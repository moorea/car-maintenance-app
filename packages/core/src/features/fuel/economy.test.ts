import { describe, expect, it } from 'vitest'
import type { FillUp } from '../../domain/types'
import { formatEconomy, formatQuantity, measureEconomy } from './economy'

let n = 0
const fill = (
  filledOn: string,
  odometerMiles: number,
  quantity: number,
  more: Partial<FillUp> = {},
): FillUp => ({
  id: `f${++n}`,
  vehicleId: 'v1',
  filledOn,
  odometerMiles,
  energy: 'fuel',
  quantity,
  full: true,
  missedPrevious: false,
  ...more,
})

describe('measureEconomy', () => {
  it('measures nothing from a single fill-up, since the first only fills the tank', () => {
    expect(measureEconomy([fill('2026-01-01', 10_000, 12)], 'fuel')).toEqual({ stretches: [] })
  })

  it('divides the miles between full fill-ups by what the second one took', () => {
    const second = fill('2026-01-10', 10_300, 10)
    const { stretches, average } = measureEconomy([fill('2026-01-01', 10_000, 12), second], 'fuel')
    expect(stretches).toEqual([
      expect.objectContaining({ fillUpId: second.id, miles: 300, quantity: 10, economy: 30 }),
    ])
    expect(average).toBe(30)
  })

  it('adds partial fill-ups into the next full one rather than measuring them alone', () => {
    const { stretches } = measureEconomy(
      [
        fill('2026-01-01', 10_000, 12),
        fill('2026-01-05', 10_150, 4, { full: false }),
        fill('2026-01-10', 10_400, 6),
      ],
      'fuel',
    )
    expect(stretches.map((s) => [s.miles, s.quantity, s.economy])).toEqual([[400, 10, 40]])
  })

  it('starts again after a missed fill-up instead of overstating economy', () => {
    const { stretches } = measureEconomy(
      [
        fill('2026-01-01', 10_000, 12),
        // 600 miles on 10 gallons only because a fill-up in between was never logged.
        fill('2026-01-20', 10_600, 10, { missedPrevious: true }),
        fill('2026-01-28', 10_900, 10),
      ],
      'fuel',
    )
    expect(stretches.map((s) => s.economy)).toEqual([30])
  })

  it('puts a fill-up entered late in its place by mileage', () => {
    const late = fill('2026-01-05', 10_150, 5)
    const { stretches } = measureEconomy(
      [fill('2026-01-10', 10_300, 5), fill('2026-01-01', 10_000, 12), late],
      'fuel',
    )
    expect(stretches.map((s) => [s.from, s.to, s.economy])).toEqual([
      ['2026-01-01', '2026-01-05', 30],
      ['2026-01-05', '2026-01-10', 30],
    ])
  })

  it('flags an impossible stretch and leaves it out of the average', () => {
    const { stretches, average } = measureEconomy(
      [
        fill('2026-01-01', 10_000, 12),
        fill('2026-01-10', 10_300, 10),
        // 41,000 typed as 14,100 the other way round would be caught by the form; this one
        // is a slip of a digit that still goes up.
        fill('2026-01-20', 13_300, 10),
      ],
      'fuel',
    )
    expect(stretches.map((s) => s.implausible)).toEqual([false, true])
    expect(average).toBe(30)
  })

  it('weights the average by distance rather than averaging each stretch', () => {
    const { average } = measureEconomy(
      [
        fill('2026-01-01', 10_000, 10),
        fill('2026-01-05', 10_100, 10), // 10 mpg over 100 miles
        fill('2026-01-20', 10_700, 20), // 30 mpg over 600 miles
      ],
      'fuel',
    )
    expect(average).toBe(700 / 30)
  })

  it('keeps charging separate from fuel, for a plug-in hybrid', () => {
    const fills = [
      fill('2026-01-01', 10_000, 10),
      fill('2026-01-02', 10_010, 8, { energy: 'electric' }),
      fill('2026-01-04', 10_040, 9, { energy: 'electric' }),
      fill('2026-01-10', 10_400, 10),
    ]
    expect(measureEconomy(fills, 'fuel').average).toBe(40)
    expect(measureEconomy(fills, 'electric').average).toBeCloseTo(30 / 9)
  })
})

describe('formatting', () => {
  it('writes economy and quantity in their units', () => {
    expect(formatEconomy(31.24, 'fuel')).toBe('31.2 mpg')
    expect(formatEconomy(3.81, 'electric')).toBe('3.8 mi/kWh')
    expect(formatQuantity(12.4815, 'fuel')).toBe('12.482 gal')
    expect(formatQuantity(48, 'electric')).toBe('48 kWh')
  })
})
