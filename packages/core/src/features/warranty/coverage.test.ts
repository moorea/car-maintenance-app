import { describe, expect, it } from 'vitest'
import type { Warranty } from '../../domain/types'
import { learnMilesPerDay } from '../../reminders/mileage'
import { coverageOf, describeCoverage, describeLimits, upcomingWarrantyEnds } from './coverage'

const basic: Warranty = {
  id: 'w1',
  vehicleId: 'v1',
  kind: 'basic',
  provider: 'Toyota',
  startsOn: '2024-03-14',
  months: 36,
  endMiles: 36_000,
}

/** A car driven 30 miles a day, at `miles` on `today`. */
const drivenAt = (miles: number, today: string) => {
  const mileage = learnMilesPerDay([
    { vehicleId: 'v1', date: '2024-03-14', miles: miles - 30 * daysSince('2024-03-14', today) },
    { vehicleId: 'v1', date: today, miles },
  ])
  return { mileage, currentMiles: miles, today }
}
const daysSince = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

describe('warranty coverage', () => {
  it('is active well before either limit', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(12_000, '2025-03-14') })
    expect(c.state).toBe('active')
    expect(c.endsOn).toBe('2027-03-14')
  })

  it('ends by mileage when the car will reach the limit before the date', () => {
    // About 60 miles a day: 25,620 miles to go takes about 14 months, the date is 2 years away.
    const mileage = learnMilesPerDay([
      { vehicleId: 'v1', date: '2025-01-01', miles: 6_000 },
      { vehicleId: 'v1', date: '2025-03-14', miles: 10_380 },
    ])
    const c = coverageOf({ warranty: basic, mileage, currentMiles: 10_380, today: '2025-03-14' })
    expect(c.endsBy).toBe('miles')
    expect((c.expectedEnd ?? '') < '2027-03-14').toBe(true)
  })

  it('ends by time for a car that is barely driven', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(5_000, '2026-03-14') })
    expect(c.endsBy).toBe('time')
    expect(c.expectedEnd).toBe('2027-03-14')
  })

  it('is ending soon within 90 days of its expected end', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(20_000, '2027-01-01') })
    expect(c.state).toBe('ending-soon')
    expect(describeCoverage(basic, c, '2027-01-01')).toBe('Ends in about 2 months, on Mar 14, 2027')
  })

  it('has ended once the date passes, whatever the mileage', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(20_000, '2027-03-14') })
    expect(c.state).toBe('ended')
    expect(c.used).toBe(1)
    expect(describeCoverage(basic, c, '2027-03-14')).toBe('Ended Mar 14, 2027')
  })

  it('has ended once the odometer passes the mileage limit, before the date', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(36_500, '2026-06-01') })
    expect(c.state).toBe('ended')
    expect(describeCoverage(basic, c, '2026-06-01')).toBe('Ended at 36,000 mi')
  })

  it('counts used coverage by whichever limit is further along', () => {
    // Halfway through the time, a quarter through the miles.
    const c = coverageOf({ warranty: basic, ...drivenAt(9_000, '2025-09-13') })
    expect(c.used).toBeCloseTo(0.5, 1)
  })

  it('measures an extended warranty bought mid-life from the odometer at its start', () => {
    const extended: Warranty = {
      id: 'w2',
      vehicleId: 'v1',
      kind: 'extended',
      startsOn: '2026-01-01',
      endMiles: 100_000,
    }
    const mileage = learnMilesPerDay([
      { vehicleId: 'v1', date: '2026-01-01', miles: 40_000 },
      { vehicleId: 'v1', date: '2026-07-01', miles: 46_000 },
    ])
    const c = coverageOf({ warranty: extended, mileage, currentMiles: 46_000, today: '2026-07-01' })
    expect(c.used).toBeCloseTo(0.1, 2)
    expect(c.state).toBe('active')
  })

  it('judges a mileage-only warranty by time alone when the car has no readings', () => {
    const { months: _months, ...milesOnly } = basic
    const c = coverageOf({
      warranty: milesOnly,
      mileage: learnMilesPerDay([]),
      currentMiles: undefined,
      today: '2026-01-01',
    })
    expect(c.state).toBe('active')
    expect(c.expectedEnd).toBeUndefined()
  })

  it('states the limits as the paperwork does', () => {
    expect(describeLimits(basic)).toBe('Mar 14, 2027 or 36,000 mi')
    const { endMiles: _miles, ...timeOnly } = basic
    expect(describeLimits(timeOnly)).toBe('Mar 14, 2027')
  })

  it.each([
    ['2027-03-14', 'today'],
    ['2027-03-13', 'tomorrow'],
    ['2027-03-09', 'in 5 days'],
    ['2027-02-21', 'in about 3 weeks'],
  ])('says how soon a coverage ends, on %s: %s', (today, when) => {
    const c = coverageOf({ warranty: basic, ...drivenAt(1_000, today) })
    expect(describeCoverage(basic, c, today)).toBe(
      when === 'today' ? 'Ended Mar 14, 2027' : `Ends ${when}, on Mar 14, 2027`,
    )
  })

  it('says a mileage limit is coming up when the car will reach it first', () => {
    const c = coverageOf({ warranty: basic, ...drivenAt(35_000, '2026-01-01') })
    expect(c.state).toBe('ending-soon')
    expect(describeCoverage(basic, c, '2026-01-01')).toBe('Ends in about 5 weeks, at 36,000 mi')
  })

  it('does not call coverage ended on a projection alone', () => {
    // One reading a year ago, projected on at the US average, passes the limit on paper only.
    const mileage = learnMilesPerDay([{ vehicleId: 'v1', date: '2025-06-01', miles: 35_000 }])
    const today = '2026-06-01'
    const c = coverageOf({ warranty: basic, mileage, currentMiles: 48_505, today })
    expect(c.state).toBe('ending-soon')
    expect(c.used).toBe(1)
    expect(describeCoverage(basic, c, today)).toBe(
      'Probably past 36,000 mi by now. Update the odometer to check',
    )
  })

  it('lists the coverages still running with when each is expected to end, for reminders', () => {
    const { months: _months, ...milesOnly } = basic
    const ended = { ...basic, id: 'w-old', startsOn: '2020-01-01' }
    const ends = upcomingWarrantyEnds(
      [basic, ended, { ...milesOnly, id: 'w-miles', kind: 'extended' }],
      drivenAt(5_000, '2026-03-14'),
    )
    expect(ends).toEqual([
      {
        id: 'w1',
        coverage: 'Bumper-to-bumper coverage',
        endsOn: '2027-03-14',
        endsBy: 'time',
        endMiles: 36_000,
      },
      // 31,000 miles to go at 30 a day.
      expect.objectContaining({ id: 'w-miles', coverage: 'Extended warranty', endsBy: 'miles' }),
    ])
  })

  it('names other coverage by its provider in reminders', () => {
    const plan = { ...basic, kind: 'other' as const, provider: 'Tire and wheel plan' }
    const { provider: _p, ...unnamed } = plan
    const car = drivenAt(5_000, '2026-03-14')
    expect(upcomingWarrantyEnds([plan], car)[0]?.coverage).toBe('Tire and wheel plan')
    expect(upcomingWarrantyEnds([unnamed], car)[0]?.coverage).toBe('Other coverage')
  })

  it('leaves out a mileage-only coverage it cannot project', () => {
    const { months: _months, ...milesOnly } = basic
    const car = { mileage: learnMilesPerDay([]), currentMiles: undefined, today: '2026-01-01' }
    expect(upcomingWarrantyEnds([milesOnly], car)).toEqual([])
  })
})
