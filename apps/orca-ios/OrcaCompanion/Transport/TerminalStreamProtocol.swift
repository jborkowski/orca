import Foundation

enum TerminalStreamOpcode: UInt8 {
  case output = 1
  case snapshotStart = 2
  case snapshotChunk = 3
  case snapshotEnd = 4
  case resized = 5
  case error = 6
  case metadata = 12
}

struct TerminalStreamFrame {
  var opcode: TerminalStreamOpcode
  var streamId: UInt32
  var seq: UInt64
  var payload: Data
}

enum TerminalStreamProtocol {
  static let kind: UInt8 = 0x74
  static let version: UInt8 = 1
  static let headerBytes = 16

  static func decode(_ bytes: Data) -> TerminalStreamFrame? {
    guard bytes.count >= headerBytes else { return nil }
    let kind = bytes[bytes.startIndex]
    let ver = bytes[bytes.startIndex + 1]
    guard kind == Self.kind, ver == Self.version else { return nil }
    guard let opcode = TerminalStreamOpcode(rawValue: bytes[bytes.startIndex + 2]) else { return nil }
    let streamId = readUInt32LE(bytes, at: 4)
    let high = UInt64(readUInt32LE(bytes, at: 8))
    let low = UInt64(readUInt32LE(bytes, at: 12))
    let payload = bytes.subdata(in: (bytes.startIndex + headerBytes) ..< bytes.endIndex)
    return TerminalStreamFrame(opcode: opcode, streamId: streamId, seq: (high << 32) | low, payload: payload)
  }

  static func decodeText(_ payload: Data) -> String {
    String(decoding: payload, as: UTF8.self)
  }

  static func decodeJSON(_ payload: Data) -> [String: Any]? {
    (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any]
  }

  private static func readUInt32LE(_ data: Data, at offset: Int) -> UInt32 {
    let i = data.startIndex + offset
    return UInt32(data[i])
      | (UInt32(data[i + 1]) << 8)
      | (UInt32(data[i + 2]) << 16)
      | (UInt32(data[i + 3]) << 24)
  }
}

/// Assembles SnapshotStart/Chunk/End into a single scrollback/resized event.
final class TerminalSnapshotAssembler {
  private var pending: [UInt32: (meta: [String: Any], chunks: [String])] = [:]

  enum Event {
    case output(streamId: UInt32, chunk: String)
    case snapshot(streamId: UInt32, kind: String, serialized: String, meta: [String: Any])
    case error(streamId: UInt32, message: String)
  }

  func ingest(_ frame: TerminalStreamFrame) -> Event? {
    switch frame.opcode {
    case .output:
      return .output(streamId: frame.streamId, chunk: TerminalStreamProtocol.decodeText(frame.payload))
    case .snapshotStart:
      guard let meta = TerminalStreamProtocol.decodeJSON(frame.payload) else { return nil }
      pending[frame.streamId] = (meta, [])
      return nil
    case .snapshotChunk:
      pending[frame.streamId]?.chunks.append(TerminalStreamProtocol.decodeText(frame.payload))
      return nil
    case .snapshotEnd:
      guard let snap = pending.removeValue(forKey: frame.streamId) else { return nil }
      let kind = (snap.meta["kind"] as? String) == "resized" ? "resized" : "scrollback"
      return .snapshot(
        streamId: frame.streamId,
        kind: kind,
        serialized: snap.chunks.joined(),
        meta: snap.meta
      )
    case .error:
      return .error(streamId: frame.streamId, message: TerminalStreamProtocol.decodeText(frame.payload))
    case .resized, .metadata:
      return nil
    }
  }
}
