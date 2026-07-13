import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { spacing, typography } from '../theme/mobile-theme'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'
import { createMobileSourceControlDiffStyles } from './mobile-source-control-diff-styles'
import { createMobileSourceControlListStyles } from './mobile-source-control-list-styles'

export function createMobileSourceControlStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  const baseStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    header: {
      backgroundColor: colors.bgPanel,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    topBar: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs
    },
    backButtonPressed: chrome.listRowPressed,
    titleBlock: {
      flex: 1,
      minWidth: 0
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    meta: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    refreshButton: {
      width: 36,
      height: 36,
      marginLeft: spacing.xs,
      ...chrome.toolbarIconButton
    },
    refreshButtonPressed: chrome.listRowPressed,
    refreshButtonDisabled: {
      opacity: 0.45
    },
    summaryCard: {
      margin: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      ...chrome.sectionCard
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md
    },
    branchLine: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    branchText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    syncText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    countRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: spacing.sm
    },
    countText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    conflictRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
      maxWidth: '100%'
    },
    conflictText: {
      color: colors.statusAmber,
      fontSize: typography.metaSize,
      textTransform: 'capitalize'
    },
    abortButton: {
      ...chrome.outlineButton,
      minHeight: 32,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderColor: colors.statusAmber,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    },
    abortPressed: chrome.listRowPressed,
    abortButtonDisabled: {
      opacity: 0.45
    },
    abortText: {
      color: colors.statusAmber,
      fontSize: typography.bodySize,
      fontWeight: '600',
      textTransform: 'capitalize'
    },
    reconnectBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: -spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...chrome.sectionCard,
      borderColor: colors.statusAmber
    },
    reconnectBannerText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize
    },
    actionError: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...chrome.outlineButton,
      borderColor: colors.statusRed
    },
    actionErrorText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize,
      lineHeight: 16
    },
    bulkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md
    },
    bulkButton: {
      flex: 1,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      ...chrome.outlineButton
    },
    bulkMenuButton: {
      width: 42,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      ...chrome.outlineButton
    },
    bulkButtonDisabled: {
      opacity: 0.45
    },
    bulkButtonPressed: {
      opacity: 0.75
    },
    bulkButtonText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    createPrBlock: {
      marginTop: spacing.md,
      gap: spacing.xs
    },
    createPrButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      ...chrome.primaryButton
    },
    createPrButtonDisabled: {
      ...chrome.outlineButton,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md
    },
    createPrButtonPressed: {
      opacity: 0.78
    },
    createPrButtonText: {
      color: colors.bgBase,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    createPrButtonTextDisabled: {
      color: colors.textSecondary
    },
    createPrHint: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      lineHeight: 16
    }
  })

  return {
    ...baseStyles,
    ...createMobileSourceControlListStyles(colors, chrome),
    ...createMobileSourceControlDiffStyles(colors, chrome)
  }
}

export function useMobileSourceControlStyles() {
  const { colors, chrome } = useMobileTheme()
  return useMemo(() => createMobileSourceControlStyles(colors, chrome), [colors, chrome])
}
