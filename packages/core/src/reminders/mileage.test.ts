import { describe, expect, it } from 'vitest'
import { DEFAULT_MILES_PER_DAY, estimateMilesOn, learnMilesPerDay } from './mileage'

const r = (date: string, miles: number) => ({ vehicleId: 'v1', date, miles })

describe('learnMilesPerDay', () => {
  it('falls back to the default with fewer than two readings', () => {
    expect(learnMilesPerDay([r('2026-01-01', 10_000)])).toEqual({
      milesPerDay: DEFAULT_MILES_PER_DAY,
      isDefault: true,
    })
  })

  it('learns the rate between two readings', () => {
    expect(learnMilesPerDay([r('2026-01-01', 10_000), r('2026-01-11', 10_400)])).toEqual({
      milesPerDay: 40,
      isDefault: false,
    })
  })

  it('weights recent intervals more heavily', () => {
    const { milesPerDay } = learnMilesPerDay([
      r('2026-01-01', 10_000),
      r('2026-01-11', 10_200), // 20/day
      r('2026-01-21', 11_000), // 80/day
    ])
    expect(milesPerDay).toBe(50)
  })

  it('ignores readings that go backwards', () => {
    const { milesPerDay } = learnMilesPerDay([
      r('2026-01-01', 10_000),
      r('2026-01-05', 1_000),
      r('2026-01-11', 10_300),
    ])
    expect(milesPerDay).toBe(30)
  })

  it('does not depend on input order', () => {
    const readings = [r('2026-01-21', 11_000), r('2026-01-01', 10_000), r('2026-01-11', 10_200)]
    expect(learnMilesPerDay(readings).milesPerDay).toBe(50)
  })
})

describe('estimateMilesOn', () => {
  it('projects forward from the latest reading', () => {
    expect(estimateMilesOn(r('2026-01-01', 10_000), 40, '2026-01-11')).toBe(10_400)
  })
})
