import { z } from 'zod'
import type { WarrantyKind } from '../domain/types'

const KINDS = [
  'basic',
  'powertrain',
  'corrosion',
  'emissions',
  'hybrid-battery',
  'extended',
  'other',
] as const satisfies readonly WarrantyKind[]

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))

/** Whole miles, allowing the thousands commas people copy from paperwork: "36,000". */
const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
/** Years with at most one decimal, such as "3" or "2.5". */
const YEARS = /^\d+(\.\d)?$/

/** What the owner types on the warranty form. Numbers arrive as text from inputs. */
export const warrantyDraftSchema = z
  .object({
    kind: z.enum(KINDS, { error: 'Choose what it covers' }),
    provider: optionalText,
    startsOn: z.iso.date({ error: 'Enter the start date as YYYY-MM-DD' }),
    years: z
      .string()
      .trim()
      .transform((s) => (s === '' ? undefined : YEARS.test(s) ? Number(s) : Number.NaN))
      .pipe(
        z
          .number({ error: 'Enter years like 3 or 2.5' })
          .positive('Enter years like 3 or 2.5')
          .max(100, 'That is longer than any warranty')
          .optional(),
      ),
    endMiles: z
      .string()
      .trim()
      .transform((s) =>
        s === '' ? undefined : MILES.test(s) ? Number(s.replaceAll(',', '')) : Number.NaN,
      )
      .pipe(
        z
          .number({ error: 'Enter whole miles, like 36,000' })
          .positive('Enter whole miles, like 36,000')
          .max(2_000_000, 'That is too many miles')
          .optional(),
      ),
    policyNumber: optionalText,
    notes: optionalText,
  })
  .refine((d) => d.years !== undefined || d.endMiles !== undefined, {
    path: ['years'],
    message: 'Enter how long it lasts, its mileage limit, or both',
  })

/** The form as typed: every field is text, `kind` included, until it is parsed. */
export type WarrantyDraft = Record<keyof z.input<typeof warrantyDraftSchema>, string>
export type ValidWarrantyDraft = z.output<typeof warrantyDraftSchema>
