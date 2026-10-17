import { AuthError, type AuthErrorKind, type AuthPort, type AuthUser } from '@car/core'
import type { SupabaseClient } from '@supabase/supabase-js'

/** The slice of a Supabase error the adapter reads. */
interface SupabaseAuthError {
  name?: string
  status?: number | undefined
  code?: string | undefined
  message: string
}

/** Translates Supabase Auth errors into the kinds the sign-in screen explains. */
export const authErrorKind = (error: SupabaseAuthError): AuthErrorKind => {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network'
  if (
    error.status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit'
  )
    return 'rate-limited'
  if (error.code === 'email_address_invalid') return 'invalid-email'
  if (error.code === 'otp_expired' || error.code === 'invalid_credentials') return 'invalid-code'
  if (error.status === 403 || error.status === 401) return 'invalid-code'
  if (error.status !== undefined && error.status >= 500) return 'network'
  return 'unknown'
}

const throwIfError = (error: SupabaseAuthError | null) => {
  if (error) throw new AuthError(authErrorKind(error), error.message)
}

const toUser = (user: { id: string; email?: string | undefined }): AuthUser => ({
  id: user.id,
  ...(user.email && { email: user.email }),
})

/** Reads the session supabase-js persisted, without validating or refreshing it. */
export type StoredUserReader = () => Promise<AuthUser | null>

/** Reads the user from a session supabase-js stored under `key` in `storage`. */
export const storedUserReader =
  (storage: { getItem(key: string): Promise<string | null> }, key: string): StoredUserReader =>
  async () => {
    try {
      const raw = await storage.getItem(key)
      const user = raw
        ? (JSON.parse(raw) as { user?: { id?: unknown; email?: unknown } }).user
        : undefined
      if (typeof user?.id !== 'string') return null
      return toUser({ id: user.id, ...(typeof user.email === 'string' && { email: user.email }) })
    } catch {
      return null
    }
  }

/**
 * Email one-time-code sign-in through Supabase Auth.
 *
 * Opening the app offline with an expired access token makes supabase-js report "no session"
 * even though it keeps the stored session and refreshes it once back online. Treating that as
 * signed out would lock the owner out of an offline-first app, so a null initial session falls
 * back to the stored user; only an actual sign-out reports null.
 */
export const supabaseAuth = (
  auth: SupabaseClient['auth'],
  readStoredUser: StoredUserReader,
): AuthPort => ({
  watchUser: (onChange) => {
    let active = true
    // Supabase calls back with INITIAL_SESSION once the stored session has loaded, then on every
    // change. Callbacks must not await supabase-js, so the stored-session fallback runs detached.
    const { data } = auth.onAuthStateChange((event, session) => {
      if (session) onChange(toUser(session.user))
      else if (event === 'INITIAL_SESSION')
        void readStoredUser().then((user) => {
          if (active) onChange(user)
        })
      else onChange(null)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  },
  sendCode: async (email) => {
    const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    throwIfError(error)
  },
  verifyCode: async (email, code) => {
    const { error } = await auth.verifyOtp({ email, token: code, type: 'email' })
    throwIfError(error)
  },
  signOut: async () => {
    // supabase-js clears the local session even when revoking it on the server fails.
    const { error } = await auth.signOut()
    throwIfError(error)
  },
})
