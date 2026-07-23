import Foundation
import GhosttyVt
import UIKit

/// Terminal paper/ink aligned with Orca light/dark chrome.
enum TerminalChromeAppearance: Equatable, Sendable {
  case light
  case dark

  static func from(style: UIUserInterfaceStyle) -> TerminalChromeAppearance {
    style == .dark ? .dark : .light
  }

  var foreground: TerminalRGB {
    switch self {
    case .light: return TerminalRGB(r: 0x0A, g: 0x0A, b: 0x0A)
    case .dark: return TerminalRGB(r: 0xFA, g: 0xFA, b: 0xFA)
    }
  }

  var background: TerminalRGB {
    switch self {
    case .light: return TerminalRGB(r: 0xFF, g: 0xFF, b: 0xFF)
    case .dark: return TerminalRGB(r: 0x0A, g: 0x0A, b: 0x0A)
    }
  }

  var cursor: TerminalRGB { foreground }
}

extension TerminalRGB {
  var luminance: Float {
    let r = Float(r) / 255
    let g = Float(g) / 255
    let b = Float(b) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  var chroma: Float {
    let rf = Float(r), gf = Float(g), bf = Float(b)
    return (abs(rf - gf) + abs(gf - bf) + abs(bf - rf)) / 255
  }

  func ghosttyRgb() -> GhosttyColorRgb {
    GhosttyColorRgb(r: r, g: g, b: b)
  }
}

extension TerminalFrame {
  /// Why: desktop/Cursor Agent often paints a dark TUI; remap near-black /
  /// near-white cells so the companion chrome theme wins without killing ANSI hues.
  func remapped(for appearance: TerminalChromeAppearance) -> TerminalFrame {
    let paper = appearance.background
    let ink = appearance.foreground
    let mapped = cells.map { cell -> TerminalCell in
      var fg = cell.foreground
      var bg = cell.background
      let bgLum = bg.luminance
      let fgLum = fg.luminance

      switch appearance {
      case .light:
        if bgLum < 0.28 { bg = paper }
        if fgLum > 0.72, fg.chroma < 0.35 { fg = ink }
        if abs(fg.luminance - bg.luminance) < 0.28 {
          fg = bg.luminance >= 0.55 ? ink : paper
        }
      case .dark:
        if bgLum > 0.78 { bg = paper }
        if fgLum < 0.28, fg.chroma < 0.35 { fg = ink }
        if abs(fg.luminance - bg.luminance) < 0.28 {
          fg = bg.luminance >= 0.55
            ? TerminalRGB(r: 0x0A, g: 0x0A, b: 0x0A)
            : ink
        }
      }

      return TerminalCell(text: cell.text, foreground: fg, background: bg, width: cell.width)
    }
    return TerminalFrame(
      cols: cols,
      rows: rows,
      cells: mapped,
      defaultForeground: ink,
      defaultBackground: paper,
      cursorCol: cursorCol,
      cursorRow: cursorRow,
      cursorVisible: cursorVisible,
      dirty: dirty
    )
  }
}
