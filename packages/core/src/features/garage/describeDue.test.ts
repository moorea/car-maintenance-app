import { describe, expect, it } from 'vitest'
import type { DueProjection } from '../../reminders/projectDue'
import { describeNext, describeWhen } from './describeDue'

const TODAY = '2026-10-17'
const due = (overrides: Partial<DueProjection>): DueProjection => ({
  itemId: 'i',
  task: 'Task',
  trigger: 'miles',
  status: 'upcoming',
  historyUnknown: false,
  ...overrides,
})

describe('describeWhen', () => {
  it('rounds the miles left to the nearest ten', () => {
    expect(describeWhen(due({ dueMiles: 40_000, dueDate: '2027-01-01' }), 38_214, TODAY)).toBe(
      'In 1,790 mi',
    )
  })

  it('says "Due now" rather than "In 0 mi" when a few miles are left', () => {
    expect(describeWhen(due({ dueMiles: 40_000, dueDate: TODAY }), 39_997, TODAY)).toBe('Due now')
  })

  it('gives the date for a time limit', () => {
    expect(describeWhen(due({ trigger: 'time', dueDate: '2027-03-14' }), 30_000, TODAY)).toBe(
      'By Mar 14, 2027',
    )
    expect(describeWhen(due({ trigger: 'time', dueDate: TODAY }), 30_000, TODAY)).toBe('Due now')
  })

  it('says when an overdue time limit was due', () => {
    const late = due({ trigger: 'time', status: 'overdue', dueDate: '2026-09-01' })
    expect(describeWhen(late, 30_000, TODAY)).toBe('Was due Sep 1')
  })

  it('gives the mileage when the car is parked and no date can be projected', () => {
    expect(describeWhen(due({ dueMiles: 40_000 }), undefined, TODAY)).toBe('At 40,000 mi')
  })
})

describe('describeNext', () => {
  it('says a time limit is due by a date', () => {
    expect(describeNext(due({ trigger: 'time', dueDate: '2027-03-14' }), 30_000, TODAY)).toBe(
      'Due by Mar 14, 2027.',
    )
  })
})
