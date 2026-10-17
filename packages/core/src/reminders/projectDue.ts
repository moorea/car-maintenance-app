import { addDays, addMonths, daysBetween, type IsoDate } from '../lib/date'
import type { MaintenanceItem, ServiceRecord } from '../domain/types'

/** Reminders turn "due soon" this many days ahead, matching the two-week notification. */
export const DUE_SOON_DAYS = 14

export type DueStatus = 'overdue' | 'due-soon' | 'upcoming'

export interface DueProjection {
  itemId: string
  task: string
  dueDate: IsoDate
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
  lastService: Pick<ServiceRecord, 'performedOn' | 'odometerMiles'> | undefined
  currentMiles: number
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

/**
 * Projects when one maintenance item is due: whichever comes first of its time limit and the
 * date the car is expected to reach its mileage limit. Returns undefined for an item with no
 * interval at all.
 */
export const projectDue = (input: ProjectionInput): DueProjection | undefined => {
  const { item, lastService, currentMiles, milesPerDay, severeDuty, today } = input
  const interval = intervalsFor(item, severeDuty)
  if (interval.miles === undefined && interval.months === undefined) return undefined

  const lastMiles = lastService?.odometerMiles
  const historyUnknown = lastService === undefined

  let dueMiles: number | undefined
  if (interval.miles !== undefined) {
    dueMiles =
      lastMiles !== undefined
        ? lastMiles + interval.miles
        : // No mileage on record: assume it is due at the next interval boundary.
          Math.ceil(currentMiles / interval.miles) * interval.miles
  }

  const byMiles =
    dueMiles !== undefined && milesPerDay > 0
      ? addDays(today, (dueMiles - currentMiles) / milesPerDay)
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
  // Time-only item with no history: treat as due now so the owner is asked about it.
  const dueDate = first?.date ?? today
  const trigger = first?.trigger ?? 'time'

  return {
    itemId: item.id,
    task: item.task,
    dueDate,
    ...(dueMiles !== undefined ? { dueMiles } : {}),
    trigger,
    status: statusOn(dueDate, today),
    historyUnknown,
  }
}
