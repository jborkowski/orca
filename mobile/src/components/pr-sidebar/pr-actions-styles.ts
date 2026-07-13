import { StyleSheet } from 'react-native'
import { spacing, typography } from '../../theme/mobile-theme'
import type { MobileEinkChrome } from '../../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../theme/mobile-theme-palettes'

// Styles for PRActionsSection (action buttons, auto-merge toggle, transient-error
// line). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap.
export function createPrActionsStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    // Identity and actions share one section, so this wrapper only sets rhythm.
    actionsBlock: {
      gap: spacing.sm
    },
    // Keep lower-emphasis actions on one row in the narrow sidebar.
    secondaryRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm
    },
    secondaryButton: {
      flex: 1
    },
    // Primary CTA (merge) and secondary action buttons (close/reopen/rerun/add).
    actionButton: {
      ...chrome.outlineButton,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm
    },
    // Neutral primary: a light fill with dark text, mirroring the desktop PR page's
    // default button (no bright accent) so the sidebar stays mostly monochrome.
    actionButtonPrimary: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary
    },
    // Merge CTA: green fill + white text, matching the desktop ChecksPanel's
    // affirmative merge action. The merge still confirms before firing.
    actionButtonMerge: {
      backgroundColor: colors.mergeGreen,
      borderColor: colors.mergeGreen
    },
    actionButtonTextMerge: {
      color: colors.onMergeGreen
    },
    actionButtonDisabled: {
      opacity: 0.5
    },
    actionButtonText: {
      // Why: shrink + single-line (numberOfLines=1 at call sites) so a long label
      // like "Link existing pull request" can't wrap and inflate the button's
      // effective padding on a narrow sidebar.
      flexShrink: 1,
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    actionButtonTextPrimary: {
      color: colors.bgBase
    },
    actionButtonDestructiveText: {
      color: colors.statusRed
    },
    // Auto-merge toggle row: label + a pill that reflects on/off state.
    toggleRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm
    },
    toggleLabel: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      flexShrink: 1
    },
    togglePill: {
      ...chrome.outlineButton,
      minWidth: 56,
      minHeight: 30,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm
    },
    togglePillOn: {
      ...chrome.listRowPressed,
      borderColor: colors.textSecondary
    },
    togglePillText: {
      fontSize: typography.metaSize,
      fontWeight: '700',
      color: colors.textSecondary
    },
    togglePillTextOn: {
      color: colors.textPrimary
    },
    // Non-blocking error line shown under an action after a transient failure.
    actionError: {
      color: colors.statusRed,
      fontSize: typography.metaSize,
      lineHeight: 18
    }
  })
}
