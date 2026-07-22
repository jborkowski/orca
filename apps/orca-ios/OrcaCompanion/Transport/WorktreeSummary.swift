import Foundation

struct WorktreeSummary: Identifiable, Equatable, Sendable {
  var id: String { worktreeId }
  var worktreeId: String
  var displayName: String
  var branch: String
  var repo: String
  var isActive: Bool
  var liveTerminalCount: Int
  var preview: String

  static func parseList(from result: [String: Any]) -> [WorktreeSummary] {
    let rows = result["worktrees"] as? [[String: Any]] ?? []
    return rows.compactMap { row in
      guard let worktreeId = row["worktreeId"] as? String, !worktreeId.isEmpty else { return nil }
      return WorktreeSummary(
        worktreeId: worktreeId,
        displayName: (row["displayName"] as? String).flatMap { $0.isEmpty ? nil : $0 }
          ?? (row["branch"] as? String)
          ?? worktreeId,
        branch: row["branch"] as? String ?? "",
        repo: row["repo"] as? String ?? "",
        isActive: row["isActive"] as? Bool ?? false,
        liveTerminalCount: row["liveTerminalCount"] as? Int ?? 0,
        preview: row["preview"] as? String ?? ""
      )
    }
  }
}

struct HostStatusSnapshot: Equatable, Sendable {
  var protocolVersion: Int?
  var minCompatibleClientVersion: Int?
  var runtimeId: String?

  static func parse(from result: [String: Any], runtimeId: String) -> HostStatusSnapshot {
    HostStatusSnapshot(
      protocolVersion: result["protocolVersion"] as? Int,
      minCompatibleClientVersion: result["minCompatibleClientVersion"] as? Int,
      runtimeId: runtimeId.isEmpty ? (result["runtimeId"] as? String) : runtimeId
    )
  }
}
