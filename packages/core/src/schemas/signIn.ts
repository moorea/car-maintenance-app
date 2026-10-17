import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter an email address like you@example.com' }))

/** Supabase codes are 6 digits by default; projects can configure up to 10. */
export const codeSchema = z
  .string()
  .transform((s) => s.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6,10}$/, 'Enter the code from the email, digits only'))
