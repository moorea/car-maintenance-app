/** Backend settings, inlined by Expo from EXPO_PUBLIC_* variables (see apps/mobile/.env.example). */
export interface BackendConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  powerSyncUrl: string
}

/** The backend to use, or undefined to run on in-memory demo data. */
export const backendConfig = (): BackendConfig | undefined => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  const powerSyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL
  if (!supabaseUrl || !supabaseAnonKey || !powerSyncUrl) return undefined
  return { supabaseUrl, supabaseAnonKey, powerSyncUrl }
}
