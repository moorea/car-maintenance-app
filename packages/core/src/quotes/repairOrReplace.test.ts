import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, ServiceRecord } from '../domain/types'
import { weighRepair, worthWeighing, type WeighInput } from './repairOrReplace'

const items: MaintenanceItem[] = [
  { id: 'oil', configId: 'c1', kind: 'engine-oil', task: 'Oil change', intervalMonths: 6 },
  { id: 'fluid', configId: 'c1', kind: 'brake-fluid', task: 'Brake fluid', intervalMonths: 36 },
  { id: 'plugs', configId: 'c1', kind: 'spark-plugs', task: 'Spark plugs', intervalMonths: 120 },
]

const done = (itemId: string, performedOn: string): ServiceRecord => ({
  id: itemId,
  vehicleId: 'v1',
  itemId,
  performedOn,
})

const input = (patch: Partial<WeighInput> = {}): WeighInput => ({
  vehicle: { id: 'v1', severeDuty: false, valueCents: 1_000_000, valuedOn: '2026-06-01' },
  items,
  records: [done('oil', '2026-08-01'), done('fluid', '2024-01-15'), done('plugs', '2020-01-01')],
  readings: [],
  quoteCents: 150_000,
  today: '2026-10-17',
  ...patch,
})

describe('weighing a repair against the car', () => {
  it('weighs quotes over $1,000, or over a quarter of the car’s value', () => {
    expect(worthWeighing(100_000, undefined)).toBe(true)
    expect(worthWeighing(99_999, undefined)).toBe(false)
    expect(worthWeighing(50_000, 200_000)).toBe(true)
    expect(worthWeighing(49_999, 200_000)).toBe(false)
  })

  it.each([
    [240_000, 'small', 'This quote is 24% of the $10,000.00 you think the car is worth'],
    [250_000, 'large', 'This quote is 25% of the $10,000.00 you think the car is worth'],
    [500_000, 'most', 'This quote is 50% of the $10,000.00 you think the car is worth'],
    [1_200_000, 'most', 'This quote is more than the $10,000.00 you think the car is worth'],
  ] as const)('puts a %i cent quote at %s', (quoteCents, share, headline) => {
    expect(weighRepair(input({ quoteCents }))).toMatchObject({ share, headline })
  })

  it('mentions the common rule of thumb once the quote is a large share', () => {
    expect(weighRepair(input({ quoteCents: 400_000 })).points[0]).toBe(
      'Many owners start to think about replacing a car when one repair costs more than about a quarter of its value.',
    )
    expect(weighRepair(input()).points[0]).toContain('under the quarter')
    // 24.95% shows as 25%, so it is not called under a quarter.
    expect(weighRepair(input({ quoteCents: 249_500 })).share).toBe('large')
  })

  it('asks the question plainly when the car’s value is unknown', () => {
    const weighed = weighRepair(input({ vehicle: { id: 'v1', severeDuty: false } }))
    expect(weighed).toMatchObject({
      share: undefined,
      headline: 'Is a $1,500.00 repair worth it?',
      valueStale: false,
    })
    expect(weighed.points).toEqual(['You haven’t logged any other repairs in the last 12 months.'])
  })

  it('counts only priced, unscheduled work from the last 12 months as repairs', () => {
    const records = [
      ...input().records,
      { id: 'r1', vehicleId: 'v1', performedOn: '2026-05-01', costCents: 40_000 },
      { id: 'r2', vehicleId: 'v1', performedOn: '2026-09-30', costCents: 20_000 },
      { id: 'old', vehicleId: 'v1', performedOn: '2025-10-17', costCents: 99_000 },
      { id: 'free', vehicleId: 'v1', performedOn: '2026-09-01' },
      { ...done('oil', '2026-02-01'), id: 'oil-2', costCents: 9_000 },
    ]
    expect(weighRepair(input({ records })).points[1]).toBe(
      'You’ve logged $600.00 of repairs in the last 12 months across 2 visits. With this quote, that’s $2,100.00 in a year, 21% of its value.',
    )
  })

  it('lists scheduled work due in the next 12 months that the quote does not cover', () => {
    expect(weighRepair(input()).dueNextYear).toEqual(['Brake fluid', 'Oil change'])
    expect(weighRepair(input({ coveredItemIds: ['fluid'] })).dueNextYear).toEqual(['Oil change'])
  })

  it('says when the car’s value is more than a year old', () => {
    const stale = { id: 'v1', severeDuty: false, valueCents: 1_000_000, valuedOn: '2025-09-01' }
    expect(weighRepair(input({ vehicle: stale })).valueStale).toBe(true)
    expect(weighRepair(input()).valueStale).toBe(false)
  })
})
