import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SquareTerminal } from 'lucide-react-native'
import { spacing } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'

// Empty detail pane shown beside the worktree-list sidebar on wide
// tablet/foldable layouts until the user opens a workspace.
export function WorkspaceDetailPlaceholder() {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createWorkspaceDetailPlaceholderStyles(colors), [colors])

  return (
    <View style={styles.container}>
      <View style={[chrome.sectionCard, styles.icon]}>
        <SquareTerminal size={28} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>No workspace open</Text>
      <Text style={styles.body}>Pick a workspace from the sidebar to open its terminal here.</Text>
    </View>
  )
}

function createWorkspaceDetailPlaceholderStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.bgBase
    },
    icon: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      marginBottom: spacing.xs
    },
    body: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      maxWidth: 320
    }
  })
}
