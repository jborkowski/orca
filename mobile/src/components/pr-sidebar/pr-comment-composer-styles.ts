import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileEinkChrome } from '../../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../theme/mobile-theme-palettes'

// Styles for the plain-text reply / root-comment composer. Muted/monochrome to
// match the PR comment timeline; split out to keep PRCommentComposer focused.
export function createPrCommentComposerStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    container: {
      gap: spacing.sm
    },
    input: {
      minHeight: 64,
      ...chrome.listRowPressed,
      borderRadius: radii.input,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      textAlignVertical: 'top'
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm
    },
    cancel: {
      minHeight: 36,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.button
    },
    cancelText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    submit: {
      minHeight: 36,
      minWidth: 72,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.button,
      backgroundColor: colors.textPrimary
    },
    submitDisabled: {
      opacity: 0.45
    },
    submitText: {
      color: colors.bgBase,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    pressed: {
      opacity: 0.8
    },
    error: {
      color: colors.statusRed,
      fontSize: typography.metaSize
    }
  })
}
