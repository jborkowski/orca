import Foundation
import Observation

/// Owns `terminal.subscribe` role flips at the wire seam (`interactive` ↔ `notify`).
///
/// Why: background must drop the glyph stream without tearing down the RPC
/// connection; foreground re-subscribes interactive so the host restores from
/// its subscribe snapshot (not a cold PTY spawn).
@MainActor
@Observable
final class AttachRoleController {
  struct TerminalAttachTarget: Equatable, Sendable {
    var handle: String
    var cols: Int
    var rows: Int
  }

  private(set) var role: WorkspaceAttachRole = .interactive
  private(set) var boundTerminal: String?

  private var target: TerminalAttachTarget?
  private var onEvent: RpcStreamListener?
  private var unsubscribe: (() -> Void)?
  private var rpcClient: OrcaRpcClient?

  var allowsInput: Bool { role.allowsTerminalInput }

  var allowsDictation: Bool { role.allowsDictation }

  /// Bind the one live terminal surface. Starts subscribe for the current role.
  func bind(
    client: OrcaRpcClient,
    terminal: String,
    cols: Int = 80,
    rows: Int = 24,
    onEvent: @escaping RpcStreamListener
  ) {
    unbindSubscriptionOnly()
    rpcClient = client
    target = TerminalAttachTarget(handle: terminal, cols: cols, rows: rows)
    self.onEvent = onEvent
    boundTerminal = terminal
    // Fresh bind while foregrounded should be interactive (glyph + snapshot).
    if role == .notify {
      role = .interactive
    }
    subscribeCurrent()
  }

  /// Tear down the active terminal attach (workspace leave / host switch).
  func unbind() {
    unbindSubscriptionOnly()
    rpcClient = nil
    target = nil
    onEvent = nil
    boundTerminal = nil
    role = .interactive
  }

  /// Scene / app lifecycle: background → notify; return to active → interactive.
  func applyLifecycle(_ phase: CompanionLifecyclePhase) {
    switch phase {
    case .background:
      setRole(.notify)
    case .active:
      setRole(.interactive)
    case .inactive:
      // Why: inactive (e.g. Control Center) is transient; keep interactive until
      // true background so a quick glance does not thrash subscribe/unsubscribe.
      break
    }
  }

  /// Test / explicit seam: flip role and re-subscribe when a terminal is bound.
  func setRole(_ next: WorkspaceAttachRole) {
    guard next != role else { return }
    role = next
    guard target != nil, rpcClient != nil, onEvent != nil else { return }
    resubscribe()
  }

  /// Refit the live PTY to the phone viewport without tearing the subscribe.
  ///
  /// Why: Expo uses `terminal.updateViewport` in place. A full unsubscribe →
  /// subscribe on every Metal layout pass blips the mobile driver and can leave
  /// the host PTY stuck at the first (too-small) fit — “doesn’t grow” / session break.
  func updateViewport(cols: Int, rows: Int) {
    guard var target, target.cols != cols || target.rows != rows else { return }
    target.cols = cols
    target.rows = rows
    self.target = target
    guard role == .interactive, let client = rpcClient else { return }
    let handle = target.handle
    let token = client.deviceTokenValue
    Task {
      _ = try? await client.sendRequest(
        method: "terminal.updateViewport",
        params: [
          "terminal": handle,
          "client": ["id": token, "type": "mobile"],
          "viewport": ["cols": cols, "rows": rows]
        ],
        timeoutMs: 8_000
      )
    }
  }

  // MARK: - Private

  private func unbindSubscriptionOnly() {
    unsubscribe?()
    unsubscribe = nil
  }

  private func resubscribe() {
    unbindSubscriptionOnly()
    subscribeCurrent()
  }

  private func subscribeCurrent() {
    guard let client = rpcClient,
          let target,
          let onEvent
    else { return }

    let tab = SessionTerminalTab(id: target.handle, terminal: target.handle, title: "Terminal")
    unsubscribe = client.subscribe(
      method: "terminal.subscribe",
      params: tab.subscribeParams(
        clientId: client.deviceTokenValue,
        cols: target.cols,
        rows: target.rows,
        role: role
      ),
      onEvent: onEvent
    )
  }
}
