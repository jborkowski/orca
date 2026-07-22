import Foundation
@testable import OrcaCompanion
import XCTest

final class HostStoreTests: XCTestCase {
  private var store: HostStore!

  override func setUp() {
    super.setUp()
    store = HostStore(metadata: InMemoryHostMetadataStore(), tokens: InMemoryHostTokenStore())
  }

  func testSaveLoadRoundTripWithoutTokenInMetadata() throws {
    let host = HostProfile(
      id: "h1",
      name: "Desk",
      endpoint: "ws://127.0.0.1:6768",
      endpoints: ["ws://192.168.1.2:6768"],
      deviceToken: "tok-secret",
      publicKeyB64: Data(repeating: 1, count: 32).base64EncodedString(),
      lastConnected: 0
    )
    try store.saveHost(host)

    let loaded = try store.loadHosts()
    XCTAssertEqual(loaded.count, 1)
    XCTAssertEqual(loaded[0].deviceToken, "tok-secret")
    XCTAssertEqual(loaded[0].name, "Desk")

    // Metadata JSON must not embed the device token (Keychain split).
    let metadata = InMemoryHostMetadataStore()
    let tokens = InMemoryHostTokenStore()
    let writer = HostStore(metadata: metadata, tokens: tokens)
    try writer.saveHost(host)
    let raw = try XCTUnwrap(metadata.blob)
    let json = String(data: raw, encoding: .utf8)!
    XCTAssertFalse(json.contains("tok-secret"))
    XCTAssertFalse(json.contains("deviceToken"))
  }

  func testRemoveDropsHost() throws {
    let host = HostProfile.fromPairing(
      PairingOffer(
        endpoint: "ws://127.0.0.1:6768",
        endpoints: [],
        deviceToken: "t",
        publicKeyB64: Data(repeating: 2, count: 32).base64EncodedString(),
        scope: nil
      ),
      name: "A",
      id: "x"
    )
    try store.saveHost(host)
    try store.removeHost(id: "x")
    XCTAssertTrue(try store.loadHosts().isEmpty)
  }

  func testOrphanMetadataSkippedWithoutToken() throws {
    let metadata = InMemoryHostMetadataStore()
    let tokens = InMemoryHostTokenStore()
    let store = HostStore(metadata: metadata, tokens: tokens)
    let stored = StoredHostProfile(
      from: HostProfile(
        id: "orphan",
        name: "Gone",
        endpoint: "ws://127.0.0.1:6768",
        endpoints: [],
        deviceToken: "ignored",
        publicKeyB64: Data(repeating: 3, count: 32).base64EncodedString(),
        lastConnected: 1
      )
    )
    metadata.blob = try JSONEncoder().encode([stored])
    XCTAssertTrue(try store.loadHosts().isEmpty)
  }

  func testPromoteEndpoint() throws {
    var host = HostProfile(
      id: "h",
      name: "N",
      endpoint: "ws://a:6768",
      endpoints: ["ws://b:6768"],
      deviceToken: "t",
      publicKeyB64: Data(repeating: 4, count: 32).base64EncodedString(),
      lastConnected: 0
    )
    try store.saveHost(host)
    try store.promoteEndpoint(id: "h", endpoint: "ws://b:6768")
    host = try store.loadHosts()[0]
    XCTAssertEqual(host.endpoint, "ws://b:6768")
    XCTAssertTrue(host.endpoints.contains("ws://a:6768"))
  }

  func testPairMultipleHostsKeepsSeparateKeychainTokens() throws {
    let a = HostProfile(
      id: "home",
      name: "Home",
      endpoint: "ws://127.0.0.1:6768",
      endpoints: [],
      deviceToken: "tok-home",
      publicKeyB64: Data(repeating: 5, count: 32).base64EncodedString(),
      lastConnected: 1
    )
    let b = HostProfile(
      id: "work",
      name: "Work",
      endpoint: "ws://10.0.0.2:6768",
      endpoints: [],
      deviceToken: "tok-work",
      publicKeyB64: Data(repeating: 6, count: 32).base64EncodedString(),
      lastConnected: 2
    )
    try store.saveHost(a)
    try store.saveHost(b)
    let loaded = try store.loadHosts()
    XCTAssertEqual(loaded.count, 2)
    let byId = Dictionary(uniqueKeysWithValues: loaded.map { ($0.id, $0) })
    XCTAssertEqual(byId["home"]?.deviceToken, "tok-home")
    XCTAssertEqual(byId["work"]?.deviceToken, "tok-work")
  }
}
