import { z } from 'zod'
import { NOTES_MAX, SHORT_TEXT_MAX, optionalText } from './text'

const isoDate = z.iso.date({
  error: (issue) =>
    issue.input === '' ? 'Add the date it was done, as YYYY-MM-DD' : 'Enter a date as YYYY-MM-DD',
})
/** Plain digits only (no "1e3", "0x10" or "1,000"), then range-checked as a number. */
const optionalNumber = (pattern: RegExp, check: z.ZodNumber) =>
  z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : pattern.test(s) ? Number(s) : Number.NaN))
    .pipe(check.optional())

const WHOLE = /^\d+$/
const DOLLARS = /^\d+(\.\d{1,2})?$/

/** What the owner types on the "log service" form. Numbers arrive as text from inputs. */
export const serviceRecordDraftSchema = z.object({
  performedOn: isoDate,
  itemId: optionalText(SHORT_TEXT_MAX),
  odometerMiles: optionalNumber(
    WHOLE,
    z.number({ error: 'Enter whole miles, digits only' }).max(2_000_000, 'That is too many miles'),
  ),
  cost: optionalNumber(
    DOLLARS,
    z.number({ error: 'Enter an amount like 89.99' }).max(100_000, 'That cost looks too high'),
  ),
  shop: optionalText(SHORT_TEXT_MAX),
  notes: optionalText(NOTES_MAX),
})

export type ServiceRecordDraft = z.input<typeof serviceRecordDraftSchema>
export type ValidServiceRecordDraft = z.output<typeof serviceRecordDraftSchema>
