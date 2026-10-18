import { describe, expect, it } from 'vitest'
import { fillUpDraftSchema, type FillUpDraft } from './fillUp'
import { NOTES_MAX, SHORT_TEXT_MAX } from './text'

const draft: FillUpDraft = {
  filledOn: '2026-10-17',
  odometerMiles: '41,250',
  energy: 'fuel',
  quantity: '12.481',
  cost: '$1,048.20',
  full: true,
  missedPrevious: false,
  station: '  ',
  notes: '',
}

describe('fill-up draft', () => {
  it('reads numbers the way pumps and dashboards print them', () => {
    expect(fillUpDraftSchema.parse(draft)).toEqual({
      filledOn: '2026-10-17',
      odometerMiles: 41_250,
      energy: 'fuel',
      quantity: 12.481,
      cost: 1_048.2,
      full: true,
      missedPrevious: false,
    })
  })

  it.each([
    ['quantity', '1e3'],
    ['quantity', '0'],
    ['quantity', '12.4815'],
    ['odometerMiles', '41.5'],
    ['odometerMiles', '4,12'],
    ['cost', '12.345'],
    ['energy', 'diesel'],
  ] as const)('refuses %s of %s', (field, value) => {
    expect(fillUpDraftSchema.safeParse({ ...draft, [field]: value }).success).toBe(false)
  })

  it('refuses a station or notes longer than the server keeps', () => {
    expect(
      fillUpDraftSchema.safeParse({ ...draft, station: 's'.repeat(SHORT_TEXT_MAX + 1) }).success,
    ).toBe(false)
    expect(
      fillUpDraftSchema.safeParse({ ...draft, notes: 'n'.repeat(NOTES_MAX + 1) }).success,
    ).toBe(false)
    expect(fillUpDraftSchema.parse({ ...draft, notes: 'n'.repeat(NOTES_MAX) }).notes).toHaveLength(
      NOTES_MAX,
    )
  })
})
