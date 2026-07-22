import Foundation

/// Escape hatch when full Metal Ghostty embedding isn’t ready.
/// Why: keeps session code compiling/testable without WebView; implement real
/// SwiftTerm binding in a follow-up if ghostty-vt render path stalls.
final class SwiftTermEnginePlaceholder: TerminalEngine {
  private(set) var cols: Int
  private(set) var rows: Int
  private var buffer = Data()

  init(cols: Int = 80, rows: Int = 24) throws {
    guard cols > 0, rows > 0 else { throw TerminalEngineError.invalidSize }
    self.cols = cols
    self.rows = rows
  }

  func resize(cols: Int, rows: Int) throws {
    guard cols > 0, rows > 0 else { throw TerminalEngineError.invalidSize }
    self.cols = cols
    self.rows = rows
  }

  func write(_ data: Data) {
    buffer.append(data)
  }

  func plainTextSnapshot() throws -> String {
    // Not a real VT — strips obvious CSI for debug only.
    let raw = String(decoding: buffer, as: UTF8.self)
    return raw.replacingOccurrences(of: "\u{001B}\\[[0-9;]*[A-Za-z]", with: "", options: .regularExpression)
  }

  func reset() {
    buffer.removeAll(keepingCapacity: false)
  }
}
