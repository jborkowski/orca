import XCTest
@testable import OrcaCompanion

final class GhosttyVtEngineTests: XCTestCase {
  func testWriteAndPlainSnapshotContainsPayload() throws {
    let engine = try GhosttyVtEngine(cols: 40, rows: 12, maxScrollback: 100)
    engine.write(Data("hello ghostty-vt\r\n".utf8))
    let text = try engine.plainTextSnapshot()
    XCTAssertTrue(
      text.contains("hello ghostty-vt"),
      "expected snapshot to contain payload, got: \(text.debugDescription)"
    )
  }

  func testResizePreservesEngine() throws {
    let engine = try GhosttyVtEngine(cols: 20, rows: 10)
    try engine.resize(cols: 60, rows: 20)
    XCTAssertEqual(engine.cols, 60)
    XCTAssertEqual(engine.rows, 20)
  }
}
