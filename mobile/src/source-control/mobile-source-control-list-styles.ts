import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../theme/mobile-theme'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

// Changed-files list, section headers, file rows, and the commit bar. Split
// from the main source-control stylesheet to stay under the line limit.
export function createMobileSourceControlListStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 136
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.md,
      paddingBottom: spacing.xs
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase'
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    branchCompareBlock: {
      paddingBottom: spacing.sm
    },
    branchSectionTitleBlock: {
      flex: 1,
      minWidth: 0
    },
    branchSectionSubtitle: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    branchStateRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    branchStateText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      lineHeight: 18
    },
    fileRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    fileRowPressed: chrome.listRowPressed,
    fileRowDisabled: {
      opacity: 0.78
    },
    fileRowUnavailable: {
      opacity: 0.72
    },
    statusBadge: {
      width: 24,
      alignItems: 'center'
    },
    statusBadgeText: {
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    fileTextBlock: {
      flex: 1,
      minWidth: 0
    },
    filePath: {
      color: colors.textPrimary,
      fontSize: typography.bodySize
    },
    filePathDisabled: {
      color: colors.textSecondary
    },
    fileMeta: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    iconButton: {
      width: 32,
      height: 32,
      ...chrome.toolbarIconButton
    },
    iconButtonPressed: chrome.listRowPressed,
    iconButtonDisabled: {
      opacity: 0.45
    },
    commitBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      gap: spacing.xs,
      padding: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.bgPanel,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle
    },
    commitRow: {
      flexDirection: 'row',
      gap: spacing.sm
    },
    commitInput: {
      flex: 1,
      minHeight: 42,
      borderRadius: radii.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.bgBase,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      fontSize: typography.bodySize
    },
    commitInputDisabled: {
      backgroundColor: colors.bgPanel,
      borderColor: colors.borderSubtle,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center'
    },
    commitInputDisabledText: {
      color: colors.textMuted,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    commitButton: {
      minWidth: 88,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      ...chrome.primaryButton
    },
    commitButtonSecondary: {
      ...chrome.outlineButton,
      minWidth: 88,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md
    },
    generateButton: {
      width: 42,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      ...chrome.outlineButton
    },
    commitButtonDisabled: {
      opacity: 0.45
    },
    commitButtonPressed: {
      opacity: 0.75
    },
    commitButtonText: {
      color: colors.bgBase,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    commitButtonSecondaryText: {
      color: colors.textPrimary
    },
    commitFailurePanel: {
      marginTop: spacing.sm,
      padding: spacing.sm,
      gap: spacing.sm,
      ...chrome.outlineButton,
      borderColor: colors.statusRed
    },
    commitFailureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    commitFailureTextBlock: {
      flex: 1,
      minWidth: 0
    },
    commitFailureTitle: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    commitFailureSummary: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      lineHeight: 16,
      marginTop: 2
    },
    commitFailureFixButton: {
      minHeight: 36,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      ...chrome.primaryButton
    },
    commitFailureFixButtonDisabled: {
      opacity: 0.45
    },
    commitFailureFixButtonPressed: {
      opacity: 0.75
    },
    commitFailureFixButtonText: {
      color: colors.bgBase,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    commitFailureDetailsButton: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    commitFailureDetailsButtonPressed: {
      opacity: 0.75
    },
    commitFailureDetailsButtonText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    commitFailureDetailsText: {
      color: colors.textSecondary,
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize,
      lineHeight: 17
    },
    commitFailureLaunchError: {
      color: colors.statusRed,
      fontSize: typography.metaSize,
      lineHeight: 16
    }
  })
}
