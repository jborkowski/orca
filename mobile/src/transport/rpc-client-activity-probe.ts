import type { PendingRequest } from './rpc-client-contract'
import { ACTIVITY_PROBE_INTERVAL_MS } from './rpc-client-recovery-policy'
import { closeSocketBestEffort } from './rpc-client-websocket-state'
import type { ConnectionState } from './types'

type RpcClientActivityProbeOptions = {
  getState: () => ConnectionState
  getSocket: () => WebSocket | null
  nextRequestId: () => string
  getInboundSequence: () => number
  pendingRequests: Map<string, PendingRequest>
  sendProbe: (id: string) => boolean
}

export type RpcClientActivityProbe = {
  run: () => void
  start: () => void
  stop: () => void
}

export function createRpcClientActivityProbe(
  options: RpcClientActivityProbeOptions
): RpcClientActivityProbe {
  let timer: ReturnType<typeof setInterval> | null = null

  function run(): void {
    const state = options.getState()
    const probeSocket = options.getSocket()
    if (state !== 'connected' || !probeSocket) {
      return
    }

    const id = options.nextRequestId()
    const probeInboundSequence = options.getInboundSequence()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      options.pendingRequests.delete(id)
      if (options.getInboundSequence() > probeInboundSequence) {
        return
      }
      console.log('[net] activity-probe TIMEOUT — forcing reconnect', {
        state: options.getState()
      })
      // Why: stale probe timers must not close a replacement socket.
      if (probeSocket === options.getSocket() && probeSocket.readyState === WebSocket.OPEN) {
        closeSocketBestEffort(probeSocket)
      }
    }, 8_000)

    options.pendingRequests.set(id, {
      resolve: () => {
        if (!timedOut) {
          clearTimeout(timeout)
        }
      },
      reject: () => {
        if (!timedOut) {
          clearTimeout(timeout)
        }
      }
    })
    if (!options.sendProbe(id)) {
      clearTimeout(timeout)
      options.pendingRequests.delete(id)
    }
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(): void {
    stop()
    timer = setInterval(run, ACTIVITY_PROBE_INTERVAL_MS)
  }

  return { run, start, stop }
}
