import { forwardRef, useImperativeHandle } from 'react'
import { Text, View } from 'react-native'
import type { GhosttyTerminalHandle, GhosttyTerminalViewProps } from './types'

// Why: the native Ghostty host only exists in the iOS/Android dev-client builds; on
// web we render a placeholder and no-op the handle so QA screens still mount.
export const GhosttyTerminalView = forwardRef<GhosttyTerminalHandle, GhosttyTerminalViewProps>(
  function GhosttyTerminalView({ style }, ref) {
    useImperativeHandle(
      ref,
      () => ({
        init: () => undefined,
        write: () => undefined,
        resize: () => undefined,
        clear: () => undefined
      }),
      []
    )

    return (
      <View style={style}>
        <Text>Ghostty terminal is not available on web.</Text>
      </View>
    )
  }
)
