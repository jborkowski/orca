import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sessionRouteSource = readFileSync(
  new URL('../../app/h/[hostId]/session/[worktreeId].tsx', import.meta.url),
  'utf8'
)
const inputBarSource = readFileSync(
  new URL('../session/MobileTerminalInputBar.tsx', import.meta.url),
  'utf8'
)

// Why: iOS terminates an active keyboard-dictation (and IME) session whenever
// JS writes a value into the focused field that differs from the native text
// (RN applies it via setTextAndSelection / _setAttributedString). Terminal
// inputs therefore must echo the raw field text in their controlled value and
// apply dash normalization only on the send/mirror path. See stablyai/orca#7925.
describe('terminal iOS dictation write-back', () => {
  it('does not write normalized text back into the buffered command input value', () => {
    expect(sessionRouteSource).toContain('onCommandInputChange={setInput}')
    expect(inputBarSource).toContain('value={liveInputEnabled ? liveInputCapture : commandInput}')
    expect(inputBarSource).toContain(
      'onChangeText={liveInputEnabled ? onLiveInputChange : onCommandInputChange}'
    )
    expect(sessionRouteSource).not.toContain(
      'setInput((previousText) => normalizeTerminalTextInput'
    )
  })

  it('still normalizes the buffered command text at send time', () => {
    expect(sessionRouteSource).toContain('normalizeTerminalTextInput(input)')
  })

  it('routes setup-required startup errors to the dictation setup sheet', () => {
    expect(sessionRouteSource).toContain('if (isDictationSetupRequiredError(err.message))')
    expect(sessionRouteSource).toContain('setShowDictationSetup(true)')
    expect(sessionRouteSource).toContain('void dictation.start().catch(() => {')
  })
})
