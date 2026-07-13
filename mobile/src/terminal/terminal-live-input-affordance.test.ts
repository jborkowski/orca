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
const modeSwitchSource = readFileSync(
  new URL('../session/MobileTerminalInputModeSwitch.tsx', import.meta.url),
  'utf8'
)
const commandInputStylesSource = readFileSync(
  new URL('../../app/h/[hostId]/session/mobile-session-command-input-styles.ts', import.meta.url),
  'utf8'
)

describe('terminal unified input affordance', () => {
  it('uses one visible MobileTerminalInputBar instead of split live/command branches', () => {
    expect(sessionRouteSource).toContain('<MobileTerminalInputBar')
    expect(sessionRouteSource).not.toContain('{liveInputEnabled ? (')
    expect(sessionRouteSource).not.toContain('MobileTerminalLiveInputStatus')
    expect(sessionRouteSource).not.toContain('styles.liveInputCapture')
    expect(sessionRouteSource).not.toContain('ChevronsRight')
  })

  it('keeps the unified field wired for direct focus and live mirror handlers', () => {
    expect(inputBarSource).toContain('ref={liveInputRef}')
    expect(inputBarSource).toContain('showSoftInputOnFocus')
    expect(inputBarSource).toContain('onLiveInputChange')
    expect(inputBarSource).toContain('onLiveInputKeyPress')
    expect(inputBarSource).toContain('onLiveInputSubmit')
    expect(sessionRouteSource).toContain('focusTerminalLiveInputTarget(liveInputRef.current')
    expect(sessionRouteSource).toContain('keyboardHeight')
  })

  it('does not hide the capture field offscreen', () => {
    expect(inputBarSource).not.toContain('opacity: 0')
    expect(inputBarSource).not.toContain('width: 1')
    expect(inputBarSource).toContain('styles.terminalInput')
  })

  it('labels the direct and command mode switch explicitly', () => {
    expect(sessionRouteSource).toContain('<MobileTerminalInputModeSwitch')
    expect(modeSwitchSource).toContain('Direct')
    expect(modeSwitchSource).toContain('Command')
    expect(modeSwitchSource).toContain(
      'Direct input — keystrokes go to terminal immediately'
    )
    expect(modeSwitchSource).toContain('Command input — compose then send')
  })

  it('uses a shared terminalInput style for the visible field', () => {
    expect(commandInputStylesSource).toContain('terminalInput:')
    expect(commandInputStylesSource).not.toContain('liveInputCapture')
    expect(commandInputStylesSource).not.toContain('liveInputFocusTarget')
  })
})
