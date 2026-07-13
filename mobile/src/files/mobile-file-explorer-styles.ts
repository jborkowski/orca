import { StyleSheet } from 'react-native'
import { spacing, typography } from '../theme/mobile-theme'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

export function createMobileFileExplorerStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    header: {
      backgroundColor: colors.bgPanel,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    topBar: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md
    },
    backButton: {
      width: 36,
      height: 36,
      ...chrome.toolbarIconButton
    },
    backButtonPressed: {
      ...chrome.listRowPressed
    },
    titleBlock: {
      flex: 1,
      minWidth: 0
    },
    title: {
      color: colors.textPrimary,
      fontSize: typography.titleSize,
      fontWeight: '600'
    },
    meta: {
      marginTop: 2,
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    list: { flex: 1 },
    listContent: {
      paddingVertical: spacing.sm
    },
    row: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingRight: spacing.md
    },
    rowPressed: {
      ...chrome.listRowPressed
    },
    rowDisabled: {
      opacity: 0.58
    },
    chevronSpacer: {
      width: 16
    },
    rowTextBlock: {
      flex: 1,
      minWidth: 0
    },
    rowTitle: {
      color: colors.textPrimary,
      fontSize: typography.bodySize
    },
    rowTitleDisabled: {
      color: colors.textMuted
    },
    rowMeta: {
      marginTop: 1,
      color: colors.textMuted,
      fontSize: 11
    },
    inlineStatusRow: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingRight: spacing.md
    },
    inlineStatusText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    inlineErrorText: {
      flex: 1,
      minWidth: 0,
      color: colors.statusRed,
      fontSize: typography.metaSize
    },
    inlineRetryButton: {
      ...chrome.outlineButton,
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md
    },
    inlineRetryText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize
    },
    errorText: {
      color: colors.statusRed,
      fontSize: typography.bodySize,
      textAlign: 'center'
    },
    retryButton: {
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      ...chrome.reconnectButton
    },
    retryText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    }
  })
}
