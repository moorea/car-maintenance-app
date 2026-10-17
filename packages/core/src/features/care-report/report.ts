import { daysBetween, type IsoDate } from '../../lib/date'
import { formatCents, formatLongDate, formatMiles } from '../../lib/format'
import { isGeneralGuidance } from '../../lib/schedule'
import type {
  MaintenanceItem,
  OdometerReading,
  ServiceRecord,
  Vehicle,
  Warranty,
} from '../../domain/types'
import { dueItemsFor } from '../../reminders/getDueItems'
import { describeInterval } from '../car/model'
import {
  coverageOf,
  describeCoverage,
  describeLimits,
  warrantyKindLabel,
  type CoverageState,
} from '../warranty/coverage'

/**
 * A gap between two services this much longer than the interval counts as late. Owners round to
 * the nearest weekend or oil-change coupon, and a warranty claim is not refused over a few days.
 */
export const LATE_TOLERANCE = 1.1

const DAYS_PER_MONTH = 30.44

/**
 * How well one scheduled item has been kept up:
 * - `on-schedule`: logged, never late, and not overdue now.
 * - `late`: a gap between services ran past the interval.
 * - `overdue`: due now and not yet done.
 * - `not-logged`: no service of it in the log.
 */
export type CareStatus = 'on-schedule' | 'late' | 'overdue' | 'not-logged'

export interface CareScheduleRow {
  task: string
  /** "Every 5,000 mi or 6 months". */
  interval: string
  /** How many times it is in the log. */
  times: number
  /** "Jul 1, 2026 at 30,000 mi". */
  lastDone?: string | undefined
  status: CareStatus
  /** "On schedule", "Late once", "Overdue", "Not in the log". */
  statusLabel: string
}

export interface CareHistoryRow {
  id: string
  /** "Jul 1, 2026". */
  date: string
  /** "30,000 mi". */
  miles?: string | undefined
  what: string
  /** The shop, or "Owner" for work the owner did themselves. */
  by: string
  diy: boolean
  cost?: string | undefined
  notes?: string | undefined
}

export interface CareWarrantyRow {
  id: string
  /** "Powertrain". */
  coverage: string
  provider?: string | undefined
  /** "Mar 14, 2024 to Mar 14, 2029 or 60,000 mi". */
  term: string
  /** "Covered until Mar 14, 2029 or 60,000 mi". */
  status: string
  state: CoverageState
  policyNumber?: string | undefined
}

/**
 * Everything a proof-of-care report shows: the car, its warranties, how its schedule has been
 * kept and the full service history, as plain text ready to lay out.
 */
export interface CareReport {
  /** "2021 Toyota RAV4". */
  title: string
  /** "XLE · 2.5L 4-cyl · AWD". */
  subtitle: string
  vin?: string | undefined
  /** "About 36,180 mi". */
  odometer?: string | undefined
  /** "Oct 17, 2026". */
  preparedOn: string
  /** Suggested file name without an extension: "Care report 2021 Toyota RAV4 2026-10-17". */
  fileName: string
  summary: {
    services: number
    /** Of those, how many the owner did themselves. */
    diy: number
    spent: string
    /** "Sep 20, 2025 to Jul 1, 2026", or undefined with no services. */
    span?: string | undefined
  }
  warranties: CareWarrantyRow[]
  /** "General schedule", or "Toyota schedule". */
  scheduleTitle: string
  /** Says the schedule is general guidance rather than the manufacturer's. */
  scheduleNote?: string | undefined
  schedule: CareScheduleRow[]
  /** Newest first. */
  history: CareHistoryRow[]
}

export interface CareReportInput {
  vehicle: Vehicle
  items: MaintenanceItem[]
  records: ServiceRecord[]
  readings: OdometerReading[]
  warranties: Warranty[]
  today: IsoDate
}

const intervalsFor = (item: MaintenanceItem, severeDuty: boolean) => ({
  miles: (severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles,
  months: (severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths,
})

/** How many gaps between consecutive services of an item ran past its interval. */
export const countLateGaps = (
  item: MaintenanceItem,
  records: readonly ServiceRecord[],
  severeDuty: boolean,
): number => {
  const { miles, months } = intervalsFor(item, severeDuty)
  const done = records
    .filter((r) => r.itemId === item.id)
    .sort((a, b) => a.performedOn.localeCompare(b.performedOn))
  let late = 0
  for (let i = 1; i < done.length; i++) {
    const prev = done[i - 1]
    const next = done[i]
    if (!prev || !next) continue
    const days = daysBetween(prev.performedOn, next.performedOn)
    const lateByTime = months !== undefined && days > months * DAYS_PER_MONTH * LATE_TOLERANCE
    const lateByMiles =
      miles !== undefined &&
      prev.odometerMiles !== undefined &&
      next.odometerMiles !== undefined &&
      next.odometerMiles - prev.odometerMiles > miles * LATE_TOLERANCE
    if (lateByTime || lateByMiles) late++
  }
  return late
}

const lateLabel = (n: number) => (n === 1 ? 'Late once' : `Late ${n} times`)

const describeVehicle = (v: Vehicle) => [v.trim, v.engine, v.drivetrain].filter(Boolean).join(' · ')

const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** Builds the proof-of-care report for one car from what is stored about it. */
export const buildCareReport = (input: CareReportInput): CareReport => {
  const { vehicle, items, records, readings, warranties, today } = input
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const due = dueItemsFor({ vehicle, items, records, readings, today })
  const taskNames = new Map(items.map((i) => [i.id, i.task]))
  const newestFirst = [...records].sort(
    (a, b) => b.performedOn.localeCompare(a.performedOn) || b.id.localeCompare(a.id),
  )

  const history = newestFirst.map((r): CareHistoryRow => ({
    id: r.id,
    date: formatLongDate(r.performedOn),
    miles: r.odometerMiles !== undefined ? formatMiles(r.odometerMiles) : undefined,
    what: (r.itemId !== undefined ? taskNames.get(r.itemId) : undefined) ?? r.notes ?? 'Service',
    // The log form says to leave the shop blank for work done at home.
    by: r.shop ?? 'Owner',
    diy: r.shop === undefined,
    cost: r.costCents !== undefined ? formatCents(r.costCents) : undefined,
    // The notes already name the work when there is no scheduled task.
    notes: r.itemId !== undefined && taskNames.has(r.itemId) ? r.notes : undefined,
  }))

  const overdue = new Set(due.items.filter((d) => d.status === 'overdue').map((d) => d.itemId))
  const schedule = [...items]
    .sort((a, b) => a.task.localeCompare(b.task))
    .map((item): CareScheduleRow => {
      const done = newestFirst.filter((r) => r.itemId === item.id)
      const last = done[0]
      const late = countLateGaps(item, records, vehicle.severeDuty)
      const status: CareStatus =
        done.length === 0
          ? 'not-logged'
          : overdue.has(item.id)
            ? 'overdue'
            : late > 0
              ? 'late'
              : 'on-schedule'
      return {
        task: item.task,
        interval: describeInterval(item, vehicle.severeDuty),
        times: done.length,
        lastDone: last
          ? [
              formatLongDate(last.performedOn),
              last.odometerMiles !== undefined ? formatMiles(last.odometerMiles) : undefined,
            ]
              .filter(Boolean)
              .join(' at ')
          : undefined,
        status,
        statusLabel:
          status === 'not-logged'
            ? 'Not in the log'
            : status === 'overdue'
              ? 'Overdue'
              : status === 'late'
                ? lateLabel(late)
                : 'On schedule',
      }
    })

  const warrantyRows = [...warranties]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.kind.localeCompare(b.kind))
    .map((w): CareWarrantyRow => {
      const coverage = coverageOf({
        warranty: w,
        mileage: due.mileage,
        currentMiles: due.currentMiles,
        today,
      })
      return {
        id: w.id,
        coverage: warrantyKindLabel(w.kind),
        provider: w.provider,
        term: `${formatLongDate(w.startsOn)} to ${describeLimits(w)}`,
        status: describeCoverage(w, coverage, today),
        state: coverage.state,
        policyNumber: w.policyNumber,
      }
    })

  const oldest = newestFirst[newestFirst.length - 1]
  const newest = newestFirst[0]
  const general = isGeneralGuidance(items)
  const latest = due.mileage.latest
  return {
    title,
    subtitle: describeVehicle(vehicle),
    vin: vehicle.vin,
    odometer:
      due.currentMiles === undefined
        ? undefined
        : latest?.date === today
          ? formatMiles(due.currentMiles)
          : `About ${formatMiles(roundTo(due.currentMiles, 10))}`,
    preparedOn: formatLongDate(today),
    // Characters a file system or mail client refuses are dropped, since make and model are typed.
    fileName: `Care report ${title} ${today}`.replace(/[/\\:*?"<>|]/g, ''),
    summary: {
      services: records.length,
      diy: records.filter((r) => r.shop === undefined).length,
      spent: formatCents(records.reduce((sum, r) => sum + (r.costCents ?? 0), 0)),
      span:
        oldest && newest
          ? oldest === newest
            ? formatLongDate(oldest.performedOn)
            : `${formatLongDate(oldest.performedOn)} to ${formatLongDate(newest.performedOn)}`
          : undefined,
    },
    warranties: warrantyRows,
    scheduleTitle: `${general ? 'General' : vehicle.make} schedule, ${vehicle.severeDuty ? 'severe' : 'normal'} driving`,
    scheduleNote: general
      ? `General guidance for most cars, not ${vehicle.make}'s own schedule.`
      : undefined,
    schedule,
    history,
  }
}
