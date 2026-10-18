import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryCustomItems,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
} from '../../testing'
import { createGarageCardsModel } from './cards'

const TODAY = '2026-10-17'
const rav4: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}
const civic: Vehicle = {
  id: 'v2',
  configId: 'c1',
  year: 2018,
  make: 'Honda',
  model: 'Civic',
  nickname: 'Civic',
  severeDuty: false,
}

const item = (id: string, task: string, intervalMiles?: number, intervalMonths?: number) =>
  ({
    id,
    configId: 'c1',
    task,
    ...(intervalMiles !== undefined && { intervalMiles }),
    ...(intervalMonths !== undefined && { intervalMonths }),
  }) as MaintenanceItem

const oil = item('oil', 'Oil & filter change', 10_000, 12)
const tires = item('tires', 'Tire rotation', 5_000, 6)

// Both about 60 miles a day, last read ten days ago.
const readings: OdometerReading[] = [
  { vehicleId: 'v1', date: '2026-07-09', miles: 30_000 },
  { vehicleId: 'v1', date: '2026-10-07', miles: 35_400 },
  { vehicleId: 'v2', date: '2026-07-09', miles: 60_000 },
  { vehicleId: 'v2', date: '2026-10-07', miles: 65_400 },
]

const done = (vehicleId: string, itemId: string, performedOn: string, odometerMiles: number) =>
  ({
    id: `${vehicleId}-${itemId}-${performedOn}`,
    vehicleId,
    itemId,
    performedOn,
    odometerMiles,
  }) as ServiceRecord

const history = [
  done('v1', 'oil', '2026-07-09', 30_000),
  done('v1', 'tires', '2026-02-01', 25_000),
  done('v2', 'oil', '2026-09-01', 63_000),
  done('v2', 'tires', '2026-09-01', 63_000),
]

const setup = (
  options: {
    cars?: Vehicle[]
    items?: MaintenanceItem[]
    records?: ServiceRecord[]
    custom?: ReturnType<typeof memoryCustomItems>
  } = {},
) => {
  const records = memoryServiceRecords(options.records ?? history)
  const custom = options.custom ?? memoryCustomItems()
  const model = createGarageCardsModel({
    cars: options.cars ?? [rav4, civic],
    schedule: memorySchedule(options.items ?? [oil, tires], custom),
    records,
    odometer: memoryOdometer(readings),
    clock: fixedClock(TODAY),
  })
  return { model, records, custom }
}

// The in-memory repos resolve at once, so a few microtask turns let a refresh finish.
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('garage cards model', () => {
  it('knows no car is due for anything until the schedules have been read', () => {
    expect(setup().model.getState().nextDue).toEqual({})
  })

  it('gives each car its own item due soonest, overdue ones first', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    const { nextDue } = model.getState()
    expect(nextDue.v1).toMatchObject({
      task: 'Tire rotation',
      status: 'overdue',
      when: 'Was due at 30,000 mi',
    })
    expect(nextDue.v2).toMatchObject({ task: 'Tire rotation', status: 'upcoming' })
    expect(nextDue.v2?.when).toMatch(/^In /)
  })

  it('moves a car on when a service is logged for it, leaving the others alone', async () => {
    const { model, records } = setup()
    model.getState().start()
    await settle()
    const civicBefore = model.getState().nextDue.v2
    await records.add(done('v1', 'tires', '2026-10-16', 36_000))
    await settle()
    const { nextDue } = model.getState()
    expect(nextDue.v1).toMatchObject({ task: 'Oil & filter change', status: 'upcoming' })
    expect(nextDue.v2).toEqual(civicBefore)
  })

  it("follows the owner's own interval for an item", async () => {
    const custom = memoryCustomItems()
    const { model } = setup({ custom })
    model.getState().start()
    await settle()
    expect(model.getState().nextDue.v2?.task).toBe('Tire rotation')
    // The owner changes the Civic's oil to every 4,000 miles, so it comes round before the tires.
    await custom.save({
      id: 'own-oil',
      vehicleId: 'v2',
      replacesItemId: 'oil',
      task: 'Oil & filter change',
      intervalMiles: 4_000,
    })
    await settle()
    expect(model.getState().nextDue.v2).toMatchObject({
      task: 'Oil & filter change',
      when: 'In 980 mi',
    })
    expect(model.getState().nextDue.v1?.task).toBe('Tire rotation')
  })

  it("guesses from the model year when an item has no record, so a new car's is not due at once", async () => {
    const brandNew: Vehicle = { ...rav4, id: 'v3', year: 2026 }
    const { model } = setup({
      cars: [brandNew],
      items: [item('brake-fluid', 'Brake fluid', undefined, 36)],
      records: [],
    })
    model.getState().start()
    await settle()
    expect(model.getState().nextDue.v3).toMatchObject({
      task: 'Brake fluid',
      status: 'upcoming',
      when: 'By Jan 1, 2029',
    })
  })

  it('leaves out a car with nothing scheduled', async () => {
    const { configId: _, ...rest } = civic
    const unmatched: Vehicle = { ...rest, id: 'v4' }
    const { model } = setup({ cars: [rav4, unmatched] })
    model.getState().start()
    await settle()
    expect(Object.keys(model.getState().nextDue)).toEqual(['v1'])
  })

  it('stops following the cars once disposed', async () => {
    const { model, records } = setup()
    model.getState().start()
    await settle()
    const before = model.getState().nextDue.v1
    model.getState().dispose()
    await records.add(done('v1', 'tires', '2026-10-16', 36_000))
    await settle()
    expect(model.getState().nextDue.v1).toEqual(before)
  })
})
