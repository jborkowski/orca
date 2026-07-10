import { useEffect, useMemo, useState } from 'react'
import { Keyboard, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { resolveMobileKeyboardLift } from './resolve-mobile-keyboard-lift'

export function useMobileKeyboardLift(): number {
  return useMobileKeyboardMetrics().keyboardLift
}

export function useMobileKeyboardHeight(): number {
  return useMobileKeyboardMetrics().keyboardHeight
}

export function useMobileKeyboardMetrics(): {
  readonly keyboardHeight: number
  readonly keyboardLift: number
} {
  const insets = useSafeAreaInsets()
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

    const onShow = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0)
    })
    const onHide = () => {
      setKeyboardHeight(0)
    }

    const showSub = onShow
    const hideSub = Keyboard.addListener(hideEvent, onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const keyboardLift = useMemo(
    () => resolveMobileKeyboardLift(keyboardHeight, Platform.OS, insets.bottom),
    [insets.bottom, keyboardHeight]
  )

  return { keyboardHeight, keyboardLift }
}
