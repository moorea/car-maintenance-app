import { addDays, addMonths, daysBetween, type IsoDate } from '../lib/date'
import type { MaintenanceItem } from '../domain/types'

/** Reminders turn "due soon" this many days ahead, matching the two-week notification. */
export const DUE_SOON_DAYS = 14

/** Projections further out than this are clamped; nobody needs a reminder 50 years away. */
const MAX_DAYS_AHEAD = 50 * 365

export type DueStatus = 'overdue' | 'due-soon' | 'upcoming'

export interface DueProjection {
  itemId: string
  task: string
  /**
   * When the item is due. Absent only for a mileage-only item on a car that is not being driven,
   * where no date can be projected.
   */
  dueDate?: IsoDate
  /** Odometer reading at which the item is due, when it has a mileage interval. */
  dueMiles?: number
  /** Which limit arrives first. */
  trigger: 'miles' | 'time'
  status: DueStatus
  /** True when there is no service record, so the due point is a guess at the next interval. */
  historyUnknown: boolean
}

export interface ProjectionInput {
  item: MaintenanceItem
  /** The last time this item was done, with the odometer then (recorded or estimated). */
  lastService: { performedOn: IsoDate; odometerMiles?: number | undefined } | undefined
  /** Estimated odometer today; undefined when the car has no readings at all. */
  currentMiles: number | undefined
  milesPerDay: number
  severeDuty: boolean
  today: IsoDate
}

const intervalsFor = (item: MaintenanceItem, severeDuty: boolean) => ({
  miles: (severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles,
  months: (severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths,
})

const statusOn = (dueDate: IsoDate, today: IsoDate): DueStatus => {
  const daysLeft = daysBetween(today, dueDate)
  if (daysLeft < 0) return 'overdue'
  return daysLeft <= DUE_SOON_DAYS ? 'due-soon' : 'upcoming'
}

const clampDays = (days: number) => Math.max(-MAX_DAYS_AHEAD, Math.min(MAX_DAYS_AHEAD, days))

/** Date the car reaches `dueMiles`, or undefined if it is not being driven and is not there yet. */
const dateForMiles = (
  dueMiles: number,
  currentMiles: number,
  milesPerDay: number,
  today: IsoDate,
): IsoDate | undefined => {
  const remaining = dueMiles - currentMiles
  if (milesPerDay > 0) return addDays(today, clampDays(remaining / milesPerDay))
  return remaining <= 0 ? today : undefined
}

/**
 * Projects when one maintenance item is due: whichever comes first of its time limit and the
 * date the car is expected to reach its mileage limit. Returns undefined for an item with no
 * interval at all.
 */
export const projectDue = (input: ProjectionInput): DueProjection | undefined => {
  const { item, lastService, currentMiles, milesPerDay, severeDuty, today } = input
  const interval = intervalsFor(item, severeDuty)
  if (interval.miles === undefined && interval.months === undefined) return undefined

  const historyUnknown = lastService === undefined
  const lastMiles = lastService?.odometerMiles

  let dueMiles: number | undefined
  if (interval.miles !== undefined) {
    if (lastMiles !== undefined) dueMiles = lastMiles + interval.miles
    // No mileage for the last service: assume it is due at the next interval boundary.
    else if (currentMiles !== undefined)
      dueMiles = Math.ceil(currentMiles / interval.miles) * interval.miles
  }

  const byMiles =
    dueMiles !== undefined && currentMiles !== undefined
      ? dateForMiles(dueMiles, currentMiles, milesPerDay, today)
      : undefined
  const byTime =
    interval.months !== undefined && lastService
      ? addMonths(lastService.performedOn, interval.months)
      : undefined

  const candidates = [
    ...(byMiles ? [{ date: byMiles, trigger: 'miles' as const }] : []),
    ...(byTime ? [{ date: byTime, trigger: 'time' as const }] : []),
  ]
  // Stable sort, so a tie goes to the mileage limit.
  const first = [...candidates].sort((a, b) => a.date.localeCompare(b.date))[0]

  const base = {
    itemId: item.id,
    task: item.task,
    ...(dueMiles !== undefined ? { dueMiles } : {}),
    historyUnknown,
  }
  if (first)
    return {
      ...base,
      dueDate: first.date,
      trigger: first.trigger,
      status: statusOn(first.date, today),
    }
  if (dueMiles !== undefined) return { ...base, trigger: 'miles', status: 'upcoming' }
  // No history and nothing to project from: treat as due now so the owner is asked about it.
  return { ...base, dueDate: today, trigger: 'time', status: 'due-soon' }
}
