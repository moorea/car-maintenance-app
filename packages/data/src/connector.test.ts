import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry } from '@powersync/common'
import { describe, expect, it } from 'vitest'
import { SupabaseConnector, type SupabaseAuth } from './connector'
import type { CrudBackend } from './upload'

const signedIn = { access_token: 'jwt', expires_at: 1_800_000_000, user: { id: 'user-a' } }

const auth = (session: object | null, error: Error | null = null) =>
  ({ getSession: async () => ({ data: { session }, error }) }) as unknown as SupabaseAuth

const unusedBackend = () => ({}) as CrudBackend
const noFiles = async () => undefined

const connector = (
  authenticator: SupabaseAuth,
  backendFor: (token: string) => CrudBackend = unusedBackend,
  readFile: (id: string) => Promise<Uint8Array | undefined> = noFiles,
) =>
  new SupabaseConnector({
    auth: authenticator,
    backendFor,
    powerSyncUrl: 'https://ps.example',
    readFile,
  })

describe('SupabaseConnector', () => {
  it('authenticates sync with the signed-in user’s token', async () => {
    expect(await connector(auth(signedIn)).fetchCredentials()).toEqual({
      endpoint: 'https://ps.example',
      token: 'jwt',
      expiresAt: new Date(1_800_000_000_000),
    })
  })

  it('has no credentials when signed out', async () => {
    expect(await connector(auth(null)).fetchCredentials()).toBeNull()
  })

  it('throws when the session cannot be read, so PowerSync retries', async () => {
    await expect(connector(auth(null, new Error('network'))).fetchCredentials()).rejects.toThrow(
      'network',
    )
  })

  it('holds uploads while signed out instead of sending them without a token', async () => {
    let read = false
    const db = {
      getCrudBatch: async () => {
        read = true
        return null
      },
    } as unknown as CommonPowerSyncDatabase
    await expect(connector(auth(null)).uploadData(db)).rejects.toThrow(/Not signed in/)
    expect(read).toBe(false)
  })

  it('uploads with the token it started with, even if the session changes midway', async () => {
    let session: object | null = signedIn
    const tokens: string[] = []
    const db = {
      getCrudBatch: async () => {
        session = null // signed out while the upload runs
        return null
      },
    } as unknown as CommonPowerSyncDatabase
    await connector(
      { getSession: async () => ({ data: { session }, error: null }) } as unknown as SupabaseAuth,
      (token) => {
        tokens.push(token)
        return {} as CrudBackend
      },
    ).uploadData(db)
    expect(tokens).toEqual(['jwt'])
  })

  it('uploads an attachment with its file from this phone, into the signed-in user’s folder', async () => {
    const pending = [
      {
        crud: [
          {
            op: UpdateType.PUT,
            table: 'attachments',
            id: 'att1',
            opData: { content_type: 'image/jpeg' },
          } as unknown as CrudEntry,
        ],
        complete: async () => {},
      },
    ]
    const db = {
      getCrudBatch: async () => pending.shift() ?? null,
    } as unknown as CommonPowerSyncDatabase
    const stored: unknown[] = []
    const backend = {
      putFile: async (path: string, bytes: Uint8Array) => (stored.push([path, [...bytes]]), null),
      insert: async () => null,
    } as unknown as CrudBackend
    await connector(
      auth(signedIn),
      () => backend,
      async (id) => (id === 'att1' ? new Uint8Array([1, 2]) : undefined),
    ).uploadData(db)
    expect(stored).toEqual([['user-a/att1', [1, 2]]])
  })
})
