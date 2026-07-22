import Foundation

/// Mirrors `src/shared/workspace-attach.ts` `WorkspaceAttachClientRole`.
/// Why: interactive may take the terminal write floor; notify is read-through only.
enum WorkspaceAttachRole: String, Equatable, Sendable {
  case interactive
  case notify

  static let `default`: WorkspaceAttachRole = .interactive

  var allowsTerminalInput: Bool { self == .interactive }
  var allowsDictation: Bool { self == .interactive }
  /// Glyph/`terminal.subscribe` interactive stream — false while notify.
  var allowsGlyphStream: Bool { self == .interactive }

  static func parse(_ raw: Any?) -> WorkspaceAttachRole {
    guard let raw = raw as? String else { return .default }
    return WorkspaceAttachRole(rawValue: raw) ?? .default
  }
}

/// App lifecycle phases that drive attach-role flips (maps from SwiftUI `ScenePhase`).
enum CompanionLifecyclePhase: Equatable, Sendable {
  case active
  case inactive
  case background
}
