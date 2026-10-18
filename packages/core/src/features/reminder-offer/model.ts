import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  DevicePreferencesRepo,
  NotificationPermission,
  Notifier,
  ReminderSettingsRepo,
  Unsubscribe,
} from '../../ports'

/**
 * - `loading`: reading the reminder setting, the phone's permission and whether it was offered.
 * - `showing`: the offer is on screen.
 * - `saving`: turning reminders on, while the phone asks for permission.
 * - `done`: answered, or nothing to offer; the app moves on.
 */
export type ReminderOfferStatus = 'loading' | 'showing' | 'saving' | 'done'

export interface ReminderOfferState {
  status: ReminderOfferStatus
}

export interface ReminderOfferActions {
  start: () => void
  /** Asks the phone for permission and turns reminders on if it is given. */
  accept: () => Promise<void>
  /** Leaves reminders off. They can still be turned on from the garage. */
  decline: () => void
  dispose: () => void
}

export type ReminderOfferModel = StoreApi<ReminderOfferState & ReminderOfferActions>

export interface ReminderOfferDeps {
  notifier: Pick<Notifier, 'permission' | 'requestPermission'>
  settings: ReminderSettingsRepo
  preferences: DevicePreferencesRepo
  /** Told once the offer is answered or there was nothing to offer. */
  onDone: () => void
}

/**
 * Screen model for offering reminders once a car has been added, the moment they become useful.
 * Offered once per phone, and never when reminders are already on or the phone blocks them.
 */
export const createReminderOfferModel = (deps: ReminderOfferDeps): ReminderOfferModel => {
  let stops: Unsubscribe[] = []
  let enabled: boolean | undefined
  let offered: boolean | undefined
  let permission: NotificationPermission | undefined

  return createStore<ReminderOfferState & ReminderOfferActions>()((set, get) => {
    const finish = () => {
      if (get().status === 'done') return
      set({ status: 'done' })
      deps.onDone()
    }

    const decide = () => {
      if (get().status !== 'loading') return
      if (enabled === undefined || offered === undefined || permission === undefined) return
      const nothingToOffer =
        offered || permission === 'denied' || (enabled && permission === 'granted')
      if (nothingToOffer) finish()
      else set({ status: 'showing' })
    }

    // A failed save only means the offer shows again after the next car.
    const remember = () => deps.preferences.update({ remindersOffered: true }).catch(() => {})

    return {
      status: 'loading',

      start: () => {
        if (stops.length > 0) return
        stops = [
          deps.settings.watch((s) => {
            enabled = s.enabled
            decide()
          }),
          deps.preferences.watch((p) => {
            offered = p.remindersOffered
            decide()
          }),
        ]
        deps.notifier.permission().then(
          (p) => {
            permission = p
            decide()
          },
          () => {
            // Unknown reads as not yet asked, so the offer shows and asking settles it.
            permission = 'undetermined'
            decide()
          },
        )
      },

      accept: async () => {
        if (get().status !== 'showing') return
        set({ status: 'saving' })
        try {
          if ((await deps.notifier.requestPermission()) === 'granted')
            await deps.settings.set({ enabled: true })
        } catch {
          // Left off, which the reminders screen shows; the owner can try again there.
        }
        void remember()
        finish()
      },

      decline: () => {
        if (get().status !== 'showing') return
        void remember()
        finish()
      },

      dispose: () => {
        for (const stop of stops) stop()
        stops = []
      },
    }
  })
}
