import { z } from 'zod'

/** No car's odometer reads more; a bigger number is a typo or a misread. */
export const MAX_ODOMETER_MILES = 2_000_000

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
      .pipe(z.number().max(MAX_ODOMETER_MILES, 'That is too many miles')),
  )

/** What the odometer reader found, as the server returns it: null when it could not read one. */
export const odometerReadSchema = z.object({
  miles: z.number().int().nonnegative().max(MAX_ODOMETER_MILES).nullable(),
})
