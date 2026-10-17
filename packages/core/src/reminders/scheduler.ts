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
  // undefined until each source has reported once, so a cold start never mistakes "not loaded
  // yet" for "signed out", "switched off" or "no cars" and cancels everything.
  let userId: string | null | undefined
  let enabled: boolean | undefined
  let vehicles: Vehicle[] | undefined
  let stops: Unsubscribe[] = []
  let stopVehicles: Unsubscribe | undefined
  const stopRecords = new Map<string, Unsubscribe>()
  let scheduled: LocalNotification[] = []
  const watchers = new Set<(scheduled: LocalNotification[]) => void>()
  let running: Promise<void> | undefined
  let again = false

  /** What should be scheduled; `active: false` means none at all. undefined while loading. */
  const plan = async (): Promise<{ active: boolean; desired: LocalNotification[] } | undefined> => {
    if (enabled === undefined || userId === undefined) return undefined
    if (!userId || !enabled) return { active: false, desired: [] }
    if ((await deps.notifier.permission()) !== 'granted') return { active: false, desired: [] }
    if (vehicles === undefined) return undefined
    const due = getDueItems(deps)
    const cars = await Promise.all(
      vehicles.map(async (vehicle) => ({ vehicle, due: await due(vehicle.id) })),
    )
    return { active: true, desired: planNotifications(cars, deps.clock.today()) }
  }

  const apply = async () => {
    const next = await plan()
    if (!next) return
    const today = deps.clock.today()
    const current = await deps.notifier.scheduled()
    // The plan only holds dates after today, but one due this morning is still pending: leave it
    // to fire rather than cancelling it because the app was opened before 9am.
    const kept = next.active ? current.filter((n) => n.date <= today) : []
    const wanted = new Set([...next.desired, ...kept].map((n) => n.id))
    for (const n of current) if (!wanted.has(n.id)) await deps.notifier.cancel(n.id)
    for (const n of next.desired) {
      const existing = current.find((c) => c.id === n.id)
      if (!existing || !sameNotification(existing, n)) await deps.notifier.schedule(n)
    }
    scheduled = [...kept, ...next.desired]
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

  const watchRecords = (owned: Vehicle[]) => {
    const ids = new Set(owned.map((v) => v.id))
    for (const [id, stop] of stopRecords) {
      if (ids.has(id)) continue
      stop()
      stopRecords.delete(id)
    }
    for (const id of ids) {
      if (stopRecords.has(id)) continue
      // Every callback re-plans, the first included: it may carry a change made since the last
      // plan read the records, and a pass with nothing new changes nothing on the device.
      stopRecords.set(
        id,
        deps.records.watchForVehicle(id, () => void refresh()),
      )
    }
  }

  const stopFollowingCars = () => {
    stopVehicles?.()
    stopVehicles = undefined
    for (const stop of stopRecords.values()) stop()
    stopRecords.clear()
    vehicles = undefined
  }

  const onUser = (id: string | null) => {
    if (id === userId) return
    stopFollowingCars()
    userId = id
    if (id) {
      stopVehicles = deps.vehicles.watchOwned(id, (owned) => {
        vehicles = owned
        watchRecords(owned)
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
        deps.auth.watchUser((user) => onUser(user?.id ?? null)),
      ]
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
      enabled = undefined
    },
  }
}
