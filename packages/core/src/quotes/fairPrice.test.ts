import { describe, expect, it } from 'vitest'
import type { PriceEstimate } from '../domain/types'
import type { CheckedLine, QuoteCheck } from './checkQuote'
import { comparePrices, estimateRequestFor, jobRange, priceFit } from './fairPrice'

const line = (index: number, text: string, fields: Partial<CheckedLine> = {}): CheckedLine => ({
  index,
  text,
  verdict: 'due',
  label: 'Due now',
  detail: '',
  questionable: false,
  bulletins: [],
  ...fields,
})

const check = (lines: CheckedLine[]): QuoteCheck => ({
  lines,
  headline: '',
  recalls: [],
  alsoDue: [],
  coveredItemIds: [],
  generalSchedule: false,
})

const rate = { low: 12_000, high: 18_000 }
// Oil change: $48–$72 labor + $35–$60 parts → $80–$135.
const oil = {
  index: 0,
  laborHours: { low: 0.4, high: 0.4 },
  partsCents: { low: 3_500, high: 6_000 },
}
// Brake pads: $180–$360 labor + $60–$150 parts → $240–$510.
const pads = {
  index: 1,
  laborHours: { low: 1.5, high: 2 },
  partsCents: { low: 6_000, high: 15_000 },
}
const estimate: PriceEstimate = { laborRateCents: rate, lines: [oil, pads] }

const car = { year: 2019, make: 'Honda', model: 'CR-V' }

describe('fair price ranges', () => {
  it('spans the fewest hours at the lowest rate to the most at the highest, plus parts', () => {
    expect(jobRange(pads, rate)).toEqual({
      low: 24_000,
      high: 51_000,
    })
  })

  it('rounds a range out to whole $5', () => {
    const job = {
      index: 0,
      laborHours: { low: 0.3, high: 0.7 },
      partsCents: { low: 1_234, high: 1_234 },
    }
    expect(jobRange(job, rate)).toEqual({ low: 4_500, high: 14_000 })
  })

  it('says how a price sits against the range, well above past a quarter over the top', () => {
    const range = { low: 10_000, high: 20_000 }
    expect(priceFit(9_999, range)).toBe('below')
    expect(priceFit(10_000, range)).toBe('within')
    expect(priceFit(20_000, range)).toBe('within')
    expect(priceFit(25_000, range)).toBe('above')
    expect(priceFit(25_001, range)).toBe('well-above')
  })

  it('compares each priced line and sums how far over the range the quote is', () => {
    const result = check([
      line(0, 'Synthetic oil & filter change', { priceCents: 8_995 }),
      line(1, 'Front brake pads', { priceCents: 65_000, verdict: 'condition' }),
    ])
    expect(comparePrices(result, estimate, '94110')).toEqual({
      lines: [
        {
          index: 0,
          rangeCents: { low: 8_000, high: 13_500 },
          range: 'Usually $80–$135',
          breakdown: '0.4 h labor, $35–$60 parts',
          fit: 'within',
          fitLabel: 'In the usual range',
        },
        {
          index: 1,
          rangeCents: { low: 24_000, high: 51_000 },
          range: 'Usually $240–$510',
          breakdown: '1.5–2.0 h labor, $60–$150 parts',
          fit: 'well-above',
          fitLabel: 'Well above the usual range',
        },
      ],
      headline: '2 jobs quoted at $739.95 usually cost $320–$645',
      summary: '1 line is priced above the usual range, by $140 in all.',
      laborRate: 'Shop labor around 94110 is usually $120–$180 an hour.',
    })
  })

  it('says so when nothing is priced above the range', () => {
    const result = check([line(0, 'Oil change', { priceCents: 7_000 })])
    const fair = comparePrices(result, estimate, '94110')
    expect(fair.headline).toBe('1 job quoted at $70.00 usually costs $80–$135')
    expect(fair.summary).toBe('Every priced line is within or below the usual range.')
    expect(fair.lines[0]?.fit).toBe('below')
  })

  it('gives a range without a fit for a line the shop did not price', () => {
    const fair = comparePrices(check([line(0, 'Oil change')]), estimate, '94110')
    expect(fair.lines[0]).toMatchObject({ range: 'Usually $80–$135', fit: undefined })
    expect(fair.headline).toBeUndefined()
    expect(fair.summary).toBeUndefined()
  })

  it('leaves out lines the estimate could not price, and recalls, which are free', () => {
    const result = check([
      line(0, 'Airbag inflator', { verdict: 'recall', priceCents: 0 }),
      line(2, 'Mystery package', { priceCents: 9_900, verdict: 'unknown' }),
    ])
    expect(comparePrices(result, estimate, '94110').lines).toEqual([])
  })

  it('shows only the parts when a job needs no labor, and only labor when it needs no parts', () => {
    const result = check([line(0, 'Wiper blades'), line(1, 'Diagnose noise')])
    const fair = comparePrices(
      result,
      {
        laborRateCents: rate,
        lines: [
          { index: 0, laborHours: { low: 0, high: 0 }, partsCents: { low: 2_000, high: 5_000 } },
          { index: 1, laborHours: { low: 1, high: 1 }, partsCents: { low: 0, high: 0 } },
        ],
      },
      '94110',
    )
    expect(fair.lines.map((l) => l.breakdown)).toEqual(['$20–$50 parts', '1.0 h labor'])
  })

  it('asks about every line but recalls, with the car and ZIP and without the prices', () => {
    const result = check([
      line(0, 'Oil change', { priceCents: 8_995 }),
      line(1, 'Airbag inflator', { verdict: 'recall' }),
    ])
    expect(estimateRequestFor({ ...car, trim: 'EX', engine: '' }, '94110', result)).toEqual({
      car: { year: 2019, make: 'Honda', model: 'CR-V', trim: 'EX' },
      zip: '94110',
      lines: [{ index: 0, text: 'Oil change' }],
    })
  })

  it('has nothing to ask when every line is a recall', () => {
    const result = check([line(0, 'Airbag inflator', { verdict: 'recall' })])
    expect(estimateRequestFor(car, '94110', result)).toBeUndefined()
  })
})
