import { createStore, type StoreApi } from 'zustand/vanilla'
import { AssistantError } from '../../domain/types'
import type {
  Assistant,
  AuthPort,
  DevicePreferencesRepo,
  OdometerReader,
  PriceEstimator,
  QuoteReader,
  Unsubscribe,
} from '../../ports'

export interface AiSharingDeps {
  preferences: DevicePreferencesRepo
  auth: Pick<AuthPort, 'watchUser'>
}

/**
 * Calls `onChange` with whether the signed-in owner allowed sharing with Anthropic, once both
 * are known and after either changes. Nobody signed in, or someone else having allowed it,
 * counts as not allowed.
 */
export const watchAiSharing = (
  deps: AiSharingDeps,
  onChange: (allowed: boolean, userId: string | null) => void,
): Unsubscribe => {
  let owner: string | null | undefined
  let userId: string | null | undefined
  const tell = () => {
    if (owner === undefined || userId === undefined) return
    onChange(userId !== null && owner === userId, userId)
  }
  const stops = [
    deps.preferences.watch((p) => {
      owner = p.aiSharingOwner
      tell()
    }),
    deps.auth.watchUser((user) => {
      userId = user?.id ?? null
      tell()
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

export interface AiSharingState {
  /** `saving` while a change is being written; the switch ignores taps meanwhile. */
  status: 'loading' | 'ready' | 'saving'
  /** Whether Ask and the photo readers may send the signed-in owner's data to Anthropic. */
  on: boolean
  /** Why the last change did not save. Cleared by the next change. */
  error?: string | undefined
}

export interface AiSharingActions {
  start: () => void
  /** Resolves true once the change is saved. */
  setOn: (on: boolean) => Promise<boolean>
  dispose: () => void
}

export type AiSharingModel = StoreApi<AiSharingState & AiSharingActions>

/**
 * The signed-in owner's permission for Ask and the photo readers (quotes, odometer) to share data
 * with Anthropic. Asked for the first time any is used, and changeable in Account (App Store guideline
 * 5.1.2(i)).
 */
export const createAiSharingModel = (deps: AiSharingDeps): AiSharingModel => {
  let stop: Unsubscribe | undefined
  let userId: string | null = null

  return createStore<AiSharingState & AiSharingActions>()((set, get) => ({
    status: 'loading',
    on: false,

    start: () => {
      stop ??= watchAiSharing(deps, (allowed, user) => {
        userId = user
        set((s) => ({ on: allowed, status: s.status === 'loading' ? 'ready' : s.status }))
      })
    },

    setOn: async (on) => {
      if (get().status !== 'ready' || userId === null) return false
      set({ status: 'saving', error: undefined })
      try {
        await deps.preferences.update({ aiSharingOwner: on ? userId : null })
        set({ status: 'ready' })
        return true
      } catch {
        set({ status: 'ready', error: "Couldn't save that choice. Try again." })
        return false
      }
    },

    dispose: () => {
      stop?.()
      stop = undefined
    },
  }))
}

interface AiServices {
  assistant: Assistant
  quoteReader: QuoteReader
  odometerReader: OdometerReader
  priceEstimator: PriceEstimator
}

/**
 * Wraps the assistant, the photo readers and the price estimator so nothing reaches Anthropic
 * unless the signed-in owner allowed it, whichever screen asks. Refuses with AssistantError
 * `not-allowed` otherwise, and says whether it is allowed now, so a screen can hold a question
 * back rather than fail. Lives for as long as the app runs.
 */
export const guardAiSharing = (
  deps: AiSharingDeps,
  services: AiServices,
): AiServices & {
  /** Whether the signed-in owner allows sharing right now. */
  aiSharingAllowed: () => boolean
} => {
  let allowed = false
  watchAiSharing(deps, (now) => {
    allowed = now
  })
  const check = () => {
    if (!allowed) throw new AssistantError('not-allowed')
  }
  return {
    aiSharingAllowed: () => allowed,
    assistant: {
      ask: async (request, onEvent, signal) => {
        check()
        return services.assistant.ask(request, onEvent, signal)
      },
    },
    quoteReader: {
      read: async (photo, signal) => {
        check()
        return services.quoteReader.read(photo, signal)
      },
    },
    odometerReader: {
      read: async (photo, signal) => {
        check()
        return services.odometerReader.read(photo, signal)
      },
    },
    priceEstimator: {
      estimate: async (request, signal) => {
        check()
        return services.priceEstimator.estimate(request, signal)
      },
    },
  }
}
