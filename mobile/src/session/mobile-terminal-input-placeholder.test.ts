import { describe, expect, it } from 'vitest'
import { resolveDirectInputPlaceholder } from './mobile-terminal-input-placeholder'

describe('resolveDirectInputPlaceholder', () => {
  it('shows dictation and attach states in the direct input placeholder', () => {
    expect(
      resolveDirectInputPlaceholder(
        { isStarting: false, isRecording: true, isProcessing: false },
        false
      )
    ).toBe('Listening — tap mic to stop')
    expect(
      resolveDirectInputPlaceholder(
        { isStarting: false, isRecording: false, isProcessing: true },
        false
      )
    ).toBe('Processing dictation on desktop')
    expect(resolveDirectInputPlaceholder(
      { isStarting: true, isRecording: false, isProcessing: false },
      false
    )).toBe('Starting microphone')
    expect(
      resolveDirectInputPlaceholder(
        { isStarting: false, isRecording: false, isProcessing: false },
        true
      )
    ).toBe('Uploading image to host')
  })

  it('uses the default direct-input hint when idle', () => {
    expect(
      resolveDirectInputPlaceholder(
        { isStarting: false, isRecording: false, isProcessing: false },
        false
      )
    ).toBe('Direct input to terminal')
  })
})
