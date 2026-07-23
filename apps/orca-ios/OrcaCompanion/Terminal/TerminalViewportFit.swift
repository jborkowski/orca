import CoreGraphics
import Foundation
import UIKit

/// Fit cols×rows so each on-screen cell is exactly one atlas glyph cell (no stretch).
enum TerminalViewportFit {
  struct Grid: Equatable, Sendable {
    var cols: Int
    var rows: Int
    var cellWidth: Float
    var cellHeight: Float
    var originX: Float
    var originY: Float
    var drawableWidth: Float
    var drawableHeight: Float
  }

  static func fit(
    drawablePixels: CGSize,
    cellPixelWidth: Int,
    cellPixelHeight: Int,
    minCols: Int = 20,
    minRows: Int = 8,
    maxCols: Int = 200,
    maxRows: Int = 120
  ) -> Grid? {
    let cellW = max(cellPixelWidth, 1)
    let cellH = max(cellPixelHeight, 1)
    let dw = Int(drawablePixels.width.rounded(.down))
    let dh = Int(drawablePixels.height.rounded(.down))
    guard dw >= cellW * minCols / 2, dh >= cellH * minRows / 2 else { return nil }

    let cols = min(maxCols, max(minCols, dw / cellW))
    let rows = min(maxRows, max(minRows, dh / cellH))
    guard cols > 0, rows > 0 else { return nil }

    let gridW = Float(cols * cellW)
    let gridH = Float(rows * cellH)
    let drawableW = Float(max(dw, 1))
    let drawableH = Float(max(dh, 1))
    return Grid(
      cols: cols,
      rows: rows,
      cellWidth: Float(cellW),
      cellHeight: Float(cellH),
      originX: max(0, (drawableW - gridW) * 0.5),
      originY: max(0, (drawableH - gridH) * 0.5),
      drawableWidth: drawableW,
      drawableHeight: drawableH
    )
  }
}
