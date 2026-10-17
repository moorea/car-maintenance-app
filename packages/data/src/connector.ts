import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadPending, type BackendError, type CrudBackend } from './upload'

interface PostgrestResult {
  error: { code?: string; message: string } | null
  status: number
}
const toError = ({ error, status }: PostgrestResult): BackendError | null =>
  error ? { code: error.code, status, message: error.message } : null

/** Writes local changes through PostgREST, so row-level security applies to every upload. */
export const supabaseBackend = (supabase: SupabaseClient): CrudBackend => ({
  insert: async (table, row) =>
    toError(await supabase.from(table).upsert(row, { ignoreDuplicates: true })),
  upsert: async (table, row) => toError(await supabase.from(table).upsert(row)),
  update: async (table, id, changes) => {
    // RLS filters a refused update down to zero rows without an error, so count them.
    const result = await supabase.from(table).update(changes).eq('id', id).select('id')
    if (result.error || (result.data?.length ?? 0) > 0) return toError(result)
    return { status: 404, message: `No ${table} row ${id} could be updated` }
  },
  remove: async (table, id) => toError(await supabase.from(table).delete().eq('id', id)),
})

/** The slice of the Supabase client the connector uses. */
export type SupabaseAuth = Pick<SupabaseClient['auth'], 'getSession'>

/**
 * Connects PowerSync to Supabase: the signed-in user's Supabase token authenticates the sync
 * stream, and local changes are uploaded as that user.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly auth: SupabaseAuth,
    private readonly backend: CrudBackend,
    private readonly powerSyncUrl: string,
    private readonly onDropped: (message: string) => void = console.warn,
  ) {}

  static forClient(supabase: SupabaseClient, powerSyncUrl: string) {
    return new SupabaseConnector(supabase.auth, supabaseBackend(supabase), powerSyncUrl)
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.auth.getSession()
    if (error) throw error
    const session = data.session
    if (!session) return null
    return {
      endpoint: this.powerSyncUrl,
      token: session.access_token,
      ...(session.expires_at ? { expiresAt: new Date(session.expires_at * 1000) } : {}),
    }
  }

  async uploadData(db: CommonPowerSyncDatabase): Promise<void> {
    // Without a session supabase-js sends the anon key, and every write would be refused by RLS
    // and dropped. Throwing keeps the queue intact until the user is signed in again.
    const { data } = await this.auth.getSession()
    if (!data.session) throw new Error('Not signed in; uploads wait until a session is restored')
    await uploadPending(db, this.backend, (entry, error) =>
      this.onDropped(`Dropped ${entry.op} on ${entry.table} ${entry.id}: ${error.message}`),
    )
  }
}
