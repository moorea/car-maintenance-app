import { describe, expect, it } from 'vitest'
import { MAX_QUOTE_LINES } from './quote'
import { parsePriceEstimate, priceEstimateRequestSchema } from './priceEstimate'

const request = {
  car: { year: 2019, make: 'Honda', model: 'CR-V' },
  zip: '94110',
  lines: [{ index: 0, text: 'Oil change' }],
}

describe('price estimate requests', () => {
  it('accepts a car, a five-digit ZIP and the quote lines', () => {
    expect(priceEstimateRequestSchema.safeParse(request).success).toBe(true)
  })

  it('rejects a ZIP that is not five digits', () => {
    for (const zip of ['9411', '94110-1234', 'abcde', ''])
      expect(priceEstimateRequestSchema.safeParse({ ...request, zip }).success).toBe(false)
  })

  it('rejects no lines, too many, or a blank one', () => {
    const many = Array.from({ length: MAX_QUOTE_LINES + 1 }, (_, index) => ({ index, text: 'x' }))
    for (const lines of [[], many, [{ index: 0, text: '  ' }]])
      expect(priceEstimateRequestSchema.safeParse({ ...request, lines }).success).toBe(false)
  })
})

describe('price estimates', () => {
  const job = {
    index: 0,
    laborHours: { low: 0.5, high: 1 },
    partsCents: { low: 2_000, high: 4_000 },
  }

  it('reads an estimate', () => {
    const estimate = { laborRateCents: { low: 12_000, high: 18_000 }, lines: [job] }
    expect(parsePriceEstimate(estimate)).toEqual(estimate)
  })

  it('puts a reversed range in order', () => {
    expect(
      parsePriceEstimate({ laborRateCents: { low: 18_000, high: 12_000 }, lines: [] })
        ?.laborRateCents,
    ).toEqual({ low: 12_000, high: 18_000 })
  })

  it('rejects a free labor rate, fractional cents, and implausible hours or parts', () => {
    const rate = { low: 12_000, high: 18_000 }
    expect(parsePriceEstimate({ laborRateCents: { low: 0, high: 0 }, lines: [] })).toBeUndefined()
    expect(
      parsePriceEstimate({ laborRateCents: { low: 120.5, high: 180 }, lines: [] }),
    ).toBeUndefined()
    const long = { ...job, laborHours: { low: 1, high: 61 } }
    expect(parsePriceEstimate({ laborRateCents: rate, lines: [long] })).toBeUndefined()
    const dear = { ...job, partsCents: { low: 1, high: 2_000_001 } }
    expect(parsePriceEstimate({ laborRateCents: rate, lines: [dear] })).toBeUndefined()
    expect(parsePriceEstimate('nope')).toBeUndefined()
  })
})
