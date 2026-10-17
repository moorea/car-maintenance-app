import type { CommonPowerSyncDatabase } from '@powersync/common'
import { describe, expect, it } from 'vitest'
import { SupabaseConnector, type SupabaseAuth } from './connector'
import type { CrudBackend } from './upload'

const signedIn = { access_token: 'jwt', expires_at: 1_800_000_000 }

const auth = (session: object | null, error: Error | null = null) =>
  ({ getSession: async () => ({ data: { session }, error }) }) as unknown as SupabaseAuth

const unusedBackend = {} as CrudBackend

describe('SupabaseConnector', () => {
  it('authenticates sync with the signed-in user’s token', async () => {
    const connector = new SupabaseConnector(auth(signedIn), unusedBackend, 'https://ps.example')
    expect(await connector.fetchCredentials()).toEqual({
      endpoint: 'https://ps.example',
      token: 'jwt',
      expiresAt: new Date(1_800_000_000_000),
    })
  })

  it('has no credentials when signed out', async () => {
    const connector = new SupabaseConnector(auth(null), unusedBackend, 'https://ps.example')
    expect(await connector.fetchCredentials()).toBeNull()
  })

  it('throws when the session cannot be read, so PowerSync retries', async () => {
    const connector = new SupabaseConnector(
      auth(null, new Error('network')),
      unusedBackend,
      'https://ps.example',
    )
    await expect(connector.fetchCredentials()).rejects.toThrow('network')
  })

  it('holds uploads while signed out instead of sending them without a token', async () => {
    let read = false
    const db = {
      getNextCrudTransaction: async () => {
        read = true
        return null
      },
    } as unknown as CommonPowerSyncDatabase
    const connector = new SupabaseConnector(auth(null), unusedBackend, 'https://ps.example')
    await expect(connector.uploadData(db)).rejects.toThrow(/Not signed in/)
    expect(read).toBe(false)
  })
})
