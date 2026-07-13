import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PairingOffer } from '../../shared/pairing'

const { sharedConnections, MockSharedConnection } = vi.hoisted(() => {
  const connections: {
    close: ReturnType<typeof vi.fn>
    notifyConnectionMayBeAvailable: ReturnType<typeof vi.fn>
  }[] = []
  class Connection {
    readonly request = vi.fn().mockResolvedValue({ id: 'request', ok: true, result: null })
    readonly subscribe = vi.fn()
    readonly close = vi.fn()
    readonly notifyConnectionMayBeAvailable = vi.fn()
    readonly getDiagnostics = vi.fn().mockReturnValue(null)

    constructor() {
      connections.push(this)
    }
  }
  return { sharedConnections: connections, MockSharedConnection: Connection }
})

vi.mock('../../shared/remote-runtime-request-connection', () => ({
  RemoteRuntimeRequestConnection: class {
    request = vi.fn()
    close = vi.fn()
  }
}))

vi.mock('../../shared/remote-runtime-shared-control-connection', () => ({
  RemoteRuntimeSharedControlConnection: MockSharedConnection
}))

import {
  closeAllRemoteRuntimeRequestConnections,
  notifyAllRemoteRuntimeConnectionsMayBeAvailable,
  sendRemoteRuntimeSharedControlRequest
} from './runtime-environment-request-connections'

const pairing: PairingOffer = {
  v: 2,
  endpoint: 'ws://192.168.1.24:6768',
  endpoints: ['ws://192.168.1.24:6768', 'ws://100.64.1.20:6768'],
  deviceToken: 'token',
  publicKeyB64: 'public-key'
}

describe('remote runtime connection revival fan-out', () => {
  beforeEach(() => {
    closeAllRemoteRuntimeRequestConnections()
    sharedConnections.length = 0
  })

  it('nudges every cached shared-control connection once', async () => {
    await sendRemoteRuntimeSharedControlRequest('env-1', pairing, 'status.get', null, 1000)
    await sendRemoteRuntimeSharedControlRequest('env-2', pairing, 'status.get', null, 1000)

    notifyAllRemoteRuntimeConnectionsMayBeAvailable()

    expect(sharedConnections).toHaveLength(2)
    expect(sharedConnections[0]!.notifyConnectionMayBeAvailable).toHaveBeenCalledTimes(1)
    expect(sharedConnections[1]!.notifyConnectionMayBeAvailable).toHaveBeenCalledTimes(1)
  })

  it('replaces a cached connection when its candidate set changes', async () => {
    await sendRemoteRuntimeSharedControlRequest('env-1', pairing, 'status.get', null, 1000)
    await sendRemoteRuntimeSharedControlRequest(
      'env-1',
      { ...pairing, endpoints: [...pairing.endpoints!, 'ws://10.0.0.4:6768'] },
      'status.get',
      null,
      1000
    )

    expect(sharedConnections).toHaveLength(2)
    expect(sharedConnections[0]!.close).toHaveBeenCalledTimes(1)
  })
})
