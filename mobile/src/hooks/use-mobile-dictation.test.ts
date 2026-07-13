import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type {
  UseMobileDictationOptions,
  UseMobileDictationResult
} from './mobile-dictation-session-state'

const nativeAudio = vi.hoisted(() => ({
  initialize: vi.fn(),
  permission: vi.fn(),
  tearDown: vi.fn(),
  toggleRecording: vi.fn(),
  listeners: new Map<string, (event: { data: unknown }) => void>()
}))

const keepAwake = vi.hoisted(() => ({
  acquire: vi.fn(),
  reacquire: vi.fn(),
  release: vi.fn()
}))

vi.mock('@orca/expo-two-way-audio', () => ({
  addExpoTwoWayAudioEventListener: (name: string, listener: (event: { data: unknown }) => void) => {
    nativeAudio.listeners.set(name, listener)
    return { remove: () => nativeAudio.listeners.delete(name) }
  },
  initialize: nativeAudio.initialize,
  requestMicrophonePermissionsAsync: nativeAudio.permission,
  tearDown: nativeAudio.tearDown,
  toggleRecording: nativeAudio.toggleRecording
}))

vi.mock('./mobile-dictation-keep-awake', () => ({
  createMobileDictationKeepAwakeOwner: () => keepAwake
}))

vi.mock('./mobile-dictation-foreground-keep-awake', () => ({
  useMobileDictationForegroundKeepAwake: () => undefined
}))

import { useMobileDictation } from './use-mobile-dictation'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type RpcResponse =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: { message: string } }

function successfulResponse(result: Record<string, unknown> = {}): RpcResponse {
  return { ok: true, result }
}

function createClient(
  responder: (method: string) => Promise<RpcResponse> = async (method) =>
    successfulResponse(method === 'speech.dictation.finish' ? { text: 'spoken words' } : {})
): RpcClient {
  return { sendRequest: vi.fn(responder) } as unknown as RpcClient
}

let latestResult: UseMobileDictationResult | null = null
let renderer: ReactTestRenderer | null = null

function DictationHarness({ options }: { readonly options: UseMobileDictationOptions }) {
  latestResult = useMobileDictation(options)
  return null
}

async function mountDictation(options: UseMobileDictationOptions): Promise<void> {
  await act(async () => {
    renderer = create(createElement(DictationHarness, { options }))
  })
}

function result(): UseMobileDictationResult {
  if (!latestResult) {
    throw new Error('Dictation hook is not mounted')
  }
  return latestResult
}

describe('useMobileDictation', () => {
  beforeEach(() => {
    latestResult = null
    renderer = null
    nativeAudio.listeners.clear()
    nativeAudio.initialize.mockReset().mockResolvedValue(true)
    nativeAudio.permission.mockReset().mockResolvedValue({ granted: true })
    nativeAudio.tearDown.mockReset()
    nativeAudio.toggleRecording.mockReset().mockImplementation((enabled: boolean) => enabled)
    keepAwake.acquire.mockReset().mockResolvedValue(undefined)
    keepAwake.reacquire.mockReset().mockResolvedValue(undefined)
    keepAwake.release.mockReset().mockResolvedValue(undefined)
  })

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount())
    }
  })

  it('leaves starting and reports native permission bridge failures', async () => {
    const onError = vi.fn()
    nativeAudio.permission.mockRejectedValueOnce(new Error('permission bridge unavailable'))
    await mountDictation({
      client: createClient(),
      enabled: true,
      onTranscript: vi.fn(),
      onError
    })

    await act(async () => {
      await expect(result().start()).rejects.toThrow('permission bridge unavailable')
    })

    expect(result().status).toBe('error')
    expect(result().isStarting).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('routes desktop setup failures through the shared error handler', async () => {
    const onError = vi.fn()
    const client = createClient(async (method) =>
      method === 'speech.dictation.start'
        ? { ok: false, error: { message: 'voice_dictation_disabled' } }
        : successfulResponse()
    )
    await mountDictation({
      client,
      enabled: true,
      onTranscript: vi.fn(),
      onError
    })

    await act(async () => {
      await expect(result().start()).rejects.toThrow('voice_dictation_disabled')
    })

    expect(result().status).toBe('error')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'voice_dictation_disabled' })
    )
  })

  it('streams microphone chunks and delivers the finished transcript', async () => {
    const onTranscript = vi.fn()
    const client = createClient()
    await mountDictation({ client, enabled: true, onTranscript })

    await act(async () => result().start())
    expect(result().status).toBe('recording')

    nativeAudio.listeners.get('onMicrophoneData')?.({
      data: new Uint8Array([1, 2, 3, 4])
    })
    await vi.waitFor(() =>
      expect(client.sendRequest).toHaveBeenCalledWith(
        'speech.dictation.chunk',
        expect.objectContaining({ sampleRate: 16_000 })
      )
    )

    await act(async () => result().stop())

    expect(result().status).toBe('idle')
    expect(onTranscript).toHaveBeenCalledWith('spoken words')
    expect(nativeAudio.toggleRecording).toHaveBeenCalledWith(false)
  })

  it('returns the local UI to idle before remote cancel finishes', async () => {
    let resolveCancel: ((response: RpcResponse) => void) | null = null
    const cancelResponse = new Promise<RpcResponse>((resolve) => {
      resolveCancel = resolve
    })
    const client = createClient(async (method) =>
      method === 'speech.dictation.cancel' ? cancelResponse : successfulResponse()
    )
    await mountDictation({ client, enabled: true, onTranscript: vi.fn() })
    await act(async () => result().start())

    let cancellation: Promise<void> | null = null
    await act(async () => {
      cancellation = result().cancel()
      await Promise.resolve()
    })
    expect(result().status).toBe('idle')

    resolveCancel?.(successfulResponse())
    await act(async () => {
      await cancellation
    })
  })
})
