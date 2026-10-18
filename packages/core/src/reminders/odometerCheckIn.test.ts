import { describe, expect, it } from 'vitest'
import {
  checkInNoticeDate,
  checkInShowing,
  firstReadingRequest,
  odometerCheckIn,
} from './odometerCheckIn'
import type { DueProjection } from './projectDue'

const oil: DueProjection = {
  itemId: 'oil',
  task: 'Oil change',
  dueDate: '2026-12-01',
  dueMiles: 45_000,
  trigger: 'miles',
  status: 'upcoming',
  historyUnknown: false,
}
const fluid: DueProjection = {
  itemId: 'fluid',
  task: 'Brake fluid',
  dueDate: '2026-11-01',
  trigger: 'time',
  status: 'upcoming',
  historyUnknown: false,
}
const learned = (date: string) => ({
  isDefault: false,
  latest: { vehicleId: 'v1', date, miles: 40_000 },
})

describe('asking for an odometer reading', () => {
  it('asks three weeks before the next mileage item when the reading will be a month old', () => {
    expect(odometerCheckIn([fluid, oil], learned('2026-09-01'))).toEqual({
      itemId: 'oil',
      task: 'Oil change',
      dueMiles: 45_000,
      dueDate: '2026-12-01',
      readOn: '2026-09-01',
      from: '2026-11-10',
    })
  })

  it('waits for the reading to go stale when it is newer than the lead-up', () => {
    expect(odometerCheckIn([oil], learned('2026-10-25'))?.from).toBe('2026-11-24')
  })

  it('does not ask when the reading stays fresh until the item is due', () => {
    expect(odometerCheckIn([oil], learned('2026-11-05'))).toBeUndefined()
  })

  it('asks about a later mileage item when the reading is fresh enough for the next one', () => {
    const rotation = { ...oil, itemId: 'rotate', task: 'Tire rotation', dueDate: '2026-11-15' }
    expect(odometerCheckIn([rotation, oil], learned('2026-11-01'))).toMatchObject({
      itemId: 'oil',
      from: '2026-12-01',
    })
  })

  it('asks after two weeks while the pace is still the US average', () => {
    const guessed = {
      isDefault: true,
      latest: { vehicleId: 'v1', date: '2026-11-05', miles: 40_000 },
    }
    expect(odometerCheckIn([oil], guessed)?.from).toBe('2026-11-19')
  })

  it('asks about an item only estimated to be overdue, since it may not be due yet', () => {
    const late = { ...oil, dueDate: '2026-10-01', status: 'overdue' as const }
    expect(odometerCheckIn([late], learned('2026-08-01'))?.from).toBe('2026-09-10')
  })

  it('does not ask about items due by time, passed by a reading, or with no readings', () => {
    expect(odometerCheckIn([fluid], learned('2026-01-01'))).toBeUndefined()
    const passed = { ...oil, dueMiles: 39_000, status: 'overdue' as const }
    expect(odometerCheckIn([passed], learned('2026-01-01'))).toBeUndefined()
    expect(odometerCheckIn([oil], { isDefault: true })).toBeUndefined()
  })

  it('shows in the app from its first day until a reading arrives', () => {
    const checkIn = odometerCheckIn([oil], learned('2026-09-01'))
    expect(checkInShowing(checkIn, '2026-11-09')).toBe(false)
    expect(checkInShowing(checkIn, '2026-11-10')).toBe(true)
    expect(checkInShowing(checkIn, '2026-12-01')).toBe(true)
    expect(checkInShowing(checkIn, '2026-12-20')).toBe(true)
    expect(checkInShowing(undefined, '2026-11-10')).toBe(false)
  })

  it('is sent once, on its first day, and not in the last week before the item is due', () => {
    const checkIn = odometerCheckIn([oil], learned('2026-09-01'))
    const late = odometerCheckIn([oil], learned('2026-10-26'))
    if (!checkIn || !late) throw new Error('expected a check-in')
    expect(checkInNoticeDate(checkIn, '2026-10-17')).toBe('2026-11-10')
    expect(checkInNoticeDate(checkIn, '2026-11-10')).toBeUndefined()
    expect(late.from).toBe('2026-11-25')
    expect(checkInNoticeDate(late, '2026-10-17')).toBeUndefined()
  })
})

describe('asking for a first odometer reading', () => {
  const unknown = (itemId: string, task: string): DueProjection => ({
    itemId,
    task,
    trigger: 'miles',
    status: 'unknown',
    historyUnknown: true,
  })

  it('asks when items due by mileage cannot be dated for want of any reading', () => {
    const atf = unknown('atf', 'Transmission fluid')
    const plugs = unknown('plugs', 'Spark plugs')
    expect(firstReadingRequest([fluid, atf, plugs])).toEqual({
      itemId: 'atf',
      task: 'Transmission fluid',
      others: 1,
    })
  })

  it('does not ask when every item can be dated', () => {
    expect(firstReadingRequest([fluid, oil])).toBeUndefined()
  })
})
