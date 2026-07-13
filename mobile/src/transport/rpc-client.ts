import type { RpcResponse, RpcSuccess, ConnectionState } from './types'
import {
  generateKeyPair,
  deriveSharedKey,
  publicKeyFromBase64,
  publicKeyToBase64,
  encrypt,
  decrypt,
  decryptBytes
} from './e2ee'
import {
  handleTerminalBinaryFrame,
  type TerminalSnapshotState
} from './rpc-client-terminal-binary-frame'
import {
  decodeBrowserScreencastFrame,
  type BrowserScreencastFrame
} from './browser-screencast-protocol'
import {
  buildTerminalUnsubscribeParams,
  updateTerminalSubscriptionViewport as updateCachedTerminalSubscriptionViewport
} from './rpc-client-terminal-subscription'
import { describeSocketEvent } from './socket-event-debug'
import { isRpcResponse } from './rpc-response-shape'
import { websocketPayloadToUint8 } from './websocket-payload-bytes'
import type {
  ConnectOptions,
  ConnectWaiter,
  PendingRequest,
  RpcClient,
  SendRequestOptions,
  StreamingListener,
  StreamRequest,
  SubscribeOptions
} from './rpc-client-contract'
import {
  asError,
  closeSocketBestEffort,
  isBrowserScreencastReadyResult,
  isTerminalSubscribedResult
} from './rpc-client-websocket-state'
import {
  ACTIVITY_PROBE_INTERVAL_MS,
  AUTH_RETRY_BUDGET,
  CONNECT_TIMEOUT_MS,
  createConnectionLogEmitter,
  GIVE_UP_AFTER_ATTEMPTS,
  HANDSHAKE_TIMEOUT_MS,
  RECONNECT_DELAYS,
  redactedEndpoint,
  REQUEST_TIMEOUT_MS,
  STABLE_CONNECTION_RESET_MS,
  WEBSOCKET_CONNECTING_STATE
} from './rpc-client-recovery-policy'

export type { ConnectOptions, RpcClient } from './rpc-client-contract'

export function connect(
  endpoint: string,
  deviceToken: string,
  serverPublicKeyB64: string,
  optionsOrLegacy?: ConnectOptions | ((state: ConnectionState) => void)
): RpcClient {
  // Why: keep backward-compat with callers that pass a bare onStateChange fn.
  const options: ConnectOptions =
    typeof optionsOrLegacy === 'function'
      ? { onStateChange: optionsOrLegacy }
      : (optionsOrLegacy ?? {})
  const onStateChange = options.onStateChange
  const onLog = options.onLog
  let candidateEndpoints = Array.from(new Set([endpoint, ...(options.endpoints ?? [])]))
  let candidateIndex = 0
  let parked = false
  const emitLog = createConnectionLogEmitter(onLog)
  let ws: WebSocket | null = null
  let state: ConnectionState = 'disconnected'
  let requestCounter = 0
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let handshakeTimer: ReturnType<typeof setTimeout> | null = null
  let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null
  let activityProbeTimer: ReturnType<typeof setInterval> | null = null
  let intentionallyClosed = false
  // Why: consecutive auth rejections since the last successful connect. We
  // tolerate up to AUTH_RETRY_BUDGET (issue #5200) before latching auth-failed
  // so a transient rejection doesn't force a needless re-pair. Reset to 0 on
  // every 'connected'.
  let authRejectionCount = 0
  let lastConnectedAt: number | null = null
  // Why: cheap diagnostics for RN/OkHttp process-state poisoning: do retry
  // attempts differ, is anything inbound, and are closes instant or slow?
  let lastInboundAt: number | null = null
  let inboundSequence = 0
  let lastWsClosedAt: number | null = null
  let wsConstructionCounter = 0
  let currentWsOpenedAt: number | null = null

  const currentEndpoint = (): string => candidateEndpoints[candidateIndex] ?? endpoint

  // Why: fresh ephemeral keypair per connection provides forward secrecy.
  // The shared key is derived from our ephemeral secret + server's static public key.
  let sharedKey: Uint8Array | null = null
  const serverPublicKey = publicKeyFromBase64(serverPublicKeyB64)

  const pending = new Map<string, PendingRequest>()
  const streamListeners = new Map<string, StreamRequest>()
  const terminalStreamListeners = new Map<number, StreamingListener>()
  const terminalStreamIdsByRequest = new Map<string, Set<number>>()
  const terminalSnapshots = new Map<number, TerminalSnapshotState>()
  let activeBrowserScreencastRequestId: string | null = null
  let pendingBrowserScreencastRequestId: string | null = null
  const stateListeners = new Set<(state: ConnectionState) => void>()
  const connectWaiters: ConnectWaiter[] = []

  if (onStateChange) {
    stateListeners.add(onStateChange)
  }

  // Diagnostic: tracks how long we've been in the current state. Useful
  // for spotting "stuck in connecting" or "stuck in reconnecting" cases
  // in the logs.
  let stateEnteredAt = Date.now()

  function rejectConnectWaiters(reason: string) {
    const error = new Error(reason)
    for (const waiter of connectWaiters.splice(0)) {
      if (waiter.timeout) {
        clearTimeout(waiter.timeout)
      }
      waiter.reject(error)
    }
  }

  function setState(next: ConnectionState) {
    if (state === next) {
      return
    }
    const prev = state
    const dwelt = Date.now() - stateEnteredAt
    state = next
    stateEnteredAt = Date.now()
    console.log('[net] state', {
      from: prev,
      to: next,
      dweltMs: dwelt,
      attempt: reconnectAttempt,
      endpoint: redactedEndpoint(currentEndpoint()),
      candidateIndex,
      reconnectRound: reconnectAttempt,
      parked
    })
    if (next === 'connected') {
      lastConnectedAt = Date.now()
      // Why: a clean handshake proves the token is valid — clear the auth
      // retry budget so a future isolated rejection gets the full budget again.
      authRejectionCount = 0
      for (const waiter of connectWaiters.splice(0)) {
        if (waiter.timeout) {
          clearTimeout(waiter.timeout)
        }
        waiter.resolve()
      }
    } else if (next === 'disconnected' || next === 'auth-failed') {
      const reason =
        next === 'auth-failed' ? 'Unauthorized — pairing may be revoked' : 'Connection closed'
      rejectConnectWaiters(reason)
    }
    for (const listener of stateListeners) {
      listener(next)
    }
  }

  function waitForConnected(timeoutMs?: number): Promise<void> {
    if (state === 'connected') {
      return Promise.resolve()
    }
    if (intentionallyClosed) {
      return Promise.reject(new Error('Client closed'))
    }
    if (parked) {
      notifyConnectionMayBeAvailable()
    }
    return new Promise((resolve, reject) => {
      const waiter: ConnectWaiter = { resolve, reject, timeout: null }
      if (timeoutMs !== undefined) {
        // Why: explicit per-request timeouts must include offline/reconnect
        // waiting, not only the RPC after the socket becomes connected.
        waiter.timeout = setTimeout(
          () => {
            const index = connectWaiters.indexOf(waiter)
            if (index !== -1) {
              connectWaiters.splice(index, 1)
            }
            reject(new Error('Timed out while connecting to the remote Orca runtime.'))
          },
          Math.max(0, timeoutMs)
        )
      }
      connectWaiters.push(waiter)
    })
  }

  function nextId(): string {
    return `rpc-${++requestCounter}-${Date.now()}`
  }

  function openConnection() {
    if (intentionallyClosed || ws) {
      return
    }

    const now = Date.now()
    const selectedEndpoint = currentEndpoint()
    wsConstructionCounter++
    console.log('[net] openConnection', {
      attempt: reconnectAttempt,
      endpoint: redactedEndpoint(selectedEndpoint),
      candidateIndex,
      candidateCount: candidateEndpoints.length,
      reconnectRound: reconnectAttempt,
      // Why: process-poisoning diagnostic. If wsCount is high (e.g. >50)
      // and every recent open fails with 1006, suspect RN/OkHttp internal
      // pool corruption that only force-quit clears. Compare msSinceLast*
      // values to the failure cadence: instant repeated fails with no
      // inbound traffic between them = process-state stuck.
      wsCount: wsConstructionCounter,
      msSinceLastConnected: lastConnectedAt != null ? now - lastConnectedAt : null,
      msSinceLastClose: lastWsClosedAt != null ? now - lastWsClosedAt : null,
      msSinceLastInbound: lastInboundAt != null ? now - lastInboundAt : null
    })
    setState('connecting')
    sharedKey = null

    currentWsOpenedAt = now
    emitLog(
      'info',
      reconnectAttempt > 0 ? `Reconnecting (attempt ${reconnectAttempt + 1})` : 'Opening WebSocket',
      redactedEndpoint(selectedEndpoint)
    )
    let openingWs: WebSocket
    let finalized = false
    try {
      openingWs = new WebSocket(selectedEndpoint)
      ws = openingWs
    } catch (error) {
      currentWsOpenedAt = null
      finalizeSocketFailure(null, asError(error))
      return
    }
    function finalizeSocketFailure(
      failedWs: WebSocket | null,
      error: Error,
      opts: { timedOut?: boolean } = {}
    ): void {
      if (finalized || (failedWs !== null && ws !== failedWs)) {
        return
      }
      finalized = true
      handleSocketClosed(failedWs, error, opts)
    }
    const ignoreStaleSocketEvent = (eventName: string): boolean => {
      if (ws === openingWs) {
        return false
      }
      // Why: React Native can deliver callbacks from a timed-out socket after
      // reconnect has swapped in a replacement; stale events must not mutate it.
      console.log('[net] stale ws event ignored', {
        eventName,
        state,
        attempt: reconnectAttempt
      })
      return true
    }

    // Why: React Native can leave TCP/WebSocket opens pending indefinitely on
    // flaky network handoffs. Force the existing onclose reconnect path if
    // onopen never arrives, instead of leaving the UI stuck at "Connecting...".
    connectTimer = setTimeout(() => {
      connectTimer = null
      if (ws === openingWs && openingWs.readyState === WEBSOCKET_CONNECTING_STATE) {
        console.log('[net] connect-timeout fired (onopen never arrived)', {
          attempt: reconnectAttempt,
          timeoutMs: CONNECT_TIMEOUT_MS
        })
        emitLog(
          'error',
          'WebSocket connect timeout',
          `No TCP/WS handshake within ${CONNECT_TIMEOUT_MS / 1000}s — endpoint unreachable?`
        )
        finalizeSocketFailure(openingWs, new Error('WebSocket connection timed out'), {
          timedOut: true
        })
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (ignoreStaleSocketEvent('open')) {
        return
      }
      console.log('[net] ws.onopen', { attempt: reconnectAttempt })
      clearConnectTimer()
      setState('handshaking')
      emitLog('success', 'WebSocket open', 'Starting E2EE handshake')

      // Why: generate a fresh ephemeral keypair for each connection.
      // This provides forward secrecy — compromising one session's key
      // doesn't compromise past or future sessions.
      const ephemeral = generateKeyPair()
      const hello = JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: publicKeyToBase64(ephemeral.publicKey)
      })
      try {
        openingWs.send(hello)
      } catch (error) {
        finalizeSocketFailure(openingWs, asError(error))
        return
      }
      emitLog('info', 'Sent e2ee_hello', 'Awaiting server e2ee_ready')

      sharedKey = deriveSharedKey(ephemeral.secretKey, serverPublicKey)

      handshakeTimer = setTimeout(() => {
        handshakeTimer = null
        if (ws !== openingWs || state !== 'handshaking') {
          return
        }
        console.log('[net] handshake-timeout fired (e2ee_authenticated never arrived)', {
          timeoutMs: HANDSHAKE_TIMEOUT_MS
        })
        emitLog(
          'error',
          'Handshake timeout',
          `No e2ee_ready/e2ee_authenticated within ${HANDSHAKE_TIMEOUT_MS / 1000}s`
        )
        finalizeSocketFailure(openingWs, new Error('E2EE handshake timed out'), {
          timedOut: true
        })
      }, HANDSHAKE_TIMEOUT_MS)
    }

    ws.onmessage = (event) => {
      if (ignoreStaleSocketEvent('message')) {
        return
      }
      void handleSocketMessage(event.data).catch((error) => {
        finalizeSocketFailure(openingWs, asError(error))
      })
    }

    async function handleSocketMessage(rawData: unknown) {
      lastInboundAt = Date.now()
      const raw = typeof rawData === 'string' ? rawData : null

      // Why: during handshaking, e2ee_ready is plaintext because it precedes
      // encrypted auth; e2ee_authenticated/e2ee_error are encrypted.
      if (state === 'handshaking') {
        if (raw === null) {
          return
        }
        try {
          const msg = JSON.parse(raw)
          if (msg.type === 'e2ee_ready') {
            emitLog('success', 'Received e2ee_ready', 'Sending device token')
            sendEncrypted({ type: 'e2ee_auth', deviceToken })
            return
          }
          if (typeof msg.type === 'string') {
            handleProtocolFailure('Remote runtime uses an incompatible E2EE handshake protocol')
            return
          }
        } catch {
          // Not plaintext JSON — fall through and try encrypted handshake messages.
        }

        if (!sharedKey || sharedKey.length !== 32) {
          return
        }

        const plaintext = decrypt(raw, sharedKey)
        if (plaintext === null) {
          return
        }

        try {
          const msg = JSON.parse(plaintext)
          if (msg.type === 'e2ee_authenticated') {
            if (handshakeTimer) {
              clearTimeout(handshakeTimer)
              handshakeTimer = null
            }
            console.log('[net] e2ee_authenticated — connected', {
              streamCount: streamListeners.size
            })
            setState('connected')
            scheduleStableConnectionReset(openingWs)
            promoteAuthenticatedEndpoint(selectedEndpoint)
            emitLog('success', 'Authenticated', 'Channel ready for RPC')
            startActivityProbe()
            for (const [id, stream] of streamListeners) {
              if (stream.cancelled) {
                removeStreamListener(id)
                continue
              }
              // Why: setState('connected') notifies UI listeners synchronously;
              // a listener may subscribe and send immediately before this
              // reconnect replay loop resumes.
              if (stream.sent) {
                continue
              }
              if (stream.method === 'browser.screencast') {
                pendingBrowserScreencastRequestId = id
                activeBrowserScreencastRequestId = null
              }
              resetTerminalStreamRoutingForRequest(id)
              if (
                sendEncrypted({ id, deviceToken, method: stream.method, params: stream.params })
              ) {
                stream.sent = true
              } else {
                emitStreamError(stream, 'Connection interrupted')
                removeStreamListener(id)
              }
            }
          } else if (msg.type === 'e2ee_error' || (!msg.ok && msg.error?.code === 'unauthorized')) {
            console.log('[net] e2ee auth FAILED', { msgType: msg.type, error: msg.error })
            if (handshakeTimer) {
              clearTimeout(handshakeTimer)
              handshakeTimer = null
            }
            handleAuthRejection('Unauthorized — pairing may be revoked')
          } else {
            handleProtocolFailure(
              'Remote runtime uses an incompatible E2EE authentication protocol'
            )
          }
        } catch {
          // Not JSON — ignore during handshake.
        }
        return
      }

      // Why: guard against decrypt with an invalid key — sharedKey can be null
      // after destroy() or if a message arrives during a reconnect race.
      if (!sharedKey || sharedKey.length !== 32) {
        return
      }

      if (raw === null) {
        const bytes = await websocketPayloadToUint8(rawData)
        if (ws !== openingWs) {
          return
        }
        if (!bytes) {
          return
        }
        const plaintextBytes = decryptBytes(bytes, sharedKey)
        if (!plaintextBytes) {
          return
        }
        handleBinaryFrame(plaintextBytes)
        return
      }

      const plaintext = decrypt(raw, sharedKey)
      if (plaintext === null) {
        return
      }

      let response: unknown
      try {
        response = JSON.parse(plaintext)
      } catch {
        handleProtocolFailure('Remote runtime returned an invalid encrypted protocol frame')
        return
      }
      if (!isRpcResponse(response)) {
        handleProtocolFailure('Remote runtime returned an incompatible RPC protocol frame')
        return
      }
      recordValidatedInboundTraffic()

      // Why: a mid-session unauthorized may be a transient glitch, not a dead
      // pairing (issue #5200). handleAuthRejection retries the handshake a few
      // times before latching auth-failed, while still bounding churn via the
      // budget so a genuinely revoked token doesn't reconnect forever.
      if (!response.ok && response.error.code === 'unauthorized') {
        handleAuthRejection('Unauthorized — pairing may be revoked')
        return
      }

      const isStreaming = response.ok && (response as RpcSuccess).streaming === true

      if (isStreaming) {
        const stream = streamListeners.get(response.id)
        if (stream && response.ok) {
          const result = (response as RpcSuccess).result
          if (isStreamingSubscriptionReadyResult(result)) {
            stream.subscriptionId = result.subscriptionId
            if (stream.cancelled) {
              sendServerSubscriptionUnsubscribe(stream)
              removeStreamListener(response.id)
              return
            }
            if (stream.method === 'browser.screencast') {
              if (
                pendingBrowserScreencastRequestId !== response.id &&
                activeBrowserScreencastRequestId !== response.id
              ) {
                sendBrowserScreencastUnsubscribe(result.subscriptionId)
                removeStreamListener(response.id)
                return
              }
              pendingBrowserScreencastRequestId = null
              activeBrowserScreencastRequestId = response.id
            }
          }
          if (isTerminalSubscribedResult(result)) {
            let ids = terminalStreamIdsByRequest.get(response.id)
            if (!ids) {
              ids = new Set()
              terminalStreamIdsByRequest.set(response.id, ids)
            }
            ids.add(result.streamId)
            terminalStreamListeners.set(result.streamId, stream.listener)
          }
          if (!stream.cancelled) {
            stream.listener(result)
          }
        }
        return
      }

      if (response.ok) {
        const result = (response as RpcSuccess).result as Record<string, unknown> | null
        if (result && result.type === 'end') {
          const stream = streamListeners.get(response.id)
          if (stream) {
            if (!stream.cancelled) {
              stream.listener(result)
            }
            removeStreamListener(response.id)
            return
          }
        }
        if (result && result.type === 'scrollback') {
          const stream = streamListeners.get(response.id)
          if (stream) {
            stream.listener(result)
            return
          }
        }
      }

      const stream = streamListeners.get(response.id)
      if (stream) {
        if (!response.ok) {
          emitStreamError(stream, response.error.message, response.error)
        } else {
          emitStreamError(stream, 'Streaming request ended before it was ready.')
        }
        removeStreamListener(response.id)
        return
      }

      const req = pending.get(response.id)
      if (req) {
        pending.delete(response.id)
        req.resolve(response)
      }
    }

    ws.onclose = (event) => {
      const e = event as { code?: number; reason?: string; wasClean?: boolean } | undefined
      const closeAt = Date.now()
      // Why: time-since-construct distinguishes failure modes. Instant
      // close (<300ms) = TCP RST / port closed / route unreachable / RN
      // synchronous reject. Mid (300ms–3s) = DNS/connect attempt + reset.
      // Slow (>3s) = TCP SYN timeout / packet loss / NAT wedge. If an
      // entire reconnect burst is all instant, the problem is local
      // process state or routing, not packet loss.
      const constructToCloseMs = currentWsOpenedAt != null ? closeAt - currentWsOpenedAt : null
      const aliveMs =
        currentWsOpenedAt != null && state === 'connected' ? closeAt - currentWsOpenedAt : null
      const inboundIdleMs = lastInboundAt != null ? closeAt - lastInboundAt : null
      // Why: statically imported (not closure-built) — an earlier hot-reload
      // bug came from a stale closure capturing a half-loaded module.
      const closeEvent = describeSocketEvent(event)
      console.log('[net] ws.onclose', {
        code: e?.code,
        reason: e?.reason,
        wasClean: e?.wasClean,
        state,
        attempt: reconnectAttempt,
        intentionallyClosed,
        endpoint: redactedEndpoint(selectedEndpoint),
        constructToCloseMs,
        aliveMs,
        inboundIdleMs,
        eventKeys: closeEvent.keys,
        eventStr: closeEvent.json
      })
      lastWsClosedAt = closeAt
      currentWsOpenedAt = null
      finalizeSocketFailure(openingWs, new Error(e?.reason || 'WebSocket closed'))
    }

    ws.onerror = (event) => {
      if (ignoreStaleSocketEvent('error')) {
        return
      }
      // Why: RN surfaces network errors here (DNS failure, TCP RST, etc).
      // onclose fires right after, but logging the error message gives us
      // the original cause that the close code alone can hide.
      const e = event as { message?: string } | undefined
      const errEvent = describeSocketEvent(event)
      console.log('[net] ws.onerror', {
        message: e?.message,
        state,
        attempt: reconnectAttempt,
        eventKeys: errEvent.keys,
        eventStr: errEvent.json
      })
      finalizeSocketFailure(openingWs, new Error(e?.message || 'WebSocket error'))
    }
  }

  function handleSocketClosed(
    closedWs: WebSocket | null,
    error: Error,
    opts: { timedOut?: boolean } = {}
  ) {
    if (closedWs !== null && ws !== closedWs) {
      console.log('[net] handleSocketClosed STALE — ignoring (ws already swapped)', {
        state,
        attempt: reconnectAttempt
      })
      return
    }
    clearConnectTimer()
    clearStableConnectionTimer()
    ws = null
    closeSocketBestEffort(closedWs)
    sharedKey = null
    activeBrowserScreencastRequestId = null
    pendingBrowserScreencastRequestId = null
    markStreamsForReplay()
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    stopActivityProbe()
    if (intentionallyClosed) {
      console.log('[net] handleSocketClosed — intentional close')
      setState('disconnected')
      rejectAllPending('Connection closed')
      return
    }
    console.log('[net] handleSocketClosed → reconnect', {
      timedOut: !!opts.timedOut,
      pendingCount: pending.size,
      streamCount: streamListeners.size,
      attempt: reconnectAttempt,
      candidateIndex
    })
    emitLog('warn', 'WebSocket closed', error.message)
    rejectAllPending('Connection interrupted')
    setState('reconnecting')
    scheduleNextCandidateOrReconnectRound()
  }

  // Why: a token rejection (handshake e2ee_error/unauthorized or a mid-session
  // unauthorized RPC) may be transient — issue #5200. Retry the full handshake
  // up to AUTH_RETRY_BUDGET times before declaring auth dead, so a one-off
  // glitch self-heals instead of forcing the user to re-pair. A genuinely
  // revoked token fails every retry and latches auth-failed within seconds.
  function handleAuthRejection(reason: string): void {
    activeBrowserScreencastRequestId = null
    pendingBrowserScreencastRequestId = null
    authRejectionCount++
    if (authRejectionCount < AUTH_RETRY_BUDGET) {
      console.log('[net] auth rejected — retrying handshake', {
        attempt: authRejectionCount,
        budget: AUTH_RETRY_BUDGET,
        endpoint: redactedEndpoint(currentEndpoint())
      })
      emitLog(
        'warn',
        'Authentication rejected',
        `Retrying (${authRejectionCount}/${AUTH_RETRY_BUDGET})`
      )
      // Why: close the current socket but DON'T set intentionallyClosed —
      // we want handleSocketClosed to route into the reconnect path so the
      // token gets a fresh handshake. rejectAllPending unblocks in-flight RPCs.
      const closing = ws
      clearSocketStateForAuthenticationRetry(reason)
      closeSocketBestEffort(closing)
      setState('reconnecting')
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        openConnection()
      }, RECONNECT_DELAYS[0])
      return
    }
    console.log('[net] auth rejected — budget exhausted, latching auth-failed', {
      attempt: authRejectionCount,
      endpoint: redactedEndpoint(currentEndpoint())
    })
    intentionallyClosed = true
    closeSocketBestEffort(ws)
    ws = null
    setState('auth-failed')
    rejectAllPending(reason)
  }

  function handleProtocolFailure(reason: string): void {
    intentionallyClosed = true
    const closing = ws
    clearSocketStateForAuthenticationRetry(reason)
    closeSocketBestEffort(closing)
    setState('auth-failed')
    emitLog('error', 'Protocol incompatible', reason)
  }

  function scheduleNextCandidateOrReconnectRound(): void {
    if (candidateIndex + 1 < candidateEndpoints.length) {
      candidateIndex++
      console.log('[net] candidate-fallback', {
        candidateIndex,
        candidateCount: candidateEndpoints.length,
        reconnectRound: reconnectAttempt,
        endpoint: redactedEndpoint(currentEndpoint())
      })
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        openConnection()
      }, 0)
      return
    }
    candidateIndex = 0
    scheduleReconnectRound()
  }

  function scheduleReconnectRound() {
    // Why: spinning reconnect forever drains battery and floods logs
    // when the host is genuinely unreachable (wrong IP, port closed,
    // host moved). Cap at GIVE_UP_AFTER_ATTEMPTS — the UI surfaces a
    // "Can't reach desktop, re-pair?" banner at this point and the
    // user can tap Retry (forceReconnect creates a fresh client,
    // resetting the counter) or Re-pair. Without an explicit cap the
    // worst-case is a phone left on the home screen burning a socket
    // open every 4s indefinitely.
    if (reconnectAttempt >= GIVE_UP_AFTER_ATTEMPTS) {
      parked = true
      console.log('[net] reconnect-paused', {
        attempt: reconnectAttempt,
        reason: 'give-up-cap',
        endpoint: redactedEndpoint(currentEndpoint()),
        parked
      })
      rejectConnectWaiters('Connection retry limit reached')
    } else {
      delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
      reconnectAttempt++
    }
    console.log('[net] scheduleReconnect', {
      delayMs: delay,
      attempt: reconnectAttempt,
      trickle: pastGiveUpCap
    })
    emitLog(
      'info',
      `Reconnect scheduled in ${delay}ms`,
      pastGiveUpCap ? `Attempt ${reconnectAttempt} (slow retry)` : `Attempt ${reconnectAttempt}`
    )
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openConnection()
    }, delay)
  }

  function clearConnectTimer() {
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
  }

  function clearStableConnectionTimer(): void {
    if (stableConnectionTimer) {
      clearTimeout(stableConnectionTimer)
      stableConnectionTimer = null
    }
  }

  function scheduleStableConnectionReset(authenticatedWs: WebSocket): void {
    clearStableConnectionTimer()
    stableConnectionTimer = setTimeout(() => {
      stableConnectionTimer = null
      if (ws !== authenticatedWs || state !== 'connected') {
        return
      }
      reconnectAttempt = 0
      parked = false
      console.log('[net] stable-connection-reset', {
        stableReset: true,
        endpoint: redactedEndpoint(currentEndpoint())
      })
    }, STABLE_CONNECTION_RESET_MS)
  }

  function promoteAuthenticatedEndpoint(authenticatedEndpoint: string): void {
    candidateEndpoints = [
      authenticatedEndpoint,
      ...candidateEndpoints.filter((candidate) => candidate !== authenticatedEndpoint)
    ]
    candidateIndex = 0
    options.onAuthenticatedEndpoint?.(authenticatedEndpoint)
  }

  function clearSocketStateForAuthenticationRetry(reason: string): void {
    clearConnectTimer()
    clearStableConnectionTimer()
    if (handshakeTimer) {
      clearTimeout(handshakeTimer)
      handshakeTimer = null
    }
    stopActivityProbe()
    ws = null
    sharedKey = null
    markStreamsForReplay()
    rejectAllPending(reason)
  }

  // Why: app-level liveness probe — see ACTIVITY_PROBE_INTERVAL_MS comment
  // at the top of the file. Fires while the channel is in 'connected'
  // state, sends a tiny status.get, and force-closes the WS if the probe
  // fails (which the existing onclose path then turns into a reconnect).
  function runActivityProbe() {
    if (state !== 'connected' || !ws) {
      return
    }
    const probeWs = ws
    const id = nextId()
    const probeInboundSequence = inboundSequence
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      pending.delete(id)
      if (inboundSequence > probeInboundSequence) {
        return
      }
      console.log('[net] activity-probe TIMEOUT — forcing reconnect', { state })
      // Why: stale probe timers must not close a replacement socket.
      if (probeWs === ws && probeWs.readyState === WebSocket.OPEN) {
        closeSocketBestEffort(probeWs)
      }
    }, 8_000)
    pending.set(id, {
      resolve: () => {
        if (timedOut) {
          return
        }
        clearTimeout(timeout)
      },
      reject: () => {
        if (timedOut) {
          return
        }
        clearTimeout(timeout)
      }
    })
    if (!sendEncrypted({ id, deviceToken, method: 'status.get' })) {
      clearTimeout(timeout)
      pending.delete(id)
    }
  }

  function startActivityProbe() {
    stopActivityProbe()
    activityProbeTimer = setInterval(runActivityProbe, ACTIVITY_PROBE_INTERVAL_MS)
  }

  function stopActivityProbe() {
    if (activityProbeTimer) {
      clearInterval(activityProbeTimer)
      activityProbeTimer = null
    }
  }

  function rejectAllPending(reason: string) {
    const error = new Error(reason)
    for (const [id, req] of pending) {
      pending.delete(id)
      queueMicrotask(() => req.reject(error))
    }
  }

  function removeStreamListener(id: string): void {
    const stream = streamListeners.get(id)
    streamListeners.delete(id)
    if (activeBrowserScreencastRequestId === id) {
      activeBrowserScreencastRequestId = null
    }
    if (pendingBrowserScreencastRequestId === id) {
      pendingBrowserScreencastRequestId = null
    }
    const terminalStreamIds = terminalStreamIdsByRequest.get(id)
    if (terminalStreamIds) {
      for (const streamId of terminalStreamIds) {
        terminalStreamListeners.delete(streamId)
        terminalSnapshots.delete(streamId)
      }
      terminalStreamIdsByRequest.delete(id)
    }
    if (stream?.method === 'browser.screencast') {
      stream.cancelled = true
    }
  }

  function markStreamsForReplay(): void {
    for (const [id, stream] of streamListeners) {
      stream.sent = false
      resetTerminalStreamRoutingForRequest(id)
    }
  }

  function resetTerminalStreamRoutingForRequest(id: string): void {
    const terminalStreamIds = terminalStreamIdsByRequest.get(id)
    if (!terminalStreamIds) {
      return
    }
    for (const streamId of terminalStreamIds) {
      terminalStreamListeners.delete(streamId)
      terminalSnapshots.delete(streamId)
    }
    terminalStreamIdsByRequest.delete(id)
  }

  function emitStreamError(stream: StreamRequest, message: string, error?: unknown): void {
    if (stream.cancelled) {
      return
    }
    stream.listener({ type: 'error', message, error })
  }

  function disposeBrowserScreencastStream(id: string): void {
    const stream = streamListeners.get(id)
    if (!stream || stream.method !== 'browser.screencast') {
      return
    }
    stream.cancelled = true
    if (activeBrowserScreencastRequestId === id) {
      activeBrowserScreencastRequestId = null
    }
    if (pendingBrowserScreencastRequestId === id) {
      pendingBrowserScreencastRequestId = null
    }
    disposeServerSubscriptionStream(id, stream)
  }

  function disposeRuntimeClientEventsStream(id: string): void {
    const stream = streamListeners.get(id)
    if (!stream || stream.method !== 'runtime.clientEvents.subscribe') {
      return
    }
    disposeServerSubscriptionStream(id, stream)
  }

  function disposeServerSubscriptionStream(id: string, stream: StreamRequest): void {
    stream.cancelled = true
    if (stream.subscriptionId) {
      sendServerSubscriptionUnsubscribe(stream)
      removeStreamListener(id)
      return
    }
    // Why: sent streams may still reply with `ready`; keep a tombstone so we
    // can immediately unsubscribe. Queued streams never reached desktop.
    if (!stream.sent) {
      removeStreamListener(id)
    }
  }

  function recordValidatedInboundTraffic(): void {
    inboundSequence++
  }

  function handleBinaryFrame(bytes: Uint8Array): void {
    const browserFrame = decodeBrowserScreencastFrame(bytes)
    if (browserFrame) {
      recordValidatedInboundTraffic()
      handleBrowserBinaryFrame(browserFrame)
      return
    }
    handleTerminalBinaryFrame(bytes, {
      terminalSnapshots,
      getListener: (streamId) => terminalStreamListeners.get(streamId),
      recordValidatedInboundTraffic
    })
  }

  function handleBrowserBinaryFrame(frame: BrowserScreencastFrame) {
    if (!activeBrowserScreencastRequestId) {
      return
    }
    const stream = streamListeners.get(activeBrowserScreencastRequestId)
    if (!stream || stream.cancelled || stream.method !== 'browser.screencast') {
      return
    }
    stream.onBinaryFrame?.(frame)
  }

  function sendEncrypted(request: unknown): boolean {
    if (ws && ws.readyState === WebSocket.OPEN && sharedKey) {
      try {
        ws.send(encrypt(JSON.stringify(request), sharedKey))
        return true
      } catch (error) {
        const failedWs = ws
        // Why: native WebSocket implementations can throw before onerror or
        // onclose; route that path through the same idempotent cleanup.
        handleSocketClosed(failedWs, asError(error))
        return false
      }
    }
    console.log('[net] sendEncrypted FAILED — channel not ready', {
      hasWs: !!ws,
      readyState: ws?.readyState,
      hasKey: !!sharedKey,
      state
    })
    // Why: if the state machine still thinks we're connected but the
    // underlying WebSocket has flipped to CLOSING/CLOSED without onclose
    // having fired (RN's WebSocket sometimes drops the event, or the
    // server half-closed the stream), force a reconnect. Without this
    // every send silently fails forever and the user sees a frozen UI.
    if (state === 'connected' && ws && ws.readyState !== WebSocket.OPEN) {
      console.log('[net] sendEncrypted detected ws desync — forcing reconnect', {
        readyState: ws.readyState
      })
      handleSocketClosed(ws, new Error('WebSocket is no longer open'))
    }
    return false
  }

  function sendBrowserScreencastUnsubscribe(subscriptionId: string): void {
    sendEncrypted({
      id: nextId(),
      deviceToken,
      method: 'browser.screencast.unsubscribe',
      params: { subscriptionId }
    })
  }

  function sendServerSubscriptionUnsubscribe(stream: StreamRequest): void {
    if (!stream.subscriptionId) {
      return
    }
    if (stream.method === 'browser.screencast') {
      sendBrowserScreencastUnsubscribe(stream.subscriptionId)
      return
    }
    if (stream.method === 'runtime.clientEvents.subscribe') {
      sendEncrypted({
        id: nextId(),
        deviceToken,
        method: 'runtime.clientEvents.unsubscribe',
        params: { subscriptionId: stream.subscriptionId }
      })
    }
  }

  openConnection()

  return {
    async sendRequest(
      method: string,
      params?: unknown,
      options?: SendRequestOptions
    ): Promise<RpcResponse> {
      if (state !== 'connected') {
        notifyConnectionMayBeAvailable()
      }
      const waitStart = Date.now()
      const wasConnected = state === 'connected'
      await waitForConnected(options?.timeoutMs)
      if (!wasConnected) {
        console.log('[net] sendRequest waited for connect', {
          method,
          waitedMs: Date.now() - waitStart
        })
      }

      return new Promise((resolve, reject) => {
        const id = nextId()
        const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
        const timeout = setTimeout(() => {
          pending.delete(id)
          console.log('[net] sendRequest TIMEOUT', {
            method,
            timeoutMs,
            state
          })
          reject(new Error(`Request timed out: ${method}`))
        }, timeoutMs)

        pending.set(id, {
          resolve: (response) => {
            clearTimeout(timeout)
            resolve(response)
          },
          reject: (error) => {
            clearTimeout(timeout)
            reject(error)
          }
        })

        if (!sendEncrypted({ id, deviceToken, method, params })) {
          pending.delete(id)
          clearTimeout(timeout)
          reject(new Error('Connection interrupted'))
        }
      })
    },

    subscribe(
      method: string,
      params: unknown,
      onData: StreamingListener,
      options?: SubscribeOptions
    ): () => void {
      if (state !== 'connected') {
        notifyConnectionMayBeAvailable()
      }
      const id = nextId()
      const stream: StreamRequest = {
        method,
        params,
        listener: onData,
        onBinaryFrame: options?.onBinaryFrame
      }
      streamListeners.set(id, stream)
      if (method === 'browser.screencast') {
        if (activeBrowserScreencastRequestId && activeBrowserScreencastRequestId !== id) {
          disposeBrowserScreencastStream(activeBrowserScreencastRequestId)
        }
        if (pendingBrowserScreencastRequestId && pendingBrowserScreencastRequestId !== id) {
          disposeBrowserScreencastStream(pendingBrowserScreencastRequestId)
        }
        // Why: browser screencast frames are connection-scoped and carry no
        // stream id. Wait for the replacement stream's ready response before
        // routing frames, so in-flight old-page pixels are dropped.
        pendingBrowserScreencastRequestId = id
        activeBrowserScreencastRequestId = null
      }

      if (state === 'connected') {
        if (sendEncrypted({ id, deviceToken, method, params })) {
          stream.sent = true
        } else {
          emitStreamError(stream, 'Connection interrupted')
          removeStreamListener(id)
        }
      } else {
        // Stream is registered but the actual outbound subscribe will be
        // sent (or re-sent) when the channel reaches 'connected'. Useful
        // when terminals don't load — confirms the request is queued.
        console.log('[net] subscribe queued — waiting for connected', { method, state })
      }

      return () => {
        const stream = streamListeners.get(id)
        if (stream?.method === 'browser.screencast') {
          disposeBrowserScreencastStream(id)
          return
        }
        if (stream?.method === 'runtime.clientEvents.subscribe') {
          disposeRuntimeClientEventsStream(id)
          return
        }
        if (stream?.method === 'terminal.subscribe') {
          // Why: the runtime registers cleanup under the composite key
          // `${terminal}:${clientId}` so two phones subscribing to the same
          // terminal handle don't evict each other. Echo that composite key
          // back on unsubscribe; also include `client.id` so the server can
          // reconstruct it if a stale build emits a bare-handle id. See
          // docs/mobile-presence-lock.md.
          const unsubscribeParams = buildTerminalUnsubscribeParams(stream.params)
          if (unsubscribeParams) {
            sendEncrypted({
              id: nextId(),
              deviceToken,
              method: 'terminal.unsubscribe',
              params: unsubscribeParams
            })
          }
        } else if (
          stream?.method === 'session.tabs.subscribe' &&
          stream.params &&
          typeof stream.params === 'object' &&
          typeof (stream.params as { worktree?: unknown }).worktree === 'string'
        ) {
          sendEncrypted({
            id: nextId(),
            deviceToken,
            method: 'session.tabs.unsubscribe',
            params: { worktree: (stream.params as { worktree: string }).worktree }
          })
        }
        removeStreamListener(id)
      }
    },

    updateTerminalSubscriptionViewport(
      terminal: string,
      viewport: { cols: number; rows: number }
    ): void {
      updateCachedTerminalSubscriptionViewport(streamListeners.values(), terminal, viewport)
    },

    getState(): ConnectionState {
      return state
    },

    getReconnectAttempt(): number {
      return reconnectAttempt
    },

    getLastConnectedAt(): number | null {
      return lastConnectedAt
    },

    onStateChange(listener: (state: ConnectionState) => void): () => void {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },

    notifyConnectionMayBeAvailable,

    close() {
      intentionallyClosed = true
      parked = false
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      clearConnectTimer()
      clearStableConnectionTimer()
      if (handshakeTimer) {
        clearTimeout(handshakeTimer)
        handshakeTimer = null
      }
      stopActivityProbe()
      closeSocketBestEffort(ws)
      ws = null
      sharedKey = null
      setState('disconnected')
      rejectAllPending('Client closed')
    }
  }

  function notifyConnectionMayBeAvailable(): void {
    if (intentionallyClosed) {
      return
    }
    if (state === 'connected') {
      // Why: the OS can kill the TCP path while the app is backgrounded
      // without delivering onclose, leaving a half-open socket that
      // blackholes input. Probe now so death is detected in ≤8s instead
      // of waiting out the 20s interval (issue #5049).
      console.log('[net] connection-may-be-available — probing live connection')
      startActivityProbe()
      runActivityProbe()
      return
    }
    if (state === 'reconnecting' || parked) {
      // Why: while backgrounded the retry loop may have parked at the
      // give-up cap or be sitting on a 60s backoff timer. Returning to
      // the foreground is a strong user signal — restart with a fresh
      // attempt budget immediately instead of requiring an app restart.
      console.log('[net] connection-revived', {
        attempt: reconnectAttempt,
        hadTimer: !!reconnectTimer,
        wasParked: parked
      })
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      parked = false
      reconnectAttempt = 0
      candidateIndex = 0
      openConnection()
    }
  }
}
