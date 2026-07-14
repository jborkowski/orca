import type { RefObject } from 'react'
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextInputKeyPressEvent,
  type ViewStyle
} from 'react-native'
import { ArrowUp } from 'lucide-react-native'
import {
  getTerminalCommandKeyboardType,
  getTerminalLiveInputKeyboardType
} from '../terminal/terminal-keyboard-type'
import { MobileTerminalInputActions } from './MobileTerminalInputActions'
import { resolveDirectInputPlaceholder } from './mobile-terminal-input-placeholder'
import type { MobileThemeColors } from '../theme/mobile-theme-palettes'

type DictationState = {
  readonly isStarting: boolean
  readonly isRecording: boolean
  readonly isProcessing: boolean
}

type MobileTerminalInputBarStyles = {
  readonly inputBar: StyleProp<ViewStyle>
  readonly terminalInput: StyleProp<ViewStyle>
  readonly dictationButton: StyleProp<ViewStyle>
  readonly dictationButtonActive: StyleProp<ViewStyle>
  readonly sendButton: StyleProp<ViewStyle>
  readonly sendButtonDisabled: StyleProp<ViewStyle>
}

type MobileTerminalInputBarProps = {
  readonly colors: MobileThemeColors
  readonly isEinkMode: boolean
  readonly styles: MobileTerminalInputBarStyles
  readonly liveInputEnabled: boolean
  readonly canSend: boolean
  readonly isAttaching: boolean
  readonly autocompleteEnabled: boolean
  readonly liveInputRef: RefObject<TextInput | null>
  readonly liveInputCapture: string
  readonly commandInput: string
  readonly dictation: DictationState
  readonly dictationMode: 'toggle' | 'hold'
  readonly onLiveInputChange: (text: string) => void
  readonly onLiveInputKeyPress: (event: TextInputKeyPressEvent) => void
  readonly onLiveInputSubmit: () => void
  readonly onCommandInputChange: (text: string) => void
  readonly onSendCommand: () => void
  readonly onAttachImage: () => void
  readonly onAttachFile: () => void
  readonly onDictationToggle: () => void
  readonly onDictationPressIn: () => void
  readonly onDictationPressOut: () => void
  readonly onDictationCancel: () => void
}

export function MobileTerminalInputBar({
  colors,
  isEinkMode,
  styles,
  liveInputEnabled,
  canSend,
  isAttaching,
  autocompleteEnabled,
  liveInputRef,
  liveInputCapture,
  commandInput,
  dictation,
  dictationMode,
  onLiveInputChange,
  onLiveInputKeyPress,
  onLiveInputSubmit,
  onCommandInputChange,
  onSendCommand,
  onAttachImage,
  onAttachFile,
  onDictationToggle,
  onDictationPressIn,
  onDictationPressOut,
  onDictationCancel
}: MobileTerminalInputBarProps) {
  const placeholder = liveInputEnabled
    ? resolveDirectInputPlaceholder(dictation, isAttaching)
    : 'Type a command…'

  return (
    <View style={styles.inputBar}>
      <TextInput
        ref={liveInputRef}
        // Why: Android caches IME inputType at mount; remount when mode or
        // autocomplete settings change so the keyboard surface stays correct.
        key={
          Platform.OS === 'android'
            ? liveInputEnabled
              ? 'terminal-input-direct'
              : autocompleteEnabled
                ? 'terminal-input-command-ac-on'
                : 'terminal-input-command-ac-off'
            : liveInputEnabled
              ? 'terminal-input-direct'
              : 'terminal-input-command'
        }
        style={styles.terminalInput}
        value={liveInputEnabled ? liveInputCapture : commandInput}
        onChangeText={liveInputEnabled ? onLiveInputChange : onCommandInputChange}
        onKeyPress={liveInputEnabled ? onLiveInputKeyPress : undefined}
        onSubmitEditing={liveInputEnabled ? onLiveInputSubmit : () => void onSendCommand()}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.textPrimary}
        cursorColor={colors.textPrimary}
        underlineColorAndroid="transparent"
        // Why: Android's extract editor inherits native dark chrome and is
        // unreadable on e-ink; keep terminal composition in the themed field.
        disableFullscreenUI
        keyboardAppearance={isEinkMode ? 'light' : 'dark'}
        showSoftInputOnFocus
        autoCapitalize="none"
        autoCorrect={liveInputEnabled ? false : autocompleteEnabled}
        spellCheck={liveInputEnabled ? false : autocompleteEnabled}
        smartInsertDelete={false}
        autoComplete="off"
        keyboardType={
          liveInputEnabled
            ? getTerminalLiveInputKeyboardType(Platform.OS)
            : getTerminalCommandKeyboardType(Platform.OS, autocompleteEnabled)
        }
        returnKeyType={liveInputEnabled ? 'default' : 'send'}
        blurOnSubmit={!liveInputEnabled}
        editable={canSend}
        importantForAutofill="no"
      />
      <MobileTerminalInputActions
        colors={colors}
        canSend={canSend}
        isAttaching={isAttaching}
        dictation={dictation}
        dictationMode={dictationMode}
        buttonStyle={styles.dictationButton}
        activeButtonStyle={styles.dictationButtonActive}
        disabledButtonStyle={styles.sendButtonDisabled}
        onAttachImage={onAttachImage}
        onAttachFile={onAttachFile}
        onDictationToggle={onDictationToggle}
        onDictationPressIn={onDictationPressIn}
        onDictationPressOut={onDictationPressOut}
        onDictationCancel={onDictationCancel}
      />
      {!liveInputEnabled ? (
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          disabled={!canSend}
          onPress={() => void onSendCommand()}
          accessibilityLabel="Send command"
        >
          <ArrowUp size={18} color={colors.onSurfaceBright} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  )
}
