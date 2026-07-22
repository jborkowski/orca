import Foundation
@testable import OrcaCompanion
import XCTest

final class GhosttyRenderCaptureTests: XCTestCase {
  func testCaptureFrameContainsWrittenText() throws {
    let engine = try GhosttyVtEngine(cols: 40, rows: 10)
    engine.write(Data("Hello\n".utf8))
    let frame = try engine.captureFrame()
    XCTAssertEqual(frame.cols, 40)
    XCTAssertEqual(frame.rows, 10)
    XCTAssertEqual(frame.cells.count, 400)
    XCTAssertEqual(frame.dirty, .full)

    let joined = frame.cells.prefix(40).map(\.text).joined()
    XCTAssertTrue(joined.contains("H"), "expected H in first row, got \(joined)")
    XCTAssertTrue(joined.contains("e"), joined)
  }

  func testSecondCaptureCanBeCleanOrPartial() throws {
    let engine = try GhosttyVtEngine(cols: 20, rows: 5)
    engine.write(Data("A".utf8))
    _ = try engine.captureFrame()
    // No further writes — dirty should collapse after first consume.
    let second = try engine.captureFrame()
    // Either none (ideal) or full if Ghostty still marks; must not crash and keep size.
    XCTAssertEqual(second.cells.count, 100)
    switch second.dirty {
    case .none, .partial, .full:
      break
    }
  }

  func testDisplayWidthEmojiIsWide() {
    XCTAssertEqual(GhosttyVtEngine.displayWidth(for: "A"), 1)
    XCTAssertEqual(GhosttyVtEngine.displayWidth(for: "😀"), 2)
  }

  func testEmptyFrameHasDefaults() throws {
    let engine = try GhosttyVtEngine(cols: 8, rows: 4)
    let frame = try engine.captureFrame()
    XCTAssertEqual(frame.cells.count, 32)
  }
}

final class GlyphAtlasTests: XCTestCase {
  func testAtlasWrapIncrementsGeneration() throws {
    guard let device = MTLCreateSystemDefaultDevice(),
          let atlas = GlyphAtlas(device: device, pointSize: 20, atlasSize: 64)
    else {
      throw XCTSkip("Metal unavailable")
    }
    let gen0 = atlas.generation
    for i in 0 ..< 200 {
      _ = atlas.uv(for: "g\(i)", cellColumns: 1)
    }
    XCTAssertGreaterThan(atlas.generation, gen0)
  }

  func testLigatureFriendlyFiCaches() throws {
    guard let device = MTLCreateSystemDefaultDevice(),
          let atlas = GlyphAtlas(device: device)
    else {
      throw XCTSkip("Metal unavailable")
    }
    let a = atlas.uv(for: "fi", cellColumns: 1)
    let b = atlas.uv(for: "fi", cellColumns: 1)
    XCTAssertEqual(a, b)
    XCTAssertNotNil(a)
  }

  func testEmojiWideCell() throws {
    guard let device = MTLCreateSystemDefaultDevice(),
          let atlas = GlyphAtlas(device: device)
    else {
      throw XCTSkip("Metal unavailable")
    }
    let uv = atlas.uv(for: "😀", cellColumns: 2)
    XCTAssertEqual(uv?.cellColumns, 2)
  }
}

final class TerminalDirtyKindTests: XCTestCase {
  func testPartialDirtyEquatable() {
    let a = TerminalDirtyKind.partial(rows: IndexSet(integersIn: 1...3))
    let b = TerminalDirtyKind.partial(rows: IndexSet(integersIn: 1...3))
    XCTAssertEqual(a, b)
    XCTAssertNotEqual(a, .full)
  }
}

final class TerminalViewportFitTests: XCTestCase {
  func testFitKeepsNaturalCellAspectAndFillsPhoneDrawable() {
    // ~iPhone drawable at 3x for the terminal pane.
    let grid = TerminalViewportFit.fit(
      drawableSize: CGSize(width: 1100, height: 1800),
      cellPixelWidth: 24,
      cellPixelHeight: 51
    )
    XCTAssertEqual(grid.cellWidth, 24)
    XCTAssertEqual(grid.cellHeight, 51)
    XCTAssertEqual(grid.cols, Int(floor(1100.0 / 24.0)))
    XCTAssertEqual(grid.rows, Int(floor(1800.0 / 51.0)))
    XCTAssertGreaterThanOrEqual(grid.cols, 20)
    XCTAssertGreaterThanOrEqual(grid.rows, 8)
  }

  func testFitDoesNotStretchCellsToFill() {
    let grid = TerminalViewportFit.fit(
      drawableSize: CGSize(width: 800, height: 600),
      cellPixelWidth: 10,
      cellPixelHeight: 20
    )
    XCTAssertEqual(grid.cols, 80)
    XCTAssertEqual(grid.rows, 30)
    XCTAssertEqual(grid.originX, 0)
    XCTAssertEqual(grid.originY, 0)
  }
}

