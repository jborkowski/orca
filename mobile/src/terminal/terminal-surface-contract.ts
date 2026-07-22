// Why: freezes the JS↔native terminal surface API ahead of the WebView cutoff so a
// future native Ghostty host can implement the same handle without a WebView.
// The stable shape still lives in terminal-webview-contract; this file is the
// WebView-agnostic name surfaces should depend on going forward.

export type {
  TerminalModes,
  TerminalKeyboardAvoidanceMetrics,
  MobileTerminalTheme,
  TerminalSelectionEvents,
  TerminalWebViewProps,
  TerminalWebViewHandle
} from './terminal-webview-contract'

import type {
  TerminalSelectionEvents,
  TerminalWebViewProps,
  TerminalWebViewHandle
} from './terminal-webview-contract'

// Surface-neutral aliases. Names intentionally drop "WebView" so callers bind to
// the host-agnostic contract; the underlying shape stays identical for now.
export type TerminalSurfaceHandle = TerminalWebViewHandle
export type TerminalSurfaceProps = TerminalWebViewProps
export type TerminalSurfaceEvents = TerminalSelectionEvents
