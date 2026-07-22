import Foundation
import simd

struct TerminalRGB: Equatable, Sendable {
  var r: UInt8
  var g: UInt8
  var b: UInt8

  static let black = TerminalRGB(r: 12, g: 12, b: 14)
  static let white = TerminalRGB(r: 220, g: 223, b: 228)

  var float4: SIMD4<Float> {
    SIMD4(Float(r) / 255, Float(g) / 255, Float(b) / 255, 1)
  }
}

struct TerminalCell: Equatable, Sendable {
  var text: String
  var foreground: TerminalRGB
  var background: TerminalRGB
  /// How many grid columns this grapheme occupies (1 or 2 for wide/emoji).
  var width: Int

  static func empty(fg: TerminalRGB, bg: TerminalRGB) -> TerminalCell {
    TerminalCell(text: "", foreground: fg, background: bg, width: 1)
  }
}

enum TerminalDirtyKind: Equatable, Sendable {
  case none
  case partial(rows: IndexSet)
  case full
}

/// CPU-side grid produced from Ghostty render-state for the Metal glyph path.
struct TerminalFrame: Equatable, Sendable {
  var cols: Int
  var rows: Int
  var cells: [TerminalCell]
  var defaultForeground: TerminalRGB
  var defaultBackground: TerminalRGB
  var cursorCol: Int?
  var cursorRow: Int?
  var cursorVisible: Bool
  var dirty: TerminalDirtyKind

  func cell(col: Int, row: Int) -> TerminalCell? {
    guard col >= 0, row >= 0, col < cols, row < rows else { return nil }
    return cells[row * cols + col]
  }
}
