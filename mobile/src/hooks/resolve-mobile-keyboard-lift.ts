export type MobileKeyboardLiftPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos'

// Why: Expo edge-to-edge keeps the window size fixed; callers translate UI by this
// amount. iOS keyboard height includes the home-indicator inset; Android IME
// height typically does not.
export function resolveMobileKeyboardLift(
  keyboardHeight: number,
  platform: MobileKeyboardLiftPlatform,
  bottomInset: number
): number {
  if (keyboardHeight <= 0) {
    return 0
  }
  if (platform === 'ios') {
    return Math.max(0, keyboardHeight - bottomInset)
  }
  return keyboardHeight
}
