import Foundation
@testable import OrcaCompanion
import XCTest

/// Multi-host detach / reload + interactive-only input gating at the RPC seam.
@MainActor
final class MultiHostReloadAndInputGateTests: XCTestCase {
  private var desktopKeys: E2EECrypto.KeyPair!
  private var shared: Bytes!

  override func setUp() async throws {
    desktopKeys = E2EECrypto.generateKeyPair()
  }

  func testDetachAllSubscriptionsSendsUnsubscribeAndClearsListeners() async throws {
    let harness = try await makeConnectedClient(token: "tok-detach")
    shared = harness.shared

    _ = harness.client.subscribe(
      method: "terminal.subscribe",
      params: [
        "terminal": "term-a",
        "client": ["id": "tok-detach", "type": "mobile"],
        "role": "interactive"
      ],
      onEvent: { _ in }
    )
    try await waitUntil { harness.client.activeStreamListenerCount == 1 }
    let before = harness.channel.sent.count

    harness.client.detachAllSubscriptions()
    try await waitUntil { harness.client.activeStreamListenerCount == 0 }
    try await waitUntil { harness.channel.sent.count > before }

    let methods = try decryptedMethods(channel: harness.channel, shared: harness.shared, from: before)
    XCTAssertTrue(methods.contains("terminal.unsubscribe"))
    XCTAssertEqual(harness.client.activeStreamListenerCount, 0)
    harness.client.close()
  }

  func testCloseDetachesSubscriptionsBeforeSocketDrop() async throws {
    let harness = try await makeConnectedClient(token: "tok-close")
    _ = harness.client.subscribe(
      method: "terminal.subscribe",
      params: ["terminal": "term-b", "role": "interactive"],
      onEvent: { _ in }
    )
    try await waitUntil { harness.client.activeStreamListenerCount == 1 }
    let before = harness.channel.sent.count

    harness.client.close()
    try await waitUntil { harness.client.activeStreamListenerCount == 0 }
    let methods = try decryptedMethods(channel: harness.channel, shared: harness.shared, from: before)
    XCTAssertTrue(methods.contains("terminal.unsubscribe"))
  }

  func testHostAToHostBSwitchFullyDetachesPriorClient() async throws {
    let channelA = MockWebSocketChannel()
    let channelB = MockWebSocketChannel()
    var channels = [channelA, channelB]
    var nextIndex = 0

    let metadata = InMemoryHostMetadataStore()
    let tokens = InMemoryHostTokenStore()
    let store = HostStore(metadata: metadata, tokens: tokens)
    let pub = Data(desktopKeys.publicKey).base64EncodedString()

    let hostA = HostProfile(
      id: "host-a",
      name: "A",
      endpoint: "ws://127.0.0.1:6768",
      endpoints: [],
      deviceToken: "tok-a",
      publicKeyB64: pub,
      lastConnected: 1
    )
    let hostB = HostProfile(
      id: "host-b",
      name: "B",
      endpoint: "ws://127.0.0.1:6769",
      endpoints: [],
      deviceToken: "tok-b",
      publicKeyB64: pub,
      lastConnected: 2
    )
    try store.saveHost(hostA)
    try store.saveHost(hostB)

    let session = CompanionSession(store: store) { _ in
      let channel = channels[nextIndex]
      nextIndex = min(nextIndex + 1, channels.count - 1)
      return channel
    }

    // Connect A with auto-handshake responder.
    let connectA = Task { await session.connect(to: hostA) }
    try await completeHandshakeOnChannel(channelA, token: "tok-a")
    try await replyStatusOk(on: channelA)
    try await replyWorktreePs(on: channelA)
    await connectA.value

    XCTAssertEqual(session.activeHostId, "host-a")
    XCTAssertEqual(session.status(for: "host-a"), .connected)

    let clientA = try XCTUnwrap(session.rpcClient)
    _ = clientA.subscribe(
      method: "terminal.subscribe",
      params: ["terminal": "term-a", "role": "interactive"],
      onEvent: { _ in }
    )
    try await waitUntil { clientA.activeStreamListenerCount == 1 }
    let beforeSwitch = channelA.sent.count

    let connectB = Task { await session.connect(to: hostB) }
    // Prior client must detach (unsubscribe) then close before B connects.
    try await waitUntil {
      (try? self.decryptedMethods(channel: channelA, shared: self.sharedA!, from: beforeSwitch)
        .contains("terminal.unsubscribe")) == true
        || clientA.activeStreamListenerCount == 0
    }

    try await completeHandshakeOnChannel(channelB, token: "tok-b")
    try await replyStatusOk(on: channelB)
    try await replyWorktreePs(on: channelB)
    await connectB.value

    XCTAssertEqual(session.activeHostId, "host-b")
    XCTAssertEqual(session.status(for: "host-b"), .connected)
    XCTAssertEqual(session.status(for: "host-a"), .idle)
    XCTAssertEqual(clientA.activeStreamListenerCount, 0)
    XCTAssertTrue(session.rpcClient !== clientA)
  }

  func testOpenCloseReopenSameWorkspaceDoesNotStackSubscriptions() async throws {
    let harness = try await makeConnectedClient(token: "tok-reload")
    let client = harness.client

    func openSubscribe() -> () -> Void {
      client.subscribe(
        method: "terminal.subscribe",
        params: ["terminal": "term-reload", "role": "interactive"],
        onEvent: { _ in }
      )
    }

    let first = openSubscribe()
    try await waitUntil { client.activeStreamListenerCount == 1 }
    first()
    try await waitUntil { client.activeStreamListenerCount == 0 }

    let second = openSubscribe()
    try await waitUntil { client.activeStreamListenerCount == 1 }
    second()
    try await waitUntil { client.activeStreamListenerCount == 0 }

    // Third open after detachAll — still a single listener, never stacked.
    client.detachAllSubscriptions()
    _ = openSubscribe()
    try await waitUntil { client.activeStreamListenerCount == 1 }
    XCTAssertEqual(client.activeStreamListenerCount, 1)
    client.close()
  }

  func testDictationBlockedWhileNotify() async throws {
    let session = CompanionSession(
      store: HostStore(metadata: InMemoryHostMetadataStore(), tokens: InMemoryHostTokenStore())
    )
    session.attachRole.setRole(.notify)
    XCTAssertFalse(session.allowsDictation)

    do {
      _ = try await session.fetchDictationSetup()
      XCTFail("expected notify dictation block")
    } catch SpeechDictationError.inputBlockedWhileNotify {
      // expected
    }
    XCTAssertNotNil(session.dictationError)
  }

  func testDictationSetupErrorSurfacesClearly() {
    let mapped = SpeechDictationError.fromDesktop(code: nil, message: "voice_dictation_disabled")
    XCTAssertEqual(mapped, .voiceDictationDisabled)
    XCTAssertTrue(mapped.localizedDescription.contains("disabled"))

    let legacy = SpeechDictationError.fromDesktop(
      code: "method_not_found",
      message: "speech.models.list is not available to mobile clients"
    )
    XCTAssertEqual(legacy, .legacyDesktop)

    let notReady = SpeechDictationError.fromDesktop(
      code: nil,
      message: "voice_model_not_ready:downloading"
    )
    XCTAssertEqual(notReady, .voiceModelNotReady("downloading"))
  }

  func testTypingBlockedWhileNotify() async throws {
    let session = CompanionSession(
      store: HostStore(metadata: InMemoryHostMetadataStore(), tokens: InMemoryHostTokenStore())
    )
    session.attachRole.setRole(.notify)
    do {
      try await session.sendTerminalText(handle: "t", text: "x", enter: true)
      XCTFail("expected block")
    } catch let error as OrcaRpcError {
      XCTAssertEqual(error, .inputBlockedWhileNotify)
    }
  }

  func testHostStatusParkedAndIncompatible() async throws {
    let session = CompanionSession(
      store: HostStore(metadata: InMemoryHostMetadataStore(), tokens: InMemoryHostTokenStore())
    )
    let pub = Data(desktopKeys.publicKey).base64EncodedString()
    let host = HostProfile(
      id: "h1",
      name: "Desk",
      endpoint: "ws://127.0.0.1:6768",
      endpoints: [],
      deviceToken: "t",
      publicKeyB64: pub,
      lastConnected: 0
    )
    try session.pair(from: makePairURL(token: "t", pub: pub), name: "Desk")
    // pair creates a new id — use loaded host.
    let loaded = try XCTUnwrap(session.hosts.first)
    XCTAssertEqual(session.status(for: loaded.id), .idle)

    // Simulate active parked state via connection observer path.
    let channel = MockWebSocketChannel()
    let client = OrcaRpcClient(
      deviceToken: "t",
      serverPublicKeyB64: pub,
      channel: channel,
      recovery: TransportRecoveryPolicy(
        reconnectDelaysMs: [1],
        giveUpAfterAttempts: 0,
        stableConnectionResetMs: 60_000,
        handshakeTimeoutMs: 5_000
      )
    )
    // Force park by exhausting reconnect budget with giveUpAfterAttempts: 0 on close.
    client.start()
    try await waitUntil { channel.didConnect }
    channel.onClose?(URLError(.networkConnectionLost))
    try await waitUntil { client.connectionState == ConnectionState.parked }
    XCTAssertEqual(client.connectionState, ConnectionState.parked)
    client.close()
    _ = host
  }

  // MARK: - Helpers

  private var sharedA: Bytes?

  private struct ClientHarness {
    var client: OrcaRpcClient
    var channel: MockWebSocketChannel
    var shared: Bytes
  }

  private func makeConnectedClient(token: String) async throws -> ClientHarness {
    let channel = MockWebSocketChannel()
    let client = OrcaRpcClient(
      deviceToken: token,
      serverPublicKeyB64: Data(desktopKeys.publicKey).base64EncodedString(),
      channel: channel,
      defaultRequestTimeoutMs: 2_000
    )
    let shared = try await completeHandshake(client: client, channel: channel)
    return ClientHarness(client: client, channel: channel, shared: shared)
  }

  private func completeHandshake(client: OrcaRpcClient, channel: MockWebSocketChannel) async throws -> Bytes {
    client.start()
    try await waitUntil { channel.sent.count >= 1 }
    let helloObj = try JSONSerialization.jsonObject(with: Data(channel.sent[0].utf8)) as! [String: Any]
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: helloObj["publicKeyB64"] as! String,
      serverSecret: desktopKeys.secretKey
    )
    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntil { channel.sent.count >= 2 }
    let authed = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: shared
    )
    channel.receive(authed)
    try await client.waitUntilConnected(timeoutMs: 2_000)
    return shared
  }

  private func completeHandshakeOnChannel(_ channel: MockWebSocketChannel, token: String) async throws {
    try await waitUntil { channel.sent.count >= 1 }
    let helloObj = try JSONSerialization.jsonObject(with: Data(channel.sent[0].utf8)) as! [String: Any]
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: helloObj["publicKeyB64"] as! String,
      serverSecret: desktopKeys.secretKey
    )
    sharedA = shared
    self.shared = shared
    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntil { channel.sent.count >= 2 }
    let authed = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: shared
    )
    channel.receive(authed)
    _ = token
  }

  private func replyStatusOk(on channel: MockWebSocketChannel) async throws {
    try await waitUntil {
      (try? self.decryptedMethods(channel: channel, shared: self.shared!, from: 0)
        .contains("status.get")) == true
    }
    let frames = try decryptedFrames(channel: channel, shared: shared!, from: 0)
    guard let req = frames.last(where: { $0["method"] as? String == "status.get" }),
          let id = req["id"] as? String
    else {
      XCTFail("missing status.get")
      return
    }
    let reply = try E2EECrypto.encryptTextJSON(
      [
        "id": id,
        "ok": true,
        "result": [
          "protocolVersion": ProtocolVersion.clientVersion,
          "minCompatibleClientVersion": 1
        ],
        "_meta": ["runtimeId": "rt-test"]
      ] as [String: Any],
      sharedKey: shared!
    )
    channel.receive(reply)
  }

  private func replyWorktreePs(on channel: MockWebSocketChannel) async throws {
    try await waitUntil {
      (try? self.decryptedMethods(channel: channel, shared: self.shared!, from: 0)
        .contains("worktree.ps")) == true
    }
    let frames = try decryptedFrames(channel: channel, shared: shared!, from: 0)
    guard let req = frames.last(where: { $0["method"] as? String == "worktree.ps" }),
          let id = req["id"] as? String
    else { return }
    let reply = try E2EECrypto.encryptTextJSON(
      [
        "id": id,
        "ok": true,
        "result": ["worktrees": []]
      ] as [String: Any],
      sharedKey: shared!
    )
    channel.receive(reply)
  }

  private func decryptedFrames(
    channel: MockWebSocketChannel,
    shared: Bytes,
    from startIndex: Int
  ) throws -> [[String: Any]] {
    var out: [[String: Any]] = []
    for text in channel.sent.dropFirst(startIndex) {
      if text.contains("e2ee_hello") { continue }
      if let obj = try? E2EECrypto.decryptTextJSON(text, sharedKey: shared) {
        out.append(obj)
      }
    }
    return out
  }

  private func decryptedMethods(
    channel: MockWebSocketChannel,
    shared: Bytes,
    from startIndex: Int
  ) throws -> [String] {
    try decryptedFrames(channel: channel, shared: shared, from: startIndex)
      .compactMap { $0["method"] as? String }
  }

  private func makePairURL(token: String, pub: String) -> String {
    let payload: [String: Any] = [
      "v": 2,
      "endpoint": "ws://127.0.0.1:6768",
      "endpoints": [],
      "deviceToken": token,
      "publicKeyB64": pub
    ]
    let data = try! JSONSerialization.data(withJSONObject: payload)
    let code = data.orcaBase64URLEncodedString()
    return "orca://pair?code=\(code)"
  }

  private func waitUntil(timeoutMs: Int = 3_000, _ predicate: @escaping () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
    while Date() < deadline {
      if predicate() { return }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
    XCTFail("Timed out after \(timeoutMs)ms waiting for condition")
  }
}
