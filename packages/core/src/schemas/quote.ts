import { z } from 'zod'
import type { QuoteLine } from '../domain/types'

/**
 * The largest photo the server accepts, as base64 characters. Claude takes images up to 5 MB, which
 * is about 6.7 million base64 characters; the phone sends a compressed JPEG well under that.
 */
export const MAX_QUOTE_PHOTO_BASE64 = 6_700_000

/** Quotes longer than this are cut; a shop's list is rarely more than a page. */
export const MAX_QUOTE_LINES = 40

/** Longer lines are cut; a line names one job. */
export const MAX_QUOTE_LINE_LENGTH = 200

/** A photo sent to the quote reader. The server checks it before spending anything. */
export const readQuoteRequestSchema = z.object({
  photo: z.object({
    mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    base64: z
      .string()
      .min(1)
      .max(MAX_QUOTE_PHOTO_BASE64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
})

export type ReadQuoteRequestBody = z.infer<typeof readQuoteRequestSchema>

/** The lines the quote reader found, as the server returns them. */
export const quoteLinesSchema = z
  .array(
    z.object({
      text: z
        .string()
        .trim()
        .min(1)
        .transform((t) => t.slice(0, MAX_QUOTE_LINE_LENGTH)),
      priceCents: z.number().int().nonnegative().optional(),
    }),
  )
  .transform((lines): QuoteLine[] =>
    lines
      .slice(0, MAX_QUOTE_LINES)
      .map((l) =>
        l.priceCents === undefined ? { text: l.text } : { text: l.text, priceCents: l.priceCents },
      ),
  )
