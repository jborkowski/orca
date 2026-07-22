import type { StyleProp, ViewStyle } from 'react-native'

// Terminal-side keystrokes/bytes produced by the Ghostty host (stubbed for now).
export interface GhosttyTerminalInputEvent {
  bytes: string
}

// Reply payload for terminal device queries (e.g. DA/DSR); stubbed for now.
export interface GhosttyTerminalQueryReplyEvent {
  bytes: string
}

export interface GhosttyTerminalViewProps {
  style?: StyleProp<ViewStyle>
  // Fired once the native Ghostty surface has initialized and is ready for writes.
  onReady?: () => void
  onTerminalInput?: (event: GhosttyTerminalInputEvent) => void
  onQueryReply?: (event: GhosttyTerminalQueryReplyEvent) => void
}

// Why: intentionally a subset of TerminalSurfaceHandle. This scaffold only freezes
// the methods needed to swap TerminalWebView later; the rest land with libghostty.
export interface GhosttyTerminalHandle {
  init: (cols: number, rows: number) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  clear: () => void
}
