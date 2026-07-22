import type { RefObject } from 'react'

// Phase 1 background outbound tear-down: when the app leaves the foreground we
// must not keep a live glyph stream subscribed (energy) and we must clear the
// "initialized" marks so the iOS foreground-recovery path resubscribes with a
// clean snapshot restore instead of trusting a stale backing store.

// Why: default OFF so a Metro reload against a live paired Orca keeps today's
// always-subscribed behaviour until background tear-down is explicitly enabled.
export const TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED = false

// Why: single readable accessor so callers/tests assert intent instead of the
// bare constant, keeping the default-off contract in one place.
export function isTerminalBackgroundTearDownEnabled(): boolean {
  return TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED
}

export function shouldTearDownTerminalOnBackground(
  previousState: string | null | undefined,
  nextState: string
): boolean {
  // Only the active→(inactive|background) edge; iOS walks active→inactive→
  // background, so gating on `active` fires the tear-down exactly once.
  return previousState === 'active' && (nextState === 'inactive' || nextState === 'background')
}

export type TerminalBackgroundTearDownPlan = {
  unsubscribeHandle: string | null
  clearInitializedHandles: string[]
}

export function planTerminalBackgroundTearDown({
  activeHandle,
  initializedHandles
}: {
  activeHandle: string | null | undefined
  initializedHandles: Iterable<string>
}): TerminalBackgroundTearDownPlan {
  return {
    unsubscribeHandle: activeHandle ?? null,
    clearInitializedHandles: Array.from(new Set(initializedHandles))
  }
}

type TerminalBackgroundTearDownOptions = {
  activeHandleRef: RefObject<string | null>
  initializedHandlesRef: RefObject<Set<string>>
  unsubscribeTerminal: (handle: string) => void
}

export function tearDownActiveTerminalForBackground({
  activeHandleRef,
  initializedHandlesRef,
  unsubscribeTerminal
}: TerminalBackgroundTearDownOptions): TerminalBackgroundTearDownPlan {
  const plan = planTerminalBackgroundTearDown({
    activeHandle: activeHandleRef.current,
    initializedHandles: initializedHandlesRef.current
  })
  // Leave activeHandleRef intact so foreground recovery knows which handle to
  // resubscribe; only the live stream + initialized marks are dropped here.
  if (plan.unsubscribeHandle) {
    unsubscribeTerminal(plan.unsubscribeHandle)
  }
  for (const handle of plan.clearInitializedHandles) {
    initializedHandlesRef.current.delete(handle)
  }
  return plan
}
