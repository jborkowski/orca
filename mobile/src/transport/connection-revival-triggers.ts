import { AppState } from 'react-native'
import {
  addNetworkStateListener,
  getIpAddressAsync,
  getNetworkStateAsync,
  type NetworkState
} from 'expo-network'

type NetworkSnapshot = Pick<NetworkState, 'isConnected' | 'type'> & { ipAddress: string | null }

async function snapshotNetwork(state: NetworkState): Promise<NetworkSnapshot> {
  let ipAddress: string | null = null
  try {
    ipAddress = state.isConnected === true ? await getIpAddressAsync() : null
  } catch {
    // Why: revival still works from connectivity/type signals when the OS
    // temporarily refuses to expose its current address.
  }
  return { isConnected: state.isConnected, type: state.type, ipAddress }
}

// Why: Android/iOS suspend JS timers and silently kill sockets while the app
// is backgrounded, and network handoffs (Wi-Fi → cellular) kill the TCP path
// without an onclose. Both leave clients waiting out long backoff timers or
// parked at the reconnect give-up cap (issue #5049). Surface every "the link
// probably just came back" OS signal as a single nudge callback.
export function subscribeConnectionRevivalTriggers(nudge: () => void): () => void {
  const appStateSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      nudge()
    }
  })
  let lastNetwork: NetworkSnapshot | null = null
  let disposed = false
  // Why: the listener only fires on *changes*; without a seeded baseline the
  // first change after subscribing (app launched offline, network returns)
  // would be swallowed by the previous == null guard below.
  void getNetworkStateAsync()
    .then(snapshotNetwork)
    .then((state) => {
      if (!disposed && lastNetwork == null) {
        lastNetwork = state
      }
    })
    .catch(() => {})
  const networkSub = addNetworkStateListener((state) => {
    void snapshotNetwork(state).then((current) => {
      if (disposed) {
        return
      }
      const previous = lastNetwork
      lastNetwork = current
      if (current.isConnected !== true) {
        return
      }
      const cameOnline = previous != null && previous.isConnected !== true
      const switchedNetworks = previous?.type != null && current.type !== previous.type
      const changedAddress =
        previous?.ipAddress != null &&
        current.ipAddress != null &&
        current.ipAddress !== previous.ipAddress
      if (cameOnline || switchedNetworks || changedAddress) {
        console.log('[net] network changed — nudging clients', {
          type: current.type,
          cameOnline,
          changedAddress
        })
        nudge()
      }
    })
  })
  return () => {
    disposed = true
    appStateSub.remove()
    networkSub.remove()
  }
}
