import { describe, expect, it } from 'vitest'
import { DEFAULT_MILES_PER_DAY, estimateMilesOn, learnMilesPerDay } from './mileage'

const r = (date: string, miles: number) => ({ vehicleId: 'v1', date, miles })

describe('learnMilesPerDay', () => {
  it('falls back to the default with fewer than two readings', () => {
    expect(learnMilesPerDay([r('2026-01-01', 10_000)])).toEqual({
      milesPerDay: DEFAULT_MILES_PER_DAY,
      isDefault: true,
      latest: r('2026-01-01', 10_000),
    })
    expect(learnMilesPerDay([])).toEqual({ milesPerDay: DEFAULT_MILES_PER_DAY, isDefault: true })
  })

  it('learns the rate between two readings', () => {
    expect(learnMilesPerDay([r('2026-01-01', 10_000), r('2026-01-11', 10_400)])).toMatchObject({
      milesPerDay: 40,
      isDefault: false,
    })
  })

  it('moves halfway to a new rate after a 30-day interval', () => {
    const { milesPerDay } = learnMilesPerDay([
      r('2026-01-01', 10_000),
      r('2026-01-31', 10_600), // 20/day
      r('2026-03-02', 13_000), // 80/day
    ])
    expect(milesPerDay).toBeCloseTo(50)
  })

  it('barely moves on a reading one day after the last', () => {
    const { milesPerDay } = learnMilesPerDay([
      r('2026-01-01', 10_000),
      r('2026-04-11', 14_000), // 40/day over 100 days
      r('2026-04-12', 14_200), // 200 miles in one day
    ])
    expect(milesPerDay).toBeLessThan(45)
  })

  it('ignores a reading that goes backwards and keeps the last good one as latest', () => {
    const estimate = learnMilesPerDay([
      r('2026-01-01', 30_000),
      r('2026-01-31', 31_200),
      r('2026-03-02', 3_800), // typo for 38,000
    ])
    expect(estimate.milesPerDay).toBe(40)
    expect(estimate.latest).toEqual(r('2026-01-31', 31_200))
  })

  it('ignores a reading that implies an impossible rate, so later readings still count', () => {
    const estimate = learnMilesPerDay([
      r('2026-01-01', 30_000),
      r('2026-01-31', 330_000), // typo for 33,000
      r('2026-03-02', 32_400),
    ])
    expect(estimate.milesPerDay).toBe(40)
    expect(estimate.latest).toEqual(r('2026-03-02', 32_400))
  })

  it('does not depend on input order', () => {
    const readings = [r('2026-03-02', 13_000), r('2026-01-01', 10_000), r('2026-01-31', 10_600)]
    expect(learnMilesPerDay(readings).milesPerDay).toBeCloseTo(50)
  })
})

describe('estimateMilesOn', () => {
  it('projects forward from a reading', () => {
    expect(estimateMilesOn(r('2026-01-01', 10_000), 40, '2026-01-11')).toBe(10_400)
  })

  it('projects backwards to estimate the odometer on a past date', () => {
    expect(estimateMilesOn(r('2026-01-11', 10_400), 40, '2026-01-01')).toBe(10_000)
  })
})
