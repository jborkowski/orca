/**
 * Shared test utilities for rpc-client tests.
 *
 * Why: oxlint max-lines requires splitting large rpc-client test suites.
 */
import { vi } from 'vitest'
import { encodeTerminalStreamFrame, TerminalStreamOpcode } from './terminal-stream-protocol'

export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readonly CONNECTING = MockWebSocket.CONNECTING
  readonly OPEN = MockWebSocket.OPEN
  readonly CLOSING = MockWebSocket.CLOSING
  readonly CLOSED = MockWebSocket.CLOSED

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  emitCloseOnClose = true
  throwOnNextSend = false
  sent: string[] = []
  close = vi.fn(() => {
    if (this.readyState === MockWebSocket.CLOSED) {
      return
    }
    this.readyState = MockWebSocket.CLOSED
    if (this.emitCloseOnClose) {
      this.onclose?.()
    }
  })

  constructor(readonly endpoint: string) {
    if (throwOnConstructEndpoints.has(endpoint)) {
      throw new Error(`constructor failed: ${endpoint}`)
    }
    mockSockets.push(this)
  }

  send(payload: string): void {
    if (this.throwOnNextSend) {
      this.throwOnNextSend = false
      throw new Error('send failed')
    }
    this.sent.push(payload)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: payload })
  }
}

export const mockSockets: MockWebSocket[] = []
export const throwOnConstructEndpoints = new Set<string>()
export const originalWebSocket = globalThis.WebSocket

export function sentRequest(
  socket: MockWebSocket,
  method: string
): { id: string; params?: unknown } {
  for (const payload of socket.sent) {
    const decoded = JSON.parse(payload.replace(/^encrypted:/, '')) as {
      id: string
      method: string
      params?: unknown
    }
    if (decoded.method === method) {
      return { id: decoded.id, params: decoded.params }
    }
  }
  throw new Error(`Request not sent: ${method}`)
}

export function sentRequests(
  socket: MockWebSocket,
  method: string
): { id: string; params?: unknown }[] {
  const requests: { id: string; params?: unknown }[] = []
  for (const payload of socket.sent) {
    const decoded = JSON.parse(payload.replace(/^encrypted:/, '')) as {
      id: string
      method: string
      params?: unknown
    }
    if (decoded.method === method) {
      requests.push({ id: decoded.id, params: decoded.params })
    }
  }
  return requests
}

export function encodeBrowserFrame(): Uint8Array {
  const metadata = new TextEncoder().encode(JSON.stringify({ deviceWidth: 800, deviceHeight: 600 }))
  const image = new Uint8Array([1, 2, 3, 4])
  const out = new Uint8Array(16 + metadata.byteLength + image.byteLength)
  const view = new DataView(out.buffer)
  view.setUint8(0, 0x62)
  view.setUint8(1, 1)
  view.setUint8(2, 1)
  view.setUint8(3, 1)
  view.setUint32(4, 7, true)
  view.setUint32(8, metadata.byteLength, true)
  view.setUint32(12, 0, true)
  out.set(metadata, 16)
  out.set(image, 16 + metadata.byteLength)
  return out
}

export function encodeTerminalOutput(streamId: number, chunk: string): Uint8Array {
  return encodeTerminalStreamFrame({
    opcode: TerminalStreamOpcode.Output,
    streamId,
    seq: 1,
    payload: new TextEncoder().encode(chunk)
  })
}

export function installRpcClientTestEnvironment(): void {
  mockSockets.length = 0
  throwOnConstructEndpoints.clear()
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
}

export function restoreRpcClientTestEnvironment(): void {
  globalThis.WebSocket = originalWebSocket
}
