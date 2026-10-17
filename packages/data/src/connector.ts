import type {
  CommonPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/common'
import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadPending, type CrudBackend } from './upload'

/** Writes local changes through PostgREST, so row-level security applies to every upload. */
export const supabaseBackend = (supabase: SupabaseClient): CrudBackend => ({
  upsert: async (table, row) => (await supabase.from(table).upsert(row)).error,
  update: async (table, id, changes) =>
    (await supabase.from(table).update(changes).eq('id', id)).error,
  remove: async (table, id) => (await supabase.from(table).delete().eq('id', id)).error,
})

/**
 * Connects PowerSync to Supabase: the signed-in user's Supabase token authenticates the sync
 * stream, and local changes are uploaded as that user.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly powerSyncUrl: string,
  ) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.supabase.auth.getSession()
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
    await uploadPending(db, supabaseBackend(this.supabase), (entry, error) =>
      console.warn(`Dropped ${entry.op} on ${entry.table} ${entry.id}: ${error.message}`),
    )
  }
}
