import { scheduleSharedControlReconnect } from './remote-runtime-shared-control-state'
import { finishSharedControlSubscription } from './remote-runtime-shared-control-state'
import type { RemoteRuntimeClientError } from './remote-runtime-client-error'
import type { SharedControlLogicalSubscription } from './remote-runtime-shared-control-types'

export function scheduleSharedControlReconnectOrFinish(args: {
  current: ReturnType<typeof setTimeout> | null
  intentionallyClosed: boolean
  reconnectAttempt: number
  delaysMs: readonly number[]
  open: () => void
}): { timer: ReturnType<typeof setTimeout> | null; reconnectAttempt: number; parked: boolean } {
  if (args.reconnectAttempt >= args.delaysMs.length) {
    // Why: logical subscriptions outlive the fast retry budget and are replayed
    // when focus, wake, or later request traffic revives this connection.
    return { timer: null, reconnectAttempt: args.reconnectAttempt, parked: true }
  }
  return { ...scheduleSharedControlReconnect(args), parked: false }
}

export function finishTerminalSharedControlSubscriptions(
  error: RemoteRuntimeClientError,
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
): boolean {
  // Why: invalid auth material and incompatible protocol frames cannot heal
  // through network revival; only transport availability failures are parked.
  if (
    error.code !== 'unauthorized' &&
    error.code !== 'invalid_argument' &&
    error.code !== 'invalid_runtime_response'
  ) {
    return false
  }
  for (const subscription of Array.from(subscriptions.values())) {
    finishSharedControlSubscription(subscriptions, subscription, true, error)
  }
  return true
}

export function logSharedControlParked(args: {
  environmentId?: string
  reconnectAttempt: number
  subscriptionCount: number
}): void {
  console.info('[remote-runtime.shared-control] connection parked', {
    environmentId: args.environmentId ?? 'unknown',
    reconnectAttempt: args.reconnectAttempt,
    subscriptionCount: args.subscriptionCount
  })
}

export function logSharedControlRevived(
  environmentId: string | undefined,
  wasParked: boolean
): void {
  console.info('[remote-runtime.shared-control] connection revived', {
    environmentId: environmentId ?? 'unknown',
    wasParked
  })
}
