import type { ConnectionLogLevel, ConnectionLogSink } from './types'

// Why: a bounded, tiered retry runway recovers short Wi-Fi/sleep failures
// without burning a socket indefinitely when the desktop is unreachable.
export const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15_000, 30_000, 60_000]
export const GIVE_UP_AFTER_ATTEMPTS = 12
export const AUTH_RETRY_BUDGET = 3
export const REQUEST_TIMEOUT_MS = 30_000
export const CONNECT_TIMEOUT_MS = 12_000
export const HANDSHAKE_TIMEOUT_MS = 5_000
export const STABLE_CONNECTION_RESET_MS = 30_000
export const WEBSOCKET_CONNECTING_STATE = 0
export const ACTIVITY_PROBE_INTERVAL_MS = 20_000

export function createConnectionLogEmitter(onLog: ConnectionLogSink | undefined) {
  let counter = 0
  return (level: ConnectionLogLevel, message: string, detail?: string): void => {
    onLog?.({ id: `log-${++counter}-${Date.now()}`, ts: Date.now(), level, message, detail })
  }
}

// Why: diagnostics must never expose device tokens or full pairing URLs.
export function redactedEndpoint(endpoint: string): string {
  const match = endpoint.match(/^wss?:\/\/([^/]+)/i)
  return match ? match[1] : 'unknown'
}
