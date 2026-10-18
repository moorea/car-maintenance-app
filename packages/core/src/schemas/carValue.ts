/** Whole dollars, or dollars and cents, with or without thousands commas or a leading $. */
const DOLLARS = /^\$?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/

/** The most a car's value can be: ten million dollars, clear of any real car and of an int column. */
export const MAX_CAR_VALUE_CENTS = 1_000_000_000

export type ParsedCarValue = { ok: true; cents: number | undefined } | { ok: false; error: string }

/**
 * What the owner typed as the car's value: cents, or undefined for an empty field, which forgets
 * the value.
 */
export const parseCarValue = (text: string): ParsedCarValue => {
  const s = text.trim()
  if (s === '') return { ok: true, cents: undefined }
  if (!DOLLARS.test(s)) return { ok: false, error: 'Enter the value in dollars, like 9,500' }
  const cents = Math.round(Number(s.replace(/[$,]/g, '')) * 100)
  if (cents <= 0) return { ok: false, error: 'Enter a value above $0' }
  if (cents > MAX_CAR_VALUE_CENTS) return { ok: false, error: 'That value looks too high' }
  return { ok: true, cents }
}

/** "9,500", or "9,500.50" when there are cents: how a saved value fills the field. */
export const formatCarValue = (cents: number): string => {
  const dollars = Math.floor(cents / 100)
  const rest = cents % 100
  const whole = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return rest === 0 ? whole : `${whole}.${String(rest).padStart(2, '0')}`
}
