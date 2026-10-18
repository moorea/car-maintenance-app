import { createStore, type StoreApi } from 'zustand/vanilla'
import type { IsoDate } from '../../lib/date'
import { formatAgo, formatMiles, formatWeekday } from '../../lib/format'
import type { MaintenanceItem, OdometerReading, Vehicle } from '../../domain/types'
import type { DevicePreferencesRepo, SafetyRepo, Unsubscribe } from '../../ports'
import { getDueItems, type GetDueItemsDeps } from '../../reminders/getDueItems'
import { currentOdometer } from './odometer'
import { describeNext, intervalUsed, toDueRow, type DueRow } from './describeDue'

/**
 * - `loading`: reading the schedule and history from the local database.
 * - `unmatched`: the car has not synced back with its configuration, so it has no schedule yet.
 * - `ready`: the schedule is known (possibly empty).
 */
export type GarageStatus = 'loading' | 'unmatched' | 'ready'

export interface NextUp extends DueRow {
  /** A sentence on when it is due. */
  detail: string
  /** How much of the interval is used up, 0 to 1, when known. */
  progress?: number | undefined
}

export interface GarageState {
  status: GarageStatus
  /** Today, for the heading: "Saturday, Oct 17". */
  today: string
  /** The odometer as the garage shows it: "About 36,240 mi · updated 7 days ago". */
  odometer?: string | undefined
  /** The item due soonest, overdue ones first. */
  nextUp?: NextUp | undefined
  /** The next few items after that. */
  comingUp: DueRow[]
  /**
   * NHTSA recalls for the car's model year, once checked. `urgent` when one says not to drive or
   * to park outside.
   */
  recalls?: { count: number; urgent: boolean } | undefined
  /**
   * A scheduled item with no record of when it was last done, to ask the owner about, oil first,
   * and how many others have none. Absent once everything has a record, or once the owner said
   * not now for this car.
   */
  catchUp?: { itemId: string; task: string; others: number } | undefined
  /** Set when the schedule could not be read. */
  error?: string | undefined
}

export interface GarageActions {
  start: () => void
  /** Stops asking about this car's history on this phone. */
  dismissCatchUp: () => void
  dispose: () => void
}

export type GarageModel = StoreApi<GarageState & GarageActions>

export interface GarageDeps extends GetDueItemsDeps {
  vehicle: Vehicle
  safety: SafetyRepo
  /** Remembers, per phone, the cars whose history the owner chose not to fill in. */
  preferences?: DevicePreferencesRepo
}

/** How many items "Coming up" lists after the next one. */
export const COMING_UP_COUNT = 4

const describeOdometer = (latest: OdometerReading, miles: number, today: IsoDate) =>
  latest.date >= today
    ? formatMiles(miles)
    : `About ${formatMiles(Math.round(miles / 10) * 10)} · updated ${formatAgo(latest.date, today)}`

/** Screen model for the garage: the selected car's next service, what follows, and recalls. */
export const createGarageModel = (deps: GarageDeps): GarageModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  // Each refresh supersedes the one before, so a slow read never overwrites a newer one.
  let generation = 0

  // Undefined until the preferences are read, so the question never flashes up and away.
  let historyDismissed: boolean | undefined = deps.preferences ? undefined : false
  let unknown: { itemId: string; task: string }[] = []

  return createStore<GarageState & GarageActions>()((set) => {
    const showCatchUp = () => {
      const [first, ...rest] = unknown
      set({
        catchUp:
          first && historyDismissed === false
            ? { itemId: first.itemId, task: first.task, others: rest.length }
            : undefined,
      })
    }

    const refresh = async () => {
      const mine = ++generation
      try {
        const today = deps.clock.today()
        // Read the records here rather than keep the watch's copy, so a refresh started by a new
        // reading never runs before the records have arrived.
        const [due, odometer, records, items] = await Promise.all([
          getDueItems(deps)(vehicle.id),
          deps.odometer.listForVehicle(vehicle.id),
          deps.records.listForVehicle(vehicle.id),
          vehicle.configId === undefined
            ? Promise.resolve([] as MaintenanceItem[])
            : deps.schedule.itemsForConfig(vehicle.configId),
        ])
        if (mine !== generation) return

        const { latest, miles: currentMiles } = currentOdometer(odometer, records, today)
        // Oil first: the service owners most often know, and the one that comes round soonest.
        const isOil = (itemId: string) =>
          items.some((i) => i.id === itemId && i.kind === 'engine-oil')
        // Only items that have come round at least once: a newer car has simply never needed the
        // rest, and its schedule already counts them from zero.
        const comeRound = (itemId: string) => {
          const scheduled = items.find((i) => i.id === itemId)
          if (!scheduled) return false
          const miles =
            (vehicle.severeDuty ? scheduled.severeMiles : undefined) ?? scheduled.intervalMiles
          const months =
            (vehicle.severeDuty ? scheduled.severeMonths : undefined) ?? scheduled.intervalMonths
          // Counted from the start of the model year, less a year, as cars sell into it early.
          const ageMonths = (Number(today.slice(0, 4)) - vehicle.year - 1) * 12
          return (
            (miles !== undefined && currentMiles !== undefined && currentMiles >= miles) ||
            (months !== undefined && ageMonths >= months)
          )
        }
        unknown = due
          .filter((d) => d.historyUnknown && comeRound(d.itemId))
          .sort((a, b) => Number(isOil(b.itemId)) - Number(isOil(a.itemId)))
          .map((d) => ({ itemId: d.itemId, task: d.task }))
        const [first, ...rest] = due
        const nextUp: NextUp | undefined = first && {
          ...toDueRow(first, currentMiles, today),
          detail: describeNext(first, currentMiles, today),
          progress: intervalUsed(
            first,
            items.find((i) => i.id === first.itemId),
            vehicle.severeDuty,
            currentMiles,
            today,
          ),
        }
        set({
          status: vehicle.configId === undefined ? 'unmatched' : 'ready',
          today: formatWeekday(today),
          odometer:
            latest && currentMiles !== undefined
              ? describeOdometer(latest, currentMiles, today)
              : undefined,
          nextUp,
          comingUp: rest.slice(0, COMING_UP_COUNT).map((d) => toDueRow(d, currentMiles, today)),
          error: undefined,
        })
        showCatchUp()
      } catch (e) {
        if (mine !== generation) return
        set({
          status: 'ready',
          nextUp: undefined,
          comingUp: [],
          error: e instanceof Error ? e.message : 'Could not read the schedule',
        })
      }
    }

    return {
      status: 'loading',
      today: formatWeekday(deps.clock.today()),
      comingUp: [],

      start: () => {
        if (subscriptions.length > 0) return
        if (deps.preferences)
          subscriptions.push(
            deps.preferences.watch((p) => {
              historyDismissed = p.historyDismissed.includes(vehicle.id)
              showCatchUp()
            }),
          )
        // Logging a service or a new odometer reading (here or from sync) moves the schedule on,
        // so recompute whenever either changes.
        subscriptions.push(
          deps.records.watchForVehicle(vehicle.id, () => void refresh()),
          deps.odometer.watchForVehicle(vehicle.id, () => void refresh()),
        )
        if (vehicle.configId !== undefined)
          subscriptions.push(
            deps.safety.watchForConfig(vehicle.configId, (report) =>
              set({
                recalls:
                  report.recallsCheckedAt === undefined
                    ? undefined
                    : {
                        count: report.recalls.length,
                        urgent: report.recalls.some((r) => r.parkIt || r.parkOutside),
                      },
              }),
            ),
          )
      },

      dismissCatchUp: () => {
        historyDismissed = true
        showCatchUp()
        const preferences = deps.preferences
        if (!preferences) return
        // Read the stored list at the moment of saving, so another car's choice is kept.
        let dismissed: string[] = []
        preferences.watch((p) => (dismissed = p.historyDismissed))()
        if (dismissed.includes(vehicle.id)) return
        // A failed save only means the question comes back next launch.
        preferences.update({ historyDismissed: [...dismissed, vehicle.id] }).catch(() => {})
      },

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
        generation++
      },
    }
  })
}
