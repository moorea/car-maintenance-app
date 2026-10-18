import { z } from 'zod'
import { normalizeVin, vinProblem, type VinProblem } from '../lib/vin'
import { optionalText } from './text'

const VIN_MESSAGES: Record<VinProblem, string> = {
  length: 'A VIN is 17 letters and numbers',
  characters: 'VINs use letters and numbers but never I, O or Q',
  'check-digit': "That VIN doesn't add up. Check each character against the car",
}

/** The VIN as typed, normalized and checked (including its check digit). */
export const vinSchema = z
  .string()
  .transform(normalizeVin)
  .superRefine((vin, ctx) => {
    const problem = vinProblem(vin)
    if (problem) ctx.addIssue({ code: 'custom', message: VIN_MESSAGES[problem] })
  })

const requiredText = (what: string) =>
  z.string().trim().min(1, `Enter the ${what}`).max(60, `That ${what} is too long`)

/** Matches the vehicles_nickname_check constraint in Postgres. */
export const NICKNAME_MAX = 40

/** Oldest model year with a 17-character VIN, which the shared configs require. */
export const FIRST_MODEL_YEAR = 1981

/**
 * The "add your car" details form. Numbers arrive as text from inputs. Next year's models go on
 * sale this year, so `maxYear` is usually the current year plus one.
 */
export const vehicleDetailsSchema = (maxYear: number) =>
  z.object({
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Enter the model year, like 2019')
      .transform(Number)
      .pipe(
        z
          .number()
          .min(FIRST_MODEL_YEAR, `Only cars from ${FIRST_MODEL_YEAR} on are supported`)
          .max(maxYear, `Enter a year up to ${maxYear}`),
      ),
    make: requiredText('make'),
    model: requiredText('model'),
    trim: optionalText(60),
    nickname: optionalText(NICKNAME_MAX),
    odometerMiles: z
      .string()
      .trim()
      .transform((s) => (s === '' ? undefined : /^\d+$/.test(s) ? Number(s) : Number.NaN))
      .pipe(
        z
          .number({ error: 'Enter whole miles, digits only' })
          .max(2_000_000, 'That is too many miles')
          .optional(),
      ),
  })

export type VehicleDetailsDraft = z.input<ReturnType<typeof vehicleDetailsSchema>>
