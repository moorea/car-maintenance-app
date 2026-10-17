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
