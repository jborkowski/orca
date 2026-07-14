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

describe('Android e-ink terminal keyboard visibility', () => {
  it('keeps the native WebView fixed and applies keyboard avoidance inside its document', () => {
    expect(terminalPaneSource).not.toContain('transform: [{ translateY: -keyboardLift }]')
    expect(terminalPaneSource).toContain('keyboardOffsetY={keyboardLift}')
    expect(terminalAppearanceSyncSource).toContain("type: 'set-keyboard-offset'")
    expect(terminalHtmlSource).toContain('function getSurfacePanY()')
    expect(terminalHtmlSource).toContain("msg.type === 'set-keyboard-offset'")
    expect(terminalHtmlSource).toContain("getSurfacePanY() + 'px) scale('")
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
