import XCTest
@testable import OrcaCompanion

final class ProtocolVersionTests: XCTestCase {
  func testCompatibleWindowIsOk() {
    XCTAssertEqual(
      ProtocolVersion.evaluate(desktopProtocolVersion: 3, minCompatibleClientVersion: 2),
      .ok
    )
  }

  func testDesktopTooOld() {
    XCTAssertEqual(
      ProtocolVersion.evaluate(desktopProtocolVersion: 1, minCompatibleClientVersion: 2),
      .desktopTooOld(desktop: 1, required: 2)
    )
  }

  func testClientTooOld() {
    XCTAssertEqual(
      ProtocolVersion.evaluate(desktopProtocolVersion: 3, minCompatibleClientVersion: 99),
      .clientTooOld(client: 3, required: 99)
    )
  }
}
