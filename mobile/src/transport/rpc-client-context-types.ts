import type { RpcClient } from './rpc-client'
import type { ConnectionState, HostProfile } from './types'

export type StoreEntry = {
  client: RpcClient
  state: ConnectionState
  refCount: number
  unsubState: () => void
}

export type ContextValue = {
  acquire: (hostId: string, host?: HostProfile) => RpcClient | null
  release: (hostId: string) => void
  forceReconnect: (hostId: string) => Promise<void>
  closeHost: (hostId: string) => void
  getState: (hostId: string) => ConnectionState
  getReconnectAttempt: (hostId: string) => number
  // Why: screens use this to escalate prolonged reconnects into a re-pair prompt.
  getLastConnectedAt: (hostId: string) => number | null
  subscribeHostState: (hostId: string, listener: (state: ConnectionState) => void) => () => void
  getAllClients: () => Array<{ hostId: string; client: RpcClient }>
  subscribeAllHosts: (listener: () => void) => () => void
  // Why: priming avoids a second Keychain pass when the home screen already loaded hosts.
  primeHosts: (hosts: HostProfile[]) => void
}
