import { Pressable, StyleSheet, Text, View } from 'react-native'
import { typography } from '../theme/mobile-theme'
import { useMobileTheme } from '../theme/mobile-theme-context'

type MobileTerminalInputModeSwitchProps = {
  readonly liveInputEnabled: boolean
  readonly disabled: boolean
  readonly onSelectDirect: () => void
  readonly onSelectCommand: () => void
}

export function MobileTerminalInputModeSwitch({
  liveInputEnabled,
  disabled,
  onSelectDirect,
  onSelectCommand
}: MobileTerminalInputModeSwitchProps) {
  const { colors, chrome } = useMobileTheme()

  return (
    <View style={[styles.segment, chrome.outlineButton, disabled && styles.segmentDisabled]}>
      <Pressable
        style={({ pressed }) => [
          styles.segmentOption,
          liveInputEnabled && styles.segmentOptionActive,
          liveInputEnabled && { backgroundColor: colors.textPrimary },
          pressed && !liveInputEnabled && chrome.listRowPressed,
          pressed && liveInputEnabled && styles.segmentOptionActivePressed
        ]}
        disabled={disabled || liveInputEnabled}
        onPress={onSelectDirect}
        accessibilityRole="button"
        accessibilityState={{ selected: liveInputEnabled, disabled: disabled || liveInputEnabled }}
        accessibilityLabel="Direct input — keystrokes go to terminal immediately"
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: colors.textSecondary },
            liveInputEnabled && { color: colors.bgBase, fontWeight: '700' },
            disabled && styles.segmentLabelDisabled
          ]}
        >
          Direct
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.segmentOption,
          !liveInputEnabled && styles.segmentOptionActive,
          !liveInputEnabled && { backgroundColor: colors.textPrimary },
          pressed && liveInputEnabled && chrome.listRowPressed,
          pressed && !liveInputEnabled && styles.segmentOptionActivePressed
        ]}
        disabled={disabled || !liveInputEnabled}
        onPress={onSelectCommand}
        accessibilityRole="button"
        accessibilityState={{ selected: !liveInputEnabled, disabled: disabled || !liveInputEnabled }}
        accessibilityLabel="Command input — compose then send"
      >
        <Text
          style={[
            styles.segmentLabel,
            { color: colors.textSecondary },
            !liveInputEnabled && { color: colors.bgBase, fontWeight: '700' },
            disabled && styles.segmentLabelDisabled
          ]}
        >
          Command
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    minHeight: 28
  },
  segmentDisabled: {
    opacity: 0.35
  },
  segmentOption: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 56,
    alignItems: 'center'
  },
  segmentOptionActive: {},
  segmentOptionActivePressed: {
    opacity: 0.85
  },
  segmentLabel: {
    fontSize: 12,
    fontFamily: typography.monoFamily
  },
  segmentLabelDisabled: {
    opacity: 0.6
  }
})
