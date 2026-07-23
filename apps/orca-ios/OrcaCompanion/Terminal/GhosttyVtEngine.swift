import Foundation
import GhosttyVt
import UIKit

/// libghostty-vt (tip XCFramework) — VT state machine for iOS.
/// Why: tip’s `ghostty-vt.xcframework` is the official Apple-universal VT core.
/// Glyphs are drawn by Metal via `captureFrame()` (render-state API), not by libghostty itself.
final class GhosttyVtEngine: TerminalEngine {
  private(set) var terminal: GhosttyTerminal?
  private(set) var cols: Int
  private(set) var rows: Int
  /// Why: keep render-state across frames so dirty tracking and iterators stay hot.
  let renderCapture = RenderCaptureState()
  /// Companion chrome light/dark — remaps host dark TUIs on capture.
  private(set) var chromeAppearance: TerminalChromeAppearance = .light

  init(cols: Int = 80, rows: Int = 24, maxScrollback: Int = 5_000) throws {
    guard cols > 0, rows > 0 else { throw TerminalEngineError.invalidSize }
    self.cols = cols
    self.rows = rows

    var handle: GhosttyTerminal?
    let options = GhosttyTerminalOptions(
      cols: UInt16(cols),
      rows: UInt16(rows),
      max_scrollback: maxScrollback
    )
    let result = ghostty_terminal_new(nil, &handle, options)
    guard result == GHOSTTY_SUCCESS, let handle else {
      throw TerminalEngineError.nativeFailure(code: Int(result.rawValue))
    }
    terminal = handle
    applyChromeAppearance(
      TerminalChromeAppearance.from(style: UIScreen.main.traitCollection.userInterfaceStyle)
    )
  }

  deinit {
    if let terminal {
      ghostty_terminal_free(terminal)
    }
  }

  func resize(cols: Int, rows: Int) throws {
    guard cols > 0, rows > 0, let terminal else { throw TerminalEngineError.invalidSize }
    let result = ghostty_terminal_resize(
      terminal,
      UInt16(cols),
      UInt16(rows),
      8,
      16
    )
    guard result == GHOSTTY_SUCCESS else {
      throw TerminalEngineError.nativeFailure(code: Int(result.rawValue))
    }
    self.cols = cols
    self.rows = rows
    renderCapture.cachedCells.removeAll(keepingCapacity: true)
    renderCapture.cachedCols = 0
    renderCapture.cachedRows = 0
  }

  func write(_ data: Data) {
    guard let terminal, !data.isEmpty else { return }
    data.withUnsafeBytes { raw in
      guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return }
      ghostty_terminal_vt_write(terminal, base, raw.count)
    }
  }

  func plainTextSnapshot() throws -> String {
    guard let terminal else { throw TerminalEngineError.unavailable("no terminal") }

    var formatter: GhosttyFormatter?
    var options = GhosttyFormatterTerminalOptions()
    options.size = MemoryLayout<GhosttyFormatterTerminalOptions>.size
    options.emit = GHOSTTY_FORMATTER_FORMAT_PLAIN
    options.unwrap = true
    options.trim = true
    options.extra = GhosttyFormatterTerminalExtra()
    options.extra.size = MemoryLayout<GhosttyFormatterTerminalExtra>.size
    options.selection = nil

    let created = ghostty_formatter_terminal_new(nil, &formatter, terminal, options)
    guard created == GHOSTTY_SUCCESS, let formatter else {
      throw TerminalEngineError.nativeFailure(code: Int(created.rawValue))
    }
    defer { ghostty_formatter_free(formatter) }

    var outPtr: UnsafeMutablePointer<UInt8>?
    var outLen: Int = 0
    let formatted = ghostty_formatter_format_alloc(formatter, nil, &outPtr, &outLen)
    guard formatted == GHOSTTY_SUCCESS, let outPtr else {
      throw TerminalEngineError.nativeFailure(code: Int(formatted.rawValue))
    }
    defer { ghostty_free(nil, outPtr, outLen) }

    let data = Data(bytes: outPtr, count: outLen)
    return String(decoding: data, as: UTF8.self)
  }

  func reset() {
    guard let terminal else { return }
    ghostty_terminal_reset(terminal)
    renderCapture.cachedCells.removeAll(keepingCapacity: true)
    renderCapture.cachedCols = 0
    renderCapture.cachedRows = 0
  }

  /// Why: finger-drag scroll is local VT viewport motion through subscribe
  /// scrollback — not an RPC. Negative delta = older history (Ghostty convention).
  func scrollByRows(_ delta: Int) {
    guard let terminal, delta != 0 else { return }
    var behavior = GhosttyTerminalScrollViewport()
    behavior.tag = GHOSTTY_SCROLL_VIEWPORT_DELTA
    behavior.value.delta = .init(delta)
    ghostty_terminal_scroll_viewport(terminal, behavior)
    // Why: scroll changes which rows are visible but may not flip Ghostty's
    // dirty bit — drop the cell cache so Metal captures the new viewport.
    renderCapture.cachedCells.removeAll(keepingCapacity: true)
  }

  func scrollToBottom() {
    guard let terminal else { return }
    var behavior = GhosttyTerminalScrollViewport()
    behavior.tag = GHOSTTY_SCROLL_VIEWPORT_BOTTOM
    ghostty_terminal_scroll_viewport(terminal, behavior)
    renderCapture.cachedCells.removeAll(keepingCapacity: true)
  }

  /// Cursor Agent / full-screen TUIs use the alternate buffer — no local history.
  var isAlternateScreen: Bool {
    guard let terminal else { return false }
    var screen = GHOSTTY_TERMINAL_SCREEN_PRIMARY
    let result = withUnsafeMutablePointer(to: &screen) {
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_ACTIVE_SCREEN, $0)
    }
    return result == GHOSTTY_SUCCESS && screen == GHOSTTY_TERMINAL_SCREEN_ALTERNATE
  }

  /// Rows of history above the viewport (0 on alt-screen / empty primary).
  var scrollbackRows: Int {
    guard let terminal else { return 0 }
    var rows = 0
    let result = withUnsafeMutablePointer(to: &rows) {
      ghostty_terminal_get(terminal, GHOSTTY_TERMINAL_DATA_SCROLLBACK_ROWS, $0)
    }
    guard result == GHOSTTY_SUCCESS else { return 0 }
    return rows
  }

  /// Prefer PTY arrow-key scroll when local history cannot move.
  var needsRemoteScrollInput: Bool {
    isAlternateScreen || scrollbackRows == 0
  }

  /// Push Orca light/dark defaults into Ghostty (fg/bg/cursor + generated palette).
  func applyChromeAppearance(_ appearance: TerminalChromeAppearance) {
    guard let terminal else { return }
    chromeAppearance = appearance

    var fg = appearance.foreground.ghosttyRgb()
    var bg = appearance.background.ghosttyRgb()
    var cursor = appearance.cursor.ghosttyRgb()
    _ = withUnsafePointer(to: &fg) {
      ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_FOREGROUND, UnsafeRawPointer($0))
    }
    _ = withUnsafePointer(to: &bg) {
      ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_BACKGROUND, UnsafeRawPointer($0))
    }
    _ = withUnsafePointer(to: &cursor) {
      ghostty_terminal_set(terminal, GHOSTTY_TERMINAL_OPT_COLOR_CURSOR, UnsafeRawPointer($0))
    }

    var palette = [GhosttyColorRgb](repeating: GhosttyColorRgb(r: 0, g: 0, b: 0), count: 256)
    ghostty_color_palette_default(&palette)
    // harmonious=false for light: Ghostty orients the cube/ramp for light themes.
    let harmonious = appearance == .dark
    ghostty_color_palette_generate(nil, nil, &bg, &fg, harmonious, &palette)
    palette.withUnsafeBufferPointer { buf in
      _ = ghostty_terminal_set(
        terminal,
        GHOSTTY_TERMINAL_OPT_COLOR_PALETTE,
        UnsafeRawPointer(buf.baseAddress)
      )
    }

    renderCapture.cachedCells.removeAll(keepingCapacity: true)
    renderCapture.cachedCols = 0
    renderCapture.cachedRows = 0
    renderCapture.defaultFg = appearance.foreground
    renderCapture.defaultBg = appearance.background
  }
}
