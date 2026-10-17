import { describe, expect, it } from 'vitest'
import type { MaintenanceItem } from '../domain/types'
import { projectDue, type ProjectionInput } from './projectDue'

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Engine oil and filter',
  intervalMiles: 5_000,
  intervalMonths: 6,
  severeMiles: 3_000,
  severeMonths: 3,
}

const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  item: oil,
  lastService: { performedOn: '2026-09-01', odometerMiles: 40_000 },
  currentMiles: 41_000,
  milesPerDay: 40,
  severeDuty: false,
  today: '2026-10-01',
  ...over,
})

describe('projectDue', () => {
  it('uses the mileage limit when it arrives first', () => {
    // 4,000 miles to go at 40/day = 100 days, before the 6-month limit on 2027-03-01
    expect(projectDue(input())).toMatchObject({
      dueDate: '2027-01-09',
      dueMiles: 45_000,
      trigger: 'miles',
      status: 'upcoming',
    })
  })

  it('uses the time limit for a car that is barely driven', () => {
    expect(projectDue(input({ milesPerDay: 2 }))).toMatchObject({
      dueDate: '2027-03-01',
      trigger: 'time',
    })
  })

  it('switches to severe-duty intervals', () => {
    // 3,000-mile interval: 2,000 to go at 40/day = 50 days
    expect(projectDue(input({ severeDuty: true }))).toMatchObject({
      dueDate: '2026-11-20',
      dueMiles: 43_000,
      trigger: 'miles',
    })
    // 3-month limit wins for a car that is barely driven
    expect(projectDue(input({ severeDuty: true, milesPerDay: 2 }))).toMatchObject({
      dueDate: '2026-12-01',
      trigger: 'time',
    })
  })

  it('marks items due within two weeks as due soon', () => {
    expect(projectDue(input({ today: '2027-01-01', currentMiles: 44_700 }))?.status).toBe(
      'due-soon',
    )
  })

  it('marks items past their mileage as overdue', () => {
    expect(projectDue(input({ currentMiles: 45_400 }))).toMatchObject({
      dueDate: '2026-09-21',
      status: 'overdue',
    })
  })

  it('guesses the next interval boundary when there is no history', () => {
    expect(projectDue(input({ lastService: undefined, currentMiles: 41_000 }))).toMatchObject({
      dueMiles: 45_000,
      trigger: 'miles',
      historyUnknown: true,
    })
  })

  it('treats a time-only item with no history as due now', () => {
    const wipers: MaintenanceItem = {
      id: 'w',
      configId: 'c1',
      task: 'Wiper blades',
      intervalMonths: 12,
    }
    expect(projectDue(input({ item: wipers, lastService: undefined }))).toMatchObject({
      dueDate: '2026-10-01',
      status: 'due-soon',
      historyUnknown: true,
    })
  })

  it('gives a parked car no mileage due date until it reaches the mileage', () => {
    const tyres: MaintenanceItem = { id: 't', configId: 'c1', task: 'Rotate', intervalMiles: 5_000 }
    expect(projectDue(input({ item: tyres, milesPerDay: 0 }))).toEqual({
      itemId: 't',
      task: 'Rotate',
      dueMiles: 45_000,
      trigger: 'miles',
      status: 'upcoming',
      historyUnknown: false,
    })
    expect(projectDue(input({ item: tyres, milesPerDay: 0, currentMiles: 45_000 }))).toMatchObject({
      dueDate: '2026-10-01',
      status: 'due-soon',
    })
  })

  it('skips the mileage limit when the car has no odometer readings at all', () => {
    expect(projectDue(input({ currentMiles: undefined, lastService: undefined }))).toMatchObject({
      dueDate: '2026-10-01',
      trigger: 'time',
      historyUnknown: true,
    })
    expect(projectDue(input({ currentMiles: undefined }))).toMatchObject({
      dueDate: '2027-03-01',
      dueMiles: 45_000,
      trigger: 'time',
    })
  })

  it('clamps absurdly distant projections instead of producing a broken date', () => {
    const due = projectDue(
      input({
        milesPerDay: 0.00005,
        item: { id: 'far', configId: 'c1', task: 'Far', intervalMiles: 5_000 },
      }),
    )
    expect(due?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('skips items with no interval', () => {
    expect(
      projectDue(input({ item: { id: 'x', configId: 'c1', task: 'Inspect' } })),
    ).toBeUndefined()
  })
})
