import { Platform, StyleSheet } from 'react-native'

import { spacing, typography } from '../../../../src/theme/mobile-theme'
import type { MobileEinkChrome } from '../../../../src/theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../../../../src/theme/mobile-theme-palettes'

export function createMobileSessionReaderStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    markdownTextInput: {
      flex: 1,
      minHeight: 0,
      color: colors.textPrimary,
      backgroundColor: colors.bgBase,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl * 3,
      fontSize: typography.bodySize,
      lineHeight: 22,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
    },
    filePreviewScroll: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.editorSurface
    },
    filePreviewContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl
    },
    filePreviewText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      lineHeight: 22,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
    },
    imagePreviewContainer: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.editorSurface
    },
    imagePreviewScroll: {
      flex: 1
    },
    imagePreviewContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg
    },
    imagePreview: {
      width: '100%',
      height: '100%',
      minHeight: 200
    },
    diffNotesToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    diffNotesTitleRow: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    diffNotesTitle: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    diffNotesActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    diffNotesActionButton: {
      ...chrome.outlineButton,
      minHeight: 30,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 0
    },
    diffNotesActionText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    diffLineBlock: {
      marginBottom: spacing.xs
    },
    diffLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderLeftWidth: 2,
      borderLeftColor: colors.editorSurface,
      paddingRight: spacing.sm
    },
    diffLineAdded: {
      backgroundColor: colors.diffAddedBg,
      borderLeftColor: colors.gitDecorationAdded
    },
    diffLineDeleted: {
      backgroundColor: colors.diffDeletedBg,
      borderLeftColor: colors.gitDecorationDeleted
    },
    diffGutter: {
      width: 42,
      paddingRight: spacing.sm,
      textAlign: 'right',
      color: colors.textMuted,
      fontSize: typography.metaSize,
      lineHeight: 22,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
    },
    diffText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      lineHeight: 22,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
    },
    diffPrefix: {
      color: colors.textMuted
    },
    diffPrefixAdded: {
      color: colors.gitDecorationAdded
    },
    diffPrefixDeleted: {
      color: colors.gitDecorationDeleted
    }
  })
}
