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

  func testScrollByRowsDoesNotCrashWithScrollback() throws {
    let engine = try GhosttyVtEngine(cols: 40, rows: 8, maxScrollback: 200)
    for i in 0 ..< 40 {
      engine.write(Data("line-\(i)\r\n".utf8))
    }
    engine.scrollByRows(-5)
    let frame = try engine.captureFrame()
    XCTAssertEqual(frame.rows, 8)
    engine.scrollToBottom()
    _ = try engine.captureFrame()
    XCTAssertFalse(engine.isAlternateScreen)
  }

  func testAlternateScreenDetectedFromDECSET() throws {
    let engine = try GhosttyVtEngine(cols: 20, rows: 10, maxScrollback: 50)
    XCTAssertFalse(engine.isAlternateScreen)
    // CSI ? 1049 h — enter alt screen (xterm)
    engine.write(Data("\u{1b}[?1049h".utf8))
    XCTAssertTrue(engine.isAlternateScreen)
    XCTAssertTrue(engine.needsRemoteScrollInput)
    engine.write(Data("\u{1b}[?1049l".utf8))
    XCTAssertFalse(engine.isAlternateScreen)
  }
}
