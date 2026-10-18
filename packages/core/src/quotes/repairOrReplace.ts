import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../domain/types'
import { addMonths, daysBetween, type IsoDate } from '../lib/date'
import { formatCents } from '../lib/format'
import { dueItemsFor } from '../reminders/getDueItems'

/** A quote this large is worth weighing against the car, whatever the car is worth. */
export const BIG_QUOTE_CENTS = 100_000

/**
 * The share of the car's value at which owners commonly start to weigh replacing it rather than
 * repairing (the "25 to 30% of its value" rule of thumb), and the share where the repair is most of
 * what the car is worth.
 */
export const LARGE_SHARE = 0.25
export const MOST_SHARE = 0.5

/** A value older than this is likely out of date, since cars lose value every year. */
export const VALUE_STALE_MONTHS = 12

/**
 * How the quote compares with the car's value:
 * - `small`: under a quarter of it.
 * - `large`: a quarter to a half.
 * - `most`: half or more.
 */
export type RepairShare = 'small' | 'large' | 'most'

export interface RepairWeighing {
  quoteCents: number
  /** Absent until the owner says what the car is worth. */
  share?: RepairShare | undefined
  /** "This quote is 38% of the $9,000 you think the car is worth." */
  headline: string
  /** One to three sentences of facts to weigh, each standing alone. */
  points: string[]
  /** True when the owner's value is more than a year old. */
  valueStale: boolean
  /** Scheduled work due in the next 12 months, not counting what the quote already covers. */
  dueNextYear: string[]
}

export interface WeighInput {
  vehicle: Pick<Vehicle, 'id' | 'severeDuty'> & {
    valueCents?: number | undefined
    valuedOn?: IsoDate | undefined
  }
  items: MaintenanceItem[]
  records: ServiceRecord[]
  readings: OdometerReading[]
  /** The quote's priced total. */
  quoteCents: number
  /** Schedule items the quote already covers, left out of what is coming up. */
  coveredItemIds?: readonly string[]
  today: IsoDate
}

/** Whether a quote of this size is worth weighing against the car at all. */
export const worthWeighing = (quoteCents: number, valueCents: number | undefined): boolean =>
  quoteCents >= BIG_QUOTE_CENTS ||
  (valueCents !== undefined && valueCents > 0 && quoteCents >= valueCents * LARGE_SHARE)

const percent = (share: number) => `${Math.round(share * 100)}%`

/**
 * Facts for deciding whether to pay for a big repair or replace the car: the quote against what the
 * owner thinks the car is worth, what repairs have cost in the last year, and what scheduled work
 * comes next. It states facts and the common rule of thumb; the decision stays with the owner.
 */
export const weighRepair = (input: WeighInput): RepairWeighing => {
  const { vehicle, quoteCents, today } = input
  const value = vehicle.valueCents !== undefined && vehicle.valueCents > 0 ? vehicle.valueCents : 0
  const ratio = value > 0 ? quoteCents / value : undefined
  const share: RepairShare | undefined =
    ratio === undefined
      ? undefined
      : ratio >= MOST_SHARE
        ? 'most'
        : ratio >= LARGE_SHARE
          ? 'large'
          : 'small'

  const headline =
    ratio === undefined
      ? `Is a ${formatCents(quoteCents)} repair worth it?`
      : ratio >= 1
        ? `This quote is more than the ${formatCents(value)} you think the car is worth`
        : `This quote is ${percent(ratio)} of the ${formatCents(value)} you think the car is worth`

  // Repairs are logged services that are not scheduled maintenance.
  const yearAgo = addMonths(today, -12)
  const repairs = input.records.filter(
    (r) =>
      r.itemId === undefined &&
      r.costCents !== undefined &&
      r.costCents > 0 &&
      r.performedOn > yearAgo &&
      r.performedOn <= today,
  )
  const repairCents = repairs.reduce((sum, r) => sum + (r.costCents ?? 0), 0)

  const points: string[] = []
  if (share === 'small')
    points.push(
      'That is well under the quarter of a car’s value where owners usually start to think about replacing it.',
    )
  else if (share !== undefined)
    points.push(
      'Many owners start to think about replacing a car when one repair costs more than about a quarter of its value.',
    )
  if (repairs.length > 0) {
    const yearTotal = repairCents + quoteCents
    points.push(
      `You’ve logged ${formatCents(repairCents)} of repairs in the last 12 months${repairs.length > 1 ? ` across ${repairs.length} visits` : ''}. With this quote, that’s ${formatCents(yearTotal)} in a year${value > 0 ? `, ${percent(yearTotal / value)} of its value` : ''}.`,
    )
  } else points.push('You haven’t logged any other repairs in the last 12 months.')

  const covered = new Set(input.coveredItemIds)
  const inAYear = addMonths(today, 12)
  const { items: due } = dueItemsFor({
    vehicle: input.vehicle,
    items: input.items,
    records: input.records,
    readings: input.readings,
    today,
  })
  const dueNextYear = due
    .filter((d) => !d.historyUnknown && d.dueDate !== undefined && d.dueDate <= inAYear)
    .filter((d) => !covered.has(d.itemId))
    .map((d) => d.task)

  return {
    quoteCents,
    share,
    headline,
    points,
    valueStale:
      vehicle.valuedOn !== undefined &&
      value > 0 &&
      daysBetween(vehicle.valuedOn, today) > VALUE_STALE_MONTHS * 30.5,
    dueNextYear,
  }
}
