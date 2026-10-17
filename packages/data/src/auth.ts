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

/** The session supabase-js persisted, read and removed without going through supabase-js. */
export interface StoredSession {
  /** The stored session's user, without validating or refreshing it. */
  readUser(): Promise<AuthUser | null>
  /** Deletes the stored session, signing this device out. */
  clear(): Promise<void>
}

/** The session supabase-js stores under `key` in `storage`. */
export const storedSession = (
  storage: {
    getItem(key: string): Promise<string | null>
    removeItem(key: string): Promise<void>
  },
  key: string,
): StoredSession => ({
  readUser: async () => {
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
  },
  clear: async () => {
    await storage.removeItem(key)
    await storage.removeItem(`${key}-code-verifier`)
  },
})

type Listener = (event: string, session: { user: AuthUser } | null) => void

/**
 * Email one-time-code sign-in through Supabase Auth.
 *
 * Opening the app offline with an expired access token makes supabase-js report "no session"
 * even though it keeps the stored session and refreshes it once back online. Treating that as
 * signed out would lock the owner out of an offline-first app, so a null initial session falls
 * back to the stored user; only an actual sign-out reports null.
 *
 * In the same state supabase-js cannot sign out: it fails refreshing the token first and leaves
 * the session stored. So a failed sign-out deletes the stored session itself.
 */
export const supabaseAuth = (auth: SupabaseClient['auth'], stored: StoredSession): AuthPort => {
  const listeners = new Set<Listener>()
  return {
    watchUser: (onChange) => {
      let active = true
      // Counts auth events, so a stored-session read that finishes after a later event is ignored.
      let events = 0
      // Supabase calls back with INITIAL_SESSION once the stored session has loaded, then on every
      // change. Callbacks must not await supabase-js, so the stored-session fallback runs detached.
      const listener: Listener = (event, session) => {
        const at = ++events
        if (session) onChange(toUser(session.user))
        else if (event === 'INITIAL_SESSION')
          void stored.readUser().then((user) => {
            if (active && at === events) onChange(user)
          })
        else onChange(null)
      }
      listeners.add(listener)
      const { data } = auth.onAuthStateChange(listener)
      return () => {
        active = false
        listeners.delete(listener)
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
      const { error } = await auth.signOut()
      if (!error) return
      await stored.clear()
      for (const listener of [...listeners]) listener('SIGNED_OUT', null)
      throwIfError(error)
    },
  }
}
