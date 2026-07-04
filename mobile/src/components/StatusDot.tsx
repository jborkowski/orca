import { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { useMobileTheme } from '../theme/mobile-theme-context'
import type { ConnectionState } from '../transport/types'
import type { ConnectionVerdict } from '../transport/connection-health'

// Why: when caller passes a verdict, the dot color reflects the verdict's
// severity instead of the raw transport state. This avoids the "amber dot
// next to red 'Can't reach desktop' label" mismatch — the underlying
// transport is still 'reconnecting' (amber) but the user-visible meaning
// has escalated to error (red).
export function StatusDot({
  state,
  verdict
}: {
  state: ConnectionState
  verdict?: ConnectionVerdict
}) {
  const { colors } = useMobileTheme()
  const stateColors = useMemo(
    (): Record<ConnectionState, string> => ({
      connected: colors.statusGreen,
      connecting: colors.statusAmber,
      handshaking: colors.statusAmber,
      reconnecting: colors.statusAmber,
      disconnected: colors.textMuted,
      'auth-failed': colors.statusRed
    }),
    [colors]
  )

  const color =
    verdict?.kind === 'unreachable' || verdict?.kind === 'auth-failed'
      ? colors.statusRed
      : verdict?.kind === 'warning'
        ? colors.statusAmber
        : (stateColors[state] ?? colors.textMuted)

  return <View style={[styles.dot, { backgroundColor: color }]} />
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  }
})
