import { useEffect } from 'react'
import type { ViewStyle } from 'react-native'
import type { RuntimeMobileTerminalTheme } from '../../../src/shared/runtime-types'
import { terminalWebViewBackgroundStyle } from './terminal-webview-frame-styles'
import type { TerminalWebViewCommand } from './terminal-webview-messages'

export function restoreTerminalWebViewAppearance(
  postMessage: (message: TerminalWebViewCommand) => void,
  terminalTheme: RuntimeMobileTerminalTheme | undefined,
  keyboardOffsetY: number
): void {
  postMessage({ type: 'set-theme', terminalTheme })
  if (keyboardOffsetY > 0) {
    postMessage({ type: 'set-keyboard-offset', offsetY: keyboardOffsetY })
  }
}

export function useTerminalWebViewAppearanceSync(
  postMessage: (message: TerminalWebViewCommand) => void,
  terminalTheme: RuntimeMobileTerminalTheme | undefined,
  textScale: number,
  keyboardOffsetY: number
): ViewStyle | undefined {
  useEffect(() => {
    postMessage({ type: 'set-theme', terminalTheme })
  }, [postMessage, terminalTheme])

  useEffect(() => {
    postMessage({ type: 'set-keyboard-offset', offsetY: Math.max(0, keyboardOffsetY) })
  }, [keyboardOffsetY, postMessage])

  // Why: mounted terminal panes survive settings visits, so appearance changes
  // must update the existing document without reloading its terminal state.
  useEffect(() => {
    postMessage({ type: 'set-font-scale', fontScale: textScale })
  }, [postMessage, textScale])

  return terminalWebViewBackgroundStyle(terminalTheme?.theme.background)
}
