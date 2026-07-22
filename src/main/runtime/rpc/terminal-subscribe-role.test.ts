import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from './dispatcher'
import type { RpcRequest } from './core'
import type { OrcaRuntimeService } from '../orca-runtime'
import { TERMINAL_METHODS } from './methods/terminal'
import type { RuntimeTerminalWait } from '../../../shared/runtime-types'

// Why: exercises the interactive-vs-notify role on terminal.subscribe. The
// invariant: default/missing role behaves exactly as today (registers a
// remote view subscriber = eyes; attaches the live output stream), while
// role='notify' watches without eyes and without the continuous stream.

function stubRuntime(overrides: Partial<OrcaRuntimeService> = {}): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    registerRemoteTerminalViewSubscriber: () => () => {},
    ...overrides
  } as OrcaRuntimeService
}

const makeRequest = (method: string, params?: unknown): RpcRequest => ({
  id: 'req-1',
  authToken: 'tok',
  method,
  params
})

type SubscribeHarness = {
  runtime: OrcaRuntimeService
  registerRemoteTerminalViewSubscriber: ReturnType<typeof vi.fn>
  releaseViewSubscriber: ReturnType<typeof vi.fn>
  subscribeToTerminalData: ReturnType<typeof vi.fn>
  cleanups: Map<string, () => void>
}

// Why: both terminal.subscribe transports (legacy JSON + binary) register the
// same view subscriber and data stream, so a shared runtime stub keeps the
// role assertions transport-agnostic.
function makeSubscribeRuntime(): SubscribeHarness {
  const cleanups = new Map<string, () => void>()
  const releaseViewSubscriber = vi.fn()
  const registerRemoteTerminalViewSubscriber = vi.fn(() => releaseViewSubscriber)
  const subscribeToTerminalData = vi.fn(() => vi.fn())
  const runtime = stubRuntime({
    resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
    readTerminal: vi.fn().mockResolvedValue({ tail: [], truncated: false }),
    serializeTerminalBuffer: vi
      .fn()
      .mockResolvedValue({ data: 'snapshot', cols: 80, rows: 24, seq: 1 }),
    getTerminalSize: vi.fn().mockReturnValue({ cols: 80, rows: 24 }),
    getMobileDisplayMode: vi.fn().mockReturnValue('auto'),
    getLayout: vi.fn().mockReturnValue({ seq: 1 }),
    subscribeToTerminalData,
    subscribeToTerminalResize: vi.fn().mockReturnValue(vi.fn()),
    subscribeToFitOverrideChanges: vi.fn().mockReturnValue(vi.fn()),
    registerRemoteTerminalViewSubscriber,
    registerSubscriptionCleanup: vi.fn((id: string, cleanup: () => void) => {
      cleanups.set(id, cleanup)
    }),
    cleanupSubscription: vi.fn((id: string) => {
      const cleanup = cleanups.get(id)
      cleanups.delete(id)
      cleanup?.()
    }),
    waitForTerminal: vi.fn(() => new Promise<RuntimeTerminalWait>(() => {}))
  })
  return {
    runtime,
    registerRemoteTerminalViewSubscriber,
    releaseViewSubscriber,
    subscribeToTerminalData,
    cleanups
  }
}

function dispatchBinarySubscribe(
  harness: SubscribeHarness,
  params: Record<string, unknown>,
  clientId: string
): { messages: string[]; done: Promise<unknown> } {
  const messages: string[] = []
  const dispatcher = new RpcDispatcher({ runtime: harness.runtime, methods: TERMINAL_METHODS })
  const done = dispatcher.dispatchStreaming(
    makeRequest('terminal.subscribe', {
      terminal: 'terminal-1',
      client: { id: clientId, type: 'desktop' },
      capabilities: { terminalBinaryStream: 1 },
      ...params
    }),
    (msg) => messages.push(msg),
    {
      connectionId: `conn-${clientId}`,
      sendBinary: vi.fn(),
      registerBinaryStreamHandler: vi.fn(() => vi.fn())
    }
  )
  return { messages, done }
}

const waitForSubscribed = async (messages: string[]): Promise<void> => {
  await vi.waitFor(() =>
    expect(messages.some((msg) => JSON.parse(msg).result?.type === 'subscribed')).toBe(true)
  )
}

describe('terminal.subscribe role (interactive vs notify)', () => {
  it('registers a remote view subscriber and live stream when role is omitted (today)', async () => {
    const harness = makeSubscribeRuntime()
    const { messages, done } = dispatchBinarySubscribe(harness, {}, 'desktop-default')

    await waitForSubscribed(messages)
    expect(harness.registerRemoteTerminalViewSubscriber).toHaveBeenCalledWith('pty-1')
    expect(harness.subscribeToTerminalData).toHaveBeenCalledWith('pty-1', expect.any(Function))

    harness.runtime.cleanupSubscription('terminal-1:desktop-default')
    await done
  })

  it('registers a remote view subscriber when role is explicit interactive', async () => {
    const harness = makeSubscribeRuntime()
    const { messages, done } = dispatchBinarySubscribe(
      harness,
      { role: 'interactive' },
      'desktop-interactive'
    )

    await waitForSubscribed(messages)
    expect(harness.registerRemoteTerminalViewSubscriber).toHaveBeenCalledWith('pty-1')
    expect(harness.subscribeToTerminalData).toHaveBeenCalled()

    harness.runtime.cleanupSubscription('terminal-1:desktop-interactive')
    await done
  })

  it('does NOT register a view subscriber or live stream when role is notify', async () => {
    const harness = makeSubscribeRuntime()
    const { messages, done } = dispatchBinarySubscribe(
      harness,
      { role: 'notify' },
      'desktop-notify'
    )

    // Still acknowledges the subscription (subscribed ack is sent for notify).
    await waitForSubscribed(messages)
    expect(harness.registerRemoteTerminalViewSubscriber).not.toHaveBeenCalled()
    expect(harness.subscribeToTerminalData).not.toHaveBeenCalled()

    harness.runtime.cleanupSubscription('terminal-1:desktop-notify')
    await done
  })

  it('counts interactive as the only remote view when interactive and notify overlap', async () => {
    const harness = makeSubscribeRuntime()
    const interactive = dispatchBinarySubscribe(harness, { role: 'interactive' }, 'desktop-eyes')
    const notify = dispatchBinarySubscribe(harness, { role: 'notify' }, 'desktop-watch')

    await waitForSubscribed(interactive.messages)
    await waitForSubscribed(notify.messages)

    // Only the interactive subscription registers eyes / participates in query
    // authority yield; the notify subscription alone does not.
    expect(harness.registerRemoteTerminalViewSubscriber).toHaveBeenCalledTimes(1)
    expect(harness.registerRemoteTerminalViewSubscriber).toHaveBeenCalledWith('pty-1')

    harness.runtime.cleanupSubscription('terminal-1:desktop-eyes')
    harness.runtime.cleanupSubscription('terminal-1:desktop-watch')
    await Promise.all([interactive.done, notify.done])
  })

  it('balances the view-subscriber release on cleanup for interactive subscriptions', async () => {
    const harness = makeSubscribeRuntime()
    const { messages, done } = dispatchBinarySubscribe(
      harness,
      { role: 'interactive' },
      'desktop-1'
    )

    await waitForSubscribed(messages)
    expect(harness.releaseViewSubscriber).not.toHaveBeenCalled()

    harness.runtime.cleanupSubscription('terminal-1:desktop-1')
    await done
    expect(harness.releaseViewSubscriber).toHaveBeenCalledTimes(1)
  })

  it('never registers nor releases a view subscriber for notify subscriptions', async () => {
    const harness = makeSubscribeRuntime()
    const { messages, done } = dispatchBinarySubscribe(harness, { role: 'notify' }, 'desktop-1')

    await waitForSubscribed(messages)
    harness.runtime.cleanupSubscription('terminal-1:desktop-1')
    await done

    // Balanced by construction: nothing acquired means nothing to release.
    expect(harness.registerRemoteTerminalViewSubscriber).not.toHaveBeenCalled()
    expect(harness.releaseViewSubscriber).not.toHaveBeenCalled()
  })

  it('honors notify on the legacy JSON transport (no binary capability)', async () => {
    const harness = makeSubscribeRuntime()
    const messages: string[] = []
    const dispatcher = new RpcDispatcher({ runtime: harness.runtime, methods: TERMINAL_METHODS })

    const done = dispatcher.dispatchStreaming(
      makeRequest('terminal.subscribe', {
        terminal: 'terminal-1',
        client: { id: 'legacy-json', type: 'desktop' },
        role: 'notify'
      }),
      (msg) => messages.push(msg),
      { connectionId: 'conn-legacy' }
    )

    await vi.waitFor(() =>
      expect(messages.some((msg) => JSON.parse(msg).result?.type === 'scrollback')).toBe(true)
    )
    expect(harness.registerRemoteTerminalViewSubscriber).not.toHaveBeenCalled()
    expect(harness.subscribeToTerminalData).not.toHaveBeenCalled()

    harness.runtime.cleanupSubscription('terminal-1:legacy-json')
    await done
  })

  it('registers a view subscriber on the legacy JSON transport when role is omitted', async () => {
    const harness = makeSubscribeRuntime()
    const messages: string[] = []
    const dispatcher = new RpcDispatcher({ runtime: harness.runtime, methods: TERMINAL_METHODS })

    const done = dispatcher.dispatchStreaming(
      makeRequest('terminal.subscribe', {
        terminal: 'terminal-1',
        client: { id: 'legacy-json', type: 'desktop' }
      }),
      (msg) => messages.push(msg),
      { connectionId: 'conn-legacy' }
    )

    await vi.waitFor(() =>
      expect(messages.some((msg) => JSON.parse(msg).result?.type === 'scrollback')).toBe(true)
    )
    expect(harness.registerRemoteTerminalViewSubscriber).toHaveBeenCalledWith('pty-1')
    expect(harness.subscribeToTerminalData).toHaveBeenCalledWith('pty-1', expect.any(Function))

    harness.runtime.cleanupSubscription('terminal-1:legacy-json')
    await done
  })
})
