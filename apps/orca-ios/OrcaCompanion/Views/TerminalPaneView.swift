import SwiftUI

/// One live Metal glyph surface + input bar (single-pane energy rule).
///
/// Subscribe/role: `AttachRoleController` (I1). Mount lease: `TerminalSurfaceMountGate`
/// so workspace / host / tab switches tear down the previous stream before the next.
struct TerminalPaneView: View {
  @Environment(CompanionSession.self) private var session
  @Environment(\.colorScheme) private var colorScheme
  let tab: SessionTerminalTab

  @State private var terminalFrame: TerminalFrame?
  @State private var input = ""
  @State private var status = "Subscribing…"
  @State private var engine: GhosttyVtEngine?
  /// Class token so displace callbacks can flip a flag without stale `@State`.
  @State private var lease: SurfaceMountLease?
  @State private var dictationId: String?
  @State private var fittedCols = 0
  @State private var fittedRows = 0
  /// Why: companion is voice-first — hide TextField so the keyboard never eats the terminal.
  @State private var inputMode: TerminalInputMode = .voice
  @FocusState private var typingFocused: Bool
  @State private var onDeviceDictation = OnDeviceDictationSession()
  /// Tap-to-talk phase — start on first tap, stop+send on second.
  @State private var dictationPhase: VoiceDictationPhase = .idle

  var body: some View {
    ZStack {
      CompanionBackdrop()
      VStack(spacing: 0) {
        MetalTerminalView(
          frame: terminalFrame,
          onViewportFit: { fit in
            applyViewportFit(fit)
          },
          onScrollRows: { delta in
            applyScroll(delta)
          }
        )
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .companionCard(cornerRadius: 16)
          .padding(.horizontal, 16)
          .padding(.top, 12)
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        // Why: fixed height so live transcript never reflows the mic bar.
        Text(status)
          .font(.caption2)
          .foregroundStyle(CompanionTheme.mutedForeground)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity)
          .frame(height: 18)
          .padding(.top, 8)
          .padding(.horizontal, 16)

        if let dictationError = session.dictationError {
          Text(dictationError)
            .font(.caption2)
            .foregroundStyle(CompanionTheme.destructive)
            .lineLimit(2)
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }

        inputBar
          .padding(.horizontal, 16)
          .padding(.vertical, 12)
          .frame(minHeight: 88)
      }
    }
    .navigationTitle(tab.title)
    .navigationBarTitleDisplayMode(.inline)
    // Why: task id = tab identity so remounting the same workspace is a fresh
    // claim (idempotent reload) and SwiftUI cancellation tears the stream down.
    .task(id: tab.id) {
      await runLiveSurface()
    }
    .onChange(of: session.attachRole.role) { _, role in
      status = statusLine(for: role)
      if !role.allowsDictation {
        if onDeviceDictation.isRunning {
          onDeviceDictation.cancel()
        }
        dictationPhase = .idle
        status = statusLine(for: role)
      }
    }
    .onChange(of: colorScheme) { _, scheme in
      applyChrome(for: scheme)
    }
    .onChange(of: onDeviceDictation.transcript) { _, text in
      if onDeviceDictation.isRunning, !text.isEmpty {
        status = text
      }
    }
    .onChange(of: inputMode) { _, mode in
      if mode == .voice {
        typingFocused = false
        input = ""
      }
    }
    .onDisappear {
      if let lease {
        tearDownIfOwning(lease)
      }
    }
  }

  @ViewBuilder
  private var inputBar: some View {
    switch inputMode {
    case .voice:
      voiceBar
    case .typing:
      typingBar
    }
  }

  /// One pattern: tap mic to talk, tap again to send — no keyboard.
  private var voiceBar: some View {
    HStack(spacing: 12) {
      Button {
        inputMode = .typing
        typingFocused = true
      } label: {
        Image(systemName: "keyboard")
          .font(.body.weight(.medium))
          .foregroundStyle(CompanionTheme.mutedForeground)
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel("Show keyboard")
      .disabled(!session.allowsTerminalInput)

      Spacer(minLength: 0)

      micToggleButton

      Spacer(minLength: 0)

      Color.clear.frame(width: 44, height: 44)
    }
  }

  private var micToggleButton: some View {
    let active = onDeviceDictation.isRunning
      || dictationPhase == .listening
      || dictationPhase == .starting
      || dictationPhase == .finishing
    return Button {
      Task { await toggleDictation() }
    } label: {
      ZStack {
        Capsule()
          .fill(CompanionTheme.primary)
        Image(systemName: active ? "mic.fill" : "mic")
          .font(.title2.weight(.semibold))
          .foregroundStyle(CompanionTheme.primaryForeground)
          .scaleEffect(active ? 1.12 : 1.0)
          .animation(.easeOut(duration: 0.12), value: active)
      }
      .frame(width: 80, height: 80)
    }
    .buttonStyle(.plain)
    .opacity(session.allowsDictation ? 1 : 0.4)
    .disabled(!session.allowsDictation || dictationPhase == .finishing)
    .accessibilityLabel(active ? "Stop dictation and send" : "Start dictation")
  }

  private var typingBar: some View {
    HStack(spacing: 10) {
      Button {
        inputMode = .voice
      } label: {
        Image(systemName: "mic")
          .foregroundStyle(CompanionTheme.mutedForeground)
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel("Voice mode")

      TextField(session.allowsTerminalInput ? "Send…" : "Notify — input blocked", text: $input)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($typingFocused)
        .foregroundStyle(CompanionTheme.foreground)
        .padding(12)
        .companionCard(cornerRadius: 14)
        .disabled(!session.allowsTerminalInput)
        .submitLabel(.send)
        .onSubmit {
          Task { await sendLine() }
        }

      Button {
        Task { await sendLine() }
      } label: {
        Image(systemName: "return")
          .foregroundStyle(CompanionTheme.primaryForeground)
          .frame(width: 44, height: 44)
      }
      .companionPrimaryButton()
      .disabled(input.isEmpty || !session.allowsTerminalInput)
    }
  }

  private var chromeAppearance: TerminalChromeAppearance {
    colorScheme == .dark ? .dark : .light
  }

  private func applyChrome(for scheme: ColorScheme) {
    guard let engine else { return }
    let next: TerminalChromeAppearance = scheme == .dark ? .dark : .light
    guard engine.chromeAppearance != next else { return }
    engine.applyChromeAppearance(next)
    refresh(engine)
  }

  private func runLiveSurface() async {
    let next = SurfaceMountLease(id: UUID().uuidString)
    lease = next

    // Previous surface teardown runs before this claim returns.
    session.surfaceMount.claim(mountId: next.id, terminal: tab.terminal) {
      next.displaced = true
      // Mark only — do not unbind here. The new pane's `bind` replaces the stream.
    }

    do {
      // Why: start near phone density; GeometryReader fit resizes before first draw.
      let cols = fittedCols > 0 ? fittedCols : 40
      let rows = fittedRows > 0 ? fittedRows : 20
      let vt = try GhosttyVtEngine(cols: cols, rows: rows)
      vt.applyChromeAppearance(chromeAppearance)
      engine = vt
      terminalFrame = try vt.captureFrame()
      guard let client = session.rpcClient else {
        status = "Not connected"
        await waitUntilCancelled()
        tearDownIfOwning(next)
        return
      }
      // I1 owns role + subscribe/unsubscribe; bind replaces any prior stream.
      session.attachRole.bind(
        client: client,
        terminal: tab.terminal,
        cols: cols,
        rows: rows
      ) { event in
        Task { @MainActor in
          applyEvent(event, engine: vt)
        }
      }
      status = statusLine(for: session.attachRole.role)
    } catch {
      status = error.localizedDescription
    }

    await waitUntilCancelled()
    tearDownIfOwning(next)
  }

  private func tearDownIfOwning(_ lease: SurfaceMountLease) {
    guard self.lease?.id == lease.id else { return }

    if let id = dictationId {
      Task { try? await session.cancelDictation(dictationId: id) }
      dictationId = nil
    }
    if onDeviceDictation.isRunning {
      onDeviceDictation.cancel()
    }
    dictationPhase = .idle

    let stillOwner = session.surfaceMount.activeMountId == lease.id && !lease.displaced
    // Why: if another pane claimed the gate, AttachRoleController already
    // rebound — unbind here would kill the new interactive stream.
    if stillOwner {
      session.attachRole.unbind()
    }
    session.surfaceMount.release(mountId: lease.id)
    if self.lease?.id == lease.id {
      self.lease = nil
    }
  }

  private func statusLine(for role: WorkspaceAttachRole) -> String {
    if !role.allowsGlyphStream {
      return "Notify (no glyph stream)"
    }
    let grid =
      fittedCols > 0 && fittedRows > 0
      ? " \(fittedCols)×\(fittedRows)"
      : ""
    if onDeviceDictation.isRunning || dictationPhase == .listening || dictationPhase == .starting {
      return "Listening… tap mic to send"
    }
    if dictationPhase == .finishing {
      return "Sending…"
    }
    if inputMode == .voice, role.allowsDictation {
      return "Voice · tap mic\(grid)"
    }
    return "Live (Metal)\(grid)"
  }

  private func applyEvent(_ event: [String: Any], engine: GhosttyVtEngine) {
    let type = event["type"] as? String
    if type == "data", let chunk = event["chunk"] as? String {
      guard session.attachRole.role.allowsGlyphStream else { return }
      engine.write(Data(chunk.utf8))
      refresh(engine)
      return
    }
    if type == "scrollback" || type == "resized", let serialized = event["serialized"] as? String {
      // Snapshot restore from subscribe — not a cold PTY spawn.
      // Why: keep the VT at the phone-fitted grid so Metal never draws a
      // desktop 80×24 (or wider) stretched into the portrait drawable.
      if fittedCols > 0, fittedRows > 0,
         engine.cols != fittedCols || engine.rows != fittedRows
      {
        try? engine.resize(cols: fittedCols, rows: fittedRows)
      }
      engine.reset()
      engine.write(Data(serialized.utf8))
      if fittedCols > 0, fittedRows > 0,
         engine.cols != fittedCols || engine.rows != fittedRows
      {
        try? engine.resize(cols: fittedCols, rows: fittedRows)
      }
      refresh(engine)
      return
    }
    if type == "error", let message = event["message"] as? String {
      status = message
    }
  }

  private func refresh(_ engine: GhosttyVtEngine) {
    do {
      var frame = try engine.captureFrame()
      // Why: if Ghostty reports a different grid after snapshot, force the
      // phone fit again before handing pixels to Metal.
      if fittedCols > 0, fittedRows > 0,
         frame.cols != fittedCols || frame.rows != fittedRows
      {
        try engine.resize(cols: fittedCols, rows: fittedRows)
        frame = try engine.captureFrame()
      }
      terminalFrame = frame
      status = statusLine(for: session.attachRole.role)
    } catch {
      status = "Render: \(error.localizedDescription)"
    }
  }

  private func applyViewportFit(_ fit: TerminalViewportFit.Grid) {
    let grew =
      fittedCols > 0
      && (fit.cols > fittedCols || fit.rows > fittedRows)
    fittedCols = fit.cols
    fittedRows = fit.rows
    guard let engine else { return }
    guard fit.cols != engine.cols || fit.rows != engine.rows else {
      status = statusLine(for: session.attachRole.role)
      return
    }
    do {
      try engine.resize(cols: fit.cols, rows: fit.rows)
      // Why: in-place host refit — do not resubscribe (that broke grow + session).
      session.attachRole.updateViewport(cols: fit.cols, rows: fit.rows)
      refresh(engine)
      if grew {
        status = statusLine(for: session.attachRole.role)
      }
    } catch {
      status = "Resize: \(error.localizedDescription)"
    }
  }

  private func applyScroll(_ deltaRows: Int) {
    guard let engine, deltaRows != 0 else { return }

    // Why: alternate-screen TUIs (Cursor Agent) have no local scrollback — Expo
    // turns the same gesture into arrow-key PTY input.
    if engine.needsRemoteScrollInput {
      guard session.allowsTerminalInput else { return }
      let count = min(abs(deltaRows), 6)
      // Negative delta = older / content up → CSI A; positive → CSI B.
      let key = deltaRows < 0 ? "\u{1b}[A" : "\u{1b}[B"
      let payload = String(repeating: key, count: count)
      Task {
        try? await session.sendTerminalText(handle: tab.terminal, text: payload, enter: false)
      }
      return
    }

    engine.scrollByRows(deltaRows)
    refresh(engine)
  }

  private func sendLine() async {
    guard session.allowsTerminalInput else {
      status = "Input blocked (notify)"
      return
    }
    let text = input
    input = ""
    do {
      try await session.sendTerminalText(handle: tab.terminal, text: text, enter: true)
    } catch {
      status = error.localizedDescription
    }
  }

  private func toggleDictation() async {
    switch dictationPhase {
    case .idle:
      await beginToggleDictation()
    case .starting, .listening:
      await endToggleDictation()
    case .finishing:
      break
    }
  }

  private func beginToggleDictation() async {
    guard session.allowsDictation else {
      status = "Dictation blocked (notify)"
      return
    }
    guard dictationPhase == .idle else { return }
    dictationPhase = .starting
    status = "Listening… tap mic to send"
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    do {
      try await onDeviceDictation.start()
      if dictationPhase == .starting {
        dictationPhase = .listening
        status = "Listening… tap mic to send"
      } else if dictationPhase == .finishing {
        // Second tap arrived while start was still opening the mic.
        await finishToggleDictation()
      } else if dictationPhase == .idle {
        onDeviceDictation.cancel()
      }
    } catch {
      onDeviceDictation.cancel()
      dictationPhase = .idle
      status = error.localizedDescription
    }
  }

  private func endToggleDictation() async {
    switch dictationPhase {
    case .starting:
      dictationPhase = .finishing
      status = "Sending…"
    case .listening:
      dictationPhase = .finishing
      await finishToggleDictation()
    case .idle, .finishing:
      break
    }
  }

  private func finishToggleDictation() async {
    status = "Sending…"
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    do {
      let text: String
      if onDeviceDictation.isRunning {
        text = try await onDeviceDictation.stop()
      } else {
        text = onDeviceDictation.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
          throw OnDeviceDictationSession.SessionError.noSpeech
        }
      }
      guard session.allowsTerminalInput else {
        dictationPhase = .idle
        status = "Input blocked (notify)"
        return
      }
      try await session.sendTerminalText(handle: tab.terminal, text: text, enter: true)
      status = "Sent"
      dictationPhase = .idle
      try? await Task.sleep(nanoseconds: 600_000_000)
      if dictationPhase == .idle {
        status = statusLine(for: session.attachRole.role)
      }
    } catch is CancellationError {
      dictationPhase = .idle
      status = statusLine(for: session.attachRole.role)
    } catch {
      onDeviceDictation.cancel()
      dictationPhase = .idle
      status = error.localizedDescription
    }
  }

  private func waitUntilCancelled() async {
    while !Task.isCancelled {
      try? await Task.sleep(nanoseconds: 1_000_000_000)
    }
  }
}

enum TerminalInputMode: Equatable {
  /// Default: mic only — keyboard never presented.
  case voice
  /// Escape hatch for rare typed input.
  case typing
}

enum VoiceDictationPhase: Equatable {
  case idle
  case starting
  case listening
  case finishing
}

/// Mutable lease token for displace callbacks (escaping closures cannot reliably
/// write `@State` on a SwiftUI `View` value).
@MainActor
final class SurfaceMountLease {
  let id: String
  var displaced = false

  init(id: String) {
    self.id = id
  }
}
