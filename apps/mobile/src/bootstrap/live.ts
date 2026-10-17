import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createPowerSyncRepositories,
  createSyncSession,
  powerSyncSessionDatabase,
  schema,
  storedSession,
  supabaseAuth,
  SupabaseConnector,
  remoteAssistant,
} from '@car/data'
import { PowerSyncDatabase } from '@powersync/react-native'
import { createClient } from '@supabase/supabase-js'
import { fetch as streamingFetch } from 'expo/fetch'
import { AppState } from 'react-native'
import type { BackendConfig } from './config'

/**
 * The real backend: an on-device SQLite database that PowerSync keeps in sync with Supabase.
 * Reads and writes go to SQLite, so the app works offline; changes upload when signed in.
 */
// Fixed so the app can read the stored session when offline (see supabaseAuth).
const AUTH_STORAGE_KEY = 'car-maintenance-auth'

export const createLiveRepositories = (config: BackendConfig) => {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      storageKey: AUTH_STORAGE_KEY,
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
  const auth = supabaseAuth(supabase.auth, storedSession(AsyncStorage, AUTH_STORAGE_KEY))
  // Sync follows the same view of who is signed in as the screens, so the two never disagree.
  auth.watchUser((user) => void session.setUser(user?.id ?? null).catch(() => {}))

  // Ask runs on the server, which holds the model's key (ADR 0009). Expo's fetch streams the
  // answer as it arrives; React Native's built-in one waits for the whole response.
  const assistant = remoteAssistant({
    url: `${config.supabaseUrl}/functions/v1/assistant`,
    accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
    fetch: streamingFetch as unknown as typeof fetch,
  })

  return { auth, assistant, ...createPowerSyncRepositories(db) }
}
