import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysBetween,
  formatShortDate,
  isoFromLocalDate,
  isoFromUtcDate,
  localNoonOf,
  parseDateInput,
  utcMidnightOf,
} from './date'

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

describe('formatShortDate', () => {
  it('shows the month and day, adding the year only when it is not this year', () => {
    expect(formatShortDate('2026-11-04', '2026-10-01')).toBe('Nov 4')
    expect(formatShortDate('2027-02-28', '2026-10-01')).toBe('Feb 28, 2027')
  })
})

describe('parseDateInput', () => {
  it('reads ISO dates and US dates with or without leading zeros', () => {
    expect(parseDateInput('2025-03-14')).toBe('2025-03-14')
    expect(parseDateInput('3/14/2025')).toBe('2025-03-14')
    expect(parseDateInput('03/04/2025')).toBe('2025-03-04')
    expect(parseDateInput(' 12/1/2025 ')).toBe('2025-12-01')
  })

  it('refuses days that do not exist and text it cannot read', () => {
    expect(parseDateInput('2/30/2025')).toBeUndefined()
    expect(parseDateInput('2025-02-29')).toBeUndefined()
    expect(parseDateInput('13/01/2025')).toBeUndefined()
    expect(parseDateInput('14/3/2025')).toBeUndefined()
    expect(parseDateInput('3/14/25')).toBeUndefined()
    expect(parseDateInput('March 14')).toBeUndefined()
    expect(parseDateInput('')).toBeUndefined()
  })

  it('reads Feb 29 in a leap year', () => {
    expect(parseDateInput('2/29/2028')).toBe('2028-02-29')
  })
})

describe('converting for native date pickers', () => {
  it('keeps the day through local noon, whatever the time zone', () => {
    for (const date of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) {
      expect(isoFromLocalDate(localNoonOf(date))).toBe(date)
    }
  })

  it('keeps the day through midnight UTC, as Material reports it', () => {
    expect(utcMidnightOf('2026-03-14').toISOString()).toBe('2026-03-14T00:00:00.000Z')
    expect(isoFromUtcDate(new Date('2026-03-14T00:00:00Z'))).toBe('2026-03-14')
  })

  it('reads the local day of a moment late in the evening', () => {
    expect(isoFromLocalDate(new Date(2026, 2, 14, 23, 59))).toBe('2026-03-14')
  })
})
