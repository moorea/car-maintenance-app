import { createStore, type StoreApi } from 'zustand/vanilla'
import type { IsoDate } from '../../lib/date'
import { formatAgo, formatMiles, formatWeekday } from '../../lib/format'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import type { SafetyRepo, Unsubscribe } from '../../ports'
import { getDueItems, type GetDueItemsDeps } from '../../reminders/getDueItems'
import { estimateMilesOn, learnMilesPerDay } from '../../reminders/mileage'
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
  /** Set when the schedule could not be read. */
  error?: string | undefined
}

export interface GarageActions {
  start: () => void
  dispose: () => void
}

export type GarageModel = StoreApi<GarageState & GarageActions>

export interface GarageDeps extends GetDueItemsDeps {
  vehicle: Vehicle
  safety: SafetyRepo
}

/** How many items "Coming up" lists after the next one. */
export const COMING_UP_COUNT = 4

/** Service records with a mileage double as odometer readings, as in getDueItems. */
const allReadings = (odometer: OdometerReading[], records: ServiceRecord[]): OdometerReading[] => [
  ...odometer,
  ...records.flatMap((r) =>
    r.odometerMiles === undefined
      ? []
      : [{ vehicleId: r.vehicleId, date: r.performedOn, miles: r.odometerMiles }],
  ),
]

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

  return createStore<GarageState & GarageActions>()((set) => {
    const refresh = async (records: ServiceRecord[]) => {
      const mine = ++generation
      try {
        const today = deps.clock.today()
        const [due, odometer, items] = await Promise.all([
          getDueItems(deps)(vehicle.id),
          deps.odometer.listForVehicle(vehicle.id),
          vehicle.configId === undefined
            ? Promise.resolve([] as MaintenanceItem[])
            : deps.schedule.itemsForConfig(vehicle.configId),
        ])
        if (mine !== generation) return

        const { milesPerDay, latest } = learnMilesPerDay(allReadings(odometer, records))
        const currentMiles = latest ? estimateMilesOn(latest, milesPerDay, today) : undefined
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
        // Logging a service moves the schedule on, so recompute whenever the records change. A
        // new odometer reading does not refresh it: the odometer port has no watch yet.
        subscriptions.push(
          deps.records.watchForVehicle(vehicle.id, (records) => void refresh(records)),
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

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
        generation++
      },
    }
  })
}
