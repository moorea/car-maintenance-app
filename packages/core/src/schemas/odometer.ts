import { z } from 'zod'

/** A new odometer reading as typed: whole miles. Numbers arrive as text from inputs. */
export const odometerReadingSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/,/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d+$/, 'Enter whole miles, digits only')
      .transform(Number)
      .pipe(z.number().max(2_000_000, 'That is too many miles')),
  )
