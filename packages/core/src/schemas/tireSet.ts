import { z } from 'zod'
import { NOTES_MAX, SHORT_TEXT_MAX, optionalText } from './text'

/** Whole miles, allowing the thousands commas people copy from a dashboard: "41,250". */
const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
/**
 * A DOT code ends in four digits, the week and the year the tire was made: "2321" is week 23 of
 * 2021. The owner may type just those, or the whole code from the sidewall ("DOT U2LL LMLR 2321").
 */
const DOT_CODE = /^(?:DOT)?[A-Z0-9]*?(\d{2})(\d{2})$/

const DOT_ERROR = 'Enter the last 4 digits of the DOT code, like 2321'

/** Reads the week and year a tire was made from its DOT code; undefined if it is not one. */
export const parseDotCode = (text: string): { week: number; year: number } | undefined => {
  const match = DOT_CODE.exec(text.replace(/\s+/g, '').toUpperCase())
  if (!match) return undefined
  const week = Number(match[1])
  // Codes have had four digits since 2000; older tires had three and are long past replacing.
  return week >= 1 && week <= 53 ? { week, year: 2000 + Number(match[2]) } : undefined
}

const optionalMiles = (message: string) =>
  z
    .string()
    .trim()
    .transform((s) =>
      s === '' ? undefined : MILES.test(s) ? Number(s.replaceAll(',', '')) : Number.NaN,
    )
    .pipe(z.number({ error: message }).max(2_000_000, 'That is too many miles').optional())

/** What the owner types on the tire set form. Numbers arrive as text from inputs. */
export const tireSetDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the set a name, like All-season')
    .max(SHORT_TEXT_MAX, 'That is too long'),
  brand: optionalText(SHORT_TEXT_MAX),
  size: optionalText(SHORT_TEXT_MAX),
  dotCode: z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === '') return undefined
      const made = parseDotCode(s)
      if (!made) ctx.addIssue({ code: 'custom', message: DOT_ERROR })
      return made ?? z.NEVER
    }),
  mounted: z.boolean(),
  mountedAtMiles: optionalMiles('Enter the odometer in whole miles, like 41,250'),
  priorMiles: optionalMiles('Enter whole miles, like 8,000'),
  treadDepth: z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : /^\d+$/.test(s) ? Number(s) : Number.NaN))
    .pipe(
      z
        .number({ error: 'Enter 32nds of an inch, like 6' })
        .max(32, 'Enter 32nds of an inch, like 6')
        .optional(),
    ),
  notes: optionalText(NOTES_MAX),
})

/** The form as typed: every field is text, apart from the switch for whether it is on the car. */
export type TireSetDraft = Record<
  Exclude<keyof z.input<typeof tireSetDraftSchema>, 'mounted'>,
  string
> & { mounted: boolean }
export type ValidTireSetDraft = z.output<typeof tireSetDraftSchema>
