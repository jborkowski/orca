import { getNextHostName, saveHost } from './host-store'
import type { PairingOffer } from './types'

export async function savePairedHost(
  offer: PairingOffer,
  authenticatedEndpoint: string
): Promise<string> {
  const hostId = `host-${Date.now()}`
  const hostName = await getNextHostName()
  await saveHost({
    id: hostId,
    name: hostName,
    endpoint: authenticatedEndpoint,
    endpoints: Array.from(
      new Set([authenticatedEndpoint, ...(offer.endpoints ?? [offer.endpoint])])
    ),
    deviceToken: offer.deviceToken,
    publicKeyB64: offer.publicKeyB64,
    lastConnected: Date.now()
  })
  return hostId
}
