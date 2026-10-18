import { daysBetween, type IsoDate } from './date'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (date: IsoDate) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month: MONTHS[month - 1] ?? '', day }
}

/** "Oct 2", with the year added when it is not `today`'s: "Mar 14, 2027". */
export const formatDay = (date: IsoDate, today: IsoDate): string => {
  const d = parts(date)
  return d.year === parts(today).year ? `${d.month} ${d.day}` : `${d.month} ${d.day}, ${d.year}`
}

/** "Sep 2025". */
export const formatMonthYear = (date: IsoDate): string => {
  const d = parts(date)
  return `${d.month} ${d.year}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Mar 14, 2027", always with the year, for documents read long after they are made. */
export const formatLongDate = (date: IsoDate): string => {
  const d = parts(date)
  return `${d.month} ${d.day}, ${d.year}`
}

/** "Oct", the month of a "2026-10" month key. */
export const formatMonth = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1] ?? ''

/** "Saturday, Oct 17", for a heading about today. */
export const formatWeekday = (date: IsoDate): string => {
  const d = parts(date)
  const weekday = WEEKDAYS[new Date(Date.UTC(d.year, MONTHS.indexOf(d.month), d.day)).getUTCDay()]
  return `${weekday}, ${d.month} ${d.day}`
}

/** "48,210 mi". Rounds to whole miles. */
export const formatMiles = (miles: number): string =>
  `${Math.round(miles).toLocaleString('en-US')} mi`

/** "$89.95". Money is integer cents. */
export const formatCents = (cents: number): string =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** How long ago `date` was, in the words a person would use: "today", "3 days ago", "2 months ago". */
export const formatAgo = (date: IsoDate, today: IsoDate): string => {
  const days = daysBetween(date, today)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 730) return `${Math.round(days / 30.44)} months ago`
  return `${Math.round(days / 365.25)} years ago`
}
