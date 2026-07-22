import Foundation
@testable import OrcaCompanion
import XCTest

final class TerminalStreamProtocolTests: XCTestCase {
  func testDecodeOutputFrame() {
    var bytes = Data(count: 16)
    bytes[0] = 0x74
    bytes[1] = 1
    bytes[2] = TerminalStreamOpcode.output.rawValue
    // streamId = 7 little-endian at offset 4
    bytes[4] = 7
    let payload = Data("hi".utf8)
    bytes.append(payload)

    guard let frame = TerminalStreamProtocol.decode(bytes) else {
      return XCTFail("decode failed")
    }
    XCTAssertEqual(frame.opcode, .output)
    XCTAssertEqual(frame.streamId, 7)
    XCTAssertEqual(TerminalStreamProtocol.decodeText(frame.payload), "hi")
  }

  func testSnapshotAssembler() {
    let assembler = TerminalSnapshotAssembler()
    var start = Data(count: 16)
    start[0] = 0x74
    start[1] = 1
    start[2] = TerminalStreamOpcode.snapshotStart.rawValue
    start[4] = 3
    let meta = try! JSONSerialization.data(withJSONObject: ["kind": "scrollback"])
    start.append(meta)

    XCTAssertNil(assembler.ingest(TerminalStreamProtocol.decode(start)!))

    var chunk = Data(count: 16)
    chunk[0] = 0x74
    chunk[1] = 1
    chunk[2] = TerminalStreamOpcode.snapshotChunk.rawValue
    chunk[4] = 3
    chunk.append(Data("abc".utf8))
    XCTAssertNil(assembler.ingest(TerminalStreamProtocol.decode(chunk)!))

    var end = Data(count: 16)
    end[0] = 0x74
    end[1] = 1
    end[2] = TerminalStreamOpcode.snapshotEnd.rawValue
    end[4] = 3
    guard case .snapshot(_, let kind, let serialized, _)? = assembler.ingest(TerminalStreamProtocol.decode(end)!) else {
      return XCTFail("expected snapshot")
    }
    XCTAssertEqual(kind, "scrollback")
    XCTAssertEqual(serialized, "abc")
  }
}

final class SessionTerminalTabTests: XCTestCase {
  func testParseTerminalTabs() {
    let result: [String: Any] = [
      "tabs": [
        ["type": "terminal", "id": "t1", "terminal": "term-1", "title": "Shell"],
        ["type": "browser", "id": "b1"]
      ]
    ]
    let tabs = SessionTerminalTab.parseList(from: result)
    XCTAssertEqual(tabs.count, 1)
    XCTAssertEqual(tabs[0].terminal, "term-1")
    XCTAssertEqual(tabs[0].title, "Shell")
  }
}
