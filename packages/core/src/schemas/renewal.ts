import { z } from 'zod'
import type { RenewalKind } from '../domain/types'

export const RENEWAL_KIND_IDS = [
  'registration',
  'inspection',
  'emissions',
  'insurance',
  'other',
] as const satisfies readonly RenewalKind[]

const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))

const MONTHS = /^\d+$/

/** What the owner types on the renewal form. `everyMonths` is text, blank when it doesn't repeat. */
export const renewalDraftSchema = z.object({
  kind: z.enum(RENEWAL_KIND_IDS, { error: 'Choose what it is' }),
  title: optionalText,
  dueOn: z.iso.date({ error: 'Enter the date as YYYY-MM-DD' }),
  everyMonths: z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : MONTHS.test(s) ? Number(s) : Number.NaN))
    .pipe(
      z
        .number({ error: 'Choose how often it repeats' })
        .int()
        .min(1, 'Choose how often it repeats')
        .max(120, 'Choose how often it repeats')
        .optional(),
    ),
  notes: optionalText,
})

/** The form as typed: every field is text, `kind` included, until it is parsed. */
export type RenewalDraft = Record<keyof z.input<typeof renewalDraftSchema>, string>
export type ValidRenewalDraft = z.output<typeof renewalDraftSchema>
