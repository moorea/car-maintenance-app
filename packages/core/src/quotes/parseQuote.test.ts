import { describe, expect, it } from 'vitest'
import { formatQuoteText, parseQuoteText } from './parseQuote'

describe('parsing a typed quote', () => {
  it('reads one job per line with the last dollar amount as its price', () => {
    expect(
      parseQuoteText(
        [
          '1. Engine oil & filter (0W-20) ...... $89.95',
          '- Cabin air filter  $79',
          '• Front brake pads & rotors: 2 hrs @ $160 = $1,249.50',
          'Fuel injection service 189.00',
          'Inspect wipers',
        ].join('\n'),
      ),
    ).toEqual([
      { text: 'Engine oil & filter (0W-20)', priceCents: 8_995 },
      { text: 'Cabin air filter', priceCents: 7_900 },
      { text: 'Front brake pads & rotors: 2 hrs', priceCents: 124_950 },
      { text: 'Fuel injection service', priceCents: 18_900 },
      { text: 'Inspect wipers' },
    ])
  })

  it('leaves out blank lines, totals, tax and fees', () => {
    expect(
      parseQuoteText(
        'Tire rotation $25\n\nSubtotal $25\nSales tax $2.00\nShop supplies $5\nTOTAL $32',
      ),
    ).toEqual([{ text: 'Tire rotation', priceCents: 2_500 }])
  })

  it('writes lines back as editable text that parses to the same lines', () => {
    const lines = [
      { text: 'Brake fluid flush', priceCents: 14_999 },
      { text: 'Multi-point inspection' },
    ]
    const text = formatQuoteText(lines)
    expect(text).toBe('Brake fluid flush  $149.99\nMulti-point inspection')
    expect(parseQuoteText(text)).toEqual(lines)
  })
})
