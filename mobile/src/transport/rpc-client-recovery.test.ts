/**
 * Recovery and auth-retry tests for the mobile rpc-client.
 *
 * Why: split from rpc-client.test.ts to stay under the oxlint max-lines limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect } from './rpc-client'
import {
  encodeTerminalOutput,
  installRpcClientTestEnvironment,
  MockWebSocket,
  mockSockets,
  restoreRpcClientTestEnvironment,
  sentRequest,
  sentRequests
} from './rpc-client-test-fixtures'

vi.mock('./e2ee', () => ({
  generateKeyPair: () => ({
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(32)
  }),
  deriveSharedKey: () => new Uint8Array(32),
  publicKeyFromBase64: () => new Uint8Array(32),
  publicKeyToBase64: () => 'client-public-key',
  encrypt: (plaintext: string) => `encrypted:${plaintext}`,
  decrypt: (raw: string) => (raw === 'undecryptable' ? null : raw.replace(/^encrypted:/, '')),
  decryptBytes: (bytes: Uint8Array) => bytes
}))

describe('mobile rpc-client recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installRpcClientTestEnvironment()
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreRpcClientTestEnvironment()
  })

  // Repro for issue #5049: Android sessions that appear connected (or stuck
  // "Reconnecting…") after the app returns to the foreground, recoverable
  // only by restarting the app. notifyConnectionMayBeAvailable is the common
  // recovery hook for foreground, network, and new-request signals.
  describe('foreground recovery', () => {
    function openAndAuthenticate(socket: MockWebSocket) {
      socket.open()
      socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
      socket.receive('encrypted:{"type":"e2ee_authenticated"}')
    }
    function connectAuthenticated() {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      const socket = mockSockets[0]!
      openAndAuthenticate(socket)
      return { client, socket }
    }

    it('repro: a parked reconnect loop never retries on its own', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      openAndAuthenticate(mockSockets[0]!)
      mockSockets[0]!.close()

      await vi.runAllTimersAsync()
      expect(client.getState()).toBe('reconnecting')
      expect(client.getReconnectAttempt()).toBe(12)

      // Stuck: arbitrary additional time produces no further attempts.
      const socketsBefore = mockSockets.length
      await vi.advanceTimersByTimeAsync(600_000)
      expect(mockSockets.length).toBe(socketsBefore)

      client.close()
    })

    it('restarts a parked reconnect loop on foreground', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      openAndAuthenticate(mockSockets[0]!)
      mockSockets[0]!.close()
      await vi.runAllTimersAsync()
      expect(client.getReconnectAttempt()).toBe(12)

      const socketsBefore = mockSockets.length
      client.notifyConnectionMayBeAvailable()

      expect(mockSockets.length).toBe(socketsBefore + 1)
      expect(client.getReconnectAttempt()).toBe(0)
      openAndAuthenticate(mockSockets[mockSockets.length - 1]!)
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('fast-forwards a pending backoff timer on foreground', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      openAndAuthenticate(mockSockets[0]!)
      mockSockets[0]!.close()
      expect(client.getState()).toBe('reconnecting')

      const socketsBefore = mockSockets.length
      client.notifyConnectionMayBeAvailable()

      expect(mockSockets.length).toBe(socketsBefore + 1)
      openAndAuthenticate(mockSockets[mockSockets.length - 1]!)
      expect(client.getState()).toBe('connected')

      // The cleared backoff timer must not fire a duplicate attempt.
      await vi.advanceTimersByTimeAsync(1_000)
      expect(mockSockets.length).toBe(socketsBefore + 1)

      client.close()
    })

    it('reaps a half-open socket within 8s of foreground', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      const socket = mockSockets[0]!
      openAndAuthenticate(socket)

      // Half-open: readyState stays OPEN but the server never answers.
      client.notifyConnectionMayBeAvailable()
      expect(sentRequests(socket, 'status.get')).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(8_000)
      expect(socket.close).toHaveBeenCalled()
      expect(client.getState()).toBe('reconnecting')

      await vi.advanceTimersByTimeAsync(500)
      openAndAuthenticate(mockSockets[mockSockets.length - 1]!)
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('keeps a healthy connection when the foreground probe is answered', async () => {
      const { client, socket } = connectAuthenticated()

      client.notifyConnectionMayBeAvailable()
      const probe = sentRequest(socket, 'status.get')
      socket.receive(`encrypted:${JSON.stringify({ id: probe.id, ok: true, result: {} })}`)

      await vi.advanceTimersByTimeAsync(10_000)
      expect(socket.close).not.toHaveBeenCalled()
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('keeps a healthy connection when another response arrives while the probe is pending', async () => {
      const { client, socket } = connectAuthenticated()

      client.notifyConnectionMayBeAvailable()
      expect(sentRequests(socket, 'status.get')).toHaveLength(1)

      const poll = client.sendRequest('speech.models.list')
      await Promise.resolve()
      const pollRequest = sentRequest(socket, 'speech.models.list')
      socket.receive(
        `encrypted:${JSON.stringify({
          id: pollRequest.id,
          ok: true,
          result: { enabled: false, selectedModelId: '', dictationMode: 'toggle', models: [] }
        })}`
      )
      await expect(poll).resolves.toMatchObject({ ok: true })

      await vi.advanceTimersByTimeAsync(8_000)
      expect(socket.close).not.toHaveBeenCalled()
      expect(client.getState()).toBe('connected')

      await vi.advanceTimersByTimeAsync(12_000)
      expect(sentRequests(socket, 'status.get')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(7_999)
      expect(socket.close).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(socket.close).toHaveBeenCalled()
      expect(client.getState()).toBe('reconnecting')

      client.close()
    })

    it('keeps a healthy connection when a non-auth RPC failure arrives while the probe is pending', async () => {
      const { client, socket } = connectAuthenticated()

      client.notifyConnectionMayBeAvailable()
      expect(sentRequests(socket, 'status.get')).toHaveLength(1)

      const poll = client.sendRequest('speech.models.list')
      await Promise.resolve()
      const pollRequest = sentRequest(socket, 'speech.models.list')
      socket.receive(
        `encrypted:${JSON.stringify({
          id: pollRequest.id,
          ok: false,
          error: { code: 'download_failed', message: 'model download failed' }
        })}`
      )
      await expect(poll).resolves.toMatchObject({
        ok: false,
        error: { code: 'download_failed' }
      })

      await vi.advanceTimersByTimeAsync(8_000)
      expect(socket.close).not.toHaveBeenCalled()
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('keeps a healthy connection when a binary stream frame arrives while the probe is pending', async () => {
      const { client, socket } = connectAuthenticated()
      const events: unknown[] = []

      client.subscribe('terminal.subscribe', { terminal: 'term-1' }, (event) => {
        events.push(event)
      })
      const subscribe = sentRequest(socket, 'terminal.subscribe')
      socket.receive(
        `encrypted:${JSON.stringify({
          id: subscribe.id,
          ok: true,
          streaming: true,
          result: { type: 'subscribed', streamId: 42 }
        })}`
      )

      client.notifyConnectionMayBeAvailable()
      socket.receive(encodeTerminalOutput(42, 'still alive'))
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(8_000)

      expect(events).toContainEqual({ type: 'data', streamId: 42, chunk: 'still alive' })
      expect(socket.close).not.toHaveBeenCalled()
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('does not count undecryptable inbound payloads as probe activity', async () => {
      const { client, socket } = connectAuthenticated()

      client.notifyConnectionMayBeAvailable()
      socket.receive('undecryptable')
      socket.receive(new Uint8Array([0xff, 0x00, 0x01]))

      await vi.advanceTimersByTimeAsync(8_000)
      expect(socket.close).toHaveBeenCalled()
      expect(client.getState()).toBe('reconnecting')

      client.close()
    })

    it('is a no-op after the client is closed', () => {
      const { client } = connectAuthenticated()
      client.close()

      const socketsBefore = mockSockets.length
      client.notifyConnectionMayBeAvailable()
      expect(mockSockets.length).toBe(socketsBefore)
      expect(client.getState()).toBe('disconnected')
    })
  })

  // Issue #5200: a single auth rejection used to latch 'auth-failed'
  // permanently, forcing a needless re-pair even when the desktop still
  // listed the device with a valid token. The client now retries the
  // handshake a bounded number of times before declaring auth dead.
  describe('auth rejection retry (issue #5200)', () => {
    function authenticate(socket: MockWebSocket) {
      socket.open()
      socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
      socket.receive('encrypted:{"type":"e2ee_authenticated"}')
    }
    function unauthorizedResponsePayload(id: string): string {
      return `encrypted:${JSON.stringify({ id, ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } })}`
    }

    it('retries the handshake on a transient e2ee_error instead of latching auth-failed', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')
      const first = mockSockets[0]!
      first.open()
      first.receive(JSON.stringify({ type: 'e2ee_ready' }))

      // Transient rejection during handshake — must NOT latch auth-failed.
      first.receive('encrypted:{"type":"e2ee_error","error":{"code":"unauthorized"}}')
      expect(client.getState()).toBe('reconnecting')

      // A fresh socket gets a fresh handshake; this time it authenticates.
      await vi.advanceTimersByTimeAsync(500)
      authenticate(mockSockets[mockSockets.length - 1]!)
      expect(client.getState()).toBe('connected')

      client.close()
    })

    it('latches auth-failed once the retry budget is exhausted', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')

      // Three consecutive handshake rejections (AUTH_RETRY_BUDGET = 3).
      for (let i = 0; i < 3; i++) {
        if (i > 0) {
          await vi.advanceTimersByTimeAsync(500)
        }
        const socket = mockSockets[mockSockets.length - 1]!
        socket.open()
        socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
        socket.receive('encrypted:{"type":"e2ee_error","error":{"code":"unauthorized"}}')
      }

      expect(client.getState()).toBe('auth-failed')

      client.close()
    })

    it('resets the budget after a successful connect between rejections', async () => {
      const client = connect('ws://desktop.invalid', 'token', 'server-key')

      // Two rejections, then a clean connect resets the budget...
      for (let i = 0; i < 2; i++) {
        if (i > 0) {
          await vi.advanceTimersByTimeAsync(500)
        }
        const socket = mockSockets[mockSockets.length - 1]!
        socket.open()
        socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
        socket.receive('encrypted:{"type":"e2ee_error","error":{"code":"unauthorized"}}')
      }
      await vi.advanceTimersByTimeAsync(500)
      authenticate(mockSockets[mockSockets.length - 1]!)
      expect(client.getState()).toBe('connected')

      // ...so a later mid-session rejection gets the full budget again
      // rather than immediately latching auth-failed.
      const live = mockSockets[mockSockets.length - 1]!
      const request = client.sendRequest('status.get').catch(() => undefined)
      // sendRequest awaits waitForConnected before sending — let it flush.
      await Promise.resolve()
      const id = sentRequest(live, 'status.get').id
      live.receive(unauthorizedResponsePayload(id))
      await request
      expect(client.getState()).toBe('reconnecting')

      client.close()
    })
  })

  it('parks waiting requests after the retry cap and lets a new request revive', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')
    socket.close()

    const waitingRequestError = client.sendRequest('status.get').then(
      () => null,
      (error: Error) => error
    )
    await vi.runAllTimersAsync()

    expect(client.getState()).toBe('reconnecting')
    expect(client.getReconnectAttempt()).toBe(12)
    await expect(waitingRequestError).resolves.toMatchObject({
      message: 'Connection retry limit reached'
    })
    const socketsBeforeRevival = mockSockets.length
    const revivedRequest = client.sendRequest('status.get')
    expect(mockSockets).toHaveLength(socketsBeforeRevival + 1)
    const revivedSocket = mockSockets.at(-1)!
    revivedSocket.open()
    revivedSocket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    revivedSocket.receive('encrypted:{"type":"e2ee_authenticated"}')
    await Promise.resolve()
    const revivedId = sentRequest(revivedSocket, 'status.get').id
    revivedSocket.receive(`encrypted:${JSON.stringify({ id: revivedId, ok: true, result: {} })}`)
    await expect(revivedRequest).resolves.toMatchObject({ ok: true })

    client.close()
  })
})
