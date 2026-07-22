import { describe, expect, it } from 'vitest'
import {
  SINGLE_SURFACE_TERMINAL_PARK_ENABLED,
  shouldMountTerminalPane
} from './terminal-single-surface-park'

describe('single-surface terminal park', () => {
  it('defaults the park flag OFF so live Orca keeps opacity:0 multi-WebView behavior', () => {
    // Why: shipping default MUST stay off — this is the live-safety invariant for
    // paired Orca. Flipping it is an explicit, separate change.
    expect(SINGLE_SURFACE_TERMINAL_PARK_ENABLED).toBe(false)
  })

  describe('flag off (shipped multi-mounted default)', () => {
    it('mounts the active pane', () => {
      expect(shouldMountTerminalPane(true, false)).toBe(true)
    })

    it('keeps inactive panes mounted (opacity:0), never unmounts them', () => {
      expect(shouldMountTerminalPane(false, false)).toBe(true)
    })
  })

  describe('flag on (single-surface park)', () => {
    it('mounts the active pane', () => {
      expect(shouldMountTerminalPane(true, true)).toBe(true)
    })

    it('unmounts inactive panes', () => {
      expect(shouldMountTerminalPane(false, true)).toBe(false)
    })
  })

  it('uses the module default flag when parkEnabled is omitted', () => {
    // Matches TerminalPaneView's call site, which relies on the default.
    expect(shouldMountTerminalPane(true)).toBe(true)
    expect(shouldMountTerminalPane(false)).toBe(!SINGLE_SURFACE_TERMINAL_PARK_ENABLED)
  })
})
