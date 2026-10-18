import { describe, expect, it } from 'vitest'
import type { TireSet } from '../../domain/types'
import { parseDotCode } from '../../schemas/tireSet'
import {
  assessTires,
  describeAge,
  madeOn,
  milesOnSet,
  putOn,
  takenOff,
  tireAgeMonths,
  upcomingTireMilestones,
} from './tires'

const winter: TireSet = {
  id: 't1',
  vehicleId: 'v1',
  name: 'Winter',
  madeWeek: 23,
  madeYear: 2021,
  mounted: false,
  priorMiles: 6_000,
}

const { madeWeek: _week, madeYear: _year, ...undated } = winter

describe('DOT codes', () => {
  it('reads the week and year from the last four digits', () => {
    expect(parseDotCode('2321')).toEqual({ week: 23, year: 2021 })
  })

  it('reads a whole code copied from the sidewall, spaces and all', () => {
    expect(parseDotCode('DOT U2LL LMLR 0819')).toEqual({ week: 8, year: 2019 })
    expect(parseDotCode('dot 4b9x 5124')).toEqual({ week: 51, year: 2024 })
  })

  it('refuses a week that does not exist, and codes too short to hold a date', () => {
    expect(parseDotCode('5421')).toBeUndefined()
    expect(parseDotCode('0021')).toBeUndefined()
    // 2020 has a week 53; 2021 does not.
    expect(parseDotCode('5320')).toEqual({ week: 53, year: 2020 })
    expect(parseDotCode('5321')).toBeUndefined()
    expect(parseDotCode('321')).toBeUndefined()
    expect(parseDotCode('winter')).toBeUndefined()
  })

  it('dates a week from its Monday, as ISO weeks count them', () => {
    // 2021's first Thursday is Jan 7, so week 1 starts Monday Jan 4.
    expect(madeOn(1, 2021)).toBe('2021-01-04')
    expect(madeOn(23, 2021)).toBe('2021-06-07')
    // 2026 starts on a Thursday, so week 1 starts the Monday before, in 2025.
    expect(madeOn(1, 2026)).toBe('2025-12-29')
  })
})

describe('tire age', () => {
  it('counts whole months from the week the tires were made', () => {
    expect(tireAgeMonths(winter, '2026-10-17')).toBe(64)
    expect(tireAgeMonths(winter, '2021-07-06')).toBe(0)
    expect(tireAgeMonths(undated, '2026-10-17')).toBeUndefined()
  })

  it('says the age the way a person would', () => {
    expect(describeAge(0)).toBe('New')
    expect(describeAge(1)).toBe('1 month old')
    expect(describeAge(12)).toBe('1 year old')
    expect(describeAge(64)).toBe('5 years 4 months old')
  })
})

describe('assessing a set', () => {
  it('has nothing to say about young tires with good tread', () => {
    expect(assessTires({ ...winter, treadDepth32nds: 8 }, '2023-01-01')).toEqual({
      condition: 'ok',
    })
  })

  it('asks for a yearly inspection at five years, and replacement at six and at ten', () => {
    expect(assessTires(winter, '2026-10-17').condition).toBe('inspect')
    expect(assessTires(winter, '2027-06-07')).toEqual({
      condition: 'replace',
      advice: 'Six years old or more. Most carmakers say to replace tires by now.',
    })
    expect(assessTires(winter, '2031-06-07').advice).toContain('Ten years old')
  })

  it('flags low tread, and tread at the legal limit', () => {
    expect(assessTires({ ...winter, madeYear: 2025, treadDepth32nds: 4 }, '2026-10-17')).toEqual({
      condition: 'inspect',
      advice: 'Tread is down to 4/32″. Grip in rain and snow is going; plan new tires.',
    })
    expect(assessTires({ ...winter, madeYear: 2025, treadDepth32nds: 2 }, '2026-10-17')).toEqual({
      condition: 'replace',
      advice: 'Tread is at 2/32″, the legal limit in most states. Replace them.',
    })
    expect(assessTires({ ...winter, madeYear: 2025, treadDepth32nds: 1 }, '2026-10-17')).toEqual({
      condition: 'replace',
      advice: 'Tread is down to 1/32″, below the legal limit in most states. Replace them.',
    })
  })

  it('gives the more urgent reason when there are two', () => {
    // Five years old asks for an inspection; worn-out tread asks for new tires.
    expect(assessTires({ ...winter, treadDepth32nds: 1 }, '2026-10-17').condition).toBe('replace')
  })
})

describe('miles on a set', () => {
  it('adds the miles since it went on to the miles from earlier seasons', () => {
    const on = putOn(winter, 40_000)
    expect(milesOnSet(on, 43_500)).toBe(9_500)
    expect(milesOnSet(winter, 43_500)).toBe(6_000)
  })

  it('keeps the miles a set did when it comes off, for when it goes back on', () => {
    const off = takenOff(putOn(winter, 40_000), 44_000)
    expect(off).toEqual({ ...winter, priorMiles: 10_000 })
    expect(milesOnSet(putOn(off, 50_000), 51_000)).toBe(11_000)
  })

  it('counts only earlier miles when the car has no mileage yet', () => {
    expect(milesOnSet(putOn(winter, 40_000), undefined)).toBe(6_000)
  })
})

describe('age reminders', () => {
  it('names the sixth and tenth birthdays still ahead', () => {
    expect(upcomingTireMilestones([winter], '2026-10-17')).toEqual([
      { setId: 't1', name: 'Winter', years: 6, on: '2027-06-07' },
      { setId: 't1', name: 'Winter', years: 10, on: '2031-06-07' },
    ])
    expect(upcomingTireMilestones([winter], '2027-06-07').map((m) => m.years)).toEqual([10])
  })

  it('has nothing to say about a set without a DOT code', () => {
    expect(upcomingTireMilestones([undated], '2026-10-17')).toEqual([])
  })
})
