import type { RuntimeMobileTerminalTheme } from '../../../src/shared/runtime-types'

const EINK_BLACK = '#111111'
const EINK_WHITE = '#ffffff'

// Why: e-ink panels need a flat light terminal palette with high-contrast ANSI
// so TUI output stays readable without translucent tints.
export const EINK_TERMINAL_THEME: RuntimeMobileTerminalTheme = {
  mode: 'light',
  theme: {
    background: EINK_WHITE,
    foreground: EINK_BLACK,
    cursor: EINK_BLACK,
    cursorAccent: EINK_WHITE,
    selectionBackground: EINK_BLACK,
    selectionForeground: EINK_WHITE,
    black: EINK_BLACK,
    red: EINK_BLACK,
    green: EINK_BLACK,
    yellow: EINK_BLACK,
    blue: EINK_BLACK,
    magenta: EINK_BLACK,
    cyan: EINK_BLACK,
    white: EINK_BLACK,
    brightBlack: EINK_BLACK,
    brightRed: EINK_BLACK,
    brightGreen: EINK_BLACK,
    brightYellow: EINK_BLACK,
    brightBlue: EINK_BLACK,
    brightMagenta: EINK_BLACK,
    brightCyan: EINK_BLACK,
    brightWhite: EINK_BLACK
  }
}
