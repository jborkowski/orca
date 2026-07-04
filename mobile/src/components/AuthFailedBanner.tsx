import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { spacing } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'

// Why: auth-failed is no longer necessarily terminal (issue #5200) — a
// transient rejection can latch it even though the desktop still lists this
// device. Offer Retry (fresh client + handshake) ahead of the disruptive
// re-pair flow so the common transient case recovers without re-pairing.
export function AuthFailedBanner({
  canRetry,
  onRetry,
  onRepair,
  onRemove
}: {
  canRetry: boolean
  onRetry: () => void
  onRepair: () => void
  onRemove: () => void
}) {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createAuthFailedBannerStyles(colors), [colors])

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Authentication failed — try reconnecting first; if it keeps failing, re-pair from desktop.
      </Text>
      <View style={styles.actions}>
        {canRetry && (
          <Pressable style={chrome.reconnectButton} onPress={onRetry}>
            <Text style={styles.actionText}>Retry</Text>
          </Pressable>
        )}
        <Pressable style={chrome.reconnectButton} onPress={onRepair}>
          <Text style={styles.actionText}>Re-pair</Text>
        </Pressable>
        <Pressable style={chrome.reconnectButton} onPress={onRemove}>
          <Text style={[styles.actionText, { color: colors.statusRed }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createAuthFailedBannerStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.bgPanel,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    text: {
      color: colors.statusRed,
      fontSize: 13,
      marginBottom: spacing.sm
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm
    },
    actionText: {
      color: colors.accentBlue,
      fontSize: 13,
      fontWeight: '600'
    }
  })
}
