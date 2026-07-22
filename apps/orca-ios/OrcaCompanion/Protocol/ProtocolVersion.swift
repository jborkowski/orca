import Foundation

/// Mirrors `mobile/src/transport/protocol-version.ts` / desktop `RUNTIME_PROTOCOL_VERSION`.
/// Why: dual clients must hard-block incompatible hosts instead of silent misbehavior.
enum ProtocolVersion {
  static let clientVersion = 3
  static let minCompatibleDesktopVersion = 2

  enum Compat: Equatable {
    case ok
    case desktopTooOld(desktop: Int, required: Int)
    case clientTooOld(client: Int, required: Int)
  }

  static func evaluate(desktopProtocolVersion: Int, minCompatibleClientVersion: Int) -> Compat {
    if desktopProtocolVersion < minCompatibleDesktopVersion {
      return .desktopTooOld(desktop: desktopProtocolVersion, required: minCompatibleDesktopVersion)
    }
    if clientVersion < minCompatibleClientVersion {
      return .clientTooOld(client: clientVersion, required: minCompatibleClientVersion)
    }
    return .ok
  }
}
