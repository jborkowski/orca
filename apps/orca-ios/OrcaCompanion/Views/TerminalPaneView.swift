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
  @State private var dictationBusy = false
  @State private var fittedCols = 0
  @State private var fittedRows = 0

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

        Text(status)
          .font(.caption2)
          .foregroundStyle(CompanionTheme.mutedForeground)
          .padding(.top, 8)

        if let dictationError = session.dictationError {
          Text(dictationError)
            .font(.caption2)
            .foregroundStyle(CompanionTheme.destructive)
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }

        HStack(spacing: 10) {
          TextField(session.allowsTerminalInput ? "Send…" : "Notify — input blocked", text: $input)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .foregroundStyle(CompanionTheme.foreground)
            .padding(12)
            .companionCard(cornerRadius: 14)
            .disabled(!session.allowsTerminalInput)
          Button {
            Task { await toggleDictation() }
          } label: {
            Image(systemName: dictationId == nil ? "mic" : "mic.fill")
              .foregroundStyle(CompanionTheme.primaryForeground)
              .frame(width: 44, height: 44)
          }
          .companionPrimaryButton()
          .disabled(!session.allowsDictation || dictationBusy)
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
        .padding(16)
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
      if !role.allowsDictation, let id = dictationId {
        Task {
          await session.cancelDictation(dictationId: id)
          dictationId = nil
        }
      }
    }
    .onChange(of: colorScheme) { _, scheme in
      applyChrome(for: scheme)
    }
    .onDisappear {
      if let lease {
        tearDownIfOwning(lease)
      }
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
    let grid =
      fittedCols > 0 && fittedRows > 0
      ? " \(fittedCols)×\(fittedRows)"
      : ""
    return role.allowsGlyphStream
      ? "Live (Metal)\(grid)"
      : "Notify (no glyph stream)"
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
    fittedCols = fit.cols
    fittedRows = fit.rows
    guard let engine else { return }
    guard fit.cols != engine.cols || fit.rows != engine.rows else {
      status = statusLine(for: session.attachRole.role)
      return
    }
    do {
      try engine.resize(cols: fit.cols, rows: fit.rows)
      session.attachRole.updateViewport(cols: fit.cols, rows: fit.rows)
      refresh(engine)
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
    guard session.allowsDictation else {
      status = "Dictation blocked (notify)"
      return
    }
    dictationBusy = true
    defer { dictationBusy = false }

    if let active = dictationId {
      do {
        let text = try await session.finishDictation(dictationId: active)
        dictationId = nil
        if !text.isEmpty {
          try await session.sendTerminalText(handle: tab.terminal, text: text, enter: true)
        }
        status = "Dictation sent"
      } catch {
        dictationId = nil
        status = error.localizedDescription
      }
      return
    }

    do {
      let setup = try await session.fetchDictationSetup()
      guard setup.isReady else {
        status = setup.enabled
          ? "Speech model not ready on desktop"
          : SpeechDictationError.voiceDictationDisabled.localizedDescription
        return
      }
      let id = UUID().uuidString
      try await session.startDictation(dictationId: id)
      dictationId = id
      status = "Listening…"
    } catch {
      status = error.localizedDescription
    }
  }

  private func waitUntilCancelled() async {
    while !Task.isCancelled {
      try? await Task.sleep(nanoseconds: 1_000_000_000)
    }
  }
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
