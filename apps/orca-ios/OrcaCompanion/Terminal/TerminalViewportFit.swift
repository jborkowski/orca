import Foundation
import CoreGraphics

/// Compute a terminal grid that keeps glyph cells at their natural pixel aspect.
/// Why: stretching a fixed 80×24 grid into a phone MTKView warps every glyph.
enum TerminalViewportFit {
  struct Grid: Equatable, Sendable {
    var cols: Int
    var rows: Int
    var cellWidth: Float
    var cellHeight: Float
    var originX: Float
    var originY: Float
  }

  static func fit(
    drawableSize: CGSize,
    cellPixelWidth: Int,
    cellPixelHeight: Int,
    minCols: Int = 20,
    minRows: Int = 8,
    maxCols: Int = 300,
    maxRows: Int = 200
  ) -> Grid {
    let cellW = Float(max(cellPixelWidth, 1))
    let cellH = Float(max(cellPixelHeight, 1))
    let drawableW = max(Float(drawableSize.width), cellW)
    let drawableH = max(Float(drawableSize.height), cellH)

    let cols = min(maxCols, max(minCols, Int(floor(drawableW / cellW))))
    let rows = min(maxRows, max(minRows, Int(floor(drawableH / cellH))))

    let gridW = Float(cols) * cellW
    let gridH = Float(rows) * cellH
    return Grid(
      cols: cols,
      rows: rows,
      cellWidth: cellW,
      cellHeight: cellH,
      originX: max(0, (drawableW - gridW) * 0.5),
      originY: max(0, (drawableH - gridH) * 0.5)
    )
  }
}
