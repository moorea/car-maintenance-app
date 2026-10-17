import { daysBetween, type IsoDate } from '../../lib/date'
import { formatDay, formatMiles } from '../../lib/format'
import type { MaintenanceItem } from '../../domain/types'
import type { DueProjection, DueStatus } from '../../reminders/projectDue'

/** One scheduled item as a list row shows it. */
export interface DueRow {
  itemId: string
  task: string
  status: DueStatus
  /** When it is or was due, in words: "In 1,790 mi", "Was due at 45,100 mi", "By Mar 14, 2027". */
  when: string
}

/** Mileage limits are shown to the nearest 10 miles, so a projection does not look exact. */
const roundMiles = (miles: number) => Math.round(miles / 10) * 10

/** When an item is or was due, in a few words for a list row. */
export const describeWhen = (
  due: DueProjection,
  currentMiles: number | undefined,
  today: IsoDate,
): string => {
  const milesLeft =
    due.dueMiles !== undefined && currentMiles !== undefined
      ? due.dueMiles - currentMiles
      : undefined
  if (due.status === 'overdue') {
    if (due.trigger === 'miles' && due.dueMiles !== undefined)
      return `Was due at ${formatMiles(due.dueMiles)}`
    return due.dueDate ? `Was due ${formatDay(due.dueDate, today)}` : 'Overdue'
  }
  if (due.trigger === 'miles' && milesLeft !== undefined) {
    const rounded = roundMiles(milesLeft)
    return rounded <= 0 ? 'Due now' : `In ${formatMiles(rounded)}`
  }
  if (due.dueDate) return due.dueDate === today ? 'Due now' : `By ${formatDay(due.dueDate, today)}`
  return due.dueMiles !== undefined ? `At ${formatMiles(due.dueMiles)}` : 'Due now'
}

/** A sentence about the next item due, for the card at the top of the garage. */
export const describeNext = (
  due: DueProjection,
  currentMiles: number | undefined,
  today: IsoDate,
): string => {
  const when = describeWhen(due, currentMiles, today)
  if (due.historyUnknown)
    return `${when}. There's no record of it yet, so this assumes it was last done on schedule.`
  if (due.status === 'overdue') return `${when}.`
  if (due.trigger === 'miles' && due.dueDate && when.startsWith('In '))
    return `Due in ${when.slice(3)}, around ${formatDay(due.dueDate, today)}.`
  return `${when.replace(/^By /, 'Due by ')}.`
}

/**
 * How much of the interval since the item was last done has been used up, from 0 to 1, by
 * whichever limit is closer. Undefined when the interval or the car's mileage is unknown.
 */
export const intervalUsed = (
  due: DueProjection,
  item: MaintenanceItem | undefined,
  severeDuty: boolean,
  currentMiles: number | undefined,
  today: IsoDate,
): number | undefined => {
  if (!item) return undefined
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  const miles = (severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles
  const months = (severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths
  if (due.trigger === 'miles' && miles && due.dueMiles !== undefined && currentMiles !== undefined)
    return clamp(1 - (due.dueMiles - currentMiles) / miles)
  if (due.trigger === 'time' && months && due.dueDate)
    return clamp(1 - daysBetween(today, due.dueDate) / (months * 30.44))
  return undefined
}

export const toDueRow = (
  due: DueProjection,
  currentMiles: number | undefined,
  today: IsoDate,
): DueRow => ({
  itemId: due.itemId,
  task: due.task,
  status: due.status,
  when: describeWhen(due, currentMiles, today),
})
