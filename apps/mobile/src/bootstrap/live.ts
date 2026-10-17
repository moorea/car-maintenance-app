import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  attachmentDownloadUrl,
  createAttachmentRepo,
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
import { appFiles } from './files'

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
  const files = appFiles()
  // Expo's fetch sends the file's bytes as the upload body on every platform.
  const storage = {
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    fetch: streamingFetch as unknown as typeof fetch,
  }
  const accessToken = async () => (await supabase.auth.getSession()).data.session?.access_token
  // An attachment's file uploads with its row, so the row never reaches the server without it.
  const connector = SupabaseConnector.forClient(supabase, {
    powerSyncUrl: config.powerSyncUrl,
    storage,
    readFile: (id) => files.read(id),
  })
  const session = createSyncSession(powerSyncSessionDatabase(db, connector))
  const auth = supabaseAuth(supabase.auth, storedSession(AsyncStorage, AUTH_STORAGE_KEY))
  // Sync follows the same view of who is signed in as the screens, so the two never disagree.
  auth.watchUser((user) => void session.setUser(user?.id ?? null).catch(() => {}))

  // Ask runs on the server, which holds the model's key (ADR 0009). Expo's fetch streams the
  // answer as it arrives; React Native's built-in one waits for the whole response.
  const assistant = remoteAssistant({
    url: `${config.supabaseUrl}/functions/v1/assistant`,
    accessToken,
    fetch: streamingFetch as unknown as typeof fetch,
  })

  const attachments = createAttachmentRepo({
    db,
    files,
    downloadUrl: attachmentDownloadUrl({ ...storage, accessToken }),
  })

  return { auth, assistant, attachments, ...createPowerSyncRepositories(db) }
}
