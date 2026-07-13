type DictationState = {
  readonly isStarting: boolean
  readonly isRecording: boolean
  readonly isProcessing: boolean
}

export function resolveDirectInputPlaceholder(
  dictation: DictationState,
  isAttaching: boolean
): string {
  if (dictation.isRecording) {
    return 'Listening — tap mic to stop'
  }
  if (dictation.isProcessing) {
    return 'Processing dictation on desktop'
  }
  if (dictation.isStarting) {
    return 'Starting microphone'
  }
  if (isAttaching) {
    return 'Uploading image to host'
  }
  return 'Direct input to terminal'
}
