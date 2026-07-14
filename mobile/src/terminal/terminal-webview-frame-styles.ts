import { StyleSheet, type ViewStyle } from 'react-native'
import { colors } from '../theme/mobile-theme'

export const TERMINAL_WEBVIEW_FRAME_STYLES = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.terminalBg
  },
  webview: {
    flex: 1,
    backgroundColor: colors.terminalBg
  }
})

export function terminalWebViewBackgroundStyle(backgroundColor?: string): ViewStyle | undefined {
  return backgroundColor ? { backgroundColor } : undefined
}
