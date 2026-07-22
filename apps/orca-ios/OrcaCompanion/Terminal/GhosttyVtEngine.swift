import Foundation
import GhosttyVt

/// libghostty-vt (tip XCFramework) — VT state machine for iOS.
/// Why: tip’s `ghostty-vt.xcframework` is the official Apple-universal VT core.
/// Glyphs are drawn by Metal via `captureFrame()` (render-state API), not by libghostty itself.
final class GhosttyVtEngine: TerminalEngine {
  private(set) var terminal: GhosttyTerminal?
  private(set) var cols: Int
  private(set) var rows: Int
  /// Why: keep render-state across frames so dirty tracking and iterators stay hot.
  let renderCapture = RenderCaptureState()

  init(cols: Int = 80, rows: Int = 24, maxScrollback: Int = 1_000) throws {
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
}
