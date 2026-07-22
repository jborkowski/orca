import Foundation

/// Host-list status for the power-efficient companion (spec user story 22).
/// Why: users need to know which host is safe to open without retry thrash.
enum HostRuntimeStatus: String, Equatable, Sendable {
  /// Paired but not the active link.
  case idle
  /// Authenticated interactive/notify attach is live.
  case connected
  /// Transport parked after fast retry (I3 park core sets this via ConnectionState).
  case parked
  /// Protocol-version gate blocked this host.
  case incompatible

  var label: String {
    switch self {
    case .idle: return "Idle"
    case .connected: return "Connected"
    case .parked: return "Parked"
    case .incompatible: return "Incompatible"
    }
  }

  var systemImage: String {
    switch self {
    case .idle: return "circle"
    case .connected: return "checkmark.seal.fill"
    case .parked: return "pause.circle.fill"
    case .incompatible: return "exclamationmark.octagon.fill"
    }
  }

  /// Map live transport state for the active host (idle when no client).
  static func from(connectionState: ConnectionState?) -> HostRuntimeStatus {
    switch connectionState {
    case .connected: return .connected
    case .parked: return .parked
    case .incompatible: return .incompatible
    case .none, .disconnected, .connecting, .handshaking, .reconnecting, .authFailed:
      return .idle
    }
  }
}
