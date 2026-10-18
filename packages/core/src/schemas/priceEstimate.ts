import { z } from 'zod'
import type { PriceEstimate, Span } from '../domain/types'
import { MAX_QUOTE_LINES, MAX_QUOTE_LINE_LENGTH } from './quote'

/** A five-digit US ZIP code. */
export const ZIP_PATTERN = /^\d{5}$/

/** Higher than any US shop charges an hour; a rate above it is a misread. */
export const MAX_LABOR_RATE_CENTS = 100_000

/** More than any single job takes; a longer estimate is a misread. */
export const MAX_LABOR_HOURS = 60

/** More than any single job's parts cost; a dearer estimate is a misread. */
export const MAX_PARTS_CENTS = 2_000_000

const text = z.string().trim().min(1).max(100)

/** A request to estimate a quote's prices. The server checks it before spending anything. */
export const priceEstimateRequestSchema = z.object({
  car: z.object({
    year: z.number().int().min(1900).max(2100),
    make: text,
    model: text,
    trim: text.optional(),
    engine: text.optional(),
  }),
  zip: z.string().regex(ZIP_PATTERN),
  lines: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        text: z.string().trim().min(1).max(MAX_QUOTE_LINE_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_QUOTE_LINES),
})

/** A span within [0, max], put in order if it came back reversed. */
const span = (max: number, int: boolean) =>
  z
    .object({ low: z.number().nonnegative().max(max), high: z.number().nonnegative().max(max) })
    .refine((s) => !int || (Number.isInteger(s.low) && Number.isInteger(s.high)))
    .transform((s): Span =>
      s.low <= s.high ? { low: s.low, high: s.high } : { low: s.high, high: s.low },
    )

/** A price estimate, as the server returns it. */
export const priceEstimateSchema = z.object({
  laborRateCents: span(MAX_LABOR_RATE_CENTS, true).refine((s) => s.low > 0),
  lines: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      laborHours: span(MAX_LABOR_HOURS, false),
      partsCents: span(MAX_PARTS_CENTS, true),
    }),
  ),
})

/** The estimate, or undefined when the value is not one. */
export const parsePriceEstimate = (value: unknown): PriceEstimate | undefined => {
  const parsed = priceEstimateSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
