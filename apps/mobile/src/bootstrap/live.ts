import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createPowerSyncRepositories,
  createSyncSession,
  powerSyncSessionDatabase,
  schema,
  SupabaseConnector,
} from '@car/data'
import { PowerSyncDatabase } from '@powersync/react-native'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import type { BackendConfig } from './config'

/**
 * The real backend: an on-device SQLite database that PowerSync keeps in sync with Supabase.
 * Reads and writes go to SQLite, so the app works offline; changes upload when signed in.
 */
export const createLiveRepositories = (config: BackendConfig) => {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
  // Supabase only refreshes tokens while the app is in the foreground.
  AppState.addEventListener('change', (state) =>
    state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh(),
  )

  const db = new PowerSyncDatabase({ schema, database: { dbFilename: 'car-maintenance.db' } })
  const connector = SupabaseConnector.forClient(supabase, config.powerSyncUrl)
  const session = createSyncSession(powerSyncSessionDatabase(db, connector))
  supabase.auth.onAuthStateChange((_event, authSession) => {
    void session.setUser(authSession?.user.id ?? null).catch(() => {})
  })

  return createPowerSyncRepositories(db)
}
