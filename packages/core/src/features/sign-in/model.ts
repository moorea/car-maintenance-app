import { createStore, type StoreApi } from 'zustand/vanilla'
import { AuthError } from '../../domain/types'
import type { AuthPort } from '../../ports'
import { codeSchema, emailSchema } from '../../schemas/signIn'

export type SignInStep = 'email' | 'code'

export interface SignInState {
  step: SignInStep
  email: string
  code: string
  /** True while a request is in flight; the form ignores submits meanwhile. */
  busy: boolean
  /** A problem with what was typed, shown under the field. */
  fieldError?: string | undefined
  /** A problem with the request itself, shown above the button. */
  error?: string | undefined
  /** Good news about the request, such as a new code being on its way. */
  notice?: string | undefined
}

export interface SignInActions {
  /** Screen lifecycle; sign-in watches nothing, so these do nothing. */
  start: () => void
  dispose: () => void
  setEmail: (email: string) => void
  /** Signs in by itself once a whole code is typed, pasted or filled in from the email. */
  setCode: (code: string) => void
  /** Sends a code to the email. Resolves true once it is sent and the code step shows. */
  submitEmail: () => Promise<boolean>
  /** Signs in with the code. Resolves true on success; the session model takes it from there. */
  submitCode: () => Promise<boolean>
  /** Sends a fresh code to the same email. */
  resend: () => Promise<boolean>
  /** Goes back to the email step, e.g. to fix a typo. */
  changeEmail: () => void
}

export type SignInModel = StoreApi<SignInState & SignInActions>

const MESSAGES: Record<AuthError['kind'], string> = {
  'invalid-email': 'That email address was not accepted. Check it and try again.',
  'invalid-code': 'That code is wrong or has expired. Check the email or send a new one.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong. Try again.',
}
const messageFor = (e: unknown) => MESSAGES[e instanceof AuthError ? e.kind : 'unknown']

/** The length of the codes the server sends (supabase/config.toml `otp_length`). */
export const SIGN_IN_CODE_LENGTH = 6

/** Screen model for passwordless sign-in: email, then the emailed one-time code. */
export const createSignInModel = (deps: { auth: AuthPort; codeLength?: number }): SignInModel =>
  createStore<SignInState & SignInActions>()((set, get) => {
    const codeLength = deps.codeLength ?? SIGN_IN_CODE_LENGTH
    /** Runs one request with busy/error handling; returns whether it succeeded. */
    const run = async (request: () => Promise<void>, onSuccess: Partial<SignInState> = {}) => {
      set({ busy: true, error: undefined, notice: undefined })
      try {
        await request()
        set({ busy: false, ...onSuccess })
        return true
      } catch (e) {
        set({ busy: false, error: messageFor(e) })
        return false
      }
    }

    const send = async (onSuccess: Partial<SignInState>) => {
      const parsed = emailSchema.safeParse(get().email)
      if (!parsed.success) {
        set({ fieldError: parsed.error.issues[0]?.message })
        return false
      }
      const email = parsed.data
      return run(() => deps.auth.sendCode(email), { email, ...onSuccess })
    }

    return {
      step: 'email',
      email: '',
      code: '',
      busy: false,

      start: () => {},
      dispose: () => {},

      setEmail: (email) => set({ email, fieldError: undefined, error: undefined }),
      setCode: (code) => {
        const was = get().code.replace(/\s/g, '')
        set({ code, fieldError: undefined, error: undefined, notice: undefined })
        const digits = code.replace(/\s/g, '')
        if (digits !== was && digits.length === codeLength && /^\d+$/.test(digits))
          void get().submitCode()
      },

      submitEmail: async () => {
        if (get().busy) return false
        return send({ step: 'code', code: '' })
      },

      resend: async () => {
        if (get().busy) return false
        const sent = await send({ code: '' })
        if (sent) set({ notice: `We sent a new code to ${get().email}.` })
        return sent
      },

      submitCode: async () => {
        if (get().busy) return false
        const parsed = codeSchema.safeParse(get().code)
        if (!parsed.success) {
          set({ fieldError: parsed.error.issues[0]?.message })
          return false
        }
        const code = parsed.data
        return run(() => deps.auth.verifyCode(get().email, code))
      },

      changeEmail: () =>
        set({
          step: 'email',
          code: '',
          fieldError: undefined,
          error: undefined,
          notice: undefined,
        }),
    }
  })
