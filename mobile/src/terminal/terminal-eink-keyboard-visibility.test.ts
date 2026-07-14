import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const inputBarSource = readFileSync(
  new URL('../session/MobileTerminalInputBar.tsx', import.meta.url),
  'utf8'
)
const inputActionsSource = readFileSync(
  new URL('../session/MobileTerminalInputActions.tsx', import.meta.url),
  'utf8'
)
const terminalPaneSource = readFileSync(
  new URL('../session/TerminalPaneView.tsx', import.meta.url),
  'utf8'
)
const terminalWebViewSource = readFileSync(
  new URL('./TerminalWebView.tsx', import.meta.url),
  'utf8'
)
const terminalHtmlSource = readFileSync(
  new URL('./terminal-webview-html.ts', import.meta.url),
  'utf8'
)
const terminalFrameStylesSource = readFileSync(
  new URL('./terminal-webview-frame-styles.ts', import.meta.url),
  'utf8'
)
const terminalAppearanceSyncSource = readFileSync(
  new URL('./use-terminal-webview-appearance-sync.ts', import.meta.url),
  'utf8'
)
const ghosttyScrollbackSource = readFileSync(
  new URL('./terminal-webview-ghostty-scrollback-injected.ts', import.meta.url),
  'utf8'
)
const wtermAdapterSource = readFileSync(
  new URL('./terminal-webview-wterm-adapter-injected.ts', import.meta.url),
  'utf8'
)

describe('Android e-ink terminal keyboard visibility', () => {
  it('keeps the native WebView fixed and applies keyboard avoidance inside its document', () => {
    expect(terminalPaneSource).not.toContain('transform: [{ translateY: -keyboardLift }]')
    expect(terminalPaneSource).toContain('keyboardOffsetY={isEinkMode ? 0 : keyboardLift}')
    expect(terminalAppearanceSyncSource).toContain("type: 'set-keyboard-offset'")
    expect(terminalHtmlSource).toContain('function getSurfacePanY()')
    expect(terminalHtmlSource).toContain("msg.type === 'set-keyboard-offset'")
    expect(terminalHtmlSource).toContain("getSurfacePanY() + 'px) scale('")
  })

  it('flattens ANSI foreground and background colors before e-ink rendering', () => {
    expect(ghosttyScrollbackSource).toContain('normalizeGhosttyCellForEink')
    expect(ghosttyScrollbackSource).toContain('normalized.fg = GHOSTTY_DEFAULT_COLOR')
    expect(ghosttyScrollbackSource).toContain('normalized.bg = GHOSTTY_DEFAULT_COLOR')
    expect(ghosttyScrollbackSource).toContain('normalized.flags = normalized.flags & ~32')
    expect(wtermAdapterSource).toContain('isEinkPresentationTheme')
    expect(wtermAdapterSource).toContain('core.einkMode =')
  })

  it('paints the native WebView backing surface with the active terminal theme', () => {
    expect(terminalWebViewSource).toContain('terminalBackgroundStyle')
    expect(terminalAppearanceSyncSource).toContain('terminalWebViewBackgroundStyle(')
    expect(terminalFrameStylesSource).toContain('return backgroundColor ? { backgroundColor }')
  })

  it('uses e-ink-safe native input chrome and contrasting action icons', () => {
    expect(inputBarSource).toContain('selectionColor={colors.textPrimary}')
    expect(inputBarSource).toContain('cursorColor={colors.textPrimary}')
    expect(inputBarSource).toContain('disableFullscreenUI')
    expect(inputBarSource).toContain("keyboardAppearance={isEinkMode ? 'light' : 'dark'}")
    expect(inputBarSource).toContain('color={colors.onSurfaceBright}')
    expect(inputActionsSource).toContain('readonly colors: MobileThemeColors')
    expect(inputActionsSource).not.toContain("from '../theme/mobile-theme'")
  })
})
