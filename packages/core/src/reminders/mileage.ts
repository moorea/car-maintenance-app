import { daysBetween, type IsoDate } from '../lib/date'
import type { OdometerReading } from '../domain/types'

/** About 13,500 miles a year, the commonly cited US average. Used until we have two readings. */
export const DEFAULT_MILES_PER_DAY = 37

/** Weight given to the newest interval, so a new commute shows up within a few readings. */
const SMOOTHING = 0.5

export interface MileageEstimate {
  milesPerDay: number
  /** True when the rate is the default rather than learned from this car's readings. */
  isDefault: boolean
}

/**
 * Learns a car's miles per day from its odometer history as an exponentially weighted average
 * of the rate between consecutive readings. Readings that go backwards are ignored as typos.
 */
export const learnMilesPerDay = (readings: readonly OdometerReading[]): MileageEstimate => {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date))
  let rate: number | undefined
  let previous: OdometerReading | undefined

  for (const reading of sorted) {
    if (previous && reading.miles >= previous.miles) {
      const days = daysBetween(previous.date, reading.date)
      if (days > 0) {
        const intervalRate = (reading.miles - previous.miles) / days
        rate = rate === undefined ? intervalRate : SMOOTHING * intervalRate + (1 - SMOOTHING) * rate
      }
    }
    if (!previous || reading.miles >= previous.miles) previous = reading
  }

  return rate === undefined
    ? { milesPerDay: DEFAULT_MILES_PER_DAY, isDefault: true }
    : { milesPerDay: rate, isDefault: false }
}

/** Projects today's odometer from the latest reading and the learned rate. */
export const estimateMilesOn = (
  latest: OdometerReading,
  milesPerDay: number,
  on: IsoDate,
): number => latest.miles + Math.max(0, daysBetween(latest.date, on)) * milesPerDay
