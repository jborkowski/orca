import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileEinkChrome } from '../../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../theme/mobile-theme-palettes'

// Styles for the PR comments timeline (body + audience tabs + comment cards +
// reactions). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap. Muted/monochrome to match the rest of the PR sidebar.
export function createPrCommentsStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    noDescription: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontStyle: 'italic'
    },
    // Comments header trailing count chip.
    countChip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      ...chrome.listRowPressed,
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1
    },
    countChipText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600'
    },
    // Audience segmented control (All / Humans / Bots).
    audienceTabs: {
      flexDirection: 'row',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      borderRadius: radii.row,
      backgroundColor: colors.bgBase,
      padding: 2,
      gap: 2
    },
    audienceTab: {
      flex: 1,
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderRadius: radii.row - 2
    },
    audienceTabActive: {
      ...chrome.listRowPressed
    },
    audienceTabText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    audienceTabTextActive: {
      color: colors.textPrimary
    },
    list: {
      gap: spacing.sm
    },
    showMore: {
      ...chrome.outlineButton,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.card
    },
    showMoreText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    group: {
      gap: spacing.sm
    },
    card: {
      ...chrome.sectionCard,
      borderRadius: radii.card
    },
    cardResolved: {
      opacity: 0.6
    },
    reply: {
      marginLeft: spacing.lg
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    avatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: chrome.listRowPressed.backgroundColor
    },
    author: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1
    },
    authorResolved: {
      color: colors.textSecondary
    },
    time: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    path: {
      color: colors.textMuted,
      fontSize: 11,
      fontFamily: typography.monoFamily,
      flexShrink: 1
    },
    resolvedChip: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      ...chrome.listRowPressed,
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1
    },
    resolvedChipText: {
      color: colors.textSecondary,
      fontSize: 11
    },
    openButton: {
      marginLeft: 'auto',
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center'
    },
    body: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm
    },
    reactionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs
    },
    reactionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 24,
      paddingHorizontal: spacing.sm,
      ...chrome.outlineButton,
      paddingVertical: 0,
      borderRadius: 999
    },
    reactionText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize
    },
    // Collapsible header for a resolved thread/comment group.
    resolvedHeader: {
      ...chrome.sectionCard,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.card
    },
    resolvedHeaderText: {
      color: colors.textSecondary,
      fontSize: 13,
      flexShrink: 1
    },
    empty: {
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: colors.borderSubtle,
      borderRadius: radii.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xl,
      color: colors.textSecondary,
      fontSize: 13
    },
    // Reply / Resolve toggle row under a comment body.
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      paddingTop: spacing.xs
    },
    actionButton: {
      ...chrome.outlineButton,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 28,
      paddingVertical: 0,
      paddingHorizontal: spacing.sm
    },
    actionButtonPressed: {
      opacity: 0.7
    },
    actionButtonText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    // Inline reply composer mounted inside a comment card.
    composer: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md
    },
    // Root-comment composer at the foot of the timeline (open PRs only).
    rootComposer: {
      gap: spacing.sm
    },
    actionError: {
      color: colors.statusRed,
      fontSize: typography.metaSize
    }
  })
}
