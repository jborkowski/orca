import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { spacing, radii, typography } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'
import { BottomDrawer } from './BottomDrawer'

type Props = {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}: Props) {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createConfirmModalStyles(colors), [colors])

  return (
    <BottomDrawer visible={visible} onClose={onCancel}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            chrome.outlineButton,
            pressed && styles.pressed
          ]}
          onPress={onCancel}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            destructive ? styles.destructiveButton : chrome.primaryButton,
            pressed && styles.pressed
          ]}
          onPress={() => {
            onConfirm()
            onCancel()
          }}
        >
          <Text style={destructive ? styles.destructiveText : styles.confirmText}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

function createConfirmModalStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    content: {
      paddingBottom: spacing.lg
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary
    },
    message: {
      fontSize: typography.bodySize,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      lineHeight: 20
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.sm
    },
    button: {
      flex: 1,
      alignItems: 'center'
    },
    destructiveButton: {
      backgroundColor: colors.statusRed,
      borderRadius: radii.button,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md
    },
    pressed: {
      opacity: 0.7
    },
    cancelText: {
      fontSize: typography.bodySize,
      fontWeight: '600',
      color: colors.textSecondary
    },
    confirmText: {
      fontSize: typography.bodySize,
      fontWeight: '600',
      color: colors.onSurfaceBright
    },
    destructiveText: {
      fontSize: typography.bodySize,
      fontWeight: '600',
      color: '#fff'
    }
  })
}
