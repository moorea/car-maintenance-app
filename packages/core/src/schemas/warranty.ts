import { z } from 'zod'
import { NOTES_MAX, SHORT_TEXT_MAX, optionalText } from './text'
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

/** Whole miles, allowing the thousands commas people copy from paperwork: "36,000". */
const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
const MONTHS = /^\d+$/

/** What the owner types on the warranty form. Numbers arrive as text from inputs. */
export const warrantyDraftSchema = z
  .object({
    kind: z.enum(KINDS, { error: 'Choose what it covers' }),
    provider: optionalText(SHORT_TEXT_MAX),
    startsOn: z.iso.date({ error: 'Enter the start date as YYYY-MM-DD' }),
    // Months rather than years, so a 3-month dealer warranty is as easy to enter as a 3-year one.
    months: z
      .string()
      .trim()
      .transform((s) => (s === '' ? undefined : MONTHS.test(s) ? Number(s) : Number.NaN))
      .pipe(
        z
          .number({ error: 'Enter whole months, like 36' })
          .min(1, 'Enter whole months, like 36')
          .max(1200, 'That is longer than any warranty')
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
    policyNumber: optionalText(SHORT_TEXT_MAX),
    notes: optionalText(NOTES_MAX),
  })
  .refine((d) => d.months !== undefined || d.endMiles !== undefined, {
    path: ['months'],
    message: 'Enter how long it lasts, its mileage limit, or both',
  })

/** The form as typed: every field is text, `kind` included, until it is parsed. */
export type WarrantyDraft = Record<keyof z.input<typeof warrantyDraftSchema>, string>
export type ValidWarrantyDraft = z.output<typeof warrantyDraftSchema>
