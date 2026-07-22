import Foundation

enum ConnectionState: String, Equatable, Sendable {
  case connecting
  case handshaking
  case connected
  case disconnected
  case reconnecting
  /// Fast-retry budget exhausted; no timers until revive.
  case parked
  case authFailed = "auth-failed"
  /// Protocol-version gate failed; terminal until a new client is created.
  case incompatible
}

/// Mirrors mobile `rpc-client-recovery-policy.ts` reconnect runway.
struct TransportRecoveryPolicy: Equatable, Sendable {
  var reconnectDelaysMs: [Int]
  var giveUpAfterAttempts: Int
  var stableConnectionResetMs: Int
  var handshakeTimeoutMs: Int

  static let `default` = TransportRecoveryPolicy(
    reconnectDelaysMs: [500, 1000, 2000, 4000, 8000, 15_000, 30_000, 60_000],
    giveUpAfterAttempts: 12,
    stableConnectionResetMs: 30_000,
    handshakeTimeoutMs: 5_000
  )
}

struct RpcErrorBody: Equatable, Sendable {
  var code: String
  var message: String
}

/// Parsed RPC envelope. `result` stays untyped JSON for S1 wire coverage.
struct RpcResponse {
  var id: String
  var ok: Bool
  var result: [String: Any]
  var streaming: Bool
  var error: RpcErrorBody?
  var runtimeId: String
}

enum RpcParseError: Error {
  case invalidJSON
  case incompatibleFrame
}

enum RpcFrameParser {
  static func parse(_ object: [String: Any]) throws -> RpcResponse {
    guard let id = object["id"] as? String else { throw RpcParseError.incompatibleFrame }
    let meta = object["_meta"] as? [String: Any]
    let runtimeId = meta?["runtimeId"] as? String ?? ""
    guard let ok = object["ok"] as? Bool else { throw RpcParseError.incompatibleFrame }
    if ok {
      let result = object["result"] as? [String: Any] ?? [:]
      let streaming = object["streaming"] as? Bool ?? false
      return RpcResponse(
        id: id,
        ok: true,
        result: result,
        streaming: streaming,
        error: nil,
        runtimeId: runtimeId
      )
    }
    let err = object["error"] as? [String: Any]
    let code = err?["code"] as? String ?? "error"
    let message = err?["message"] as? String ?? "Request failed"
    return RpcResponse(
      id: id,
      ok: false,
      result: [:],
      streaming: false,
      error: RpcErrorBody(code: code, message: message),
      runtimeId: runtimeId
    )
  }
}
