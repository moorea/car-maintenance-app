import { z } from 'zod'
import type { EnergyKind } from '../domain/types'

const ENERGIES = ['fuel', 'electric'] as const satisfies readonly EnergyKind[]

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))

/** Whole miles, allowing the thousands commas a pump receipt or a dashboard shows: "41,250". */
const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
/** Up to three decimals, as pumps show gallons: "12.481". */
const QUANTITY = /^\d+(\.\d{1,3})?$|^\.\d{1,3}$/
const DOLLARS = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/

const number = (pattern: RegExp, s: string) =>
  pattern.test(s) ? Number(s.replaceAll(',', '')) : Number.NaN

/** What the owner types on the fill-up form. Numbers arrive as text from inputs. */
export const fillUpDraftSchema = z.object({
  filledOn: z.iso.date({ error: 'Enter the date as YYYY-MM-DD' }),
  odometerMiles: z
    .string()
    .trim()
    .transform((s) => (s === '' ? Number.NaN : number(MILES, s)))
    .pipe(
      z
        .number({ error: 'Enter the odometer in whole miles, like 41,250' })
        .max(2_000_000, 'That is too many miles'),
    ),
  energy: z.enum(ENERGIES, { error: 'Choose fuel or charge' }),
  quantity: z
    .string()
    .trim()
    .transform((s) => (s === '' ? Number.NaN : number(QUANTITY, s)))
    .pipe(
      z
        .number({ error: 'Enter how much went in, like 12.4' })
        .positive('Enter how much went in, like 12.4')
        .max(1_000, 'That is more than any tank or battery holds'),
    ),
  cost: z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : number(DOLLARS, s.startsWith('$') ? s.slice(1) : s)))
    .pipe(
      z
        .number({ error: 'Enter the total paid, like 48.20' })
        .max(10_000, 'That total looks too high')
        .optional(),
    ),
  full: z.boolean(),
  missedPrevious: z.boolean(),
  station: optionalText,
  notes: optionalText,
})

/** The form as typed: every field is text, `energy` included, apart from the two switches. */
export type FillUpDraft = Record<
  Exclude<keyof z.input<typeof fillUpDraftSchema>, 'full' | 'missedPrevious'>,
  string
> & { full: boolean; missedPrevious: boolean }
export type ValidFillUpDraft = z.output<typeof fillUpDraftSchema>
