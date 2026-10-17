import { describe, expect, it } from 'vitest'
import type { FillUp, OdometerReading, ServiceRecord } from '../../domain/types'
import { runningCosts } from './costs'

const fill = (filledOn: string, odometerMiles: number, costCents?: number): FillUp => ({
  id: `f-${filledOn}`,
  vehicleId: 'v1',
  filledOn,
  odometerMiles,
  energy: 'fuel',
  quantity: 10,
  full: true,
  missedPrevious: false,
  ...(costCents !== undefined && { costCents }),
})
const service = (performedOn: string, costCents?: number): ServiceRecord => ({
  id: `r-${performedOn}`,
  vehicleId: 'v1',
  performedOn,
  ...(costCents !== undefined && { costCents }),
})
const reading = (date: string, miles: number): OdometerReading => ({ vehicleId: 'v1', date, miles })

describe('runningCosts', () => {
  it('totals fuel and service by month, for the twelve months to today', () => {
    const { months } = runningCosts({
      fillUps: [fill('2026-10-02', 1_000, 4_000), fill('2026-10-20', 1_300, 4_500)],
      records: [service('2026-10-05', 8_995), service('2026-03-01', 12_000)],
      readings: [],
      today: '2026-10-25',
    })
    expect(months).toHaveLength(12)
    expect(months[0]?.month).toBe('2025-11')
    expect(months.at(-1)).toEqual({
      month: '2026-10',
      fuelCents: 8_500,
      serviceCents: 8_995,
      totalCents: 17_495,
    })
    expect(months.find((m) => m.month === '2026-03')?.serviceCents).toBe(12_000)
    expect(months.find((m) => m.month === '2026-05')?.totalCents).toBe(0)
  })

  it('counts a fill-up or service without a cost as nothing', () => {
    const { lastYear } = runningCosts({
      fillUps: [fill('2026-10-02', 1_000)],
      records: [service('2026-10-05')],
      readings: [],
      today: '2026-10-25',
    })
    expect(lastYear.totalCents).toBe(0)
  })

  it('gives cost per mile from the miles the readings show over the period', () => {
    const { lastYear } = runningCosts({
      fillUps: [fill('2026-01-01', 10_000, 5_000), fill('2026-07-01', 15_000, 5_000)],
      records: [service('2026-04-01', 20_000)],
      readings: [reading('2026-01-01', 10_000), reading('2026-07-01', 15_000)],
      today: '2026-10-17',
    })
    expect(lastYear).toEqual({
      fuelCents: 10_000,
      serviceCents: 20_000,
      totalCents: 30_000,
      miles: 5_000,
      centsPerMile: 6,
    })
  })

  it('splits miles at a year boundary between the readings either side', () => {
    const { years } = runningCosts({
      fillUps: [fill('2025-12-01', 10_000, 4_000), fill('2026-02-01', 11_240, 4_000)],
      records: [],
      readings: [reading('2025-12-01', 10_000), reading('2026-02-01', 11_240)],
      today: '2026-10-17',
    })
    // 62 days, 20 miles a day: 620 in December's 31 days, 620 in January's.
    expect(years.map((y) => [y.year, y.miles])).toEqual([
      [2026, 620],
      [2025, 620],
    ])
  })

  it('leaves out cost per mile over too few miles to mean anything', () => {
    const { lastYear } = runningCosts({
      fillUps: [fill('2026-10-01', 10_000, 4_000), fill('2026-10-02', 10_040, 4_000)],
      records: [],
      readings: [reading('2026-10-01', 10_000), reading('2026-10-02', 10_040)],
      today: '2026-10-17',
    })
    expect(lastYear.miles).toBe(40)
    expect(lastYear.centsPerMile).toBeUndefined()
  })

  it('ignores a reading lower than an earlier one, as a typo', () => {
    const { lastYear } = runningCosts({
      fillUps: [fill('2026-06-01', 20_000, 5_000)],
      records: [],
      readings: [
        reading('2026-01-01', 10_000),
        reading('2026-03-01', 1_200),
        reading('2026-06-01', 20_000),
      ],
      today: '2026-10-17',
    })
    expect(lastYear.miles).toBe(10_000)
  })

  it('ignores a reading further on than the car could have been driven, as a typo', () => {
    const { lastYear } = runningCosts({
      fillUps: [fill('2026-06-01', 16_000, 5_000)],
      records: [],
      readings: [
        reading('2026-01-01', 9_000),
        reading('2026-02-01', 95_000),
        reading('2026-03-01', 10_000),
        reading('2026-06-01', 16_000),
      ],
      today: '2026-10-17',
    })
    expect(lastYear.miles).toBe(7_000)
  })

  it('lists each year with a cost, newest first', () => {
    const { years } = runningCosts({
      fillUps: [fill('2024-05-01', 1_000, 3_000)],
      records: [service('2026-02-01', 9_000)],
      readings: [],
      today: '2026-10-17',
    })
    expect(years.map((y) => [y.year, y.totalCents])).toEqual([
      [2026, 9_000],
      [2024, 3_000],
    ])
  })
})
