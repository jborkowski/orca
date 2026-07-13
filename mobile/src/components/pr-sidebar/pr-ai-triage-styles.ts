import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../../theme/mobile-theme'
import type { MobileEinkChrome } from '../../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../theme/mobile-theme-palettes'

// Styles for the "Fix checks with AI" / "Resolve conflicts with AI" triage
// affordances. Kept in their own focused file (rather than growing the shared
// sidebar/conflict style sheets) and muted/monochrome to match the sidebar.
export function createPrAiTriageStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    triageArea: {
      gap: spacing.xs
    },
    // Top-of-section triage strip (desktop PRTriageStrip): failing-count summary +
    // a Fix action on the right, tinted by the failure status color.
    triageStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.button,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.statusRed,
      backgroundColor: colors.diffDeletedBg
    },
    triageStripText: {
      flex: 1,
      minWidth: 0
    },
    triageStripTitle: {
      color: colors.textPrimary,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    triageStripSubtitle: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    // Compact Fix button sitting inside the strip (vs. the full-width footer button).
    triageStripButton: {
      ...chrome.outlineButton,
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs
    },
    triageStripButtonText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    triageButton: {
      ...chrome.outlineButton,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs
    },
    triageButtonPressed: {
      opacity: 0.7
    },
    triageButtonText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    triageError: {
      color: colors.statusRed,
      fontSize: typography.metaSize
    }
  })
}
