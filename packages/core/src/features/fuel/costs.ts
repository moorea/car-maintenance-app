import { addDays, addMonths, daysBetween, type IsoDate } from '../../lib/date'
import type { FillUp, OdometerReading, ServiceRecord } from '../../domain/types'
import { MAX_PLAUSIBLE_MILES_PER_DAY } from '../../reminders/mileage'

/** What the car cost over a stretch of time, in cents. */
export interface CostTotals {
  fuelCents: number
  serviceCents: number
  totalCents: number
}

export interface MonthCost extends CostTotals {
  /** "2026-10". */
  month: string
}

export interface PeriodCost extends CostTotals {
  /** Miles driven over the period, as far as the readings show; absent when they cannot. */
  miles?: number
  /** Cents per mile, fuel and service together; absent below `MIN_MILES_FOR_RATE`. */
  centsPerMile?: number
}

export interface YearCost extends PeriodCost {
  year: number
}

export interface RunningCosts {
  /** The twelve calendar months up to today's, oldest first, months without costs included. */
  months: MonthCost[]
  /** The last twelve months to today. */
  lastYear: PeriodCost
  /** Each calendar year with a cost logged, newest first. */
  years: YearCost[]
}

/** Below this, one fill-up dominates the rate and cents per mile is noise. */
export const MIN_MILES_FOR_RATE = 100

const totals = (fuelCents: number, serviceCents: number): CostTotals => ({
  fuelCents,
  serviceCents,
  totalCents: fuelCents + serviceCents,
})

/**
 * Readings that only go up at a drivable rate, by date: one lower than an earlier one, or more
 * miles after it than a car covers, is a typo and dropped, as the mileage estimate does.
 */
export const climbing = (readings: readonly OdometerReading[]): OdometerReading[] => {
  const kept: OdometerReading[] = []
  for (const r of [...readings].sort((a, b) => a.date.localeCompare(b.date) || a.miles - b.miles)) {
    const last = kept.at(-1)
    const days = last ? Math.max(1, daysBetween(last.date, r.date)) : 1
    if (
      !last ||
      (r.miles >= last.miles && (r.miles - last.miles) / days <= MAX_PLAUSIBLE_MILES_PER_DAY)
    )
      kept.push(r)
  }
  return kept
}

/**
 * The odometer on `date`, between the readings either side of it. Before the first reading it
 * is the first reading and after the last it is the last: miles nobody recorded are not counted.
 */
const odometerOn = (readings: readonly OdometerReading[], date: IsoDate): number | undefined => {
  const first = readings[0]
  const last = readings.at(-1)
  if (!first || !last) return undefined
  if (date <= first.date) return first.miles
  if (date >= last.date) return last.miles
  const after = readings.findIndex((r) => r.date > date)
  const a = readings[after - 1] ?? first
  const b = readings[after] ?? last
  const span = daysBetween(a.date, b.date)
  return span === 0 ? b.miles : a.miles + ((b.miles - a.miles) * daysBetween(a.date, date)) / span
}

/**
 * The car's running costs: fuel or charging and services, by month and by year, with what each
 * mile cost. Every fill-up and service with a cost counts; one without a cost counts as nothing.
 */
export const runningCosts = (input: {
  fillUps: readonly FillUp[]
  records: readonly ServiceRecord[]
  /** All the car's readings, fill-ups and services with a mileage included. */
  readings: readonly OdometerReading[]
  today: IsoDate
}): RunningCosts => {
  const costs = [
    ...input.fillUps.flatMap((f) =>
      f.costCents === undefined ? [] : [{ date: f.filledOn, cents: f.costCents, fuel: true }],
    ),
    ...input.records.flatMap((r) =>
      r.costCents === undefined ? [] : [{ date: r.performedOn, cents: r.costCents, fuel: false }],
    ),
  ].filter((c) => c.date <= input.today)
  const readings = climbing(input.readings)

  const sum = (from: IsoDate, to: IsoDate): CostTotals => {
    let fuel = 0
    let service = 0
    for (const c of costs) {
      if (c.date < from || c.date > to) continue
      if (c.fuel) fuel += c.cents
      else service += c.cents
    }
    return totals(fuel, service)
  }

  /** From the start of `from` to the end of `to`, both inclusive. */
  const period = (from: IsoDate, to: IsoDate): PeriodCost => {
    const cost = sum(from, to)
    const start = odometerOn(readings, from)
    // The odometer at the end of `to`, which is the start of the next day.
    const end = odometerOn(readings, addDays(to, 1))
    if (start === undefined || end === undefined) return cost
    const miles = Math.round(end - start)
    return miles >= MIN_MILES_FOR_RATE
      ? { ...cost, miles, centsPerMile: cost.totalCents / miles }
      : { ...cost, miles }
  }

  const thisMonth = `${input.today.slice(0, 7)}-01`
  const months = Array.from({ length: 12 }, (_, i) => {
    const first = addMonths(thisMonth, i - 11)
    const month = first.slice(0, 7)
    return { month, ...sum(first, `${month}-31`) }
  })

  const years = [...new Set(costs.map((c) => Number(c.date.slice(0, 4))))]
    .sort((a, b) => b - a)
    .map((year) => {
      const end = `${year}-12-31` < input.today ? `${year}-12-31` : input.today
      return { year, ...period(`${year}-01-01`, end) }
    })

  return {
    months,
    lastYear: period(addDays(addMonths(input.today, -12), 1), input.today),
    years,
  }
}
