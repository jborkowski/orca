import { StyleSheet } from 'react-native'

import { spacing, typography } from '../../../../src/theme/mobile-theme'
import type { MobileEinkChrome } from '../../../../src/theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../../../src/theme/mobile-theme-palettes'

export function createMobileSessionFrameStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    kavInner: {
      flex: 1
    },
    // Master-detail content row below the header chrome (KTD2): the existing content is
    // the flex-1 left child; the dock column (when present on wide) is the right child.
    sessionContentRow: {
      flex: 1,
      flexDirection: 'row'
    },
    sessionContentMain: {
      flex: 1,
      minWidth: 0
    },
    sessionChrome: {
      backgroundColor: colors.bgPanel,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    sessionTopBar: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    backButton: {
      ...chrome.toolbarIconButton,
      width: 36,
      height: 36,
      borderRadius: 18,
      marginRight: spacing.xs
    },
    backButtonPressed: {
      ...chrome.listRowPressed
    },
    filesButton: {
      ...chrome.toolbarIconButton,
      width: 36,
      height: 36,
      marginLeft: spacing.xs
    },
    filesButtonPressed: {
      ...chrome.listRowPressed
    },
    // Selected state for the active docked-panel icon on wide layouts (R2).
    filesButtonActive: {
      ...chrome.listRowPressed
    },
    sessionTitleBlock: {
      flex: 1,
      minWidth: 0
    },
    sessionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600'
    },
    sessionMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2
    },
    sessionMetaText: {
      flexShrink: 1,
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle
    },
    tabScroll: {
      flex: 1,
      maxHeight: 36
    },
    tabContent: {
      paddingLeft: spacing.sm,
      paddingRight: spacing.sm
    },
    tab: {
      width: 128,
      maxWidth: 128,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent'
    },
    tabActive: {
      // Neutral grey underline, matching the desktop terminal tab's active
      // indicator (a muted foreground/card mix), not a blue accent.
      borderBottomColor: colors.textSecondary
    },
    tabLabelRow: {
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    tabText: {
      flexShrink: 1,
      color: colors.textSecondary,
      fontSize: 13
    },
    tabTextActive: {
      color: colors.textPrimary
    },
    newTerminalButton: {
      ...chrome.toolbarIconButton,
      width: 40,
      height: 36,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent'
    },
    newTerminalButtonPressed: {
      ...chrome.listRowPressed
    },
    newTerminalButtonDisabled: {
      opacity: 0.45
    },
    terminalFrame: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
      overflow: 'hidden'
    },
    terminalPane: {
      ...StyleSheet.absoluteFillObject
    },
    terminalPaneHidden: {
      opacity: 0
    },
    terminalWebView: {
      flex: 1
    },
    markdownFrame: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.bgBase
    },
    browserFrame: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.bgBase
    },
    markdownEditor: {
      flex: 1,
      position: 'relative'
    },
    markdownState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md
    },
    markdownError: {
      color: colors.statusRed,
      fontSize: typography.bodySize
    }
  })
}
