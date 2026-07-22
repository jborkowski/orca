import XCTest
@testable import OrcaCompanion

final class E2EEHandshakeTests: XCTestCase {
  func testHelloThenReadyThenAuthenticated() throws {
    let server = E2EECrypto.generateKeyPair()
    var hs = try E2EEHandshake(
      deviceToken: "token-abc",
      serverPublicKeyB64: Data(server.publicKey).base64EncodedString()
    )

    let helloData = try hs.makeHelloJSON()
    let hello = try JSONSerialization.jsonObject(with: helloData) as! [String: Any]
    XCTAssertEqual(hello["type"] as? String, "e2ee_hello")
    XCTAssertEqual(hs.state, .sentHello)

    // Server derives shared key from client ephemeral public + server secret
    let clientPubB64 = hello["publicKeyB64"] as! String
    let clientPub = Array(Data(base64Encoded: clientPubB64)!)
    let serverShared = E2EECrypto.sharedKey(
      serverPublicKey: clientPub,
      clientSecretKey: server.secretKey
    )!
    XCTAssertEqual(hs.sharedKey, serverShared)

    let authWire = try hs.handlePlaintext(#"{"type":"e2ee_ready"}"#)
    XCTAssertNotNil(authWire)
    XCTAssertEqual(hs.state, .awaitingAuthResult)

    let authObj = try E2EECrypto.decryptTextJSON(authWire!, sharedKey: serverShared)
    XCTAssertEqual(authObj["type"] as? String, "e2ee_auth")
    XCTAssertEqual(authObj["deviceToken"] as? String, "token-abc")

    let okWire = try E2EECrypto.encryptTextJSON(
      ["type": "e2ee_authenticated"],
      sharedKey: serverShared
    )
    try hs.handleEncryptedText(okWire)
    XCTAssertEqual(hs.state, .authenticated)
  }
}
