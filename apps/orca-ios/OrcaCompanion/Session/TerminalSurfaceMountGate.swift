import Foundation
import Observation

/// Enforces the one-live-surface rule: at most one Metal/VT pane may be mounted.
///
/// Why: workspace / host / tab switches must tear down the previous interactive
/// stream before the next starts. Role flips (`interactive` ↔ `notify`) stay on
/// `AttachRoleController` (I1); this gate only tracks which view owns the lease.
@MainActor
@Observable
final class TerminalSurfaceMountGate {
  private(set) var activeMountId: String?
  private(set) var activeTerminalHandle: String?

  /// How many mounts were displaced or released (tests / diagnostics).
  private(set) var teardownCount: Int = 0
  /// How many successful claims since last reset (tests).
  private(set) var claimCount: Int = 0

  private var activeTeardown: (() -> Void)?

  var hasLiveSurface: Bool { activeMountId != nil }

  /// Claim the single live surface. Always runs the previous mount's teardown
  /// first so reloads stay idempotent (no stacked interactive surfaces).
  func claim(mountId: String, terminal: String, teardown: @escaping () -> Void) {
    releaseActive()
    activeMountId = mountId
    activeTerminalHandle = terminal
    activeTeardown = teardown
    claimCount += 1
  }

  /// Release only if `mountId` still owns the lease (safe for stale tasks).
  func release(mountId: String) {
    guard activeMountId == mountId else { return }
    releaseActive()
  }

  /// Drop the current surface (host disconnect, workspace leave). Idempotent.
  func releaseActive() {
    guard activeMountId != nil || activeTeardown != nil else { return }
    let prior = activeTeardown
    activeTeardown = nil
    activeMountId = nil
    activeTerminalHandle = nil
    teardownCount += 1
    prior?()
  }

  func resetCountersForTests() {
    teardownCount = 0
    claimCount = 0
  }
}
