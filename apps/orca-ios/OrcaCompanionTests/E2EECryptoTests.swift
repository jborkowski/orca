import XCTest
@testable import OrcaCompanion

final class E2EECryptoTests: XCTestCase {
  func testRoundTripJSON() throws {
    let server = E2EECrypto.generateKeyPair()
    let client = E2EECrypto.generateKeyPair()
    guard let sharedA = E2EECrypto.sharedKey(
      serverPublicKey: server.publicKey,
      clientSecretKey: client.secretKey
    ),
      let sharedB = E2EECrypto.sharedKey(
        serverPublicKey: client.publicKey,
        clientSecretKey: server.secretKey
      )
    else {
      return XCTFail("shared key")
    }

    // Cross-compat: before(A's secret, B's public) === before(B's secret, A's public)
    XCTAssertEqual(sharedA, sharedB)

    let payload: [String: Any] = ["type": "e2ee_auth", "deviceToken": "valid-token"]
    let wire = try E2EECrypto.encryptTextJSON(payload, sharedKey: sharedA)
    let decoded = try E2EECrypto.decryptTextJSON(wire, sharedKey: sharedB)
    XCTAssertEqual(decoded["type"] as? String, "e2ee_auth")
    XCTAssertEqual(decoded["deviceToken"] as? String, "valid-token")
  }

  func testRejectsShortBundle() {
    let server = E2EECrypto.generateKeyPair()
    let client = E2EECrypto.generateKeyPair()
    guard let shared = E2EECrypto.sharedKey(
      serverPublicKey: server.publicKey,
      clientSecretKey: client.secretKey
    ) else {
      return XCTFail("shared key")
    }
    XCTAssertNil(E2EECrypto.decrypt(Data(repeating: 1, count: 10), sharedKey: shared))
  }
}
