import type { GhosttyTerminalInputEvent, GhosttyTerminalQueryReplyEvent } from './types'

// Maps the native event name to its unwrapped payload. This is the single source
// of truth the view + future native bridge validate against.
export interface GhosttyTerminalEventMap {
  onReady: Record<string, never>
  onTerminalInput: GhosttyTerminalInputEvent
  onQueryReply: GhosttyTerminalQueryReplyEvent
}

export type GhosttyTerminalReadyCallback = () => void
export type GhosttyTerminalInputCallback = (event: GhosttyTerminalInputEvent) => void
export type GhosttyTerminalQueryReplyCallback = (event: GhosttyTerminalQueryReplyEvent) => void

// Why: native events arrive as untyped payloads; these guards let the (stubbed) host
// and the WebView-cutoff bridge reject malformed frames before they reach callers.
export function isGhosttyTerminalInputEvent(value: unknown): value is GhosttyTerminalInputEvent {
  return typeof (value as GhosttyTerminalInputEvent | null)?.bytes === 'string'
}

export function isGhosttyTerminalQueryReplyEvent(
  value: unknown
): value is GhosttyTerminalQueryReplyEvent {
  return typeof (value as GhosttyTerminalQueryReplyEvent | null)?.bytes === 'string'
}
