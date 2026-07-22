import XCTest
@testable import OrcaCompanion

final class PairingOfferParserTests: XCTestCase {
  private let offerJSON: [String: Any] = [
    "v": 2,
    "endpoint": "ws://100.102.47.57:6768",
    "deviceToken": "token-abc",
    "publicKeyB64": Data(repeating: 7, count: 32).base64EncodedString(),
    "endpoints": ["ws://100.102.47.57:6768", "ws://192.168.0.10:6768"],
    "scope": "mobile"
  ]

  private func encodeOfferURL(query: Bool) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: offerJSON)
    let code = data.orcaBase64URLEncodedString()
    if query {
      return "orca://pair?code=\(code)"
    }
    return "orca://pair#\(code)"
  }

  func testParseQueryParam() throws {
    let url = try encodeOfferURL(query: true)
    let offer = try PairingOfferParser.parse(url)
    XCTAssertEqual(offer.endpoint, "ws://100.102.47.57:6768")
    XCTAssertEqual(offer.deviceToken, "token-abc")
    XCTAssertEqual(offer.endpoints.count, 2)
    XCTAssertEqual(offer.candidateEndpoints.first, offer.endpoint)
    XCTAssertEqual(offer.scope, "mobile")
  }

  func testParseFragment() throws {
    let url = try encodeOfferURL(query: false)
    let offer = try PairingOfferParser.parse(url)
    XCTAssertEqual(offer.deviceToken, "token-abc")
  }

  func testBareCode() throws {
    let data = try JSONSerialization.data(withJSONObject: offerJSON)
    let code = data.orcaBase64URLEncodedString()
    let offer = try PairingOfferParser.parse(code)
    XCTAssertEqual(offer.endpoint, "ws://100.102.47.57:6768")
  }

  func testRejectWrongHost() {
    XCTAssertThrowsError(try PairingOfferParser.parse("orca://pairing?code=abc")) { error in
      XCTAssertEqual(error as? PairingOfferError, .invalidURL)
    }
  }

  func testRejectBadVersion() throws {
    var bad = offerJSON
    bad["v"] = 1
    let data = try JSONSerialization.data(withJSONObject: bad)
    let code = data.orcaBase64URLEncodedString()
    XCTAssertThrowsError(try PairingOfferParser.parse(code)) { error in
      XCTAssertEqual(error as? PairingOfferError, .unsupportedVersion(1))
    }
  }

  func testRejectNon32BytePublicKey() throws {
    var bad = offerJSON
    bad["publicKeyB64"] = Data(repeating: 1, count: 16).base64EncodedString()
    let data = try JSONSerialization.data(withJSONObject: bad)
    let code = data.orcaBase64URLEncodedString()
    XCTAssertThrowsError(try PairingOfferParser.parse(code)) { error in
      XCTAssertEqual(error as? PairingOfferError, .invalidPublicKey)
    }
  }
}
