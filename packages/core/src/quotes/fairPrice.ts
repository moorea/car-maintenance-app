import type { PriceEstimate, PriceEstimateRequest, Span, Vehicle } from '../domain/types'
import { formatCents } from '../lib/format'
import type { QuoteCheck } from './checkQuote'

/** A quoted price more than this much over the usual range's top is well above it. */
export const WELL_ABOVE = 1.25

/** Ranges are rounded out to whole $5, since the estimate is no finer than that. */
const ROUND_CENTS = 500

/**
 * How a quoted price compares with the usual range for the job:
 * - `below`: under the range's bottom.
 * - `within`: inside the range.
 * - `above`: over the top, by up to a quarter.
 * - `well-above`: more than a quarter over the top.
 */
export type PriceFit = 'below' | 'within' | 'above' | 'well-above'

const FIT_LABELS: Record<PriceFit, string> = {
  below: 'Below the usual range',
  within: 'In the usual range',
  above: 'A little above the usual range',
  'well-above': 'Well above the usual range',
}

export interface PricedLine {
  index: number
  /** The usual cost of the job, in cents. */
  rangeCents: Span
  /** "Usually $80–$120". */
  range: string
  /** "1.0–1.5 h labor, $35–$60 parts". */
  breakdown: string
  /** Absent when the shop gave no price for the line. */
  fit?: PriceFit | undefined
  /** "Well above the usual range". */
  fitLabel?: string | undefined
}

export interface FairPrices {
  /** By quote line index; a line the estimate could not price is absent. */
  lines: PricedLine[]
  /**
   * "4 jobs quoted at $1,048.90 usually cost $490–$1,105", over the lines with both an estimate
   * and a price.
   */
  headline?: string | undefined
  /** "2 lines are priced above the usual range, by $185 in all." */
  summary?: string | undefined
  /** "Shop labor around 94110 is usually $120–$190 an hour." */
  laborRate: string
}

const roundDown = (cents: number) => Math.floor(cents / ROUND_CENTS) * ROUND_CENTS
const roundUp = (cents: number) => Math.ceil(cents / ROUND_CENTS) * ROUND_CENTS

/** Whole dollars when the amount is, as estimates are: "$120", "$1,450". */
const dollars = (cents: number) =>
  cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-US')}` : formatCents(cents)

const spanText = (s: Span) =>
  s.low === s.high ? dollars(s.low) : `${dollars(s.low)}–${dollars(s.high)}`

const hours = (h: number) => (Math.round(h * 10) / 10).toFixed(1)

/** Labor from the cheapest hours at the cheapest rate to the most at the dearest, plus parts. */
export const jobRange = (line: PriceEstimate['lines'][number], rate: Span): Span => ({
  // Hours are fractional, so their product is put back in whole cents before rounding out.
  low: roundDown(Math.round(line.laborHours.low * rate.low) + line.partsCents.low),
  high: roundUp(Math.round(line.laborHours.high * rate.high) + line.partsCents.high),
})

export const priceFit = (priceCents: number, range: Span): PriceFit => {
  if (priceCents < range.low) return 'below'
  if (priceCents <= range.high) return 'within'
  return priceCents <= range.high * WELL_ABOVE ? 'above' : 'well-above'
}

/**
 * What to ask the estimator about a checked quote: every line except recalls, whose fix is free
 * whatever the shop's list says.
 */
export const estimateRequestFor = (
  vehicle: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim' | 'engine'>,
  zip: string,
  result: QuoteCheck,
): PriceEstimateRequest | undefined => {
  const lines = result.lines
    .filter((l) => l.verdict !== 'recall')
    .map((l) => ({ index: l.index, text: l.text }))
  if (lines.length === 0) return undefined
  return {
    car: {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      ...(vehicle.trim && { trim: vehicle.trim }),
      ...(vehicle.engine && { engine: vehicle.engine }),
    },
    zip,
    lines,
  }
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/**
 * Sets each priced line of a checked quote against the usual range the estimate gives, and sums
 * up how far over the range the quote is. The estimate is a model's, so the words say "usual
 * range" and the screen labels it as an estimate; the comparison itself is plain arithmetic.
 */
export const comparePrices = (
  result: QuoteCheck,
  estimate: PriceEstimate,
  zip: string,
): FairPrices => {
  const rate = estimate.laborRateCents
  const byIndex = new Map(estimate.lines.map((l) => [l.index, l]))
  const lines = result.lines.flatMap((line): PricedLine[] => {
    const job = byIndex.get(line.index)
    if (!job || line.verdict === 'recall') return []
    const rangeCents = jobRange(job, rate)
    const fit = line.priceCents === undefined ? undefined : priceFit(line.priceCents, rangeCents)
    const labor =
      job.laborHours.high === 0
        ? undefined
        : job.laborHours.low === job.laborHours.high
          ? `${hours(job.laborHours.low)} h labor`
          : `${hours(job.laborHours.low)}–${hours(job.laborHours.high)} h labor`
    const parts = job.partsCents.high === 0 ? undefined : `${spanText(job.partsCents)} parts`
    return [
      {
        index: line.index,
        rangeCents,
        range: `Usually ${spanText(rangeCents)}`,
        breakdown: [labor, parts].filter(Boolean).join(', '),
        fit,
        fitLabel: fit && FIT_LABELS[fit],
      },
    ]
  })

  const quoted = result.lines.flatMap((l) => {
    const priced = lines.find((p) => p.index === l.index)
    return priced && l.priceCents !== undefined ? [{ price: l.priceCents, priced }] : []
  })
  const total = quoted.reduce(
    (sum, q) => ({
      low: sum.low + q.priced.rangeCents.low,
      high: sum.high + q.priced.rangeCents.high,
    }),
    { low: 0, high: 0 },
  )
  const over = quoted.filter((q) => q.price > q.priced.rangeCents.high)
  const overCents = over.reduce((sum, q) => sum + q.price - q.priced.rangeCents.high, 0)

  return {
    lines,
    headline:
      quoted.length === 0
        ? undefined
        : `${quoted.length === 1 ? '1 job' : `${quoted.length} jobs`} quoted at ${formatCents(
            quoted.reduce((sum, q) => sum + q.price, 0),
          )} usually ${quoted.length === 1 ? 'costs' : 'cost'} ${spanText(total)}`,
    summary:
      quoted.length === 0
        ? undefined
        : over.length === 0
          ? 'Every priced line is within or below the usual range.'
          : `${plural(over.length, 'line')} ${over.length === 1 ? 'is' : 'are'} priced above the usual range, by ${dollars(Math.ceil(overCents / 100) * 100)} in all.`,
    laborRate: `Shop labor around ${zip} is usually ${spanText({ low: roundDown(rate.low), high: roundUp(rate.high) })} an hour.`,
  }
}
