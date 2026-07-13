import { beforeEach, describe, expect, it, vi } from 'vitest'

const { asyncValues, secureValues } = vi.hoisted(() => ({
  asyncValues: new Map<string, string>(),
  secureValues: new Map<string, string>()
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(asyncValues.get(key) ?? null),
    setItem: (key: string, value: string) => {
      asyncValues.set(key, value)
      return Promise.resolve()
    },
    removeItem: (key: string) => {
      asyncValues.delete(key)
      return Promise.resolve()
    }
  }
}))

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: (key: string) => Promise.resolve(secureValues.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    secureValues.set(key, value)
    return Promise.resolve()
  },
  deleteItemAsync: (key: string) => {
    secureValues.delete(key)
    return Promise.resolve()
  }
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

import { loadHosts, promoteHostEndpoint, saveHost } from './host-store'

const STORAGE_KEY = 'orca:hosts'

describe('host endpoint candidates', () => {
  beforeEach(() => {
    asyncValues.clear()
    secureValues.clear()
  })

  it('normalizes a legacy single-endpoint host to one candidate', async () => {
    asyncValues.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy-host',
          name: 'Desktop',
          endpoint: 'ws://192.168.1.24:6768',
          publicKeyB64: 'public-key',
          lastConnected: 1
        }
      ])
    )
    secureValues.set('orca.host-token.legacy-host', 'token')

    await expect(loadHosts()).resolves.toMatchObject([
      {
        endpoint: 'ws://192.168.1.24:6768',
        endpoints: ['ws://192.168.1.24:6768']
      }
    ])
  })

  it('persists candidates and promotes the authenticated endpoint', async () => {
    await saveHost({
      id: 'candidate-host',
      name: 'Desktop',
      endpoint: 'ws://192.168.1.24:6768',
      endpoints: ['ws://192.168.1.24:6768', 'ws://100.64.1.20:6768'],
      deviceToken: 'token',
      publicKeyB64: 'public-key',
      lastConnected: 1
    })

    await promoteHostEndpoint('candidate-host', 'ws://100.64.1.20:6768')

    const stored = JSON.parse(asyncValues.get(STORAGE_KEY)!) as Array<{
      endpoint: string
      endpoints: string[]
    }>
    expect(stored[0]).toMatchObject({
      endpoint: 'ws://100.64.1.20:6768',
      endpoints: ['ws://100.64.1.20:6768', 'ws://192.168.1.24:6768']
    })
  })
})
