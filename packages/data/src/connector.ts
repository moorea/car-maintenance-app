import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseStorage, type StorageOptions } from './storage'
import { uploadPending, type BackendError, type CrudBackend } from './upload'

interface PostgrestResult {
  error: { code?: string; message: string } | null
  status: number
}
const toError = ({ error, status }: PostgrestResult): BackendError | null =>
  error ? { code: error.code, status, message: error.message } : null

/**
 * Writes local changes through PostgREST, and attachment files to Storage, as the user who owns
 * `accessToken`, so row-level security applies to every upload. The token is fixed for the whole
 * upload: if the user signs out or switches account midway, supabase-js would otherwise send the
 * rest as someone else.
 */
export const supabaseBackend = (
  supabase: SupabaseClient,
  storage: StorageOptions,
  accessToken: string,
): CrudBackend => {
  const from = (table: string) => supabase.from(table)
  const auth = `Bearer ${accessToken}`
  const files = supabaseStorage(storage, accessToken)
  return {
    putFile: (path, bytes, contentType) => files.put(path, bytes, contentType),
    removeFile: (path) => files.remove(path),
    insert: async (table, row) =>
      toError(
        await from(table).upsert(row, { ignoreDuplicates: true }).setHeader('Authorization', auth),
      ),
    upsert: async (table, row) =>
      toError(await from(table).upsert(row).setHeader('Authorization', auth)),
    update: async (table, id, changes) => {
      // RLS filters a refused update down to zero rows without an error, so count them.
      const result = await from(table)
        .update(changes)
        .eq('id', id)
        .select('id')
        .setHeader('Authorization', auth)
      if (result.error || (result.data?.length ?? 0) > 0) return toError(result)
      return { status: 404, message: `No ${table} row ${id} could be updated` }
    },
    remove: async (table, id) =>
      toError(await from(table).delete().eq('id', id).setHeader('Authorization', auth)),
  }
}

/** The slice of the Supabase client the connector uses. */
export type SupabaseAuth = Pick<SupabaseClient['auth'], 'getSession'>

export interface SupabaseConnectorOptions {
  auth: SupabaseAuth
  /** The backend that uploads as the owner of an access token. */
  backendFor: (accessToken: string) => CrudBackend
  powerSyncUrl: string
  /** The bytes of an attachment's file on this phone, or undefined if there is none. */
  readFile: (attachmentId: string) => Promise<Uint8Array | undefined>
  onDropped?: (message: string) => void
}

export interface SupabaseClientConnectorOptions {
  powerSyncUrl: string
  /** The project URL and anon key the client was created with, for Storage uploads. */
  storage: StorageOptions
  readFile: (attachmentId: string) => Promise<Uint8Array | undefined>
  onDropped?: (message: string) => void
}

/**
 * Connects PowerSync to Supabase: the signed-in user's Supabase token authenticates the sync
 * stream, and local changes are uploaded as that user.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  private readonly onDropped: (message: string) => void

  constructor(private readonly options: SupabaseConnectorOptions) {
    this.onDropped = options.onDropped ?? console.warn
  }

  static forClient(supabase: SupabaseClient, options: SupabaseClientConnectorOptions) {
    return new SupabaseConnector({
      auth: supabase.auth,
      backendFor: (token) => supabaseBackend(supabase, options.storage, token),
      powerSyncUrl: options.powerSyncUrl,
      readFile: options.readFile,
      ...(options.onDropped ? { onDropped: options.onDropped } : {}),
    })
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.options.auth.getSession()
    if (error) throw error
    const session = data.session
    if (!session) return null
    return {
      endpoint: this.options.powerSyncUrl,
      token: session.access_token,
      ...(session.expires_at ? { expiresAt: new Date(session.expires_at * 1000) } : {}),
    }
  }

  async uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    // Without a session every write would be refused by RLS and dropped. Throwing keeps the queue
    // intact until the user is signed in again. An expired token midway gets a 401, which retries.
    const { data } = await this.options.auth.getSession()
    if (!data.session) throw new Error('Not signed in; uploads wait until a session is restored')
    const backend = this.options.backendFor(data.session.access_token)
    await uploadPending(
      db,
      backend,
      (entry, error) =>
        this.onDropped(`Dropped ${entry.op} on ${entry.table} ${entry.id}: ${error.message}`),
      { userId: data.session.user.id, readFile: this.options.readFile },
    )
  }
}
