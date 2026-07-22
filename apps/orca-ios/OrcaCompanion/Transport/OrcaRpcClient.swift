import Foundation

enum OrcaRpcError: Error, Equatable, LocalizedError {
  case notConnected
  case handshakeFailed(String)
  case requestTimedOut(String)
  case connectionInterrupted
  case connectionFailed(String)
  case unauthorized
  case protocolFailure(String)
  case retryLimitReached
  case protocolIncompatible
  /// Typing / dictation while `role=notify` must not steal the write floor.
  case inputBlockedWhileNotify

  var errorDescription: String? {
    switch self {
    case .notConnected:
      return "Not connected"
    case .handshakeFailed(let message):
      return message
    case .requestTimedOut(let method):
      return "Request timed out: \(method)"
    case .connectionInterrupted:
      return "Connection interrupted"
    case .connectionFailed(let detail):
      return detail
    case .unauthorized:
      return "Unauthorized — pairing token rejected. Remove this host and paste a fresh orca://pair link from the desktop."
    case .protocolFailure(let message):
      return message
    case .retryLimitReached:
      return "Reconnect budget exhausted"
    case .protocolIncompatible:
      return "Protocol incompatible"
    case .inputBlockedWhileNotify:
      return "Input requires an interactive attach (foreground)."
    }
  }
}

typealias RpcStreamListener = ([String: Any]) -> Void

/// E2EE RPC client: handshake, unary requests, streaming subscribe, binary terminal frames.
/// Parks after the fast reconnect budget; revive via `notifyConnectionMayBeAvailable`.
final class OrcaRpcClient: @unchecked Sendable {
  private let deviceToken: String
  private let serverPublicKeyB64: String
  private let channel: WebSocketChannel
  private let recovery: TransportRecoveryPolicy
  private let queue = DispatchQueue(label: "dev.orca.companion.rpc")
  private let defaultRequestTimeoutMs: Int

  private var handshake: E2EEHandshake?
  private var state: ConnectionState = .disconnected
  private var stateListeners: [(ConnectionState) -> Void] = []
  private var pending: [String: (DispatchWorkItem, (Result<RpcResponse, Error>) -> Void)] = [:]
  private var streamListeners: [String: RpcStreamListener] = [:]
  private var terminalStreamByRequest: [String: Set<UInt32>] = [:]
  private var terminalListenerByStreamId: [UInt32: RpcStreamListener] = [:]
  /// Why: host switch / reload must tear down prior subs (send unsubscribe) before close.
  private var activeUnsubscribers: [String: () -> Void] = [:]
  private var snapshotAssembler = TerminalSnapshotAssembler()
  private var connectWaiters: [(Result<Void, Error>) -> Void] = []
  private var requestCounter = 0

  private var intentionallyClosed = false
  private var reconnectAttempt = 0
  private var reconnectWorkItem: DispatchWorkItem?
  private var stableResetWorkItem: DispatchWorkItem?
  private var handshakeTimeoutWorkItem: DispatchWorkItem?

  init(
    deviceToken: String,
    serverPublicKeyB64: String,
    channel: WebSocketChannel,
    defaultRequestTimeoutMs: Int = 15_000,
    recovery: TransportRecoveryPolicy = .default
  ) {
    self.deviceToken = deviceToken
    self.serverPublicKeyB64 = serverPublicKeyB64
    self.channel = channel
    self.defaultRequestTimeoutMs = defaultRequestTimeoutMs
    self.recovery = recovery
  }

  convenience init(
    host: HostProfile,
    channel: WebSocketChannel,
    recovery: TransportRecoveryPolicy = .default
  ) {
    self.init(
      deviceToken: host.deviceToken,
      serverPublicKeyB64: host.publicKeyB64,
      channel: channel,
      recovery: recovery
    )
  }

  var connectionState: ConnectionState {
    queue.sync { state }
  }

  /// Reconnect rounds completed in the current runway (0 after stable reset / revive).
  var reconnectAttemptCount: Int {
    queue.sync { reconnectAttempt }
  }

  var deviceTokenValue: String { deviceToken }

  /// Active stream listeners (terminal.subscribe etc.) — seam tests assert detach clears these.
  var activeStreamListenerCount: Int {
    queue.sync { streamListeners.count }
  }

  func onStateChange(_ listener: @escaping (ConnectionState) -> Void) {
    queue.sync {
      stateListeners.append(listener)
      listener(state)
    }
  }

  func start() {
    queue.sync {
      intentionallyClosed = false
      reconnectAttempt = 0
      cancelReconnectLocked()
      cancelStableResetLocked()
      cancelHandshakeTimeoutLocked()
      installChannelHandlersLocked()
      openConnectionLocked()
    }
  }

  /// Sends unsubscribe for every live stream, then clears local listeners.
  /// Why: multi-host reload must not leave stacked interactive subscriptions.
  func detachAllSubscriptions() {
    let teardowns = queue.sync { () -> [() -> Void] in
      let values = Array(activeUnsubscribers.values)
      activeUnsubscribers.removeAll()
      return values
    }
    for teardown in teardowns {
      teardown()
    }
    queue.sync {
      streamListeners.removeAll()
      terminalListenerByStreamId.removeAll()
      terminalStreamByRequest.removeAll()
    }
  }

  func close() {
    // Why: unsubscribe on the wire before dropping the socket so the host drops glyph streams.
    detachAllSubscriptions()
    queue.sync {
      intentionallyClosed = true
      cancelReconnectLocked()
      cancelStableResetLocked()
      cancelHandshakeTimeoutLocked()
      streamListeners.removeAll()
      terminalListenerByStreamId.removeAll()
      terminalStreamByRequest.removeAll()
      activeUnsubscribers.removeAll()
      failPendingLocked(OrcaRpcError.connectionInterrupted)
      failConnectWaitersLocked(OrcaRpcError.connectionInterrupted)
      setStateLocked(.disconnected)
      handshake = nil
    }
    channel.close()
  }

  /// Foreground / network-restore / new-request nudge. No-op when closed or already connected.
  func notifyConnectionMayBeAvailable() {
    queue.sync {
      reviveIfNeededLocked()
    }
  }

  /// Protocol-version gate latch: tear down without parking or reconnect storms.
  func markIncompatible() {
    queue.sync {
      intentionallyClosed = true
      cancelReconnectLocked()
      cancelStableResetLocked()
      cancelHandshakeTimeoutLocked()
      failPendingLocked(OrcaRpcError.protocolIncompatible)
      failConnectWaitersLocked(OrcaRpcError.protocolIncompatible)
      setStateLocked(.incompatible)
      handshake = nil
    }
    channel.close()
  }

  func waitUntilConnected(timeoutMs: Int = 15_000) async throws {
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      queue.async {
        if self.state == .connected {
          cont.resume()
          return
        }
        if self.state == .authFailed {
          cont.resume(throwing: OrcaRpcError.unauthorized)
          return
        }
        if self.state == .incompatible {
          cont.resume(throwing: OrcaRpcError.protocolIncompatible)
          return
        }
        if self.intentionallyClosed {
          cont.resume(throwing: OrcaRpcError.notConnected)
          return
        }
        self.reviveIfNeededLocked()
        var settled = false
        let timeout = DispatchWorkItem {
          guard !settled else { return }
          settled = true
          cont.resume(throwing: OrcaRpcError.requestTimedOut("connect"))
        }
        self.connectWaiters.append { result in
          guard !settled else { return }
          settled = true
          timeout.cancel()
          cont.resume(with: result)
        }
        self.queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: timeout)
      }
    }
  }

  func sendRequest(
    method: String,
    params: [String: Any]? = nil,
    timeoutMs: Int? = nil
  ) async throws -> RpcResponse {
    queue.sync { reviveIfNeededLocked() }
    try await waitUntilConnected(timeoutMs: timeoutMs ?? defaultRequestTimeoutMs)
    let timeout = timeoutMs ?? defaultRequestTimeoutMs
    return try await withCheckedThrowingContinuation { cont in
      queue.async {
        guard self.state == .connected, let shared = self.handshake?.sharedKey else {
          cont.resume(throwing: OrcaRpcError.notConnected)
          return
        }
        let id = self.nextIdLocked()
        var body: [String: Any] = [
          "id": id,
          "deviceToken": self.deviceToken,
          "method": method
        ]
        if let params {
          body["params"] = params
        }
        let timeoutWork = DispatchWorkItem { [weak self] in
          guard let self else { return }
          self.queue.async {
            guard let entry = self.pending.removeValue(forKey: id) else { return }
            entry.1(.failure(OrcaRpcError.requestTimedOut(method)))
          }
        }
        self.pending[id] = (timeoutWork, { result in
          cont.resume(with: result)
        })
        self.queue.asyncAfter(deadline: .now() + .milliseconds(timeout), execute: timeoutWork)
        do {
          let frame = try E2EECrypto.encryptTextJSON(body, sharedKey: shared)
          try self.channel.sendText(frame)
        } catch {
          self.pending.removeValue(forKey: id)?.0.cancel()
          cont.resume(throwing: OrcaRpcError.connectionInterrupted)
        }
      }
    }
  }

  /// Subscribe to a streaming RPC (e.g. `terminal.subscribe`). Returns an unsubscribe closure.
  @discardableResult
  func subscribe(
    method: String,
    params: [String: Any],
    onEvent: @escaping RpcStreamListener
  ) -> () -> Void {
    let id = queue.sync { () -> String in
      let id = nextIdLocked()
      streamListeners[id] = onEvent
      return id
    }

    queue.async {
      guard self.state == .connected, let shared = self.handshake?.sharedKey else {
        self.queue.async {
          self.streamListeners.removeValue(forKey: id)
          self.activeUnsubscribers.removeValue(forKey: id)
        }
        return
      }
      let body: [String: Any] = [
        "id": id,
        "deviceToken": self.deviceToken,
        "method": method,
        "params": params
      ]
      do {
        let frame = try E2EECrypto.encryptTextJSON(body, sharedKey: shared)
        try self.channel.sendText(frame)
      } catch {
        self.streamListeners.removeValue(forKey: id)
        self.activeUnsubscribers.removeValue(forKey: id)
      }
    }

    let unsub: () -> Void = { [weak self] in
      guard let self else { return }
      self.queue.sync {
        self.activeUnsubscribers.removeValue(forKey: id)
        self.streamListeners.removeValue(forKey: id)
        if let ids = self.terminalStreamByRequest.removeValue(forKey: id) {
          for sid in ids {
            self.terminalListenerByStreamId.removeValue(forKey: sid)
          }
        }
        // Why: still send unsubscribe while parked so the host drops the glyph stream.
        if method == "terminal.subscribe",
           let terminal = params["terminal"] as? String,
           let shared = self.handshake?.sharedKey,
           self.state == .connected || self.state == .parked
        {
          let unsubBody: [String: Any] = [
            "id": self.nextIdLocked(),
            "deviceToken": self.deviceToken,
            "method": "terminal.unsubscribe",
            "params": [
              "terminal": terminal,
              "client": ["id": self.deviceToken, "type": "mobile"]
            ]
          ]
          if let frame = try? E2EECrypto.encryptTextJSON(unsubBody, sharedKey: shared) {
            try? self.channel.sendText(frame)
          }
        }
      }
    }

    queue.sync { activeUnsubscribers[id] = unsub }
    return unsub
  }

  // MARK: - Private

  private func installChannelHandlersLocked() {
    channel.onOpen = { [weak self] in
      guard let self else { return }
      // Why: async avoids deadlock when handshake-timeout closes the channel on this queue.
      self.queue.async { self.handleOpenLocked() }
    }
    channel.onText = { [weak self] text in
      guard let self else { return }
      self.queue.async { self.handleTextLocked(text) }
    }
    channel.onBinary = { [weak self] data in
      guard let self else { return }
      self.queue.async { self.handleBinaryLocked(data) }
    }
    channel.onClose = { [weak self] error in
      guard let self else { return }
      self.queue.async { self.handleCloseLocked(error) }
    }
  }

  private func openConnectionLocked() {
    guard !intentionallyClosed else { return }
    cancelReconnectLocked()
    cancelHandshakeTimeoutLocked()
    handshake = nil
    setStateLocked(.connecting)
    channel.connect()
  }

  private func reviveIfNeededLocked() {
    guard !intentionallyClosed else { return }
    if state == .connected {
      return
    }
    // Why: parked has no timers; mid-backoff revive must not wait out 60s or re-pair.
    guard state == .reconnecting || state == .parked else {
      return
    }
    cancelReconnectLocked()
    reconnectAttempt = 0
    openConnectionLocked()
  }

  private func scheduleReconnectLocked() {
    guard !intentionallyClosed else { return }
    setStateLocked(.reconnecting)
    if reconnectAttempt >= recovery.giveUpAfterAttempts {
      // Why: stop the timer loop after the fast runway so unreachable hosts do not drain battery.
      setStateLocked(.parked)
      failConnectWaitersLocked(OrcaRpcError.retryLimitReached)
      return
    }
    let delays = recovery.reconnectDelaysMs
    let index = min(reconnectAttempt, max(delays.count - 1, 0))
    let delayMs = delays.isEmpty ? 0 : delays[index]
    reconnectAttempt += 1
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.queue.async {
        self.reconnectWorkItem = nil
        self.openConnectionLocked()
      }
    }
    reconnectWorkItem = work
    queue.asyncAfter(deadline: .now() + .milliseconds(delayMs), execute: work)
  }

  private func cancelReconnectLocked() {
    reconnectWorkItem?.cancel()
    reconnectWorkItem = nil
  }

  private func cancelStableResetLocked() {
    stableResetWorkItem?.cancel()
    stableResetWorkItem = nil
  }

  private func cancelHandshakeTimeoutLocked() {
    handshakeTimeoutWorkItem?.cancel()
    handshakeTimeoutWorkItem = nil
  }

  private func scheduleHandshakeTimeoutLocked() {
    cancelHandshakeTimeoutLocked()
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.queue.async {
        self.handshakeTimeoutWorkItem = nil
        guard self.state == .handshaking, !self.intentionallyClosed else { return }
        self.handshake = nil
        // Unexpected close path → reconnect/park (do not set intentionallyClosed).
        self.channel.close()
      }
    }
    handshakeTimeoutWorkItem = work
    queue.asyncAfter(
      deadline: .now() + .milliseconds(recovery.handshakeTimeoutMs),
      execute: work
    )
  }

  private func scheduleStableConnectionResetLocked() {
    cancelStableResetLocked()
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.queue.async {
        self.stableResetWorkItem = nil
        guard self.state == .connected else { return }
        self.reconnectAttempt = 0
      }
    }
    stableResetWorkItem = work
    queue.asyncAfter(
      deadline: .now() + .milliseconds(recovery.stableConnectionResetMs),
      execute: work
    )
  }

  private func handleOpenLocked() {
    do {
      var hs = try E2EEHandshake(deviceToken: deviceToken, serverPublicKeyB64: serverPublicKeyB64)
      let hello = try hs.makeHelloJSON()
      handshake = hs
      setStateLocked(.handshaking)
      scheduleHandshakeTimeoutLocked()
      guard let text = String(data: hello, encoding: .utf8) else {
        cancelHandshakeTimeoutLocked()
        intentionallyClosed = true
        setStateLocked(.authFailed)
        failConnectWaitersLocked(OrcaRpcError.handshakeFailed("hello encode"))
        return
      }
      try channel.sendText(text)
    } catch {
      cancelHandshakeTimeoutLocked()
      intentionallyClosed = true
      setStateLocked(.authFailed)
      failConnectWaitersLocked(OrcaRpcError.handshakeFailed(String(describing: error)))
    }
  }

  private func handleTextLocked(_ text: String) {
    guard var hs = handshake else { return }

    if state == .handshaking {
      do {
        if let authFrame = try hs.handlePlaintext(text) {
          handshake = hs
          try channel.sendText(authFrame)
          return
        }
        try hs.handleEncryptedText(text)
        handshake = hs
        switch hs.state {
        case .authenticated:
          cancelHandshakeTimeoutLocked()
          setStateLocked(.connected)
          scheduleStableConnectionResetLocked()
          succeedConnectWaitersLocked()
        case .failed(let code):
          cancelHandshakeTimeoutLocked()
          intentionallyClosed = true
          cancelReconnectLocked()
          setStateLocked(.authFailed)
          failConnectWaitersLocked(
            code == "unauthorized" ? OrcaRpcError.unauthorized : OrcaRpcError.handshakeFailed(code)
          )
        default:
          break
        }
      } catch {
        cancelHandshakeTimeoutLocked()
        intentionallyClosed = true
        cancelReconnectLocked()
        setStateLocked(.authFailed)
        failConnectWaitersLocked(OrcaRpcError.handshakeFailed(String(describing: error)))
      }
      return
    }

    guard state == .connected, let shared = hs.sharedKey else { return }
    do {
      let obj = try E2EECrypto.decryptTextJSON(text, sharedKey: shared)
      if let type = obj["type"] as? String, type == "e2ee_error" {
        intentionallyClosed = true
        cancelReconnectLocked()
        setStateLocked(.authFailed)
        failPendingLocked(OrcaRpcError.unauthorized)
        return
      }
      let response = try RpcFrameParser.parse(obj)
      if !response.ok, response.error?.code == "unauthorized" {
        intentionallyClosed = true
        cancelReconnectLocked()
        setStateLocked(.authFailed)
        failPendingLocked(OrcaRpcError.unauthorized)
        return
      }
      if response.streaming {
        deliverStreamResultLocked(requestId: response.id, result: response.result)
        return
      }
      if let entry = pending.removeValue(forKey: response.id) {
        entry.0.cancel()
        entry.1(.success(response))
      }
    } catch {
      // Drop undecryptable / malformed post-auth frames.
    }
  }

  private func handleBinaryLocked(_ bundle: Data) {
    guard state == .connected, let shared = handshake?.sharedKey else { return }
    guard let plain = E2EECrypto.decrypt(bundle, sharedKey: shared) else { return }
    guard let frame = TerminalStreamProtocol.decode(plain) else { return }
    if let event = snapshotAssembler.ingest(frame) {
      deliverTerminalBinaryEventLocked(event)
    }
  }

  private func deliverStreamResultLocked(requestId: String, result: [String: Any]) {
    if let type = result["type"] as? String, type == "subscribed",
       let streamId = result["streamId"] as? Int
    {
      let sid = UInt32(streamId)
      if terminalStreamByRequest[requestId] == nil {
        terminalStreamByRequest[requestId] = []
      }
      terminalStreamByRequest[requestId]?.insert(sid)
      if let listener = streamListeners[requestId] {
        terminalListenerByStreamId[sid] = listener
      }
    }
    streamListeners[requestId]?(result)
  }

  private func deliverTerminalBinaryEventLocked(_ event: TerminalSnapshotAssembler.Event) {
    switch event {
    case .output(let streamId, let chunk):
      terminalListenerByStreamId[streamId]?([
        "type": "data",
        "streamId": Int(streamId),
        "chunk": chunk
      ])
    case .snapshot(let streamId, let kind, let serialized, let meta):
      var payload = meta
      payload["type"] = kind
      payload["streamId"] = Int(streamId)
      payload["serialized"] = serialized
      terminalListenerByStreamId[streamId]?(payload)
    case .error(let streamId, let message):
      terminalListenerByStreamId[streamId]?([
        "type": "error",
        "streamId": Int(streamId),
        "message": message
      ])
    }
  }

  private func handleCloseLocked(_ error: Error?) {
    cancelStableResetLocked()
    cancelHandshakeTimeoutLocked()
    let detail = Self.describeClose(error)
    let connectFailure = OrcaRpcError.connectionFailed(detail)
    failPendingLocked(connectFailure)
    handshake = nil

    if intentionallyClosed {
      if state != .authFailed, state != .incompatible {
        setStateLocked(.disconnected)
      }
      failConnectWaitersLocked(connectFailure)
      return
    }

    if state == .authFailed || state == .incompatible {
      failConnectWaitersLocked(connectFailure)
      return
    }

    // Why: mid-handshake drop should fail the waiter with the real reason, not silent reconnect only.
    if state == .connecting || state == .handshaking {
      failConnectWaitersLocked(connectFailure)
    }

    scheduleReconnectLocked()
  }

  private static func describeClose(_ error: Error?) -> String {
    guard let error else { return "Connection interrupted" }
    let ns = error as NSError
    if let urlError = error as? URLError {
      switch urlError.code {
      case .timedOut:
        return "Timed out reaching host — is Orca running and Tailscale/LAN up?"
      case .notConnectedToInternet, .networkConnectionLost:
        return "Network lost while connecting"
      case .cannotConnectToHost, .dnsLookupFailed:
        return "Cannot reach \(urlError.failingURL?.absoluteString ?? "host") — check Tailscale/VPN"
      case .secureConnectionFailed:
        return "TLS failed for WebSocket"
      default:
        break
      }
    }
    return ns.localizedDescription.isEmpty ? "Connection interrupted" : ns.localizedDescription
  }

  private func nextIdLocked() -> String {
    requestCounter += 1
    return "req-\(requestCounter)"
  }

  private func setStateLocked(_ next: ConnectionState) {
    guard state != next else { return }
    state = next
    let listeners = stateListeners
    DispatchQueue.main.async {
      listeners.forEach { $0(next) }
    }
  }

  private func succeedConnectWaitersLocked() {
    let waiters = connectWaiters
    connectWaiters.removeAll()
    waiters.forEach { $0(.success(())) }
  }

  private func failConnectWaitersLocked(_ error: Error) {
    let waiters = connectWaiters
    connectWaiters.removeAll()
    waiters.forEach { $0(.failure(error)) }
  }

  private func failPendingLocked(_ error: Error) {
    let entries = pending
    pending.removeAll()
    for (_, entry) in entries {
      entry.0.cancel()
      entry.1(.failure(error))
    }
  }
}
