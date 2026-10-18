import { z } from 'zod'
import { NOTES_MAX, SHORT_TEXT_MAX, optionalText } from './text'

const isoDate = z.iso.date({
  error: (issue) =>
    issue.input === '' ? 'Add the date it was done, as YYYY-MM-DD' : 'Enter a date as YYYY-MM-DD',
})
/**
 * Plain digits with optional thousands commas, as a receipt prints them ("1,234.50"), and an
 * optional "$" on a cost; no "1e3" or "0x10". Then range-checked as a number.
 */
const optionalNumber = (pattern: RegExp, check: z.ZodNumber) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(/^\$\s*/, ''))
    .transform((s) =>
      s === '' ? undefined : pattern.test(s) ? Number(s.replaceAll(',', '')) : Number.NaN,
    )
    .pipe(check.optional())

const WHOLE = /^\d{1,3}(,\d{3})*$|^\d+$/
const DOLLARS = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/

/** What the owner types on the "log service" form. Numbers arrive as text from inputs. */
export const serviceRecordDraftSchema = z.object({
  performedOn: isoDate,
  itemId: optionalText(SHORT_TEXT_MAX),
  odometerMiles: optionalNumber(
    WHOLE,
    z.number({ error: 'Enter whole miles, like 41,250' }).max(2_000_000, 'That is too many miles'),
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
