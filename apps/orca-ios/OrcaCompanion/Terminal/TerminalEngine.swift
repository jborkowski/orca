import Foundation

/// Abstraction over VT backends so S3 can swap Ghostty-vt ↔ SwiftTerm without rewriting session code.
protocol TerminalEngine: AnyObject {
  var cols: Int { get }
  var rows: Int { get }

  func resize(cols: Int, rows: Int) throws
  func write(_ data: Data)
  /// Visible screen as plain text (for tests / debug dumps). Not the Metal glyph path.
  func plainTextSnapshot() throws -> String
  func reset()
  /// Scroll the visible viewport through local scrollback. Negative = older history.
  func scrollByRows(_ delta: Int)
}

enum TerminalEngineError: Error, Equatable {
  case invalidSize
  case nativeFailure(code: Int)
  case unavailable(String)
}
