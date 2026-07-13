import { StyleSheet } from 'react-native'

import { spacing, radii, typography } from '../../../../src/theme/mobile-theme'
import type { MobileEinkChrome } from '../../../../src/theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../../../src/theme/mobile-theme-palettes'

export function createMobileSessionCommandInputStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    createWarningBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.bgPanel,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    createWarningText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 16
    },
    createWarningDismiss: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -4
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      marginBottom: spacing.lg
    },
    createError: {
      color: colors.statusRed,
      fontSize: 13,
      marginBottom: spacing.sm
    },
    emptyActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm
    },
    createButton: {
      ...chrome.primaryButton,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm + 2
    },
    createButtonDisabled: {
      opacity: 0.5
    },
    createButtonText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    commandDock: {
      zIndex: 20
    },
    accessoryBar: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    accessoryContent: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      gap: spacing.xs
    },
    accessoryKey: {
      ...chrome.outlineButton,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs,
      minWidth: 36,
      alignItems: 'center'
    },
    accessoryKeyPressed: {
      ...chrome.listRowPressed
    },
    accessoryKeyActive: {
      backgroundColor: colors.textPrimary
    },
    customAccessoryKey: {
      borderWidth: 1,
      borderColor: colors.borderSubtle
    },
    accessoryKeyDisabled: {
      opacity: 0.35
    },
    accessoryKeyText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: typography.monoFamily
    },
    accessoryKeyTextActive: {
      color: colors.bgBase,
      fontWeight: '700'
    },
    accessoryKeyTextDisabled: {
      color: colors.textMuted
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 46,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    terminalInput: {
      ...chrome.outlineButton,
      flex: 1,
      height: 34,
      color: colors.textPrimary,
      borderRadius: radii.input,
      paddingHorizontal: spacing.md,
      paddingVertical: 0,
      fontSize: 14,
      fontFamily: typography.monoFamily,
      marginRight: spacing.sm
    },
    sendButton: {
      ...chrome.primaryButton,
      width: 34,
      height: 34,
      borderRadius: 17,
      paddingHorizontal: 0,
      paddingVertical: 0,
      alignItems: 'center',
      justifyContent: 'center'
    },
    dictationButton: {
      ...chrome.outlineButton,
      width: 34,
      height: 34,
      borderRadius: 17,
      paddingHorizontal: 0,
      paddingVertical: 0,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm
    },
    dictationButtonActive: {
      backgroundColor: colors.bgPanel,
      borderColor: colors.textSecondary
    },
    sendButtonDisabled: {
      opacity: 0.35
    }
  })
}
