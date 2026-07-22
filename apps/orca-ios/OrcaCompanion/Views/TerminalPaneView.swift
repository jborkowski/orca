import SwiftUI

/// One live Metal glyph surface + input bar (single-pane energy rule).
///
/// Subscribe/role: `AttachRoleController` (I1). Mount lease: `TerminalSurfaceMountGate`
/// so workspace / host / tab switches tear down the previous stream before the next.
struct TerminalPaneView: View {
  @Environment(CompanionSession.self) private var session
  let tab: SessionTerminalTab

  @State private var terminalFrame: TerminalFrame?
  @State private var input = ""
  @State private var status = "Subscribing…"
  @State private var engine: GhosttyVtEngine?
  /// Class token so displace callbacks can flip a flag without stale `@State`.
  @State private var lease: SurfaceMountLease?
  @State private var dictationId: String?
  @State private var dictationBusy = false

  var body: some View {
    ZStack {
      CompanionBackdrop()
      VStack(spacing: 0) {
        MetalTerminalView(frame: terminalFrame)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .companionGlassCard(cornerRadius: 16)
          .padding(.horizontal, 16)
          .padding(.top, 12)
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        Text(status)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .padding(.top, 8)

        if let dictationError = session.dictationError {
          Text(dictationError)
            .font(.caption2)
            .foregroundStyle(.orange)
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }

        HStack(spacing: 10) {
          TextField(session.allowsTerminalInput ? "Send…" : "Notify — input blocked", text: $input)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(12)
            .companionGlassCard(cornerRadius: 14)
            .disabled(!session.allowsTerminalInput)
          Button {
            Task { await toggleDictation() }
          } label: {
            Image(systemName: dictationId == nil ? "mic" : "mic.fill")
              .frame(width: 44, height: 44)
          }
          .companionGlassButton()
          .disabled(!session.allowsDictation || dictationBusy)
          Button {
            Task { await sendLine() }
          } label: {
            Image(systemName: "return")
              .frame(width: 44, height: 44)
          }
          .companionGlassButton()
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
    .onDisappear {
      if let lease {
        tearDownIfOwning(lease)
      }
    }
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
      let vt = try GhosttyVtEngine(cols: 80, rows: 24)
      engine = vt
      terminalFrame = try vt.captureFrame()
      guard let client = session.rpcClient else {
        status = "Not connected"
        await waitUntilCancelled()
        tearDownIfOwning(next)
        return
      }
      // I1 owns role + subscribe/unsubscribe; bind replaces any prior stream.
      session.attachRole.bind(client: client, terminal: tab.terminal) { event in
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
    role.allowsGlyphStream ? "Live (Metal)" : "Notify (no glyph stream)"
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
      engine.reset()
      engine.write(Data(serialized.utf8))
      refresh(engine)
      return
    }
    if type == "error", let message = event["message"] as? String {
      status = message
    }
  }

  private func refresh(_ engine: GhosttyVtEngine) {
    do {
      terminalFrame = try engine.captureFrame()
      status = statusLine(for: session.attachRole.role)
    } catch {
      status = "Render: \(error.localizedDescription)"
    }
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
