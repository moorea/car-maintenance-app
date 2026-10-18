import { describe, expect, it } from 'vitest'
import { formatCarValue, parseCarValue } from './carValue'

describe('car value', () => {
  it.each([
    ['9500', 950_000],
    ['9,500', 950_000],
    ['$12,345.6', 1_234_560],
    [' 800.25 ', 80_025],
  ])('reads %j as dollars', (text, cents) => {
    expect(parseCarValue(text)).toEqual({ ok: true, cents })
  })

  it('reads an empty field as forgetting the value', () => {
    expect(parseCarValue('  ')).toEqual({ ok: true, cents: undefined })
  })

  it.each(['8k', '9,50', '-100', '1.234', 'abc'])('refuses %j', (text) => {
    expect(parseCarValue(text)).toEqual({
      ok: false,
      error: 'Enter the value in dollars, like 9,500',
    })
  })

  it('refuses nothing and absurd amounts', () => {
    expect(parseCarValue('0')).toEqual({ ok: false, error: 'Enter a value above $0' })
    expect(parseCarValue('20,000,000')).toEqual({ ok: false, error: 'That value looks too high' })
  })

  it('writes a saved value back the way an owner would type it', () => {
    expect(formatCarValue(950_000)).toBe('9,500')
    expect(formatCarValue(123_456_705)).toBe('1,234,567.05')
    expect(formatCarValue(80_050)).toBe('800.50')
  })
})
