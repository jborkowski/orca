import Foundation

struct SessionTerminalTab: Identifiable, Equatable, Hashable, Sendable {
  var id: String
  var terminal: String
  var title: String

  static func parseList(from result: [String: Any]) -> [SessionTerminalTab] {
    let tabs = result["tabs"] as? [[String: Any]] ?? []
    return tabs.compactMap { tab in
      guard (tab["type"] as? String) == "terminal" || tab["terminal"] != nil else { return nil }
      let terminal = tab["terminal"] as? String
      let id = tab["id"] as? String
      guard let handle = terminal ?? id, !handle.isEmpty else { return nil }
      return SessionTerminalTab(
        id: id ?? handle,
        terminal: handle,
        title: (tab["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Terminal"
      )
    }
  }

  /// Params for `terminal.subscribe` — role comes from AttachRoleController / I1.
  func subscribeParams(
    clientId: String,
    cols: Int = 80,
    rows: Int = 24,
    role: WorkspaceAttachRole
  ) -> [String: Any] {
    [
      "terminal": terminal,
      "client": ["id": clientId, "type": "mobile"],
      "viewport": ["cols": cols, "rows": rows],
      "capabilities": ["terminalBinaryStream": 1],
      "role": role.rawValue
    ]
  }
}
