import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMemo } from 'react'
import { spacing, typography } from '../theme/mobile-theme'
import { useMobileTheme } from '../theme/mobile-theme-context'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

export type BrowserPointerModifier = 'cmd' | 'ctrl' | 'alt' | 'shift'

const BROWSER_POINTER_MODIFIERS: { id: BrowserPointerModifier; label: string }[] = [
  { id: 'cmd', label: 'Cmd' },
  { id: 'ctrl', label: 'Ctrl' },
  { id: 'alt', label: 'Alt' },
  { id: 'shift', label: 'Shift' }
]

type Props = {
  disabled: boolean
  selectedModifiers: BrowserPointerModifier[]
  onToggle: (modifier: BrowserPointerModifier) => void
}

export function MobileBrowserPointerModifiers({
  disabled,
  selectedModifiers,
  onToggle
}: Props): React.JSX.Element {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(
    () => createMobileBrowserPointerModifierStyles(colors, chrome),
    [colors, chrome]
  )

  return (
    <View style={styles.modifierRow}>
      {BROWSER_POINTER_MODIFIERS.map((modifier) => {
        const selected = selectedModifiers.includes(modifier.id)
        return (
          <Pressable
            key={modifier.id}
            style={({ pressed }) => [
              styles.keyButton,
              selected && styles.keyButtonSelected,
              pressed && !selected && styles.keyButtonPressed,
              disabled && styles.disabled
            ]}
            disabled={disabled}
            onPress={() => onToggle(modifier.id)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${modifier.label} click modifier`}
          >
            <Text
              style={[
                styles.keyButtonText,
                selected && styles.keyButtonTextSelected,
                disabled && styles.disabledText
              ]}
            >
              {modifier.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function createMobileBrowserPointerModifierStyles(
  colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    modifierRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs
    },
    keyButton: {
      minHeight: 30,
      minWidth: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      ...chrome.outlineButton
    },
    keyButtonPressed: {
      ...chrome.listRowPressed
    },
    keyButtonSelected: {
      ...chrome.filterChip(true)
    },
    keyButtonText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: typography.monoFamily
    },
    keyButtonTextSelected: {
      color: colors.textPrimary
    },
    disabled: {
      opacity: 0.35
    },
    disabledText: {
      color: colors.textMuted
    }
  })
}
