import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { TerminalWebView } from '../terminal/TerminalWebView'
import type {
  MobileTerminalTheme,
  TerminalKeyboardAvoidanceMetrics,
  TerminalModes,
  TerminalWebViewHandle
} from '../terminal/terminal-webview-contract'
import { shouldMountTerminalPane } from '../terminal/terminal-single-surface-park'
import { useMobileTheme } from '../theme/mobile-theme-context'
import { resolveMobileTerminalTheme } from '../theme/resolve-mobile-terminal-theme'

// Re-exported for call sites that import the flag from the pane; the source of
// truth (and its default-OFF live-safety invariant) lives in the pure park module.
export { SINGLE_SURFACE_TERMINAL_PARK_ENABLED } from '../terminal/terminal-single-surface-park'

type TerminalPaneViewProps = {
  handle: string
  active: boolean
  keyboardLift: number
  terminalTheme?: MobileTerminalTheme
  textScale: number
  onRef: (handle: string, ref: TerminalWebViewHandle | null) => void
  onWebReady: (handle: string) => void
  onSelectionMode: (handle: string, active: boolean) => void
  onSelectionCopy: (handle: string, text: string) => void
  onSelectionEvicted: (handle: string) => void
  onModesChanged: (handle: string, modes: TerminalModes) => void
  onKeyboardAvoidanceMetrics: (handle: string, metrics: TerminalKeyboardAvoidanceMetrics) => void
  onHaptic: (kind: 'selection' | 'success' | 'error' | 'edge-bump') => void
  onTerminalInput: (handle: string, bytes: string) => void
  onTerminalQueryReply: (handle: string, bytes: string) => void
  onTerminalTap: (handle: string) => void
  onFileTap: (handle: string, pathText: string, line: number | null, column: number | null) => void
  onOpenUrl: (handle: string, url: string) => void
  onTextScaleChange: (scale: number) => void
}

export function TerminalPaneView({
  handle,
  active,
  keyboardLift,
  terminalTheme,
  textScale,
  onRef,
  onWebReady,
  onSelectionMode,
  onSelectionCopy,
  onSelectionEvicted,
  onModesChanged,
  onKeyboardAvoidanceMetrics,
  onHaptic,
  onTerminalInput,
  onTerminalQueryReply,
  onTerminalTap,
  onFileTap,
  onOpenUrl,
  onTextScaleChange
}: TerminalPaneViewProps) {
  const { isEinkMode } = useMobileTheme()
  const resolvedTerminalTheme = useMemo(
    () => resolveMobileTerminalTheme(isEinkMode, terminalTheme),
    [isEinkMode, terminalTheme]
  )

  const setRef = useCallback(
    (ref: TerminalWebViewHandle | null) => {
      onRef(handle, ref)
    },
    [handle, onRef]
  )

  if (!shouldMountTerminalPane(active)) {
    return null
  }

  return (
    <View
      // Why: when park is off, inactive WebViews stay mounted to preserve terminal
      // state while touch/visibility are disabled — matches shipped Orca mobile.
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.terminalPane, !active && styles.terminalPaneHidden]}
    >
      <TerminalWebView
        ref={setRef}
        style={styles.terminalWebView}
        terminalTheme={resolvedTerminalTheme}
        // Why: e-ink Android compositors can corrupt or massively magnify a
        // transformed WebView; the resized window already keeps input visible.
        keyboardOffsetY={isEinkMode ? 0 : keyboardLift}
        textScale={textScale}
        onWebReady={() => onWebReady(handle)}
        onSelectionMode={(a) => onSelectionMode(handle, a)}
        onSelectionCopy={(t) => onSelectionCopy(handle, t)}
        onSelectionEvicted={() => onSelectionEvicted(handle)}
        onModesChanged={(m) => onModesChanged(handle, m)}
        onKeyboardAvoidanceMetrics={(m) => onKeyboardAvoidanceMetrics(handle, m)}
        onHaptic={onHaptic}
        onTerminalInput={(bytes) => onTerminalInput(handle, bytes)}
        onTerminalQueryReply={(bytes) => onTerminalQueryReply(handle, bytes)}
        onTerminalTap={() => onTerminalTap(handle)}
        onFileTap={(pathText, line, column) => onFileTap(handle, pathText, line, column)}
        onOpenUrl={(url) => onOpenUrl(handle, url)}
        onTextScaleChange={onTextScaleChange}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  terminalPane: {
    ...StyleSheet.absoluteFillObject
  },
  terminalPaneHidden: {
    opacity: 0
  },
  terminalWebView: {
    flex: 1
  }
})
