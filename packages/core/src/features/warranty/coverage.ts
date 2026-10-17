import { addDays, addMonths, daysBetween, type IsoDate } from '../../lib/date'
import { formatLongDate, formatMiles } from '../../lib/format'
import type { Warranty, WarrantyKind } from '../../domain/types'
import type { MileageEstimate } from '../../reminders/mileage'
import { estimateMilesOn } from '../../reminders/mileage'
import type { WarrantyEnding } from '../../reminders/planNotifications'

/**
 * A coverage turns "ending soon" this many days before it is expected to end: time to have a
 * dealer look at anything that might be a claim.
 */
export const ENDING_SOON_DAYS = 90

export type CoverageState = 'active' | 'ending-soon' | 'ended'

export const WARRANTY_KINDS: { kind: WarrantyKind; label: string }[] = [
  { kind: 'basic', label: 'Bumper-to-bumper' },
  { kind: 'powertrain', label: 'Powertrain' },
  { kind: 'corrosion', label: 'Corrosion' },
  { kind: 'emissions', label: 'Emissions' },
  { kind: 'hybrid-battery', label: 'Hybrid or EV battery' },
  { kind: 'extended', label: 'Extended warranty' },
  { kind: 'other', label: 'Other coverage' },
]

export const warrantyKindLabel = (kind: WarrantyKind): string =>
  WARRANTY_KINDS.find((k) => k.kind === kind)?.label ?? 'Coverage'

export interface Coverage {
  state: CoverageState
  /** The end of the time limit. */
  endsOn?: IsoDate | undefined
  /**
   * When the car is expected to reach the mileage limit, from how it is driven. Absent with no
   * mileage limit, or for a car with no readings that is not being driven.
   */
  milesReachedOn?: IsoDate | undefined
  /** Whichever limit is expected first, and when. */
  endsBy: 'time' | 'miles'
  expectedEnd?: IsoDate | undefined
  /** How much of the coverage is used up, from 0 to 1, by whichever limit is further along. */
  used: number
}

export interface CoverageInput {
  warranty: Warranty
  mileage: MileageEstimate
  /** Estimated odometer today; undefined when the car has no readings at all. */
  currentMiles: number | undefined
  today: IsoDate
}

const fraction = (done: number, total: number) =>
  total <= 0 ? 1 : Math.min(1, Math.max(0, done / total))

/** Where a warranty stands today, judged by its time limit and the car's projected mileage. */
export const coverageOf = ({ warranty, mileage, currentMiles, today }: CoverageInput): Coverage => {
  const endsOn =
    warranty.months !== undefined ? addMonths(warranty.startsOn, warranty.months) : undefined

  let milesReachedOn: IsoDate | undefined
  let milesUsed = 0
  if (warranty.endMiles !== undefined && currentMiles !== undefined) {
    const remaining = warranty.endMiles - currentMiles
    if (remaining <= 0) milesReachedOn = today
    else if (mileage.milesPerDay > 0)
      milesReachedOn = addDays(today, Math.min(remaining / mileage.milesPerDay, 50 * 365))
    // The odometer when coverage began, projected back from the readings; zero for a new car.
    const startMiles = mileage.latest
      ? Math.min(
          estimateMilesOn(mileage.latest, mileage.milesPerDay, warranty.startsOn),
          currentMiles,
        )
      : 0
    milesUsed = fraction(currentMiles - startMiles, warranty.endMiles - startMiles)
  }
  // Only a reading the owner took proves the limit is passed; a projection past it may be a car
  // that has sat parked since its last reading, so it counts as ending soon, not ended.
  const readPastLimit =
    warranty.endMiles !== undefined &&
    mileage.latest !== undefined &&
    mileage.latest.miles >= warranty.endMiles

  const timeUsed =
    endsOn !== undefined
      ? fraction(daysBetween(warranty.startsOn, today), daysBetween(warranty.startsOn, endsOn))
      : 0

  const byMiles = milesReachedOn !== undefined && (endsOn === undefined || milesReachedOn < endsOn)
  const expectedEnd = byMiles ? milesReachedOn : endsOn
  const ended = (endsOn !== undefined && endsOn <= today) || readPastLimit
  const state: CoverageState = ended
    ? 'ended'
    : expectedEnd !== undefined && daysBetween(today, expectedEnd) <= ENDING_SOON_DAYS
      ? 'ending-soon'
      : 'active'

  return {
    state,
    endsOn,
    milesReachedOn,
    endsBy: byMiles ? 'miles' : 'time',
    expectedEnd,
    used: ended ? 1 : Math.max(timeUsed, milesUsed),
  }
}

/** "Mar 14, 2027 or 36,000 mi", "36,000 mi" or "Mar 14, 2027": the limits as the paperwork states them. */
export const describeLimits = (warranty: Warranty): string =>
  [
    warranty.months !== undefined
      ? formatLongDate(addMonths(warranty.startsOn, warranty.months))
      : undefined,
    warranty.endMiles !== undefined ? formatMiles(warranty.endMiles) : undefined,
  ]
    .filter(Boolean)
    .join(' or ')

/** How soon an end within ENDING_SOON_DAYS is: "today", "in 5 days", "in about 3 weeks". */
const roughly = (days: number): string => {
  if (days < 1) return 'today'
  if (days < 14) return days === 1 ? 'tomorrow' : `in ${days} days`
  if (days < 60) return `in about ${Math.round(days / 7)} weeks`
  return `in about ${Math.round(days / 30.44)} months`
}

/**
 * One line on where a warranty stands: "Ended Mar 14, 2027", "Ends in about 2 months, at
 * 36,000 mi" or "Covered until Mar 14, 2027 or 36,000 mi".
 */
export const describeCoverage = (
  warranty: Warranty,
  coverage: Coverage,
  today: IsoDate,
): string => {
  if (coverage.state === 'ended') {
    const byTime = coverage.endsOn !== undefined && coverage.endsOn <= today
    return byTime && coverage.endsOn
      ? `Ended ${formatLongDate(coverage.endsOn)}`
      : `Ended at ${formatMiles(warranty.endMiles ?? 0)}`
  }
  if (coverage.state === 'ending-soon' && coverage.expectedEnd) {
    if (coverage.endsBy === 'miles' && coverage.expectedEnd <= today)
      return `Probably past ${formatMiles(warranty.endMiles ?? 0)} by now. Update the odometer to check`
    const when = roughly(daysBetween(today, coverage.expectedEnd))
    return coverage.endsBy === 'miles'
      ? `Ends ${when}, at ${formatMiles(warranty.endMiles ?? 0)}`
      : `Ends ${when}, on ${formatLongDate(coverage.expectedEnd)}`
  }
  return `Covered until ${describeLimits(warranty)}`
}

/**
 * The coverages still running and when each is expected to end, for reminders. A coverage whose
 * end can't be projected (a mileage limit on a car with no readings) is left out.
 */
export const upcomingWarrantyEnds = (
  warranties: readonly Warranty[],
  car: Omit<CoverageInput, 'warranty'>,
): WarrantyEnding[] =>
  warranties.flatMap((warranty) => {
    const c = coverageOf({ warranty, ...car })
    if (c.state === 'ended' || c.expectedEnd === undefined || c.expectedEnd <= car.today) return []
    return [
      {
        id: warranty.id,
        coverage: warrantyKindLabel(warranty.kind),
        endsOn: c.expectedEnd,
        endsBy: c.endsBy,
        endMiles: warranty.endMiles,
      },
    ]
  })
