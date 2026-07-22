import Foundation
@testable import OrcaCompanion
import XCTest

final class WorktreeSummaryTests: XCTestCase {
  func testParseList() {
    let result: [String: Any] = [
      "worktrees": [
        [
          "worktreeId": "wt-1",
          "displayName": "feature/x",
          "branch": "feature/x",
          "repo": "orca",
          "isActive": true,
          "liveTerminalCount": 2,
          "preview": "hello"
        ],
        [
          "worktreeId": "wt-2",
          "branch": "main",
          "repo": "orca",
          "isActive": false,
          "liveTerminalCount": 0,
          "preview": ""
        ]
      ]
    ]
    let list = WorktreeSummary.parseList(from: result)
    XCTAssertEqual(list.count, 2)
    XCTAssertEqual(list[0].displayName, "feature/x")
    XCTAssertTrue(list[0].isActive)
    XCTAssertEqual(list[1].displayName, "main")
  }

  func testSkipsRowsWithoutId() {
    let result: [String: Any] = [
      "worktrees": [["displayName": "nope"] as [String: Any]]
    ]
    XCTAssertTrue(WorktreeSummary.parseList(from: result).isEmpty)
  }
}
