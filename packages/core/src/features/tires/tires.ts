import type { TireSet } from '../../domain/types'
import { addDays, addMonths, daysBetween, type IsoDate } from '../../lib/date'
import { formatMonthYear } from '../../lib/format'

/**
 * Tire makers and NHTSA advise a yearly inspection once tires are five years old, most carmakers
 * say to replace them at six whatever the tread, and no tire should stay in service past ten.
 * Rubber hardens with age, on the car or in a garage, and an old tire can fail without warning.
 */
export const TIRE_INSPECT_YEARS = 5
export const TIRE_REPLACE_YEARS = 6
export const TIRE_MAX_YEARS = 10

/** 2/32″ is the legal minimum in most states; below 4/32″ grip in rain falls away quickly. */
export const TREAD_LEGAL_MIN = 2
export const TREAD_LOW = 4

/** The reminders a set gets: a month before it turns six, and a month before it turns ten. */
export const TIRE_AGE_NOTICE_YEARS = [TIRE_REPLACE_YEARS, TIRE_MAX_YEARS] as const
export const TIRE_AGE_NOTICE_DAYS = 30

/**
 * - `ok`: nothing to do.
 * - `inspect`: worth a look: five years old, or tread getting low.
 * - `replace`: six years old or more, or tread at the legal limit.
 */
export type TireCondition = 'ok' | 'inspect' | 'replace'

/** The Monday a tire's DOT week starts on (ISO weeks: week 1 holds the year's first Thursday). */
export const madeOn = (week: number, year: number): IsoDate => {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const mondayOfWeek1 = addDays(`${year}-01-04`, -((jan4.getUTCDay() + 6) % 7))
  return addDays(mondayOfWeek1, (week - 1) * 7)
}

/** When the set was made, if its DOT code is known. */
export const tireMadeOn = (set: TireSet): IsoDate | undefined =>
  set.madeWeek !== undefined && set.madeYear !== undefined
    ? madeOn(set.madeWeek, set.madeYear)
    : undefined

/** Whole months between two dates, counting a month once its day of the month is reached. */
const monthsBetween = (from: IsoDate, to: IsoDate): number => {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0))
}

/** The set's age in whole months, if its DOT code is known. */
export const tireAgeMonths = (set: TireSet, today: IsoDate): number | undefined => {
  const made = tireMadeOn(set)
  return made === undefined ? undefined : monthsBetween(made, today)
}

/** "3 years 2 months old", "8 months old", "New". */
export const describeAge = (months: number): string => {
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return rest === 0 ? 'New' : `${rest} month${rest === 1 ? '' : 's'} old`
  const y = `${years} year${years === 1 ? '' : 's'}`
  return rest === 0 ? `${y} old` : `${y} ${rest} month${rest === 1 ? '' : 's'} old`
}

/**
 * Miles driven on the set: earlier seasons, plus the time since it went on if it is on the car.
 * `currentMiles` is the car's estimated odometer today.
 */
export const milesOnSet = (set: TireSet, currentMiles: number | undefined): number => {
  if (!set.mounted || set.mountedAtMiles === undefined || currentMiles === undefined)
    return set.priorMiles
  return set.priorMiles + Math.max(0, currentMiles - set.mountedAtMiles)
}

/**
 * The set taken off the car at `atMiles`: the miles it did this time are added to its earlier
 * ones, so it picks up where it left off when it goes back on.
 */
export const takenOff = (set: TireSet, atMiles: number): TireSet => {
  const { mountedAtMiles: _, ...rest } = set
  return { ...rest, mounted: false, priorMiles: milesOnSet(set, atMiles) }
}

/** The set put on the car at `atMiles`. */
export const putOn = (set: TireSet, atMiles: number): TireSet => ({
  ...set,
  mounted: true,
  mountedAtMiles: atMiles,
})

export interface TireAssessment {
  condition: TireCondition
  /** Why, in a sentence, when there is something to do. */
  advice?: string
}

const WORSE: Record<TireCondition, number> = { ok: 0, inspect: 1, replace: 2 }

/** How the set stands by its age and its last tread reading; the more urgent reason wins. */
export const assessTires = (set: TireSet, today: IsoDate): TireAssessment => {
  const found: TireAssessment[] = []
  const months = tireAgeMonths(set, today)
  if (months !== undefined) {
    const years = months / 12
    if (years >= TIRE_MAX_YEARS)
      found.push({
        condition: 'replace',
        advice: 'Ten years old or more. Replace them, even if the tread looks fine.',
      })
    else if (years >= TIRE_REPLACE_YEARS)
      found.push({
        condition: 'replace',
        advice: 'Six years old or more. Most carmakers say to replace tires by now.',
      })
    else if (years >= TIRE_INSPECT_YEARS)
      found.push({
        condition: 'inspect',
        advice: 'Five years old or more. Have a shop inspect them every year.',
      })
  }
  const tread = set.treadDepth32nds
  if (tread !== undefined) {
    if (tread <= TREAD_LEGAL_MIN)
      found.push({
        condition: 'replace',
        advice: `Tread is at ${tread}/32″, the legal limit in most states. Replace them.`,
      })
    else if (tread <= TREAD_LOW)
      found.push({
        condition: 'inspect',
        advice: `Tread is down to ${tread}/32″. Grip in rain and snow is going; plan new tires.`,
      })
  }
  return found.reduce<TireAssessment>(
    (worst, next) => (WORSE[next.condition] > WORSE[worst.condition] ? next : worst),
    { condition: 'ok' },
  )
}

/** "Made Jun 2021", from the DOT code. */
export const describeMade = (set: TireSet): string | undefined => {
  const made = tireMadeOn(set)
  return made === undefined ? undefined : `Made ${formatMonthYear(made)}`
}

/** A birthday a set's reminders are about. */
export interface TireAgeMilestone {
  setId: string
  name: string
  years: (typeof TIRE_AGE_NOTICE_YEARS)[number]
  /** The day the set turns `years` old. */
  on: IsoDate
}

/** The age milestones still ahead of each set with a known DOT code. */
export const upcomingTireMilestones = (sets: TireSet[], today: IsoDate): TireAgeMilestone[] =>
  sets.flatMap((set) => {
    const made = tireMadeOn(set)
    if (made === undefined) return []
    return TIRE_AGE_NOTICE_YEARS.flatMap((years): TireAgeMilestone[] => {
      const on = addMonths(made, years * 12)
      return daysBetween(today, on) > 0 ? [{ setId: set.id, name: set.name, years, on }] : []
    })
  })
