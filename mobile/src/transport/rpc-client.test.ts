import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect } from './rpc-client'
import {
  encodeBrowserFrame,
  encodeTerminalOutput,
  installRpcClientTestEnvironment,
  mockSockets,
  restoreRpcClientTestEnvironment,
  sentRequest,
  sentRequests,
  throwOnConstructEndpoints
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

describe('mobile rpc-client connection timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installRpcClientTestEnvironment()
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreRpcClientTestEnvironment()
  })

  it('closes a socket that never opens so reconnect can run', () => {
    const states: string[] = []
    const client = connect('ws://desktop.invalid', 'token', 'server-key', (state) => {
      states.push(state)
    })

    expect(client.getState()).toBe('connecting')
    expect(mockSockets).toHaveLength(1)
    mockSockets[0]!.emitCloseOnClose = false

    vi.advanceTimersByTime(12_000)

    expect(mockSockets[0]!.close).toHaveBeenCalledTimes(1)
    expect(client.getState()).toBe('reconnecting')
    expect(states).toContain('reconnecting')

    client.close()
  })

  it('ignores stale socket opens after reconnect swaps in a new socket', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const firstSocket = mockSockets[0]!
    firstSocket.emitCloseOnClose = false

    vi.advanceTimersByTime(12_000)
    vi.advanceTimersByTime(500)

    const secondSocket = mockSockets[1]!
    expect(client.getState()).toBe('connecting')

    firstSocket.open()

    expect(client.getState()).toBe('connecting')
    expect(secondSocket.sent).toEqual([])

    vi.advanceTimersByTime(12_000)

    expect(secondSocket.close).toHaveBeenCalledTimes(1)

    client.close()
  })

  it('clears the open timeout once the socket opens and authenticates', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    expect(client.getState()).toBe('connected')

    vi.advanceTimersByTime(12_000)

    expect(socket.close).not.toHaveBeenCalled()
    expect(client.getState()).toBe('connected')

    client.close()
  })

  it('tries every endpoint before incrementing the reconnect round and promotes success', async () => {
    const promoted: string[] = []
    const client = connect('ws://primary.invalid', 'token', 'server-key', {
      endpoints: ['ws://primary.invalid', 'ws://secondary.invalid'],
      onAuthenticatedEndpoint: (endpoint) => promoted.push(endpoint)
    })

    mockSockets[0]!.close()
    expect(client.getReconnectAttempt()).toBe(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSockets[1]!.endpoint).toBe('ws://secondary.invalid')
    expect(client.getReconnectAttempt()).toBe(0)

    mockSockets[1]!.open()
    mockSockets[1]!.receive(JSON.stringify({ type: 'e2ee_ready' }))
    mockSockets[1]!.receive('encrypted:{"type":"e2ee_authenticated"}')
    expect(promoted).toEqual(['ws://secondary.invalid'])

    mockSockets[1]!.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSockets[2]!.endpoint).toBe('ws://primary.invalid')
    expect(client.getReconnectAttempt()).toBe(0)
    client.close()
  })

  it('recovers from constructor and handshake-send exceptions without escaping', async () => {
    throwOnConstructEndpoints.add('ws://primary.invalid')
    const client = connect('ws://primary.invalid', 'token', 'server-key', {
      endpoints: ['ws://secondary.invalid']
    })

    await vi.advanceTimersByTimeAsync(0)
    const secondary = mockSockets[0]!
    secondary.throwOnNextSend = true
    expect(() => secondary.open()).not.toThrow()
    expect(client.getState()).toBe('reconnecting')
    expect(client.getReconnectAttempt()).toBe(1)
    client.close()
  })

  it('finalizes duplicate error and close events only once', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.onerror?.()
    socket.onclose?.()

    expect(client.getReconnectAttempt()).toBe(1)
    expect(client.getState()).toBe('reconnecting')
    client.close()
  })

  it('keeps reconnect backoff until authentication is stable for 30 seconds', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const first = mockSockets[0]!
    first.close()
    await vi.advanceTimersByTimeAsync(500)
    const second = mockSockets[1]!
    second.open()
    second.receive(JSON.stringify({ type: 'e2ee_ready' }))
    second.receive('encrypted:{"type":"e2ee_authenticated"}')

    expect(client.getReconnectAttempt()).toBe(1)
    await vi.advanceTimersByTimeAsync(20_000)
    const probeId = sentRequest(second, 'status.get').id
    second.receive(`encrypted:${JSON.stringify({ id: probeId, ok: true, result: {} })}`)
    await vi.advanceTimersByTimeAsync(9_999)
    expect(client.getReconnectAttempt()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(client.getReconnectAttempt()).toBe(0)
    client.close()
  })

  it('closes a stalled E2EE handshake so reconnect can run', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    expect(client.getState()).toBe('handshaking')

    // No e2ee_authenticated ever arrives — the handshake timer must terminate
    // the socket instead of leaving the client wedged in 'handshaking'.
    await vi.advanceTimersByTimeAsync(5_000)

    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(client.getState()).toBe('reconnecting')
    expect(client.getReconnectAttempt()).toBe(1)

    client.close()
  })

  it('does not reset reconnect backoff when a reconnect handshake stalls', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    mockSockets[0]!.close()
    await vi.advanceTimersByTimeAsync(500)
    expect(client.getReconnectAttempt()).toBe(1)

    // The retried socket opens and receives e2ee_ready but never authenticates.
    // A stalled handshake never reaches 'connected', so the 30s stable-reset is
    // never armed — backoff must keep climbing rather than snapping back to zero.
    const second = mockSockets[1]!
    second.open()
    second.receive(JSON.stringify({ type: 'e2ee_ready' }))
    expect(client.getReconnectAttempt()).toBe(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(client.getState()).toBe('reconnecting')
    expect(client.getReconnectAttempt()).toBe(2)

    client.close()
  })

  it('treats an incompatible handshake protocol as terminal', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!
    socket.open()

    socket.receive(JSON.stringify({ type: 'e2ee_ready_v3' }))

    expect(client.getState()).toBe('auth-failed')
    client.notifyConnectionMayBeAvailable()
    expect(mockSockets).toHaveLength(1)
    client.close()
  })

  it('sends session tabs unsubscribe when a session tab stream is disposed', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    const unsubscribe = client.subscribe(
      'session.tabs.subscribe',
      { worktree: 'id:wt-1' },
      () => {}
    )
    unsubscribe()

    expect(
      socket.sent.some((payload) => payload.includes('"method":"session.tabs.unsubscribe"'))
    ).toBe(true)
    expect(socket.sent.some((payload) => payload.includes('"worktree":"id:wt-1"'))).toBe(true)

    client.close()
  })

  it('does not resend a stream subscribed from the connected-state listener', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key', (state) => {
      if (state === 'connected') {
        client.subscribe('notifications.subscribe', {}, () => {})
      }
    })
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    expect(sentRequests(socket, 'notifications.subscribe')).toHaveLength(1)

    client.close()
  })

  it('routes browser screencast binary frames to the browser subscriber', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!
    const frames: unknown[] = []

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    const unsubscribe = client.subscribe(
      'browser.screencast',
      { worktree: 'id:wt-1', page: 'page-1' },
      () => {},
      { onBinaryFrame: (frame) => frames.push(frame) }
    )
    const request = sentRequest(socket, 'browser.screencast')
    socket.receive(
      `encrypted:${JSON.stringify({
        id: request.id,
        ok: true,
        streaming: true,
        result: { type: 'ready', subscriptionId: 'browser-screencast:page-1:test' },
        _meta: { runtimeId: 'r1' }
      })}`
    )

    client.notifyConnectionMayBeAvailable()
    socket.receive(encodeBrowserFrame())
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(8_000)

    expect(frames).toHaveLength(1)
    expect(socket.close).not.toHaveBeenCalled()
    expect(frames[0]).toMatchObject({
      seq: 7,
      format: 'jpeg',
      metadata: { deviceWidth: 800, deviceHeight: 600 }
    })

    unsubscribe()
    client.close()
  })

  it('sends browser screencast unsubscribe after ready even when disposed early', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    const unsubscribe = client.subscribe(
      'browser.screencast',
      { worktree: 'id:wt-1', page: 'page-1' },
      () => {},
      { onBinaryFrame: () => {} }
    )
    const request = sentRequest(socket, 'browser.screencast')
    unsubscribe()
    socket.receive(
      `encrypted:${JSON.stringify({
        id: request.id,
        ok: true,
        streaming: true,
        result: { type: 'ready', subscriptionId: 'browser-screencast:page-1:test' },
        _meta: { runtimeId: 'r1' }
      })}`
    )

    expect(
      socket.sent.some(
        (payload) =>
          payload.includes('"method":"browser.screencast.unsubscribe"') &&
          payload.includes('"subscriptionId":"browser-screencast:page-1:test"')
      )
    ).toBe(true)

    client.close()
  })

  it('reports rejected browser screencast subscribes and drops the stale frame sink', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!
    const events: unknown[] = []
    const frames: unknown[] = []

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    client.subscribe(
      'browser.screencast',
      { worktree: 'id:wt-1', page: 'page-1' },
      (event) => events.push(event),
      { onBinaryFrame: (frame) => frames.push(frame) }
    )
    const request = sentRequest(socket, 'browser.screencast')
    socket.receive(
      `encrypted:${JSON.stringify({
        id: request.id,
        ok: false,
        error: { code: 'forbidden', message: 'not allowed' },
        _meta: { runtimeId: 'r1' }
      })}`
    )

    socket.receive(encodeBrowserFrame())
    await Promise.resolve()
    await Promise.resolve()

    expect(events).toEqual([
      {
        type: 'error',
        message: 'not allowed',
        error: { code: 'forbidden', message: 'not allowed' }
      }
    ])
    expect(frames).toHaveLength(0)

    client.close()
  })

  it('deletes queued browser screencast subscribes when disposed before connect', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    const unsubscribe = client.subscribe(
      'browser.screencast',
      { worktree: 'id:wt-1', page: 'page-1' },
      () => {},
      { onBinaryFrame: () => {} }
    )
    unsubscribe()

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    expect(sentRequests(socket, 'browser.screencast')).toHaveLength(0)

    client.close()
  })

  it('replaces duplicate browser screencast subscribers and unsubscribes the old stream', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    client.subscribe('browser.screencast', { worktree: 'id:wt-1', page: 'page-1' }, () => {}, {
      onBinaryFrame: () => {}
    })
    const first = sentRequest(socket, 'browser.screencast')
    socket.receive(
      `encrypted:${JSON.stringify({
        id: first.id,
        ok: true,
        streaming: true,
        result: { type: 'ready', subscriptionId: 'browser-screencast:page-1:first' },
        _meta: { runtimeId: 'r1' }
      })}`
    )

    client.subscribe('browser.screencast', { worktree: 'id:wt-1', page: 'page-2' }, () => {}, {
      onBinaryFrame: () => {}
    })

    expect(sentRequests(socket, 'browser.screencast')).toHaveLength(2)
    expect(
      socket.sent.some(
        (payload) =>
          payload.includes('"method":"browser.screencast.unsubscribe"') &&
          payload.includes('"subscriptionId":"browser-screencast:page-1:first"')
      )
    ).toBe(true)

    client.close()
  })

  it('drops old browser frames while a replacement stream is waiting for ready', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!
    const firstFrames: unknown[] = []
    const secondFrames: unknown[] = []

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    client.subscribe('browser.screencast', { worktree: 'id:wt-1', page: 'page-1' }, () => {}, {
      onBinaryFrame: (frame) => firstFrames.push(frame)
    })
    const first = sentRequest(socket, 'browser.screencast')
    socket.receive(
      `encrypted:${JSON.stringify({
        id: first.id,
        ok: true,
        streaming: true,
        result: { type: 'ready', subscriptionId: 'browser-screencast:page-1:first' },
        _meta: { runtimeId: 'r1' }
      })}`
    )

    client.subscribe('browser.screencast', { worktree: 'id:wt-1', page: 'page-2' }, () => {}, {
      onBinaryFrame: (frame) => secondFrames.push(frame)
    })
    const browserRequests = sentRequests(socket, 'browser.screencast')
    const second = browserRequests[browserRequests.length - 1]!
    socket.receive(encodeBrowserFrame())
    await Promise.resolve()
    await Promise.resolve()

    socket.receive(
      `encrypted:${JSON.stringify({
        id: second.id,
        ok: true,
        streaming: true,
        result: { type: 'ready', subscriptionId: 'browser-screencast:page-2:second' },
        _meta: { runtimeId: 'r1' }
      })}`
    )
    socket.receive(encodeBrowserFrame())
    await Promise.resolve()
    await Promise.resolve()

    expect(firstFrames).toHaveLength(0)
    expect(secondFrames).toHaveLength(1)

    client.close()
  })

  it('still routes terminal binary frames after browser demux is enabled', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!
    const events: unknown[] = []

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    client.subscribe('terminal.subscribe', { terminal: 'term-1' }, (event) => events.push(event))
    const request = sentRequest(socket, 'terminal.subscribe')
    socket.receive(
      `encrypted:${JSON.stringify({
        id: request.id,
        ok: true,
        streaming: true,
        result: { type: 'subscribed', streamId: 42 },
        _meta: { runtimeId: 'r1' }
      })}`
    )
    socket.receive(encodeTerminalOutput(42, 'hello'))
    await Promise.resolve()
    await Promise.resolve()

    expect(events).toContainEqual({ type: 'data', streamId: 42, chunk: 'hello' })

    client.close()
  })

  it('replays terminal subscribe with the latest viewport after reconnect', () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const firstSocket = mockSockets[0]!

    firstSocket.open()
    firstSocket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    firstSocket.receive('encrypted:{"type":"e2ee_authenticated"}')

    client.subscribe(
      'terminal.subscribe',
      {
        terminal: 'term-1',
        client: { id: 'phone-1', type: 'mobile' },
        viewport: { cols: 45, rows: 20 }
      },
      () => {}
    )
    expect(sentRequest(firstSocket, 'terminal.subscribe').params).toMatchObject({
      viewport: { cols: 45, rows: 20 }
    })

    client.updateTerminalSubscriptionViewport('term-1', { cols: 60, rows: 24 })
    firstSocket.close()
    vi.advanceTimersByTime(500)
    const secondSocket = mockSockets[1]!
    secondSocket.open()
    secondSocket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    secondSocket.receive('encrypted:{"type":"e2ee_authenticated"}')

    expect(sentRequest(secondSocket, 'terminal.subscribe').params).toMatchObject({
      viewport: { cols: 60, rows: 24 }
    })

    client.close()
  })

  it('honors per-request timeout overrides', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')

    const request = client.sendRequest(
      'speech.dictation.finish',
      { dictationId: 'd1' },
      {
        timeoutMs: 123
      }
    )
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(122)
    await expect(
      Promise.race([request.then(() => 'settled'), Promise.resolve('pending')])
    ).resolves.toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    await expect(request).rejects.toThrow('Request timed out: speech.dictation.finish')

    client.close()
  })

  it('applies per-request timeout overrides while waiting for reconnect', async () => {
    const client = connect('ws://desktop.invalid', 'token', 'server-key')
    const socket = mockSockets[0]!

    socket.open()
    socket.receive(JSON.stringify({ type: 'e2ee_ready' }))
    socket.receive('encrypted:{"type":"e2ee_authenticated"}')
    socket.close()

    const request = client.sendRequest(
      'speech.dictation.finish',
      { dictationId: 'd1' },
      {
        timeoutMs: 123
      }
    )
    let requestOutcome = 'pending'
    request.then(
      () => {
        requestOutcome = 'resolved'
      },
      (error: Error) => {
        requestOutcome = error.message
      }
    )

    try {
      await vi.advanceTimersByTimeAsync(122)
      await Promise.resolve()
      expect(requestOutcome).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()
      expect(requestOutcome).toBe('Timed out while connecting to the remote Orca runtime.')
    } finally {
      client.close()
      await request.catch(() => undefined)
    }
  })
})
