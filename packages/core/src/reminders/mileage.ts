import { daysBetween, type IsoDate } from '../lib/date'
import type { OdometerReading } from '../domain/types'

/** About 13,500 miles a year, the commonly cited US average. Used until we have two readings. */
export const DEFAULT_MILES_PER_DAY = 37

/** Faster than any real car is driven day after day; a reading implying more is a typo. */
export const MAX_PLAUSIBLE_MILES_PER_DAY = 1_000

/**
 * An interval this many days long moves the estimate halfway to its own rate, so a reading a day
 * after the last one barely shifts it while one after months of driving dominates.
 */
const HALF_LIFE_DAYS = 30

export interface MileageEstimate {
  milesPerDay: number
  /** True when the rate is the default rather than learned from this car's readings. */
  isDefault: boolean
  /** The newest reading that passed the plausibility checks, if any. */
  latest?: OdometerReading
}

/**
 * Learns a car's miles per day from its odometer history as a time-weighted average of the rate
 * between consecutive readings. Readings that go backwards or imply an impossible rate are
 * ignored as typos, so one bad entry cannot hide overdue work or poison later estimates.
 */
export const learnMilesPerDay = (readings: readonly OdometerReading[]): MileageEstimate => {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date))
  let rate: number | undefined
  let latest: OdometerReading | undefined

  for (const reading of sorted) {
    if (!latest) {
      latest = reading
      continue
    }
    const miles = reading.miles - latest.miles
    const days = daysBetween(latest.date, reading.date)
    if (miles < 0) continue
    if (days === 0) {
      // Same day: keep the higher reading without learning a rate from it.
      latest = reading
      continue
    }
    const intervalRate = miles / days
    if (intervalRate > MAX_PLAUSIBLE_MILES_PER_DAY) continue
    const weight = 1 - 0.5 ** (days / HALF_LIFE_DAYS)
    rate = rate === undefined ? intervalRate : weight * intervalRate + (1 - weight) * rate
    latest = reading
  }

  const base =
    rate === undefined
      ? { milesPerDay: DEFAULT_MILES_PER_DAY, isDefault: true }
      : { milesPerDay: rate, isDefault: false }
  return latest ? { ...base, latest } : base
}

/** Projects the odometer on a date from a reading and the learned rate, in either direction. */
export const estimateMilesOn = (
  reading: OdometerReading,
  milesPerDay: number,
  on: IsoDate,
): number => Math.max(0, reading.miles + daysBetween(reading.date, on) * milesPerDay)
