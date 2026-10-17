import { describe, expect, it } from 'vitest'
import { formatAgo, formatCents, formatDay, formatMiles, formatWeekday } from './format'

describe('formatting', () => {
  it('leaves the year off dates in the current year', () => {
    expect(formatDay('2026-10-02', '2026-10-17')).toBe('Oct 2')
    expect(formatDay('2027-03-14', '2026-10-17')).toBe('Mar 14, 2027')
  })

  it('names the weekday', () => {
    expect(formatWeekday('2026-10-17')).toBe('Saturday, Oct 17')
  })

  it('writes miles with thousands separators', () => {
    expect(formatMiles(48_210.4)).toBe('48,210 mi')
  })

  it('writes cents as dollars', () => {
    expect(formatCents(8995)).toBe('$89.95')
    expect(formatCents(123_456)).toBe('$1,234.56')
  })

  it('says how long ago a date was', () => {
    expect(formatAgo('2026-10-17', '2026-10-17')).toBe('today')
    expect(formatAgo('2026-10-16', '2026-10-17')).toBe('yesterday')
    expect(formatAgo('2026-10-14', '2026-10-17')).toBe('3 days ago')
    expect(formatAgo('2026-09-17', '2026-10-17')).toBe('4 weeks ago')
    expect(formatAgo('2026-04-17', '2026-10-17')).toBe('6 months ago')
    expect(formatAgo('2023-10-17', '2026-10-17')).toBe('3 years ago')
  })
})
