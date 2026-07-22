// Why: the single-surface "park" decision (feature flag + mount predicate) lives
// in a React-free module so it is unit-testable in the vitest node env without
// react-test-renderer. TerminalPaneView.tsx only consumes shouldMountTerminalPane.

import { shouldMountTerminalSurface } from './terminal-surface-mount-policy'

// Why: default OFF so Metro reloads against a live paired Orca keep today's
// opacity:0 multi-WebView behavior until single-surface park is explicitly enabled.
export const SINGLE_SURFACE_TERMINAL_PARK_ENABLED = false

// Why: flag off keeps every pane mounted (inactive ones at opacity:0) to match
// shipped Orca mobile; flag on unmounts inactive panes via the surface policy so
// only the active terminal surface stays mounted.
export function shouldMountTerminalPane(
  active: boolean,
  parkEnabled: boolean = SINGLE_SURFACE_TERMINAL_PARK_ENABLED
): boolean {
  return !parkEnabled || shouldMountTerminalSurface(active)
}
