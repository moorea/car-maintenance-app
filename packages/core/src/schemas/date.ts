import { z } from 'zod'
import { parseDateInput } from '../lib/date'

/** What a date field says when it was typed in a form it cannot read. */
export const DATE_FORMAT_ERROR = 'Enter a date like 3/14/2025'

/** What a date field says when the day has not come yet, where only past days make sense. */
export const FUTURE_DATE_ERROR = "That's in the future"

/**
 * A required date on a form. The picker fills it with an ISO date; text typed or pasted as
 * "3/14/2025" is read too. Parses to the ISO date.
 */
export const dateInput = (empty: string) =>
  z.string().transform((s, ctx) => {
    const date = parseDateInput(s)
    if (date !== undefined) return date
    ctx.addIssue({ code: 'custom', message: s.trim() === '' ? empty : DATE_FORMAT_ERROR })
    return z.NEVER
  })
