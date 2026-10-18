import { z } from 'zod'

/** Whole miles, allowing thousands commas: "5,000". */
const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
const MONTHS = /^\d+$/

/** Longest name for an item of the owner's own, matching the check in Postgres. */
export const CUSTOM_TASK_MAX = 100

/** What the owner types on the schedule item form. Numbers arrive as text from inputs. */
export const customItemDraftSchema = z
  .object({
    task: z
      .string()
      .trim()
      .min(1, 'Name the item, like Cabin air filter')
      .max(CUSTOM_TASK_MAX, `Keep the name under ${CUSTOM_TASK_MAX} characters`),
    intervalMiles: z
      .string()
      .trim()
      .transform((s) =>
        s === '' ? undefined : MILES.test(s) ? Number(s.replaceAll(',', '')) : Number.NaN,
      )
      .pipe(
        z
          .number({ error: 'Enter whole miles, like 5,000' })
          .min(100, 'Enter at least 100 miles')
          .max(500_000, 'That is more miles than a car lasts')
          .optional(),
      ),
    intervalMonths: z
      .string()
      .trim()
      .transform((s) => (s === '' ? undefined : MONTHS.test(s) ? Number(s) : Number.NaN))
      .pipe(
        z
          .number({ error: 'Enter whole months, like 12' })
          .min(1, 'Enter whole months, like 12')
          .max(240, 'Enter 240 months or fewer')
          .optional(),
      ),
  })
  .refine((d) => d.intervalMiles !== undefined || d.intervalMonths !== undefined, {
    path: ['intervalMiles'],
    message: 'Enter how often it is due in miles, months, or both',
  })

/** The form as typed: every field is text until it is parsed. */
export type CustomItemDraft = Record<keyof z.input<typeof customItemDraftSchema>, string>
export type ValidCustomItemDraft = z.output<typeof customItemDraftSchema>
