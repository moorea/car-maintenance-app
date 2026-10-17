import { describe, expect, it } from 'vitest'
import {
  MAX_QUOTE_LINE_LENGTH,
  MAX_QUOTE_LINES,
  quoteLinesSchema,
  readQuoteRequestSchema,
} from './quote'

describe('quote schemas', () => {
  it('accepts a supported photo and refuses anything else', () => {
    const photo = { mediaType: 'image/png', base64: 'iVBORw0KGgo=' }
    expect(readQuoteRequestSchema.safeParse({ photo }).success).toBe(true)
    expect(
      readQuoteRequestSchema.safeParse({ photo: { ...photo, mediaType: 'image/gif' } }).success,
    ).toBe(false)
    expect(
      readQuoteRequestSchema.safeParse({ photo: { ...photo, base64: 'data:x' } }).success,
    ).toBe(false)
    expect(readQuoteRequestSchema.safeParse({}).success).toBe(false)
  })

  it('trims lines, drops empty ones, keeps prices and caps length and count', () => {
    const many = Array.from({ length: MAX_QUOTE_LINES + 5 }, (_, i) => ({ text: `Job ${i}` }))
    expect(quoteLinesSchema.parse(many)).toHaveLength(MAX_QUOTE_LINES)
    expect(
      quoteLinesSchema.parse([
        { text: '  Oil change ', priceCents: 8_995 },
        { text: 'x'.repeat(MAX_QUOTE_LINE_LENGTH + 10) },
      ]),
    ).toEqual([
      { text: 'Oil change', priceCents: 8_995 },
      { text: 'x'.repeat(MAX_QUOTE_LINE_LENGTH) },
    ])
    expect(quoteLinesSchema.safeParse([{ text: '   ' }]).success).toBe(false)
    expect(quoteLinesSchema.safeParse([{ text: 'Oil', priceCents: -1 }]).success).toBe(false)
  })
})
