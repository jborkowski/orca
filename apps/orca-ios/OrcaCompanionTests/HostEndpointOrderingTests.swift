import XCTest
@testable import OrcaCompanion

final class HostEndpointOrderingTests: XCTestCase {
  func testDetectsTailscaleCGNATAndMagicDNS() {
    XCTAssertTrue(HostEndpointOrdering.isTailscaleEndpoint("ws://100.77.7.70:6768"))
    XCTAssertTrue(HostEndpointOrdering.isTailscaleEndpoint("ws://100.64.0.5:6768"))
    XCTAssertTrue(HostEndpointOrdering.isTailscaleEndpoint("wss://host.ts.net"))
    XCTAssertFalse(HostEndpointOrdering.isTailscaleEndpoint("ws://192.168.1.24:6768"))
    XCTAssertFalse(HostEndpointOrdering.isTailscaleEndpoint("ws://100.63.0.1:6768"))
  }

  func testPrefersTailscaleBeforeLANEvenWhenLANIsPrimary() {
    let ordered = HostEndpointOrdering.orderedCandidates(
      primary: "ws://192.168.1.24:6768",
      extras: ["ws://100.77.7.70:6768", "ws://192.168.1.24:6768"],
      preferTailscale: true
    )
    XCTAssertEqual(
      ordered,
      ["ws://100.77.7.70:6768", "ws://192.168.1.24:6768"]
    )
  }

  func testHostProfileCandidateEndpointsPreferTailscale() {
    let host = HostProfile(
      id: "h1",
      name: "Titan",
      endpoint: "ws://192.168.1.24:6768",
      endpoints: ["ws://192.168.1.24:6768", "ws://100.77.7.70:6768"],
      deviceToken: "tok",
      publicKeyB64: Data(repeating: 1, count: 32).base64EncodedString(),
      lastConnected: 0
    )
    XCTAssertEqual(host.candidateEndpoints.first, "ws://100.77.7.70:6768")
  }

  func testLANTimeoutIsShortWhenTailscaleRemains() {
    XCTAssertEqual(
      HostEndpointOrdering.connectTimeoutMs(
        for: "ws://192.168.1.24:6768",
        remainingIncludesTailscale: true
      ),
      3_000
    )
    XCTAssertEqual(
      HostEndpointOrdering.connectTimeoutMs(
        for: "ws://100.77.7.70:6768",
        remainingIncludesTailscale: false
      ),
      20_000
    )
  }
}
