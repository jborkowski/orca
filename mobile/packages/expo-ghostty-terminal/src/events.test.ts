import { describe, expect, it } from 'vitest'
import { isGhosttyTerminalInputEvent, isGhosttyTerminalQueryReplyEvent } from './events'

describe('isGhosttyTerminalInputEvent', () => {
  it('accepts a payload with string bytes', () => {
    expect(isGhosttyTerminalInputEvent({ bytes: '\u001b[A' })).toBe(true)
    expect(isGhosttyTerminalInputEvent({ bytes: '' })).toBe(true)
  })

  it('rejects malformed or missing payloads', () => {
    expect(isGhosttyTerminalInputEvent(null)).toBe(false)
    expect(isGhosttyTerminalInputEvent(undefined)).toBe(false)
    expect(isGhosttyTerminalInputEvent({})).toBe(false)
    expect(isGhosttyTerminalInputEvent({ bytes: 42 })).toBe(false)
    expect(isGhosttyTerminalInputEvent('bytes')).toBe(false)
  })
})

describe('isGhosttyTerminalQueryReplyEvent', () => {
  it('accepts a payload with string bytes', () => {
    expect(isGhosttyTerminalQueryReplyEvent({ bytes: '\u001b[?1;2c' })).toBe(true)
  })

  it('rejects malformed or missing payloads', () => {
    expect(isGhosttyTerminalQueryReplyEvent(null)).toBe(false)
    expect(isGhosttyTerminalQueryReplyEvent({ bytes: { nested: true } })).toBe(false)
    expect(isGhosttyTerminalQueryReplyEvent([])).toBe(false)
  })
})
