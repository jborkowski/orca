import { describe, expect, it } from 'vitest'
import {
  shouldMountTerminalSurface,
  shouldTearDownTerminalSurfaceOnAppState
} from './terminal-surface-mount-policy'

describe('shouldMountTerminalSurface', () => {
  it('mounts only the active surface', () => {
    expect(shouldMountTerminalSurface(true)).toBe(true)
  })

  it('does not mount inactive surfaces (single-surface park)', () => {
    expect(shouldMountTerminalSurface(false)).toBe(false)
  })
})

describe('shouldTearDownTerminalSurfaceOnAppState', () => {
  it('tears down when leaving active for background', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState('active', 'background')).toBe(true)
  })

  it('tears down when leaving active for inactive', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState('active', 'inactive')).toBe(true)
  })

  it('does not tear down while staying active', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState('active', 'active')).toBe(false)
  })

  it('does not tear down on foreground transitions back to active', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState('background', 'active')).toBe(false)
    expect(shouldTearDownTerminalSurfaceOnAppState('inactive', 'active')).toBe(false)
  })

  it('does not tear down when already backgrounded', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState('background', 'inactive')).toBe(false)
    expect(shouldTearDownTerminalSurfaceOnAppState('inactive', 'background')).toBe(false)
  })

  it('does not tear down on RN states outside the acted-on set', () => {
    // RN's AppStateStatus is a superset: 'unknown' (all platforms) and 'extension'
    // (iOS). An ambiguous next state must not reclaim the surface.
    expect(shouldTearDownTerminalSurfaceOnAppState('active', 'unknown')).toBe(false)
    expect(shouldTearDownTerminalSurfaceOnAppState('active', 'extension')).toBe(false)
    expect(shouldTearDownTerminalSurfaceOnAppState('unknown', 'background')).toBe(false)
  })

  it('does not tear down when previous is null/undefined (initial currentState)', () => {
    expect(shouldTearDownTerminalSurfaceOnAppState(null, 'background')).toBe(false)
    expect(shouldTearDownTerminalSurfaceOnAppState(undefined, 'inactive')).toBe(false)
  })
})
