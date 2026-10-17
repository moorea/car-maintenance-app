import { AuthError, type AuthErrorKind, type AuthPort } from '@car/core'
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
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return 'rate-limited'
  if (error.code === 'otp_expired' || error.code === 'invalid_credentials') return 'invalid-code'
  if (error.status === 403 || error.status === 401) return 'invalid-code'
  if (error.status !== undefined && error.status >= 500) return 'network'
  return 'unknown'
}

const throwIfError = (error: SupabaseAuthError | null) => {
  if (error) throw new AuthError(authErrorKind(error), error.message)
}

/** Email one-time-code sign-in through Supabase Auth. */
export const supabaseAuth = (auth: SupabaseClient['auth']): AuthPort => ({
  watchUser: (onChange) => {
    // Supabase calls back with INITIAL_SESSION straight away, then on every change.
    const { data } = auth.onAuthStateChange((_event, session) =>
      onChange(
        session
          ? { id: session.user.id, ...(session.user.email && { email: session.user.email }) }
          : null,
      ),
    )
    return () => data.subscription.unsubscribe()
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
    throwIfError(error)
  },
})
