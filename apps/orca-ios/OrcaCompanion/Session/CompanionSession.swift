import Foundation
import Observation
import SwiftUI

/// App-wide session brain: multi-host store, RPC attach, worktrees, input gates.
@MainActor
@Observable
final class CompanionSession {
  typealias ChannelFactory = (URL) -> WebSocketChannel

  private(set) var hosts: [HostProfile] = []
  private(set) var connectionState: ConnectionState = .disconnected
  private(set) var statusLine: String = "Not connected"
  private(set) var worktrees: [WorktreeSummary] = []
  private(set) var protocolCompat: ProtocolVersion.Compat?
  private(set) var lastError: String?
  private(set) var activeHostId: String?
  /// Last dictation setup / speech RPC error for UI (cleared on success).
  private(set) var dictationError: String?

  /// Wire-level interactive ↔ notify controller (glyph stream + input gate).
  let attachRole = AttachRoleController()
  /// One live Metal/VT lease — workspace / host / tab switches tear down prior surface.
  let surfaceMount = TerminalSurfaceMountGate()

  private let store: HostStore
  private let makeChannel: ChannelFactory
  private(set) var rpcClient: OrcaRpcClient?
  /// Per-host list status (connected / parked / incompatible / idle).
  private var hostStatusById: [String: HostRuntimeStatus] = [:]

  /// Typing / dictation may only run while interactive (write-floor rule).
  var allowsTerminalInput: Bool { attachRole.allowsInput }

  var allowsDictation: Bool { attachRole.allowsDictation }

  init(
    store: HostStore = .live(),
    makeChannel: @escaping ChannelFactory = { URLSessionWebSocketChannel(url: $0) }
  ) {
    self.store = store
    self.makeChannel = makeChannel
    reloadHosts()
  }

  /// Scene-phase entry from `OrcaCompanionApp` (or tests).
  func handleScenePhase(_ phase: ScenePhase) {
    switch phase {
    case .active:
      attachRole.applyLifecycle(.active)
      // Why: parked transport revives on foreground without re-pairing (I3).
      rpcClient?.notifyConnectionMayBeAvailable()
    case .inactive:
      attachRole.applyLifecycle(.inactive)
    case .background:
      attachRole.applyLifecycle(.background)
    @unknown default:
      break
    }
  }

  func reloadHosts() {
    do {
      hosts = try store.loadHosts().sorted { $0.lastConnected > $1.lastConnected }
      for host in hosts where hostStatusById[host.id] == nil {
        hostStatusById[host.id] = .idle
      }
    } catch {
      lastError = "Host list: \(error.localizedDescription)"
      hosts = []
    }
  }

  func status(for hostId: String) -> HostRuntimeStatus {
    if hostId == activeHostId {
      return statusFromConnectionState()
    }
    return hostStatusById[hostId] ?? .idle
  }

  func pair(from rawOffer: String, name: String? = nil) throws -> HostProfile {
    let offer = try PairingOfferParser.parse(rawOffer)
    let hostName = (name?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap {
      $0.isEmpty ? nil : $0
    } ?? "Host \(hosts.count + 1)"
    let host = HostProfile.fromPairing(offer, name: hostName)
    try store.saveHost(host)
    hostStatusById[host.id] = .idle
    reloadHosts()
    return host
  }

  func removeHost(_ id: String) {
    try? store.removeHost(id: id)
    hostStatusById.removeValue(forKey: id)
    if activeHostId == id {
      disconnect()
    }
    reloadHosts()
  }

  /// Fully detach prior RPC client / subscriptions before the next connect.
  func disconnect() {
    attachRole.unbind()
    surfaceMount.releaseActive()
    if let priorId = activeHostId {
      hostStatusById[priorId] = .idle
    }
    rpcClient?.close()
    rpcClient = nil
    activeHostId = nil
    connectionState = .disconnected
    statusLine = "Not connected"
    worktrees = []
    protocolCompat = nil
    dictationError = nil
  }

  func connect(to host: HostProfile) async {
    // Why: switching hosts must tear down prior interactive stream before next connect.
    disconnect()
    lastError = nil
    dictationError = nil
    activeHostId = host.id
    connectionState = .connecting
    hostStatusById[host.id] = .idle
    statusLine = "Connecting…"

    guard let endpoint = host.candidateEndpoints.first,
          let url = URL(string: endpoint)
    else {
      lastError = "Invalid endpoint"
      connectionState = .disconnected
      statusLine = "Bad endpoint"
      return
    }

    let channel = makeChannel(url)
    let rpc = OrcaRpcClient(host: host, channel: channel)
    rpcClient = rpc
    rpc.onStateChange { [weak self] state in
      Task { @MainActor in
        self?.applyConnectionState(state, hostId: host.id)
      }
    }
    rpc.start()

    do {
      try await rpc.waitUntilConnected(timeoutMs: 20_000)
      statusLine = "Authenticated — probing status…"
      let statusResponse = try await rpc.sendRequest(method: "status.get", timeoutMs: 15_000)
      guard statusResponse.ok else {
        throw OrcaRpcError.handshakeFailed(statusResponse.error?.message ?? "status.get failed")
      }
      let snap = HostStatusSnapshot.parse(
        from: statusResponse.result,
        runtimeId: statusResponse.runtimeId
      )
      if let desktop = snap.protocolVersion {
        let minClient = snap.minCompatibleClientVersion ?? 0
        let compat = ProtocolVersion.evaluate(
          desktopProtocolVersion: desktop,
          minCompatibleClientVersion: minClient
        )
        protocolCompat = compat
        if compat != .ok {
          statusLine = "Protocol blocked"
          lastError = String(describing: compat)
          hostStatusById[host.id] = .incompatible
          rpc.markIncompatible()
          connectionState = .incompatible
          return
        }
      }
      try? store.updateLastConnected(id: host.id)
      try? store.promoteEndpoint(id: host.id, endpoint: endpoint)
      reloadHosts()
      hostStatusById[host.id] = .connected
      statusLine = "Connected"
      await refreshWorktrees()
    } catch {
      lastError = error.localizedDescription
      statusLine = "Connect failed"
      connectionState = .disconnected
      hostStatusById[host.id] = .idle
      rpcClient?.close()
      rpcClient = nil
    }
  }

  func refreshWorktrees() async {
    guard let rpcClient, connectionState == .connected else { return }
    do {
      let response = try await rpcClient.sendRequest(
        method: "worktree.ps",
        params: ["limit": 10_000],
        timeoutMs: 20_000
      )
      guard response.ok else {
        lastError = response.error?.message ?? "worktree.ps failed"
        return
      }
      worktrees = WorktreeSummary.parseList(from: response.result)
      statusLine = "\(worktrees.count) worktree\(worktrees.count == 1 ? "" : "s")"
    } catch {
      lastError = error.localizedDescription
    }
  }

  func activateWorktree(_ summary: WorktreeSummary) async {
    guard let rpcClient, connectionState == .connected else { return }
    // Leaving a worktree must drop any prior interactive glyph subscription.
    attachRole.unbind()
    surfaceMount.releaseActive()
    do {
      _ = try await rpcClient.sendRequest(
        method: "worktree.activate",
        params: ["worktree": "id:\(summary.worktreeId)", "notifyClients": false],
        timeoutMs: 20_000
      )
      await refreshWorktrees()
    } catch {
      lastError = error.localizedDescription
    }
  }

  func listTabs(worktreeId: String) async -> [SessionTerminalTab] {
    guard let rpcClient, connectionState == .connected else { return [] }
    do {
      let response = try await rpcClient.sendRequest(
        method: "session.tabs.list",
        params: ["worktree": "id:\(worktreeId)"],
        timeoutMs: 15_000
      )
      guard response.ok else {
        lastError = response.error?.message
        return []
      }
      return SessionTerminalTab.parseList(from: response.result)
    } catch {
      lastError = error.localizedDescription
      return []
    }
  }

  func createTerminal(worktreeId: String) async -> SessionTerminalTab? {
    guard let rpcClient, connectionState == .connected else { return nil }
    do {
      let response = try await rpcClient.sendRequest(
        method: "session.tabs.createTerminal",
        params: ["worktree": "id:\(worktreeId)"],
        timeoutMs: 20_000
      )
      guard response.ok else {
        lastError = response.error?.message
        return nil
      }
      if let tab = response.result["tab"] as? [String: Any] {
        return SessionTerminalTab.parseList(from: ["tabs": [tab]]).first
      }
      return SessionTerminalTab.parseList(from: response.result).first
    } catch {
      lastError = error.localizedDescription
      return nil
    }
  }

  func sendTerminalText(handle: String, text: String, enter: Bool) async throws {
    guard allowsTerminalInput else {
      throw OrcaRpcError.inputBlockedWhileNotify
    }
    guard let rpcClient, connectionState == .connected else {
      throw OrcaRpcError.notConnected
    }
    let response = try await rpcClient.sendRequest(
      method: "terminal.send",
      params: [
        "terminal": handle,
        "text": text,
        "enter": enter,
        "client": ["id": rpcClient.deviceTokenValue, "type": "mobile"]
      ],
      timeoutMs: 15_000
    )
    if !response.ok {
      throw OrcaRpcError.handshakeFailed(response.error?.message ?? "send failed")
    }
  }

  // MARK: - Speech / dictation (interactive only)

  func fetchDictationSetup() async throws -> SpeechDictationSetup {
    try requireInteractiveDictation()
    guard let rpcClient, connectionState == .connected else {
      throw OrcaRpcError.notConnected
    }
    let response = try await rpcClient.sendRequest(method: "speech.models.list", timeoutMs: 15_000)
    guard response.ok else {
      let mapped = SpeechDictationError.fromDesktop(
        code: response.error?.code,
        message: response.error?.message ?? "Failed to load dictation models"
      )
      dictationError = mapped.localizedDescription
      throw mapped
    }
    dictationError = nil
    return SpeechDictationSetup.parse(from: response.result)
  }

  func startDictation(dictationId: String) async throws {
    try requireInteractiveDictation()
    guard let rpcClient, connectionState == .connected else {
      throw OrcaRpcError.notConnected
    }
    let response = try await rpcClient.sendRequest(
      method: "speech.dictation.start",
      params: ["dictationId": dictationId],
      timeoutMs: 15_000
    )
    guard response.ok else {
      let mapped = SpeechDictationError.fromDesktop(
        code: response.error?.code,
        message: response.error?.message ?? "Dictation start failed"
      )
      dictationError = mapped.localizedDescription
      throw mapped
    }
    dictationError = nil
  }

  func finishDictation(dictationId: String) async throws -> String {
    try requireInteractiveDictation()
    guard let rpcClient, connectionState == .connected else {
      throw OrcaRpcError.notConnected
    }
    let response = try await rpcClient.sendRequest(
      method: "speech.dictation.finish",
      params: ["dictationId": dictationId],
      timeoutMs: 30_000
    )
    guard response.ok else {
      let mapped = SpeechDictationError.fromDesktop(
        code: response.error?.code,
        message: response.error?.message ?? "Dictation finish failed"
      )
      dictationError = mapped.localizedDescription
      throw mapped
    }
    dictationError = nil
    return response.result["text"] as? String ?? ""
  }

  func cancelDictation(dictationId: String) async {
    // Cancel is allowed even while flipping roles so a notify transition can clean up.
    guard let rpcClient, connectionState == .connected else { return }
    _ = try? await rpcClient.sendRequest(
      method: "speech.dictation.cancel",
      params: ["dictationId": dictationId],
      timeoutMs: 10_000
    )
  }

  /// Secondary notify path — stub only (full local push is out of scope for this slice).
  @discardableResult
  func subscribeNotificationsStub(onEvent: @escaping RpcStreamListener) -> (() -> Void)? {
    guard let rpcClient, connectionState == .connected || connectionState == .parked else {
      return nil
    }
    return rpcClient.subscribe(method: "notifications.subscribe", params: [:], onEvent: onEvent)
  }

  // MARK: - Private

  private func requireInteractiveDictation() throws {
    guard allowsDictation else {
      dictationError = SpeechDictationError.inputBlockedWhileNotify.localizedDescription
      throw SpeechDictationError.inputBlockedWhileNotify
    }
  }

  private func applyConnectionState(_ state: ConnectionState, hostId: String) {
    connectionState = state
    guard hostId == activeHostId else { return }
    hostStatusById[hostId] = statusFromConnectionState()
    if state == .parked {
      statusLine = "Parked"
    }
  }

  private func statusFromConnectionState() -> HostRuntimeStatus {
    switch connectionState {
    case .connected:
      return .connected
    case .parked, .reconnecting:
      return .parked
    case .incompatible:
      return .incompatible
    case .connecting, .handshaking, .disconnected, .authFailed:
      if let protocolCompat, protocolCompat != .ok {
        return .incompatible
      }
      return hostStatusById[activeHostId ?? ""] == .incompatible ? .incompatible : .idle
    }
  }
}
