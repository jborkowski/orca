import { useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'
import { spacing } from '../theme/mobile-theme'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'
import { useMobileTheme } from '../theme/mobile-theme-context'

// Diameter of the phone "new workspace" floating action button. Exported so the
// worktree list can reserve matching bottom padding and keep the last row tappable.
export const FAB_SIZE = 48

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

// Phone-only floating "+" for creating a workspace. Absolutely positioned so it
// never intercepts list row taps, and lifted above the home indicator.
export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createNewWorkspaceFabStyles(colors), [colors])

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fab,
        chrome.noShadow,
        { bottom: spacing.xl + insets.bottom },
        pressed && styles.fabPressed,
        disabled && styles.fabDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="New workspace"
      hitSlop={8}
    >
      <Plus size={24} color={colors.onSurfaceBright} strokeWidth={2.75} />
    </Pressable>
  )
}

function createNewWorkspaceFabStyles(colors: MobileThemeColors) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      right: spacing.lg,
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceBright,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4
    },
    fabPressed: {
      backgroundColor: colors.textPrimary
    },
    fabDisabled: {
      opacity: 0.5
    }
  })
}
