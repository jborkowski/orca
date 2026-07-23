import Foundation
@testable import OrcaCompanion
import XCTest

/// Proves interactive ↔ notify attach flips at the injectable WebSocket / RPC seam.
@MainActor
final class AttachRoleControllerTests: XCTestCase {
  private var desktopKeys: E2EECrypto.KeyPair!
  private var deviceToken: String!
  private var channel: MockWebSocketChannel!
  private var client: OrcaRpcClient!
  private var shared: Bytes!

  override func setUp() async throws {
    desktopKeys = E2EECrypto.generateKeyPair()
    deviceToken = "device-token-attach-role"
    channel = MockWebSocketChannel()
    client = OrcaRpcClient(
      deviceToken: deviceToken,
      serverPublicKeyB64: Data(desktopKeys.publicKey).base64EncodedString(),
      channel: channel,
      defaultRequestTimeoutMs: 2_000
    )
    shared = try await completeHandshake()
  }

  override func tearDown() async throws {
    client.close()
  }

  func testBindSendsInteractiveSubscribe() async throws {
    let controller = AttachRoleController()
    var events: [[String: Any]] = []
    controller.bind(client: client, terminal: "term-1") { events.append($0) }

    let req = try await waitForDecryptedMethod("terminal.subscribe")
    XCTAssertEqual(req["method"] as? String, "terminal.subscribe")
    let params = req["params"] as! [String: Any]
    XCTAssertEqual(params["role"] as? String, "interactive")
    XCTAssertEqual(params["terminal"] as? String, "term-1")
    XCTAssertTrue(controller.allowsInput)
    XCTAssertEqual(controller.role, .interactive)
    _ = events
  }

  func testBackgroundFlipsToNotifyAndUnsubscribesThenResubscribes() async throws {
    let controller = AttachRoleController()
    controller.bind(client: client, terminal: "term-1") { _ in }

    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let afterBind = channel.sent.count

    controller.applyLifecycle(.background)

    // Unsubscribe interactive glyph stream, then subscribe role=notify.
    try await waitUntil { self.channel.sent.count >= afterBind + 2 }

    let frames = try decryptedFrames(from: afterBind)
    let methods = frames.map { $0["method"] as? String }
    XCTAssertEqual(methods, ["terminal.unsubscribe", "terminal.subscribe"])

    let notifyParams = frames[1]["params"] as! [String: Any]
    XCTAssertEqual(notifyParams["role"] as? String, "notify")
    XCTAssertEqual(notifyParams["terminal"] as? String, "term-1")
    XCTAssertEqual(controller.role, .notify)
    XCTAssertFalse(controller.allowsInput)
    XCTAssertFalse(controller.allowsDictation)
  }

  func testForegroundRestoresInteractiveSubscribe() async throws {
    let controller = AttachRoleController()
    controller.bind(client: client, terminal: "term-1") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")

    controller.applyLifecycle(.background)
    try await waitUntil {
      self.decryptedMethods().suffix(1).first == "terminal.subscribe"
        && (try? self.lastSubscribeRole()) == "notify"
    }

    let beforeFg = channel.sent.count
    controller.applyLifecycle(.active)
    try await waitUntil { self.channel.sent.count >= beforeFg + 2 }

    let frames = try decryptedFrames(from: beforeFg)
    XCTAssertEqual(frames.map { $0["method"] as? String }, [
      "terminal.unsubscribe",
      "terminal.subscribe"
    ])
    let params = frames[1]["params"] as! [String: Any]
    XCTAssertEqual(params["role"] as? String, "interactive")
    XCTAssertEqual(controller.role, .interactive)
    XCTAssertTrue(controller.allowsInput)
  }

  func testInactiveDoesNotFlipRole() async throws {
    let controller = AttachRoleController()
    controller.bind(client: client, terminal: "term-1") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let count = channel.sent.count

    controller.applyLifecycle(.inactive)
    try await Task.sleep(nanoseconds: 50_000_000)

    XCTAssertEqual(channel.sent.count, count)
    XCTAssertEqual(controller.role, .interactive)
  }

  func testSendTerminalTextBlockedWhileNotify() async throws {
    let session = CompanionSession(
      store: HostStore(metadata: InMemoryHostMetadataStore(), tokens: InMemoryHostTokenStore())
    )
    session.attachRole.setRole(.notify)
    XCTAssertFalse(session.allowsTerminalInput)
    XCTAssertFalse(session.allowsDictation)

    do {
      try await session.sendTerminalText(handle: "term-1", text: "hi", enter: true)
      XCTFail("expected notify input block")
    } catch let error as OrcaRpcError {
      XCTAssertEqual(error, .inputBlockedWhileNotify)
    }
  }

  func testUpdateViewportSendsInPlaceRpcWithoutResubscribe() async throws {
    let controller = AttachRoleController()
    controller.bind(client: client, terminal: "term-1", cols: 40, rows: 20) { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let afterBind = channel.sent.count

    controller.updateViewport(cols: 42, rows: 68)
    try await waitUntil {
      self.decryptedMethods().contains("terminal.updateViewport")
    }

    let frames = try decryptedFrames(from: afterBind)
    let methods = frames.map { $0["method"] as? String }
    XCTAssertEqual(methods, ["terminal.updateViewport"])
    XCTAssertFalse(methods.contains("terminal.unsubscribe"))
    XCTAssertFalse(methods.contains("terminal.subscribe"))

    let params = frames[0]["params"] as! [String: Any]
    XCTAssertEqual(params["terminal"] as? String, "term-1")
    let viewport = params["viewport"] as! [String: Any]
    XCTAssertEqual(viewport["cols"] as? Int, 42)
    XCTAssertEqual(viewport["rows"] as? Int, 68)
    let clientParam = params["client"] as! [String: Any]
    XCTAssertEqual(clientParam["type"] as? String, "mobile")
  }

  func testUnbindClearsSubscription() async throws {
    let controller = AttachRoleController()
    controller.bind(client: client, terminal: "term-1") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let before = channel.sent.count

    controller.unbind()
    // Unsubscribe runs on the RPC queue via sync — frame is on the wire when unbind returns.
    XCTAssertGreaterThanOrEqual(channel.sent.count, before + 1)

    let frames = try decryptedFrames(from: before)
    XCTAssertEqual(frames.first?["method"] as? String, "terminal.unsubscribe")
    XCTAssertNil(controller.boundTerminal)
    XCTAssertEqual(controller.role, .interactive)
  }

  // MARK: - Handshake / decrypt helpers

  private func completeHandshake() async throws -> Bytes {
    client.start()
    try await waitUntil { self.channel.sent.count >= 1 }

    let helloObj = try JSONSerialization.jsonObject(with: Data(channel.sent[0].utf8)) as! [String: Any]
    let shared = MockDesktopCrypto.sharedKey(
      clientPublicB64: helloObj["publicKeyB64"] as! String,
      serverSecret: desktopKeys.secretKey
    )
    channel.receive(#"{"type":"e2ee_ready"}"#)
    try await waitUntil { self.channel.sent.count >= 2 }

    let authed = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: shared
    )
    channel.receive(authed)
    try await client.waitUntilConnected(timeoutMs: 2_000)
    return shared
  }

  private func waitForDecryptedMethod(_ method: String) async throws -> [String: Any] {
    try await waitUntil {
      self.decryptedMethods().contains(method)
    }
    return try decryptedFrames(from: 0).last { $0["method"] as? String == method }!
  }

  private func decryptedFrames(from startIndex: Int) throws -> [[String: Any]] {
    var out: [[String: Any]] = []
    for text in channel.sent.dropFirst(startIndex) {
      // Handshake frames are plaintext JSON; skip those.
      if text.contains("e2ee_hello") { continue }
      if let obj = try? E2EECrypto.decryptTextJSON(text, sharedKey: shared) {
        out.append(obj)
      }
    }
    return out
  }

  private func decryptedMethods() -> [String] {
    (try? decryptedFrames(from: 0).compactMap { $0["method"] as? String }) ?? []
  }

  private func lastSubscribeRole() throws -> String? {
    let frames = try decryptedFrames(from: 0)
    guard let last = frames.last(where: { $0["method"] as? String == "terminal.subscribe" }),
          let params = last["params"] as? [String: Any]
    else { return nil }
    return params["role"] as? String
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
