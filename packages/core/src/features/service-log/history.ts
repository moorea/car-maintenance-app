import type { IsoDate } from '../../lib/date'
import { formatCents, formatMiles } from '../../lib/format'
import type { ServiceRecord } from '../../domain/types'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** One logged service as the history list shows it. */
export interface LogEntry {
  id: string
  /** "Oct" and "2", for the date badge. */
  month: string
  day: string
  /** The scheduled task done, or the owner's note: "Oil & filter change". */
  what: string
  /** "Main St Auto · 41,250 mi", leaving out what is unknown. */
  where: string
  cost?: string | undefined
}

/** A month of history: "October", or "October 2025" outside the current year. */
export interface LogGroup {
  label: string
  entries: LogEntry[]
}

export interface LogSummary {
  /** "Spent in 2026". */
  spentLabel: string
  /** "$612.40". */
  spent: string
  count: number
}

const whatWasDone = (r: ServiceRecord, taskNames: ReadonlyMap<string, string>) =>
  (r.itemId !== undefined ? taskNames.get(r.itemId) : undefined) ?? r.notes ?? 'Service'

const matches = (r: ServiceRecord, what: string, query: string) => {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return [what, r.shop, r.notes].some((text) => text?.toLowerCase().includes(q))
}

/**
 * Groups records (newest first) by month for the history list, keeping those matching `query`
 * in the task, shop or notes.
 */
export const groupHistory = (
  records: readonly ServiceRecord[],
  taskNames: ReadonlyMap<string, string>,
  query: string,
  today: IsoDate,
): LogGroup[] => {
  const thisYear = today.slice(0, 4)
  const groups: LogGroup[] = []
  for (const r of records) {
    const what = whatWasDone(r, taskNames)
    if (!matches(r, what, query)) continue
    const [year, month, day] = r.performedOn.split('-') as [string, string, string]
    const monthName = MONTHS[Number(month) - 1] ?? ''
    const label = year === thisYear ? monthName : `${monthName} ${year}`
    const entry: LogEntry = {
      id: r.id,
      month: monthName.slice(0, 3),
      day: String(Number(day)),
      what,
      where: [r.shop, r.odometerMiles !== undefined ? formatMiles(r.odometerMiles) : undefined]
        .filter(Boolean)
        .join(' · '),
      cost: r.costCents !== undefined ? formatCents(r.costCents) : undefined,
    }
    const last = groups[groups.length - 1]
    if (last?.label === label) last.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }
  return groups
}

/** What was spent this calendar year and how many services are logged in all. */
export const summarizeHistory = (records: readonly ServiceRecord[], today: IsoDate): LogSummary => {
  const year = today.slice(0, 4)
  const cents = records
    .filter((r) => r.performedOn.startsWith(year))
    .reduce((sum, r) => sum + (r.costCents ?? 0), 0)
  return { spentLabel: `Spent in ${year}`, spent: formatCents(cents), count: records.length }
}
