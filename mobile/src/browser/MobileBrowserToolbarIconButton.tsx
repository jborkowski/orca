import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useMobileTheme } from '../theme/mobile-theme-context'
import type { MobileEinkChrome } from '../theme/mobile-eink-chrome'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

type Props = {
  children: ReactNode
  disabled?: boolean
  label: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
}

export function MobileBrowserToolbarIconButton({
  children,
  disabled,
  label,
  onPress,
  style
}: Props): React.JSX.Element {
  const { colors, chrome } = useMobileTheme()
  const styles = useMemo(
    () => createMobileBrowserToolbarIconButtonStyles(colors, chrome),
    [colors, chrome]
  )

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabled
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  )
}

function createMobileBrowserToolbarIconButtonStyles(
  _colors: MobileThemeColors,
  chrome: MobileEinkChrome
) {
  return StyleSheet.create({
    button: {
      width: 26,
      height: 26,
      ...chrome.toolbarIconButton
    },
    buttonPressed: {
      ...chrome.listRowPressed
    },
    disabled: {
      opacity: 0.35
    }
  })
}
