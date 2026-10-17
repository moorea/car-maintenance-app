import { createStore, type StoreApi } from 'zustand/vanilla'
import type { DevicePreferencesRepo, Unsubscribe } from '../../ports'

export interface AiSharingState {
  /** `saving` while a change is being written; the switch ignores taps meanwhile. */
  status: 'loading' | 'ready' | 'saving'
  /** Whether Ask and the quote checker may send data to Anthropic. */
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
 * The owner's permission for Ask and the quote checker to share data with Anthropic. Asked for
 * the first time either is opened, and changeable in Account (App Store guideline 5.1.2(i)).
 */
export const createAiSharingModel = (deps: {
  preferences: DevicePreferencesRepo
}): AiSharingModel => {
  let stop: Unsubscribe | undefined

  return createStore<AiSharingState & AiSharingActions>()((set, get) => ({
    status: 'loading',
    on: false,

    start: () => {
      stop ??= deps.preferences.watch((p) =>
        set((s) => ({ on: p.aiSharing, status: s.status === 'loading' ? 'ready' : s.status })),
      )
    },

    setOn: async (on) => {
      if (get().status !== 'ready') return false
      set({ status: 'saving', error: undefined })
      try {
        await deps.preferences.update({ aiSharing: on })
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
