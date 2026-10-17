import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysBetween } from './date'

describe('dates', () => {
  it('counts days across a DST change without drifting', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('clamps month addition to the end of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-15', 6)).toBe('2027-05-15')
  })

  it('rounds fractional days', () => {
    expect(addDays('2026-10-17', 2.6)).toBe('2026-10-20')
  })

  it('rejects malformed dates', () => {
    expect(() => daysBetween('17/10/2026', '2026-10-17')).toThrow(RangeError)
  })
})
