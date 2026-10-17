import type { QuoteLine } from '../domain/types'
import { formatCents } from '../lib/format'
import { MAX_QUOTE_LINE_LENGTH, MAX_QUOTE_LINES } from '../schemas/quote'

// A dollar amount, such as "$1,249.95", "$89" or "89.95". The last one on a line is its price.
const PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?|\b(\d+)\.(\d{2})\b/g

// Lines that are not a job: totals, tax and fees the owner cannot check against a schedule.
const NOT_A_JOB =
  /^(sub ?total|total|grand total|estimate total|(sales )?tax|shop supplies|environmental fee|labor total|parts total|amount due|balance)\b/i

const toCents = (match: RegExpExecArray): number => {
  const dollars = (match[1] ?? match[3] ?? '0').replace(/,/g, '')
  const cents = match[2] ?? match[4] ?? '00'
  return Number(dollars) * 100 + Number(cents)
}

/** Splits a typed or pasted quote into its lines, each with its price when the line shows one. */
export const parseQuoteText = (text: string): QuoteLine[] =>
  text
    .split(/\r?\n/)
    .flatMap((raw): QuoteLine[] => {
      const prices = [...raw.matchAll(PRICE)]
      const last = prices.at(-1)
      const words = raw
        .replace(PRICE, ' ')
        // Bullets, numbering and the dashes or dots that lead to a price.
        .replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s+/, '')
        .replace(/[\s.:@=–—-]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (words === '' || NOT_A_JOB.test(words)) return []
      return [
        {
          text: words.slice(0, MAX_QUOTE_LINE_LENGTH),
          ...(last ? { priceCents: toCents(last) } : {}),
        },
      ]
    })
    .slice(0, MAX_QUOTE_LINES)

/** Writes lines back as text the owner can edit, one per line: "Cabin air filter  $79.95". */
export const formatQuoteText = (lines: readonly QuoteLine[]): string =>
  lines
    .map((l) => (l.priceCents === undefined ? l.text : `${l.text}  ${formatCents(l.priceCents)}`))
    .join('\n')
