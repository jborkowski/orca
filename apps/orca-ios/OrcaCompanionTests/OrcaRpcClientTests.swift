import Foundation
@testable import OrcaCompanion
import XCTest

/// Injectable channel that records outbound text and lets tests push inbound frames.
final class MockWebSocketChannel: WebSocketChannel {
  var onOpen: (() -> Void)?
  var onText: ((String) -> Void)?
  var onBinary: ((Data) -> Void)?
  var onClose: ((Error?) -> Void)?
  private(set) var sent: [String] = []
  private(set) var didConnect = false
  private(set) var connectCount = 0
  /// When false, `connect()` records but does not fire `onOpen` (handshake stall tests).
  var autoOpen = true

  func connect() {
    didConnect = true
    connectCount += 1
    if autoOpen {
      onOpen?()
    }
  }

  func sendText(_ text: String) throws {
    sent.append(text)
  }

  func close() {
    onClose?(nil)
  }

  func receive(_ text: String) {
    onText?(text)
  }

  func receiveBinary(_ data: Data) {
    onBinary?(data)
  }

  /// Simulate an unexpected network drop (does not go through intentional `close()`).
  func simulateDrop(_ error: Error? = nil) {
    onClose?(error ?? URLError(.networkConnectionLost))
  }
}

/// Desktop-side crypto helper for handshake tests (mirrors server beforenm).
enum MockDesktopCrypto {
  static func sharedKey(clientPublicB64: String, serverSecret: Bytes) -> Bytes {
    let clientPub = Array(Data(base64Encoded: clientPublicB64)!)
    return E2EECrypto.sharedKey(serverPublicKey: clientPub, clientSecretKey: serverSecret)!
  }
}

final class OrcaRpcClientTests: XCTestCase {
  private var desktopKeys: E2EECrypto.KeyPair!
  private var deviceToken: String!
  private var channel: MockWebSocketChannel!
  private var client: OrcaRpcClient!

  /// Fast park runway for unit tests (0ms delays, give-up after 3 attempts).
  private let testRecovery = TransportRecoveryPolicy(
    reconnectDelaysMs: [0, 0, 0],
    giveUpAfterAttempts: 3,
    stableConnectionResetMs: 60_000,
    handshakeTimeoutMs: 30
  )

  override func setUp() {
    super.setUp()
    desktopKeys = E2EECrypto.generateKeyPair()
    deviceToken = "device-token-test"
    channel = MockWebSocketChannel()
    client = OrcaRpcClient(
      deviceToken: deviceToken,
      serverPublicKeyB64: Data(desktopKeys.publicKey).base64EncodedString(),
      channel: channel,
      defaultRequestTimeoutMs: 2_000,
      recovery: testRecovery
    )
  }

  override func tearDown() {
    client.close()
    super.tearDown()
  }

  func testHandshakeThenStatusGet() async throws {
    client.start()
    try await waitUntilSent(count: 1)

    let helloJSON = try XCTUnwrap(channel.sent.first)
    let helloObj = try JSONSerialization.jsonObject(with: Data(helloJSON.utf8)) as! [String: Any]
    XCTAssertEqual(helloObj["type"] as? String, "e2ee_hello")
    let clientPub = helloObj["publicKeyB64"] as! String
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: clientPub,
      serverSecret: desktopKeys.secretKey
    )

    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntilSent(count: 2)

    let authObj = try E2EECrypto.decryptTextJSON(channel.sent[1], sharedKey: shared)
    XCTAssertEqual(authObj["type"] as? String, "e2ee_auth")
    XCTAssertEqual(authObj["deviceToken"] as? String, deviceToken)

    let authed = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: shared
    )
    channel.receive(authed)

    try await client.waitUntilConnected(timeoutMs: 2_000)
    XCTAssertEqual(client.connectionState, .connected)

    async let responseTask = client.sendRequest(method: "status.get")
    try await waitUntilSent(count: 3)

    let reqObj = try E2EECrypto.decryptTextJSON(channel.sent[2], sharedKey: shared)
    XCTAssertEqual(reqObj["method"] as? String, "status.get")
    let reqId = reqObj["id"] as! String

    let reply = try E2EECrypto.encryptTextJSON(
      [
        "id": reqId,
        "ok": true,
        "result": ["status": "ok"],
        "_meta": ["runtimeId": "rt-1"]
      ] as [String: Any],
      sharedKey: shared
    )
    channel.receive(reply)

    let response = try await responseTask
    XCTAssertTrue(response.ok)
    XCTAssertEqual(response.result["status"] as? String, "ok")
    XCTAssertEqual(response.runtimeId, "rt-1")
  }

  func testAuthRejectionLatchesAuthFailed() async throws {
    var sawAuthFailed = false
    client.onStateChange { state in
      if state == .authFailed { sawAuthFailed = true }
    }

    client.start()
    try await waitUntilSent(count: 1)

    let helloObj = try JSONSerialization.jsonObject(with: Data(channel.sent[0].utf8)) as! [String: Any]
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: helloObj["publicKeyB64"] as! String,
      serverSecret: desktopKeys.secretKey
    )
    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntilSent(count: 2)

    let err = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_error", "error": ["code": "unauthorized"]] as [String: Any],
      sharedKey: shared
    )
    channel.receive(err)

    try await waitUntil { sawAuthFailed || self.client.connectionState == .authFailed }
    XCTAssertEqual(client.connectionState, .authFailed)
  }

  func testParkAfterFastRetryBudgetAndStaysParked() async throws {
    try await authenticateClient()
    XCTAssertEqual(channel.connectCount, 1)

    // Drop + fail each reconnect open until give-up (3 attempts → park).
    channel.simulateDrop()
    try await waitUntil { self.client.connectionState == .parked }

    XCTAssertEqual(client.connectionState, .parked)
    XCTAssertEqual(client.reconnectAttemptCount, 3)
    let connectsAtPark = channel.connectCount

    // Parked: no further reconnect storms without an explicit revive.
    try await Task.sleep(nanoseconds: 80_000_000)
    XCTAssertEqual(channel.connectCount, connectsAtPark)
    XCTAssertEqual(client.connectionState, .parked)
  }

  func testReviveOnNotifyAfterPark() async throws {
    try await authenticateClient()
    channel.simulateDrop()
    try await waitUntil { self.client.connectionState == .parked }
    let connectsAtPark = channel.connectCount

    client.notifyConnectionMayBeAvailable()
    try await waitUntil { self.channel.connectCount > connectsAtPark }
    XCTAssertEqual(client.reconnectAttemptCount, 0)

    try await completeHandshakeFromLatestHello()
    try await client.waitUntilConnected(timeoutMs: 2_000)
    XCTAssertEqual(client.connectionState, .connected)
  }

  func testSendRequestRevivesParkedTransport() async throws {
    try await authenticateClient()
    channel.simulateDrop()
    try await waitUntil { self.client.connectionState == .parked }
    let connectsAtPark = channel.connectCount

    async let responseTask = client.sendRequest(method: "status.get", timeoutMs: 3_000)
    try await waitUntil { self.channel.connectCount > connectsAtPark }

    let shared = try await completeHandshakeFromLatestHello()
    try await waitUntilSent(count: channel.sent.count)

    // Wait for the status.get frame after auth.
    try await waitUntil {
      self.channel.sent.count >= 1 &&
        (try? E2EECrypto.decryptTextJSON(self.channel.sent.last!, sharedKey: shared))?["method"]
        as? String == "status.get"
    }
    let reqObj = try E2EECrypto.decryptTextJSON(channel.sent.last!, sharedKey: shared)
    let reqId = reqObj["id"] as! String
    let reply = try E2EECrypto.encryptTextJSON(
      ["id": reqId, "ok": true, "result": ["status": "ok"]] as [String: Any],
      sharedKey: shared
    )
    channel.receive(reply)

    let response = try await responseTask
    XCTAssertTrue(response.ok)
    XCTAssertEqual(client.connectionState, .connected)
  }

  func testReviveFastForwardsPendingBackoff() async throws {
    let slowRecovery = TransportRecoveryPolicy(
      reconnectDelaysMs: [60_000],
      giveUpAfterAttempts: 12,
      stableConnectionResetMs: 60_000,
      handshakeTimeoutMs: 5_000
    )
    client.close()
    client = OrcaRpcClient(
      deviceToken: deviceToken,
      serverPublicKeyB64: Data(desktopKeys.publicKey).base64EncodedString(),
      channel: channel,
      defaultRequestTimeoutMs: 2_000,
      recovery: slowRecovery
    )

    try await authenticateClient()
    channel.simulateDrop()
    try await waitUntil { self.client.connectionState == .reconnecting }
    let connectsBefore = channel.connectCount

    client.notifyConnectionMayBeAvailable()
    try await waitUntil { self.channel.connectCount > connectsBefore }
    try await completeHandshakeFromLatestHello()
    try await client.waitUntilConnected(timeoutMs: 2_000)
    XCTAssertEqual(client.connectionState, .connected)
  }

  func testMarkIncompatibleIsTerminalWithoutReconnect() async throws {
    try await authenticateClient()
    client.markIncompatible()
    XCTAssertEqual(client.connectionState, .incompatible)

    let connects = channel.connectCount
    client.notifyConnectionMayBeAvailable()
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(channel.connectCount, connects)
    XCTAssertEqual(client.connectionState, .incompatible)
  }

  func testNotifyNoOpAfterClose() async throws {
    try await authenticateClient()
    client.close()
    let connects = channel.connectCount
    client.notifyConnectionMayBeAvailable()
    try await Task.sleep(nanoseconds: 30_000_000)
    XCTAssertEqual(channel.connectCount, connects)
    XCTAssertEqual(client.connectionState, .disconnected)
  }

  // MARK: - Helpers

  @discardableResult
  private func authenticateClient() async throws -> Bytes {
    client.start()
    return try await completeHandshakeFromLatestHello()
  }

  @discardableResult
  private func completeHandshakeFromLatestHello() async throws -> Bytes {
    try await waitUntilSent(count: channel.sent.count == 0 ? 1 : channel.sent.count)
    // Find the latest plaintext hello (or wait for a new one after reconnect).
    try await waitUntil {
      guard let last = self.channel.sent.last,
            let obj = try? JSONSerialization.jsonObject(with: Data(last.utf8)) as? [String: Any]
      else { return false }
      return obj["type"] as? String == "e2ee_hello"
    }
    let helloObj = try JSONSerialization.jsonObject(with: Data(channel.sent.last!.utf8)) as! [String: Any]
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: helloObj["publicKeyB64"] as! String,
      serverSecret: desktopKeys.secretKey
    )
    let sentBeforeAuth = channel.sent.count
    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntilSent(count: sentBeforeAuth + 1)
    let authed = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: shared
    )
    channel.receive(authed)
    try await client.waitUntilConnected(timeoutMs: 2_000)
    return shared
  }

  private func waitUntilSent(count: Int, timeoutMs: Int = 2_000) async throws {
    try await waitUntil(timeoutMs: timeoutMs) { self.channel.sent.count >= count }
  }

  private func waitUntil(timeoutMs: Int = 2_000, _ predicate: @escaping () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
    while Date() < deadline {
      if predicate() { return }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
    XCTFail("Timed out after \(timeoutMs)ms waiting for condition")
  }
}
