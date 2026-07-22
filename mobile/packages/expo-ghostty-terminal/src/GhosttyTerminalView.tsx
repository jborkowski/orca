// Why: SDK 55 exports requireNativeView from `expo` (a re-export of
// expo-modules-core's requireNativeViewManager), not from expo-modules-core.
import { requireNativeView } from 'expo'
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ForwardRefExoticComponent,
  type RefAttributes
} from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import type {
  GhosttyTerminalHandle,
  GhosttyTerminalInputEvent,
  GhosttyTerminalQueryReplyEvent,
  GhosttyTerminalViewProps
} from './types'

// Native events arrive wrapped in `{ nativeEvent }`; the public props unwrap them.
type NativeViewProps = {
  style?: StyleProp<ViewStyle>
  onReady?: (event: { nativeEvent: Record<string, never> }) => void
  onTerminalInput?: (event: { nativeEvent: GhosttyTerminalInputEvent }) => void
  onQueryReply?: (event: { nativeEvent: GhosttyTerminalQueryReplyEvent }) => void
}

// View-scoped native functions exposed on the component ref by the Expo module.
type NativeViewInstance = {
  initTerminal: (cols: number, rows: number) => Promise<void>
  write: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  clear: () => Promise<void>
}

// Why: requireNativeView throws a clear "native module not linked" error under Expo
// Go, so build a dev client to load the Ghostty host view (mirrors expo-two-way-audio).
const NativeView = requireNativeView('ExpoGhosttyTerminal') as unknown as ForwardRefExoticComponent<
  NativeViewProps & RefAttributes<NativeViewInstance>
>

export const GhosttyTerminalView = forwardRef<GhosttyTerminalHandle, GhosttyTerminalViewProps>(
  function GhosttyTerminalView({ style, onReady, onTerminalInput, onQueryReply }, ref) {
    const nativeRef = useRef<NativeViewInstance>(null)

    useImperativeHandle(
      ref,
      () => ({
        init: (cols, rows) => void nativeRef.current?.initTerminal(cols, rows),
        write: (data) => void nativeRef.current?.write(data),
        resize: (cols, rows) => void nativeRef.current?.resize(cols, rows),
        clear: () => void nativeRef.current?.clear()
      }),
      []
    )

    return (
      <NativeView
        ref={nativeRef}
        style={style}
        onReady={onReady ? () => onReady() : undefined}
        onTerminalInput={
          onTerminalInput ? (event) => onTerminalInput(event.nativeEvent) : undefined
        }
        onQueryReply={onQueryReply ? (event) => onQueryReply(event.nativeEvent) : undefined}
      />
    )
  }
)
