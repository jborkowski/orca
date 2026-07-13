import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMemo } from 'react'
import { spacing, typography } from '../theme/mobile-theme'
import { useMobileTheme } from '../theme/mobile-theme-context'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

const BROWSER_KEYS = ['Enter', 'Backspace', 'Tab', 'Escape'] as const

type Props = {
  disabled: boolean
  onKeypress: (key: string) => void
}

export function MobileBrowserKeyRow({ disabled, onKeypress }: Props): React.JSX.Element {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(() => createMobileBrowserKeyRowStyles(colors, chrome), [colors, chrome])

  return (
    <View style={styles.keyRow}>
      {BROWSER_KEYS.map((key) => (
        <Pressable
          key={key}
          style={({ pressed }) => [
            styles.keyButton,
            pressed && styles.keyButtonPressed,
            disabled && styles.disabled
          ]}
          disabled={disabled}
          onPress={() => onKeypress(key)}
        >
          <Text style={[styles.keyButtonText, disabled && styles.disabledText]}>
            {key === 'Backspace' ? '⌫' : key === 'Escape' ? 'Esc' : key}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function createMobileBrowserKeyRowStyles(colors: MobileThemeColors, chrome: MobileEinkChrome) {
  return StyleSheet.create({
    keyRow: {
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
    keyButtonText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: typography.monoFamily
    },
    disabled: {
      opacity: 0.35
    },
    disabledText: {
      color: colors.textMuted
    }
  })
}
