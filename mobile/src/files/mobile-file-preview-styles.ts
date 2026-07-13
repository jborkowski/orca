import { StyleSheet } from 'react-native'
import { radii, spacing, typography } from '../theme/mobile-theme'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

export function createMobileFilePreviewStyles(
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
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl
    },
    stateText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      textAlign: 'center'
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
    },
    saveButton: {
      width: 36,
      height: 36,
      ...chrome.toolbarIconButton
    },
    saveButtonDisabled: {
      opacity: 0.42
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.editorSurface
    },
    textContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl
    },
    textPreview: {
      color: colors.textPrimary,
      fontFamily: typography.monoFamily,
      fontSize: 13,
      lineHeight: 19
    },
    markdownContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl
    },
    modeContainer: {
      flex: 1,
      backgroundColor: colors.editorSurface
    },
    modeToolbar: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      marginHorizontal: spacing.md,
      marginVertical: spacing.sm,
      padding: 2,
      gap: 2,
      ...chrome.sectionCard
    },
    modeToggle: {
      width: 34,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.row,
      opacity: 0.72,
      ...chrome.filterChip(false)
    },
    modeToggleActive: {
      opacity: 1,
      ...chrome.filterChip(true)
    },
    truncatedNote: {
      marginBottom: spacing.md,
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    imageContainer: {
      flex: 1,
      backgroundColor: colors.editorSurface
    },
    imageScrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md
    },
    image: {
      backgroundColor: colors.editorSurface
    },
    editContainer: {
      flex: 1,
      backgroundColor: colors.editorSurface,
      padding: spacing.md
    },
    saveErrorText: {
      marginBottom: spacing.sm,
      color: colors.statusRed,
      fontSize: typography.metaSize
    },
    editInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: typography.monoFamily,
      fontSize: 13,
      lineHeight: 19,
      padding: 0
    }
  })
}
