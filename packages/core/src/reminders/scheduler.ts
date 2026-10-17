import type { Vehicle } from '../domain/types'
import type {
  AuthPort,
  LocalNotification,
  Notifier,
  ReminderSettingsRepo,
  Unsubscribe,
} from '../ports'
import { getDueItems, type GetDueItemsDeps } from './getDueItems'
import { planNotifications } from './planNotifications'

export interface ReminderSchedulerDeps extends GetDueItemsDeps {
  auth: AuthPort
  notifier: Notifier
  settings: ReminderSettingsRepo
  /** Where failures go; a reminder that cannot be planned must not crash the app. */
  log?: (message: string, error: unknown) => void
}

export interface ReminderScheduler {
  /** Follows sign-in, the owner's cars, their service logs and the reminder setting. */
  start: () => void
  /**
   * Plans again now. Call when the app returns to the foreground, since a new day or a changed
   * notification permission does not announce itself. Resolves once the plan is applied.
   */
  refresh: () => Promise<void>
  /** Calls `onChange` with the reminders scheduled now and after every change. */
  watchScheduled: (onChange: (scheduled: LocalNotification[]) => void) => Unsubscribe
  dispose: () => void
}

const sameNotification = (a: LocalNotification, b: LocalNotification) =>
  a.date === b.date &&
  a.hour === b.hour &&
  a.title === b.title &&
  a.body === b.body &&
  a.vehicleId === b.vehicleId

/**
 * Keeps this device's scheduled reminders in step with the owner's cars: re-plans whenever a car
 * or a service record changes, and schedules or cancels only the notifications that differ.
 * Nothing is scheduled while signed out, while reminders are off or without permission, so
 * signing out or turning reminders off cancels them all.
 */
export const createReminderScheduler = (deps: ReminderSchedulerDeps): ReminderScheduler => {
  const log = deps.log ?? (() => {})
  let userId: string | undefined
  let enabled = false
  let vehicles: Vehicle[] = []
  let stops: Unsubscribe[] = []
  let stopVehicles: Unsubscribe | undefined
  const stopRecords = new Map<string, Unsubscribe>()
  let scheduled: LocalNotification[] = []
  const watchers = new Set<(scheduled: LocalNotification[]) => void>()
  let running: Promise<void> | undefined
  let again = false

  const plan = async (): Promise<LocalNotification[]> => {
    if (!userId || !enabled) return []
    if ((await deps.notifier.permission()) !== 'granted') return []
    const due = getDueItems(deps)
    const cars = await Promise.all(
      vehicles.map(async (vehicle) => ({ vehicle, due: await due(vehicle.id) })),
    )
    return planNotifications(cars, deps.clock.today())
  }

  const apply = async () => {
    const desired = await plan()
    const current = await deps.notifier.scheduled()
    const wanted = new Map(desired.map((n) => [n.id, n]))
    for (const n of current) if (!wanted.has(n.id)) await deps.notifier.cancel(n.id)
    for (const n of desired) {
      const existing = current.find((c) => c.id === n.id)
      if (!existing || !sameNotification(existing, n)) await deps.notifier.schedule(n)
    }
    scheduled = desired
    for (const w of watchers) w(scheduled)
  }

  // One plan at a time; changes arriving meanwhile are folded into one more pass.
  const refresh = (): Promise<void> => {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          try {
            await apply()
          } catch (e) {
            log('Could not schedule reminders', e)
          }
        } while (again)
      } finally {
        running = undefined
      }
    })()
    return running
  }

  const watchRecords = () => {
    const ids = new Set(vehicles.map((v) => v.id))
    for (const [id, stop] of stopRecords) {
      if (ids.has(id)) continue
      stop()
      stopRecords.delete(id)
    }
    for (const id of ids) {
      if (stopRecords.has(id)) continue
      // The first callback arrives straight away; the refresh below covers it.
      let first = true
      stopRecords.set(
        id,
        deps.records.watchForVehicle(id, () => {
          if (first) first = false
          else void refresh()
        }),
      )
    }
  }

  const stopFollowingCars = () => {
    stopVehicles?.()
    stopVehicles = undefined
    for (const stop of stopRecords.values()) stop()
    stopRecords.clear()
    vehicles = []
  }

  const onUser = (id: string | undefined) => {
    if (id === userId) return
    stopFollowingCars()
    userId = id
    if (id) {
      stopVehicles = deps.vehicles.watchOwned(id, (owned) => {
        vehicles = owned
        watchRecords()
        void refresh()
      })
    } else void refresh()
  }

  return {
    start: () => {
      if (stops.length > 0) return
      stops = [
        deps.settings.watch((s) => {
          if (s.enabled === enabled) return
          enabled = s.enabled
          void refresh()
        }),
        deps.auth.watchUser((user) => onUser(user?.id)),
      ]
      void refresh()
    },
    refresh,
    watchScheduled: (onChange) => {
      watchers.add(onChange)
      onChange(scheduled)
      return () => watchers.delete(onChange)
    },
    dispose: () => {
      for (const stop of stops) stop()
      stops = []
      stopFollowingCars()
      userId = undefined
    },
  }
}
