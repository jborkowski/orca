import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../theme/mobile-theme'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

export function createMobileDiffReviewLayoutStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    topBar: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    iconButton: {
      ...chrome.toolbarIconButton,
      width: 44,
      height: 44
    },
    iconButtonPressed: {
      ...chrome.listRowPressed
    },
    titleBlock: {
      flex: 1,
      minWidth: 0
    },
    title: {
      color: colors.textPrimary,
      fontSize: typography.titleSize,
      fontWeight: '700'
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md
    },
    progressText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    filterRow: {
      gap: spacing.sm,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs
    },
    filterChip: {
      minHeight: 34,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...chrome.filterChip(false)
    },
    filterChipActive: {
      ...chrome.filterChip(true)
    },
    filterChipPressed: {
      opacity: 0.78
    },
    filterText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    filterTextActive: {
      color: colors.textPrimary
    },
    fileHeader: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.bgBase,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    fileTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    statusBadge: {
      width: 28,
      height: 28,
      borderRadius: radii.button,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center'
    },
    statusBadgeText: {
      fontSize: typography.metaSize,
      fontWeight: '800'
    },
    fileTitleBlock: {
      flex: 1,
      minWidth: 0
    },
    filePath: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    fileMeta: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    fileMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      flexWrap: 'wrap'
    },
    reviewedPill: {
      color: colors.statusGreen,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    stalePill: {
      color: colors.statusAmber,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    staleText: {
      color: colors.statusAmber,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    fileNotes: {
      gap: spacing.xs,
      marginTop: spacing.sm
    },
    fileNote: {
      minHeight: 44,
      padding: spacing.sm,
      ...chrome.sectionCard
    },
    fileNotePressed: {
      ...chrome.listRowPressed
    },
    fileNoteText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      lineHeight: 17
    },
    hunkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm
    },
    hunkButton: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      ...chrome.outlineButton,
      paddingVertical: spacing.xs
    },
    hunkButtonPressed: {
      ...chrome.listRowPressed
    },
    hunkButtonText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    actionError: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.statusAmber
    },
    actionErrorText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize
    },
    diffList: {
      paddingBottom: 140,
      backgroundColor: colors.editorSurface
    },
    truncatedText: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      padding: spacing.md,
      textAlign: 'center'
    },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md
    },
    stateTitle: {
      color: colors.textPrimary,
      fontSize: typography.titleSize,
      fontWeight: '700',
      textAlign: 'center'
    },
    stateText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      textAlign: 'center',
      lineHeight: 20
    },
    retryButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      ...chrome.outlineButton
    },
    retryText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '700'
    }
  })
}
