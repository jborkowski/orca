import { describe, expect, it } from 'vitest'
import { resolveMobileKeyboardLift } from './resolve-mobile-keyboard-lift'

describe('resolveMobileKeyboardLift', () => {
  it('returns zero when the keyboard is closed', () => {
    expect(resolveMobileKeyboardLift(0, 'ios', 34)).toBe(0)
    expect(resolveMobileKeyboardLift(0, 'android', 0)).toBe(0)
  })

  it('subtracts the home-indicator inset on iOS', () => {
    expect(resolveMobileKeyboardLift(336, 'ios', 34)).toBe(302)
  })

  it('uses the raw IME height on Android edge-to-edge', () => {
    expect(resolveMobileKeyboardLift(288, 'android', 48)).toBe(288)
  })
})
