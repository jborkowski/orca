// Why: encodes the single-surface "park" policy so both the WebView host and a
// future native Ghostty host mount/tear down on the same rules. Pure functions
// only — no React, no platform globals — so the policy is trivially testable.

// The AppState transitions this policy acts on. RN's AppStateStatus is a superset
// ('unknown', iOS-only 'extension') and its currentState can be null before the
// first event; callers pass those raw, so the predicate below narrows by literal
// comparison rather than forcing every call site to pre-filter.
export type TerminalSurfaceAppState = 'active' | 'background' | 'inactive'

// Single-surface park: only the active surface is mounted; others stay unmounted.
export function shouldMountTerminalSurface(active: boolean): boolean {
  return active
}

// Why: tear down when leaving `active` for `background`/`inactive` on BOTH iOS and
// Android to reclaim energy. This is broader than iOS-only foreground recovery,
// which only re-subscribes on the way back into `active`. Ambiguous states RN can
// emit ('unknown'/'extension') and a null initial `previous` never trigger teardown
// — we only reclaim on a clear background transition. Input types mirror the sibling
// recovery predicate so callers can hand off AppStateStatus / currentState directly.
export function shouldTearDownTerminalSurfaceOnAppState(
  previous: string | null | undefined,
  next: string
): boolean {
  return previous === 'active' && (next === 'background' || next === 'inactive')
}
