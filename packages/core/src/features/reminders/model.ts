import { createStore, type StoreApi } from 'zustand/vanilla'
import { formatShortDate } from '../../lib/date'
import type {
  Clock,
  NotificationPermission,
  Notifier,
  ReminderSettingsRepo,
  Unsubscribe,
} from '../../ports'
import type { ReminderScheduler } from '../../reminders/scheduler'

/** How many of the next reminders the screen lists. */
export const UPCOMING_SHOWN = 5

export interface UpcomingReminder {
  id: string
  /** "Nov 14", or "Feb 2, 2027" outside this year. */
  when: string
  title: string
  body: string
}

export interface RemindersState {
  status: 'loading' | 'ready' | 'saving'
  /** Whether reminders are on: the owner turned them on and the phone allows them. */
  on: boolean
  /**
   * The phone does not allow this app's notifications, so only the Settings app can turn them
   * back on. Shown with a way there.
   */
  blocked: boolean
  /** The next reminders scheduled on this phone, soonest first. */
  upcoming: UpcomingReminder[]
}

export interface RemindersActions {
  start: () => void
  /** Turning on asks for permission first, the first time; it stays off if refused. */
  setOn: (on: boolean) => Promise<void>
  openSettings: () => void
  dispose: () => void
}

export type RemindersModel = StoreApi<RemindersState & RemindersActions>

export interface RemindersDeps {
  notifier: Notifier
  settings: ReminderSettingsRepo
  scheduler: Pick<ReminderScheduler, 'watchScheduled'>
  clock: Clock
}

/** Screen model for the reminders setting and the reminders it has scheduled. */
export const createRemindersModel = (deps: RemindersDeps): RemindersModel => {
  let stops: Unsubscribe[] = []
  let enabled = false
  let permission: NotificationPermission = 'undetermined'
  let loaded = { settings: false, permission: false }

  return createStore<RemindersState & RemindersActions>()((set, get) => {
    const show = () => {
      if (!loaded.settings || !loaded.permission) return
      set((s) => ({
        status: s.status === 'loading' ? 'ready' : s.status,
        on: enabled && permission === 'granted',
        blocked: permission === 'denied',
      }))
    }

    const checkPermission = async () => {
      permission = await deps.notifier.permission()
      loaded = { ...loaded, permission: true }
      show()
    }

    return {
      status: 'loading',
      on: false,
      blocked: false,
      upcoming: [],

      start: () => {
        if (stops.length > 0) return
        stops = [
          deps.settings.watch((s) => {
            enabled = s.enabled
            loaded = { ...loaded, settings: true }
            show()
          }),
          deps.scheduler.watchScheduled((scheduled) => {
            const today = deps.clock.today()
            set({
              upcoming: scheduled.slice(0, UPCOMING_SHOWN).map((n) => ({
                id: n.id,
                when: formatShortDate(n.date, today),
                title: n.title,
                body: n.body,
              })),
            })
            // Each re-plan follows a change or a return to the app, when the owner may have
            // changed the permission in Settings.
            void checkPermission()
          }),
        ]
      },

      setOn: async (on) => {
        if (get().status !== 'ready') return
        set({ status: 'saving' })
        try {
          if (on) {
            permission = await deps.notifier.requestPermission()
            if (permission === 'granted') await deps.settings.set({ enabled: true })
          } else {
            await deps.settings.set({ enabled: false })
          }
        } catch {
          // The setting stays as it was, which the screen shows.
        } finally {
          set({ status: 'ready' })
          show()
        }
      },

      openSettings: () => void deps.notifier.openSettings(),

      dispose: () => {
        for (const stop of stops) stop()
        stops = []
      },
    }
  })
}
