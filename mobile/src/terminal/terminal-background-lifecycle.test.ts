import { readFileSync } from 'node:fs'
import type { RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED,
  isTerminalBackgroundTearDownEnabled,
  planTerminalBackgroundTearDown,
  shouldTearDownTerminalOnBackground,
  tearDownActiveTerminalForBackground
} from './terminal-background-lifecycle'

const sessionSource = readFileSync(
  new URL('../../app/h/[hostId]/session/[worktreeId].tsx', import.meta.url),
  'utf8'
)

describe('TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED', () => {
  it('defaults to off so live paired Orca keeps always-subscribed behaviour', () => {
    expect(TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED).toBe(false)
  })

  it('is mirrored by the isTerminalBackgroundTearDownEnabled accessor', () => {
    expect(isTerminalBackgroundTearDownEnabled()).toBe(TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED)
    expect(isTerminalBackgroundTearDownEnabled()).toBe(false)
  })
})

describe('shouldTearDownTerminalOnBackground', () => {
  it('tears down on the active→inactive and active→background edges', () => {
    expect(shouldTearDownTerminalOnBackground('active', 'inactive')).toBe(true)
    expect(shouldTearDownTerminalOnBackground('active', 'background')).toBe(true)
  })

  it('does not tear down when returning to or staying in the foreground', () => {
    expect(shouldTearDownTerminalOnBackground('background', 'active')).toBe(false)
    expect(shouldTearDownTerminalOnBackground('inactive', 'active')).toBe(false)
    expect(shouldTearDownTerminalOnBackground('active', 'active')).toBe(false)
  })

  it('fires only once across the iOS active→inactive→background walk', () => {
    // Gating on `active` means the later inactive→background hop is a no-op, so
    // we never double-unsubscribe within a single backgrounding sequence.
    expect(shouldTearDownTerminalOnBackground('active', 'inactive')).toBe(true)
    expect(shouldTearDownTerminalOnBackground('inactive', 'background')).toBe(false)
  })

  it('ignores nullish previous states (cold start / first sample)', () => {
    expect(shouldTearDownTerminalOnBackground(null, 'background')).toBe(false)
    expect(shouldTearDownTerminalOnBackground(undefined, 'inactive')).toBe(false)
  })

  it('does not tear down when the active state is unchanged or unknown', () => {
    expect(shouldTearDownTerminalOnBackground('active', 'unknown')).toBe(false)
    expect(shouldTearDownTerminalOnBackground('inactive', 'inactive')).toBe(false)
    expect(shouldTearDownTerminalOnBackground('background', 'background')).toBe(false)
  })

  it('requires the exact active previous state (not a stale background sample)', () => {
    expect(shouldTearDownTerminalOnBackground('background', 'inactive')).toBe(false)
  })
})

describe('planTerminalBackgroundTearDown', () => {
  it('unsubscribes the active handle and clears every initialized mark', () => {
    const plan = planTerminalBackgroundTearDown({
      activeHandle: 'term-1',
      initializedHandles: new Set(['term-1', 'term-2'])
    })
    expect(plan.unsubscribeHandle).toBe('term-1')
    expect(plan.clearInitializedHandles.sort()).toEqual(['term-1', 'term-2'])
  })

  it('clears initialized marks even when nothing is active', () => {
    const plan = planTerminalBackgroundTearDown({
      activeHandle: null,
      initializedHandles: new Set(['term-2'])
    })
    expect(plan.unsubscribeHandle).toBeNull()
    expect(plan.clearInitializedHandles).toEqual(['term-2'])
  })

  it('normalizes an undefined active handle to null', () => {
    const plan = planTerminalBackgroundTearDown({
      activeHandle: undefined,
      initializedHandles: []
    })
    expect(plan.unsubscribeHandle).toBeNull()
    expect(plan.clearInitializedHandles).toEqual([])
  })

  it('clears an initialized handle even if it is not the active surface', () => {
    // An inactive-mounted terminal can still be initialized; its stale backing
    // store must be re-hydrated on the next foreground too.
    const plan = planTerminalBackgroundTearDown({
      activeHandle: 'term-1',
      initializedHandles: new Set(['term-2'])
    })
    expect(plan.unsubscribeHandle).toBe('term-1')
    expect(plan.clearInitializedHandles).toEqual(['term-2'])
  })

  it('dedupes repeated initialized handles', () => {
    const plan = planTerminalBackgroundTearDown({
      activeHandle: 'term-1',
      initializedHandles: ['term-1', 'term-1', 'term-2']
    })
    expect(plan.clearInitializedHandles.sort()).toEqual(['term-1', 'term-2'])
  })
})

type TearDownHarness = {
  activeHandleRef: RefObject<string | null>
  initializedHandlesRef: RefObject<Set<string>>
  unsubscribeTerminal: ReturnType<typeof vi.fn<(handle: string) => void>>
}

function createHarness(active: string | null, initialized: string[]): TearDownHarness {
  return {
    activeHandleRef: { current: active },
    initializedHandlesRef: { current: new Set(initialized) },
    unsubscribeTerminal: vi.fn()
  }
}

describe('tearDownActiveTerminalForBackground', () => {
  it('unsubscribes the active handle and drops all initialized marks', () => {
    const harness = createHarness('term-1', ['term-1', 'term-2'])

    tearDownActiveTerminalForBackground(harness)

    expect(harness.unsubscribeTerminal).toHaveBeenCalledWith('term-1')
    expect(harness.unsubscribeTerminal).toHaveBeenCalledTimes(1)
    expect(harness.initializedHandlesRef.current.size).toBe(0)
  })

  it('keeps activeHandleRef so foreground recovery can resubscribe it', () => {
    const harness = createHarness('term-1', ['term-1'])

    tearDownActiveTerminalForBackground(harness)

    expect(harness.activeHandleRef.current).toBe('term-1')
  })

  it('still clears initialized marks when there is no active handle', () => {
    const harness = createHarness(null, ['term-2'])

    tearDownActiveTerminalForBackground(harness)

    expect(harness.unsubscribeTerminal).not.toHaveBeenCalled()
    expect(harness.initializedHandlesRef.current.has('term-2')).toBe(false)
  })

  it('unsubscribes only the active handle while clearing every initialized mark', () => {
    const harness = createHarness('term-1', ['term-1', 'term-2', 'term-3'])

    tearDownActiveTerminalForBackground(harness)

    expect(harness.unsubscribeTerminal).toHaveBeenCalledTimes(1)
    expect(harness.unsubscribeTerminal).toHaveBeenCalledWith('term-1')
    expect(harness.unsubscribeTerminal).not.toHaveBeenCalledWith('term-2')
    expect(harness.initializedHandlesRef.current.size).toBe(0)
  })

  it('is a no-op on refs when nothing is active or initialized', () => {
    const harness = createHarness(null, [])

    const plan = tearDownActiveTerminalForBackground(harness)

    expect(harness.unsubscribeTerminal).not.toHaveBeenCalled()
    expect(harness.initializedHandlesRef.current.size).toBe(0)
    expect(plan).toEqual({ unsubscribeHandle: null, clearInitializedHandles: [] })
  })

  it('returns the executed plan so callers can log the tear-down', () => {
    const harness = createHarness('term-1', ['term-1', 'term-2'])

    const plan = tearDownActiveTerminalForBackground(harness)

    expect(plan.unsubscribeHandle).toBe('term-1')
    expect(plan.clearInitializedHandles.sort()).toEqual(['term-1', 'term-2'])
  })
})

describe('background tear-down wiring in the session screen', () => {
  it('imports and invokes the tear-down coordinator from an AppState listener', () => {
    expect(sessionSource).toContain('shouldTearDownTerminalOnBackground')
    expect(sessionSource).toContain('tearDownActiveTerminalForBackground({')
    expect(sessionSource).toContain("AppState.addEventListener('change'")
  })

  it('runs tear-down before the existing foreground recovery in the same listener', () => {
    const tearDown = sessionSource.indexOf('tearDownActiveTerminalForBackground({')
    const recover = sessionSource.indexOf('recoverActiveTerminalAfterForeground({')
    expect(tearDown).toBeGreaterThanOrEqual(0)
    expect(recover).toBeGreaterThan(tearDown)
  })

  it('gates the tear-down call behind the default-off flag', () => {
    // Without the flag the session must no-op tear-down so live mobile keeps
    // today's always-subscribe behaviour against a paired Orca.
    expect(sessionSource).toContain('if (TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED && shouldTearDown)')
    const gate = sessionSource.indexOf('TERMINAL_BACKGROUND_TEAR_DOWN_ENABLED && shouldTearDown')
    const call = sessionSource.indexOf('tearDownActiveTerminalForBackground({')
    expect(gate).toBeGreaterThanOrEqual(0)
    expect(call).toBeGreaterThan(gate)
  })
})
