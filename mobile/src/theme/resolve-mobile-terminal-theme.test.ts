import { describe, expect, it } from 'vitest'
import type { RuntimeMobileTerminalTheme } from '../../../src/shared/runtime-types'
import type { TerminalColorOverrides } from '../../../src/shared/types'
import { EINK_TERMINAL_THEME } from './mobile-eink-terminal-theme'
import { resolveMobileTerminalTheme } from './resolve-mobile-terminal-theme'

const EINK_BLACK = '#111111'
const EINK_WHITE = '#ffffff'

const EINK_ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const satisfies readonly (keyof TerminalColorOverrides)[]

const DESKTOP_THEME: RuntimeMobileTerminalTheme = {
  mode: 'dark',
  theme: {
    background: '#1a1b26',
    foreground: '#c0caf5'
  }
}

describe('EINK_TERMINAL_THEME', () => {
  it('uses pure black on white with a flat high-contrast ANSI palette', () => {
    const { theme } = EINK_TERMINAL_THEME

    expect(EINK_TERMINAL_THEME.mode).toBe('light')
    expect(theme.background).toBe(EINK_WHITE)
    expect(theme.foreground).toBe(EINK_BLACK)
    expect(theme.cursor).toBe(EINK_BLACK)
    expect(theme.cursorAccent).toBe(EINK_WHITE)
    expect(theme.selectionBackground).toBe(EINK_BLACK)
    expect(theme.selectionForeground).toBe(EINK_WHITE)

    for (const key of EINK_ANSI_KEYS) {
      expect(theme[key]).toBe(EINK_BLACK)
    }
  })
})

describe('resolveMobileTerminalTheme', () => {
  it('returns the e-ink terminal theme when e-ink mode is enabled', () => {
    expect(resolveMobileTerminalTheme(true, DESKTOP_THEME)).toBe(EINK_TERMINAL_THEME)
    expect(resolveMobileTerminalTheme(true)).toBe(EINK_TERMINAL_THEME)
  })

  it('returns the desktop theme when e-ink mode is disabled', () => {
    expect(resolveMobileTerminalTheme(false, DESKTOP_THEME)).toBe(DESKTOP_THEME)
  })

  it('returns undefined when e-ink mode is disabled and no desktop theme is provided', () => {
    expect(resolveMobileTerminalTheme(false)).toBeUndefined()
  })
})
