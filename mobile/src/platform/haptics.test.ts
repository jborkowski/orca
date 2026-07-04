import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}))

vi.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Long_Press: 'Long_Press',
    Gesture_Start: 'Gesture_Start',
    Confirm: 'Confirm',
    Reject: 'Reject',
    Clock_Tick: 'Clock_Tick'
  },
  ImpactFeedbackStyle: { Medium: 'Medium', Light: 'Light' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error' },
  impactAsync: vi.fn().mockResolvedValue(undefined),
  selectionAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  performAndroidHapticsAsync: vi.fn().mockResolvedValue(undefined)
}))

import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { setEinkDisplayModeFlag } from '../theme/mobile-theme-context'
import {
  triggerEdgeBump,
  triggerError,
  triggerMediumImpact,
  triggerSelection,
  triggerSuccess
} from './haptics'

describe('haptics e-ink gate', () => {
  beforeEach(() => {
    setEinkDisplayModeFlag(false)
    vi.clearAllMocks()
  })

  it('triggers iOS haptics when e-ink mode is off', () => {
    vi.spyOn(Platform, 'OS', 'get').mockReturnValue('ios')

    triggerMediumImpact()
    triggerSelection()
    triggerSuccess()
    triggerError()
    triggerEdgeBump()

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2)
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2)
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled()
  })

  it('skips all haptic triggers when e-ink mode is on', () => {
    setEinkDisplayModeFlag(true)
    vi.spyOn(Platform, 'OS', 'get').mockReturnValue('ios')

    triggerMediumImpact()
    triggerSelection()
    triggerSuccess()
    triggerError()
    triggerEdgeBump()

    expect(Haptics.impactAsync).not.toHaveBeenCalled()
    expect(Haptics.selectionAsync).not.toHaveBeenCalled()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled()
  })
})
