/** Calendar dates are ISO `YYYY-MM-DD` strings, handled in UTC so time zones never shift a day. */
export type IsoDate = string

const MS_PER_DAY = 86_400_000

const toUtc = (date: IsoDate): number => {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ISO date: ${date}`)
  return ms
}

const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10)

export const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY)

export const addDays = (date: IsoDate, days: number): IsoDate =>
  fromUtc(toUtc(date) + Math.round(days) * MS_PER_DAY)

/** Adds calendar months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28). */
export const addMonths = (date: IsoDate, months: number): IsoDate => {
  const d = new Date(toUtc(date))
  const targetMonth = d.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
  return fromUtc(Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), lastDay)))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 14", with the year only when it is not `today`'s: "Feb 2, 2027". */
export const formatShortDate = (date: IsoDate, today: IsoDate): string => {
  const d = new Date(toUtc(date))
  const monthDay = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return date.slice(0, 4) === today.slice(0, 4) ? monthDay : `${monthDay}, ${d.getUTCFullYear()}`
}

const ISO_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/
const US_INPUT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * A date as someone types or pastes it: ISO "2025-03-14", or the US "3/14/2025" and "03/14/2025".
 * Returns the ISO date, or undefined when the text is not a real calendar day (Feb 30 included).
 */
export const parseDateInput = (input: string): IsoDate | undefined => {
  const text = input.trim()
  const iso = ISO_INPUT.exec(text)
  const us = US_INPUT.exec(text)
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : undefined
  if (!parts) return undefined
  const [year, month, day] = parts.map(Number) as [number, number, number]
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? date
    : undefined
}

/**
 * The calendar day `date` falls on in the device's time zone. Native date pickers report the day
 * the person chose as a moment in their own time zone, which can sit in a different UTC day.
 */
export const isoFromLocalDate = (date: Date): IsoDate =>
  fromUtc(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

/** Noon on `date` in the device's time zone: the same local day whatever the offset or DST. */
export const localNoonOf = (date: IsoDate): Date => {
  const d = new Date(toUtc(date))
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)
}

/** Midnight UTC on `date`, the moment Material's date picker uses for a day. */
export const utcMidnightOf = (date: IsoDate): Date => new Date(toUtc(date))

/** The UTC calendar day of `date`, for a picker that reports days as midnight UTC. */
export const isoFromUtcDate = (date: Date): IsoDate => fromUtc(date.getTime())
