import type { ViewStyle } from 'react-native'
import { radii, spacing } from './mobile-theme'
import type { MobileThemeColors } from './mobile-theme-palettes'

export type MobileEinkChrome = {
  noShadow: ViewStyle
  sectionCard: ViewStyle
  outlineButton: ViewStyle
  primaryButton: ViewStyle
  toolbarIconButton: ViewStyle
  listRowPressed: ViewStyle
  listRowActive: ViewStyle
  filterChip: (active: boolean) => ViewStyle
  reconnectButton: ViewStyle
}

export function createMobileEinkChrome(
  isEinkMode: boolean,
  colors: MobileThemeColors
): MobileEinkChrome {
  if (!isEinkMode) {
    return createDarkChrome(colors)
  }

  const ink = colors.borderSubtle
  const strong = colors.borderStrong ?? ink

  return {
    noShadow: {
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0
    },
    sectionCard: {
      backgroundColor: colors.bgBase,
      borderWidth: 1,
      borderColor: ink,
      borderRadius: 12,
      overflow: 'hidden' as const
    },
    outlineButton: {
      backgroundColor: colors.bgBase,
      borderWidth: 1,
      borderColor: ink,
      borderRadius: radii.button,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md
    },
    primaryButton: {
      backgroundColor: colors.surfaceBright,
      borderWidth: 1,
      borderColor: ink,
      borderRadius: radii.button,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md
    },
    toolbarIconButton: {
      backgroundColor: colors.bgBase,
      borderWidth: 1,
      borderColor: ink,
      borderRadius: radii.button,
      alignItems: 'center' as const,
      justifyContent: 'center' as const
    },
    listRowPressed: {
      backgroundColor: colors.bgBase,
      borderWidth: 1,
      borderColor: ink
    },
    listRowActive: {
      backgroundColor: colors.bgBase,
      borderLeftWidth: 2,
      borderLeftColor: strong
    },
    filterChip: (active: boolean) => ({
      backgroundColor: colors.bgBase,
      borderWidth: active ? 2 : 1,
      borderColor: ink,
      borderRadius: 12
    }),
    reconnectButton: {
      backgroundColor: colors.bgBase,
      borderWidth: 1,
      borderColor: ink,
      borderRadius: radii.button,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm
    }
  }
}

function createDarkChrome(colors: MobileThemeColors): MobileEinkChrome {
  return {
    noShadow: {},
    sectionCard: {
      backgroundColor: colors.bgPanel,
      borderRadius: 12,
      overflow: 'hidden' as const
    },
    outlineButton: {
      backgroundColor: colors.bgPanel,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radii.button,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md
    },
    primaryButton: {
      backgroundColor: colors.textPrimary,
      borderRadius: radii.button,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md
    },
    toolbarIconButton: {
      borderRadius: radii.button,
      alignItems: 'center' as const,
      justifyContent: 'center' as const
    },
    listRowPressed: {
      backgroundColor: colors.bgRaised
    },
    listRowActive: {
      backgroundColor: colors.bgPanel,
      borderLeftWidth: 2,
      borderLeftColor: colors.textSecondary
    },
    filterChip: (active: boolean) =>
      active
        ? {
            backgroundColor: colors.bgRaised,
            borderWidth: 1,
            borderColor: colors.textSecondary,
            borderRadius: 12
          }
        : {
            backgroundColor: 'transparent',
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            borderRadius: 12
          },
    reconnectButton: {
      backgroundColor: colors.bgPanel,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radii.button,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm
    }
  }
}
