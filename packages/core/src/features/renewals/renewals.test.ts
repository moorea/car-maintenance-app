import { describe, expect, it } from 'vitest'
import { describeRenewal, describeRepeat, nextDueOn, renewalState, renewalTitle } from './renewals'

const TODAY = '2026-10-18'

describe('describeRenewal', () => {
  it('gives the date of one far off', () => {
    expect(describeRenewal({ kind: 'registration', dueOn: '2027-03-14' }, TODAY)).toBe(
      'Expires Mar 14, 2027',
    )
  })

  it('counts the days once it is due within a month', () => {
    expect(describeRenewal({ kind: 'insurance', dueOn: '2026-10-30' }, TODAY)).toBe(
      'Renews in 12 days, on Oct 30',
    )
    expect(describeRenewal({ kind: 'inspection', dueOn: '2026-10-19' }, TODAY)).toBe('Due tomorrow')
    expect(describeRenewal({ kind: 'emissions', dueOn: TODAY }, TODAY)).toBe('Due today')
  })

  it('says how long ago it ran out once the date has passed', () => {
    expect(describeRenewal({ kind: 'registration', dueOn: '2026-10-15' }, TODAY)).toBe(
      'Expired 3 days ago, on Oct 15',
    )
    expect(describeRenewal({ kind: 'insurance', dueOn: '2026-10-17' }, TODAY)).toBe(
      'Was due to renew yesterday, on Oct 17',
    )
  })
})

describe('renewalState', () => {
  it('turns due soon a month ahead, and overdue the day after', () => {
    expect(renewalState({ dueOn: '2026-11-17' }, TODAY)).toBe('due-soon')
    expect(renewalState({ dueOn: '2026-11-18' }, TODAY)).toBe('upcoming')
    expect(renewalState({ dueOn: TODAY }, TODAY)).toBe('due-soon')
    expect(renewalState({ dueOn: '2026-10-17' }, TODAY)).toBe('overdue')
  })
})

describe('nextDueOn', () => {
  it('moves on one period from the old date, keeping its anniversary', () => {
    expect(nextDueOn({ dueOn: '2026-11-01', everyMonths: 12 }, TODAY)).toBe('2027-11-01')
    expect(nextDueOn({ dueOn: '2026-10-31', everyMonths: 6 }, TODAY)).toBe('2027-04-30')
  })

  it('steps on past today when renewed long after the date', () => {
    expect(nextDueOn({ dueOn: '2025-01-31', everyMonths: 6 }, TODAY)).toBe('2027-01-31')
  })

  it('has no next date for one that does not repeat', () => {
    expect(nextDueOn({ dueOn: '2026-11-01' }, TODAY)).toBeUndefined()
  })
})

describe('names', () => {
  it("uses the owner's own name, else the kind's", () => {
    expect(renewalTitle({ kind: 'other', title: 'Parking permit' })).toBe('Parking permit')
    expect(renewalTitle({ kind: 'emissions' })).toBe('Emissions test')
  })

  it('describes how often it repeats', () => {
    expect(describeRepeat(12)).toBe('Every year')
    expect(describeRepeat(36)).toBe('Every 3 years')
    expect(describeRepeat(3)).toBe('Every 3 months')
    expect(describeRepeat(undefined)).toBeUndefined()
  })
})
