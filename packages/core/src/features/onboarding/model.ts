import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AuthPort, DevicePreferencesRepo, Unsubscribe } from '../../ports'

/** One page of the first-run introduction. */
export interface OnboardingPage {
  /** Names an icon the app knows, such as "car". */
  symbol: 'car' | 'ask' | 'quote' | 'bell'
  title: string
  body: string
}

/** What the app does, in the order an owner meets it. Claims stay true to what is built. */
export const ONBOARDING_PAGES: OnboardingPage[] = [
  {
    symbol: 'car',
    title: 'Your car, explained',
    body: 'Add your car by VIN or by year, make and model. See what maintenance is due, the recalls for your model and the problems other owners report to NHTSA.',
  },
  {
    symbol: 'ask',
    title: 'Answers you can check',
    body: 'Ask anything about your car in plain English. Answers come from its schedule, your service log and federal safety data, and show their sources.',
  },
  {
    symbol: 'quote',
    title: 'Walk into the shop knowing more',
    body: "Photograph a shop's quote and see which items your car's schedule calls for, which were done recently, and which match a recall.",
  },
  {
    symbol: 'bell',
    title: "A heads-up when it's due",
    body: 'Reminders follow your odometer, not a fixed calendar. Your own work counts in the log, and your garage, log and reminders work offline.',
  },
]

/**
 * - `loading`: reading whether this phone has seen the introduction.
 * - `showing`: the introduction is on screen.
 * - `done`: seen or skipped; sign-in shows instead.
 */
export type OnboardingStatus = 'loading' | 'showing' | 'done'

export interface OnboardingState {
  status: OnboardingStatus
  pages: OnboardingPage[]
  /** Index of the page on screen. */
  page: number
  /** True on the last page, whose button finishes the introduction. */
  isLast: boolean
}

export interface OnboardingActions {
  start: () => void
  /** The next page, or the end of the introduction on the last one. */
  next: () => void
  back: () => void
  /** Ends the introduction from any page. */
  skip: () => void
  dispose: () => void
}

export type OnboardingModel = StoreApi<OnboardingState & OnboardingActions>

export interface OnboardingDeps {
  preferences: DevicePreferencesRepo
  auth: Pick<AuthPort, 'watchUser'>
}

/**
 * Screen model for the introduction a new owner sees before signing in, once per phone. Someone
 * already signed in, such as an owner updating the app, never sees it, even after signing out.
 * Keep it running while signed in for that.
 */
export const createOnboardingModel = (deps: OnboardingDeps): OnboardingModel => {
  let stops: Unsubscribe[] = []
  let onboarded: boolean | undefined
  let signedIn: boolean | undefined

  return createStore<OnboardingState & OnboardingActions>()((set, get) => {
    const show = () => {
      if (onboarded === undefined || signedIn === undefined) return
      // Once done it stays done while the app runs, even if the save failed.
      if (get().status === 'done') return
      if (onboarded) set({ status: 'done' })
      // An owner who has signed in has nothing left to be introduced to on this phone.
      else if (signedIn) finish()
      else set({ status: 'showing' })
    }

    const finish = () => {
      set({ status: 'done' })
      // A failed save only means the introduction shows again next launch.
      deps.preferences.update({ onboarded: true }).catch(() => {})
    }

    const goTo = (page: number) => set({ page, isLast: page === ONBOARDING_PAGES.length - 1 })

    return {
      status: 'loading',
      pages: ONBOARDING_PAGES,
      page: 0,
      isLast: ONBOARDING_PAGES.length === 1,

      start: () => {
        if (stops.length > 0) return
        stops = [
          deps.preferences.watch((p) => {
            onboarded = p.onboarded
            show()
          }),
          deps.auth.watchUser((user) => {
            signedIn = user !== null
            show()
          }),
        ]
      },

      next: () => {
        const { status, page, isLast } = get()
        if (status !== 'showing') return
        if (isLast) finish()
        else goTo(page + 1)
      },

      back: () => {
        const { status, page } = get()
        if (status === 'showing' && page > 0) goTo(page - 1)
      },

      skip: () => {
        if (get().status === 'showing') finish()
      },

      dispose: () => {
        for (const stop of stops) stop()
        stops = []
      },
    }
  })
}
