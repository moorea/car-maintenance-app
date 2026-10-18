import { z } from 'zod'

/**
 * Longest free text the server stores, matching the length checks in Postgres (migration
 * 20261017000041_text_limits.sql). Generous for anything typed on a phone; they stop one account
 * filling the database.
 */
export const SHORT_TEXT_MAX = 200
export const NOTES_MAX = 10_000

/** An optional text field on a form: blank is undefined, longer than `max` is refused. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'That is too long')
    .transform((s) => (s === '' ? undefined : s))
