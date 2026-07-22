import Foundation
@testable import OrcaCompanion
import XCTest

/// One-live-surface lease + subscribe teardown at the mount / RPC seam.
@MainActor
final class TerminalSurfaceMountGateTests: XCTestCase {
  func testClaimDisplacesPreviousMountBeforeNextIsActive() {
    let gate = TerminalSurfaceMountGate()
    var order: [String] = []

    gate.claim(mountId: "a", terminal: "term-a") {
      order.append("teardown-a")
    }
    XCTAssertEqual(gate.activeMountId, "a")
    XCTAssertEqual(gate.activeTerminalHandle, "term-a")
    XCTAssertEqual(gate.claimCount, 1)
    XCTAssertEqual(gate.teardownCount, 0)

    gate.claim(mountId: "b", terminal: "term-b") {
      order.append("teardown-b")
    }

    XCTAssertEqual(order, ["teardown-a"])
    XCTAssertEqual(gate.activeMountId, "b")
    XCTAssertEqual(gate.activeTerminalHandle, "term-b")
    XCTAssertEqual(gate.claimCount, 2)
    XCTAssertEqual(gate.teardownCount, 1)
    XCTAssertTrue(gate.hasLiveSurface)
  }

  func testReloadSameTerminalIsIdempotent() {
    let gate = TerminalSurfaceMountGate()
    var teardowns = 0

    gate.claim(mountId: "m1", terminal: "term-1") { teardowns += 1 }
    gate.claim(mountId: "m2", terminal: "term-1") { teardowns += 1 }
    gate.claim(mountId: "m3", terminal: "term-1") { teardowns += 1 }

    XCTAssertEqual(teardowns, 2)
    XCTAssertEqual(gate.activeMountId, "m3")
    XCTAssertEqual(gate.activeTerminalHandle, "term-1")
    XCTAssertEqual(gate.claimCount, 3)
    XCTAssertEqual(gate.teardownCount, 2)
  }

  func testReleaseIsIdempotentAndIgnoresStaleMountId() {
    let gate = TerminalSurfaceMountGate()
    var teardowns = 0
    gate.claim(mountId: "a", terminal: "t") { teardowns += 1 }

    gate.release(mountId: "stale")
    XCTAssertEqual(teardowns, 0)
    XCTAssertEqual(gate.activeMountId, "a")

    gate.release(mountId: "a")
    XCTAssertEqual(teardowns, 1)
    XCTAssertNil(gate.activeMountId)

    gate.releaseActive()
    gate.release(mountId: "a")
    XCTAssertEqual(teardowns, 1)
  }
}

@MainActor
final class SingleSurfaceSubscribeTeardownTests: XCTestCase {
  private var desktopKeys: E2EECrypto.KeyPair!
  private var deviceToken: String!
  private var channel: MockWebSocketChannel!
  private var client: OrcaRpcClient!
  private var shared: Bytes!

  override func setUp() async throws {
    desktopKeys = E2EECrypto.generateKeyPair()
    deviceToken = "device-token-single-surface"
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

  /// Workspace/tab switch: previous interactive stream unsubscribes before next subscribe.
  func testSwitchingTerminalUnsubscribesBeforeNextSubscribe() async throws {
    let attach = AttachRoleController()
    let gate = TerminalSurfaceMountGate()

    gate.claim(mountId: "m1", terminal: "term-a") {
      attach.unbind()
    }
    attach.bind(client: client, terminal: "term-a") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let afterFirst = channel.sent.count

    // Opening another tab/workspace: claim tears down prior bind, then new bind.
    gate.claim(mountId: "m2", terminal: "term-b") {
      attach.unbind()
    }
    attach.bind(client: client, terminal: "term-b") { _ in }

    try await waitUntil { self.channel.sent.count >= afterFirst + 2 }

    let frames = try decryptedFrames(from: afterFirst)
    let methods = frames.map { $0["method"] as? String }
    XCTAssertEqual(methods.first, "terminal.unsubscribe")
    XCTAssertEqual(methods.last, "terminal.subscribe")

    let unsubParams = frames[0]["params"] as! [String: Any]
    XCTAssertEqual(unsubParams["terminal"] as? String, "term-a")

    let subParams = frames.last!["params"] as! [String: Any]
    XCTAssertEqual(subParams["terminal"] as? String, "term-b")
    XCTAssertEqual(subParams["role"] as? String, "interactive")
    XCTAssertEqual(gate.activeTerminalHandle, "term-b")
    XCTAssertEqual(attach.boundTerminal, "term-b")
  }

  /// Reloading the same workspace twice must not leave stacked interactive roles.
  func testReloadSameWorkspaceUnsubscribesThenResubscribesOnce() async throws {
    let attach = AttachRoleController()
    let gate = TerminalSurfaceMountGate()

    gate.claim(mountId: "r1", terminal: "term-1") { attach.unbind() }
    attach.bind(client: client, terminal: "term-1") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let afterFirst = channel.sent.count

    gate.claim(mountId: "r2", terminal: "term-1") { attach.unbind() }
    attach.bind(client: client, terminal: "term-1") { _ in }

    try await waitUntil { self.channel.sent.count >= afterFirst + 2 }
    let frames = try decryptedFrames(from: afterFirst)
    XCTAssertEqual(frames.map { $0["method"] as? String }, [
      "terminal.unsubscribe",
      "terminal.subscribe"
    ])

    // Only one live bind — second reload teardown + third claim still one owner.
    gate.claim(mountId: "r3", terminal: "term-1") { attach.unbind() }
    attach.bind(client: client, terminal: "term-1") { _ in }
    try await waitUntil { self.channel.sent.count >= afterFirst + 4 }

    let allMethods = try decryptedFrames(from: afterFirst).map { $0["method"] as? String }
    let subscribes = allMethods.filter { $0 == "terminal.subscribe" }
    let unsubscribes = allMethods.filter { $0 == "terminal.unsubscribe" }
    XCTAssertEqual(subscribes.count, 2)
    XCTAssertEqual(unsubscribes.count, 2)
    XCTAssertEqual(attach.boundTerminal, "term-1")
    XCTAssertEqual(gate.activeMountId, "r3")
  }

  /// Host leave / disconnect path: releaseActive + unbind sends unsubscribe.
  func testHostLeaveReleasesSurfaceAndUnsubscribes() async throws {
    let attach = AttachRoleController()
    let gate = TerminalSurfaceMountGate()

    gate.claim(mountId: "h1", terminal: "term-x") { attach.unbind() }
    attach.bind(client: client, terminal: "term-x") { _ in }
    _ = try await waitForDecryptedMethod("terminal.subscribe")
    let afterBind = channel.sent.count

    gate.releaseActive()
    attach.unbind()

    try await waitUntil { self.channel.sent.count >= afterBind + 1 }
    let frames = try decryptedFrames(from: afterBind)
    XCTAssertEqual(frames.map { $0["method"] as? String }, ["terminal.unsubscribe"])
    XCTAssertNil(gate.activeMountId)
    XCTAssertNil(attach.boundTerminal)
  }

  // MARK: - Handshake helpers (same pattern as AttachRoleControllerTests)

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
      (try? self.decryptedFrames(from: 0).contains { $0["method"] as? String == method }) == true
    }
    return try decryptedFrames(from: 0).last { $0["method"] as? String == method }!
  }

  private func decryptedFrames(from startIndex: Int) throws -> [[String: Any]] {
    var out: [[String: Any]] = []
    for text in channel.sent.dropFirst(startIndex) {
      if let obj = try? E2EECrypto.decryptTextJSON(text, sharedKey: shared) {
        out.append(obj)
      }
    }
    return out
  }

  private func waitUntil(timeoutMs: Int = 2_000, _ predicate: @escaping () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(Double(timeoutMs) / 1000)
    while Date() < deadline {
      if predicate() { return }
      try await Task.sleep(nanoseconds: 10_000_000)
    }
    XCTFail("Timed out after \(timeoutMs)ms")
  }
}

final class SessionTerminalTabSubscribeParamsTests: XCTestCase {
  func testSubscribeParamsIncludeRoleAndViewport() {
    let tab = SessionTerminalTab(id: "t1", terminal: "term-1", title: "Shell")
    let params = tab.subscribeParams(clientId: "dev-1", cols: 100, rows: 40, role: .notify)
    XCTAssertEqual(params["terminal"] as? String, "term-1")
    XCTAssertEqual(params["role"] as? String, "notify")
    let viewport = params["viewport"] as! [String: Any]
    XCTAssertEqual(viewport["cols"] as? Int, 100)
    XCTAssertEqual(viewport["rows"] as? Int, 40)
    let client = params["client"] as! [String: Any]
    XCTAssertEqual(client["id"] as? String, "dev-1")
    XCTAssertEqual(client["type"] as? String, "mobile")
  }
}
