import { AuthError } from '@car/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { authErrorKind, supabaseAuth } from './auth'

type Auth = SupabaseClient['auth']

describe('authErrorKind', () => {
  it.each([
    [
      'a dropped connection',
      { name: 'AuthRetryableFetchError', status: 0, message: '' },
      'network',
    ],
    ['rate limiting', { status: 429, message: '' }, 'rate-limited'],
    [
      'too many emails',
      { status: 400, code: 'over_email_send_rate_limit', message: '' },
      'rate-limited',
    ],
    ['an expired code', { status: 403, code: 'otp_expired', message: '' }, 'invalid-code'],
    ['a server error', { status: 502, message: '' }, 'network'],
    ['anything else', { status: 400, code: 'validation_failed', message: '' }, 'unknown'],
  ] as const)('treats %s as %s', (_, error, kind) => {
    expect(authErrorKind(error)).toBe(kind)
  })
})

describe('supabaseAuth', () => {
  it('sends a code that can create the account', async () => {
    const calls: unknown[] = []
    const auth = supabaseAuth({
      signInWithOtp: async (args: unknown) => (calls.push(args), { data: {}, error: null }),
    } as unknown as Auth)
    await auth.sendCode('a@example.com')
    expect(calls).toEqual([{ email: 'a@example.com', options: { shouldCreateUser: true } }])
  })

  it('verifies the emailed code', async () => {
    const calls: unknown[] = []
    const auth = supabaseAuth({
      verifyOtp: async (args: unknown) => (calls.push(args), { data: {}, error: null }),
    } as unknown as Auth)
    await auth.verifyCode('a@example.com', '123456')
    expect(calls).toEqual([{ email: 'a@example.com', token: '123456', type: 'email' }])
  })

  it('throws an AuthError the screen can explain', async () => {
    const auth = supabaseAuth({
      verifyOtp: async () => ({
        data: {},
        error: { status: 403, code: 'otp_expired', message: 'Token has expired' },
      }),
    } as unknown as Auth)
    const error = await auth.verifyCode('a@example.com', '1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AuthError)
    expect(error).toMatchObject({ kind: 'invalid-code' })
  })

  it('reports the session user and stops when unsubscribed', () => {
    let listener: ((event: string, session: unknown) => void) | undefined
    let unsubscribed = false
    const auth = supabaseAuth({
      onAuthStateChange: (cb: typeof listener) => {
        listener = cb
        return { data: { subscription: { unsubscribe: () => (unsubscribed = true) } } }
      },
    } as unknown as Auth)
    const users: unknown[] = []
    const stop = auth.watchUser((u) => users.push(u))
    listener?.('INITIAL_SESSION', null)
    listener?.('SIGNED_IN', { user: { id: 'u1', email: 'a@example.com' } })
    stop()
    expect(users).toEqual([null, { id: 'u1', email: 'a@example.com' }])
    expect(unsubscribed).toBe(true)
  })
})
