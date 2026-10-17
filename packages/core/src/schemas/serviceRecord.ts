import { z } from 'zod'

const isoDate = z.iso.date({ error: 'Enter a date as YYYY-MM-DD' })
const optionalText = z
  .string()
  .trim()
  .transform((s) => (s === '' ? undefined : s))
const optionalNumber = (check: z.ZodNumber) =>
  z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : Number(s)))
    .pipe(check.optional())

/** What the owner types on the "log service" form. Numbers arrive as text from inputs. */
export const serviceRecordDraftSchema = z.object({
  performedOn: isoDate,
  itemId: optionalText,
  odometerMiles: optionalNumber(
    z
      .number({ error: 'Enter a number' })
      .int('Whole miles only')
      .nonnegative('Miles cannot be negative'),
  ),
  cost: optionalNumber(
    z.number({ error: 'Enter a number' }).nonnegative('Cost cannot be negative'),
  ),
  shop: optionalText,
  notes: optionalText,
})

export type ServiceRecordDraft = z.input<typeof serviceRecordDraftSchema>
export type ValidServiceRecordDraft = z.output<typeof serviceRecordDraftSchema>
