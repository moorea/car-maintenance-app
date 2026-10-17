import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryOdometer,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
} from '../../testing'
import { createGarageModel } from './model'

const TODAY = '2026-10-17'
const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
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
const brakeFluid = item('brake-fluid', 'Brake fluid', undefined, 36)

// About 60 miles a day, last read ten days ago.
const readings: OdometerReading[] = [
  { vehicleId: 'v1', date: '2026-07-09', miles: 30_000 },
  { vehicleId: 'v1', date: '2026-10-07', miles: 35_400 },
]

const done = (id: string, itemId: string, performedOn: string, odometerMiles: number) =>
  ({ id, vehicleId: 'v1', itemId, performedOn, odometerMiles }) as ServiceRecord

const setup = (
  options: {
    vehicle?: Vehicle
    items?: MaintenanceItem[]
    records?: ServiceRecord[]
    odometer?: OdometerReading[]
  } = {},
) => {
  const vehicle = options.vehicle ?? car
  const records = memoryServiceRecords(options.records ?? [])
  const safety = memorySafety()
  const model = createGarageModel({
    vehicle,
    vehicles: memoryVehicles([vehicle]),
    schedule: memorySchedule(options.items ?? [oil, tires, brakeFluid]),
    records,
    odometer: memoryOdometer(options.odometer ?? readings),
    clock: fixedClock(TODAY),
    safety,
  })
  return { model, records, safety }
}

// The in-memory repos resolve at once, so a few microtask turns let a refresh finish.
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('garage model', () => {
  it('is loading until the schedule has been read, with today as its heading', () => {
    expect(setup().model.getState()).toMatchObject({
      status: 'loading',
      today: 'Saturday, Oct 17',
    })
  })

  it('puts the overdue item first and lists what follows', async () => {
    const { model } = setup({
      records: [
        done('r1', 'oil', '2026-07-09', 30_000),
        done('r2', 'tires', '2026-02-01', 25_000),
        done('r3', 'brake-fluid', '2025-01-10', 20_000),
      ],
    })
    model.getState().start()
    await settle()
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.nextUp).toMatchObject({
      task: 'Tire rotation',
      status: 'overdue',
      when: 'Was due at 30,000 mi',
      detail: 'Was due at 30,000 mi.',
      progress: 1,
    })
    expect(s.comingUp.map((r) => [r.task, r.when])).toEqual([
      ['Oil & filter change', 'In 4,040 mi'],
      ['Brake fluid', 'By Jan 10, 2028'],
    ])
  })

  it('says roughly when a mileage limit will be reached and how much of it is used', async () => {
    const { model } = setup({ items: [oil], records: [done('r1', 'oil', '2026-07-09', 30_000)] })
    model.getState().start()
    await settle()
    const next = model.getState().nextUp
    expect(next?.when).toBe('In 4,000 mi')
    expect(next?.detail).toBe('Due in 4,000 mi, around Dec 23.')
    expect(next?.progress).toBeCloseTo(0.6, 1)
  })

  it('says when an item with no record is only a guess', async () => {
    const { model } = setup({ items: [oil] })
    model.getState().start()
    await settle()
    expect(model.getState().nextUp?.detail).toContain("There's no record of it yet")
  })

  it('shows the estimated odometer and when it was last read', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().odometer).toBe('About 36,000 mi · updated 10 days ago')
  })

  it('shows the exact odometer when it was read today', async () => {
    const { model } = setup({ odometer: [{ vehicleId: 'v1', date: TODAY, miles: 36_012 }] })
    model.getState().start()
    await settle()
    expect(model.getState().odometer).toBe('36,012 mi')
  })

  it('moves the schedule on when a service is logged', async () => {
    const { model, records } = setup({
      items: [tires],
      records: [done('r2', 'tires', '2026-02-01', 25_000)],
    })
    model.getState().start()
    await settle()
    expect(model.getState().nextUp?.status).toBe('overdue')
    await records.add(done('r3', 'tires', TODAY, 36_000))
    await settle()
    expect(model.getState().nextUp).toMatchObject({ status: 'upcoming', when: 'In 5,000 mi' })
  })

  it('has no schedule for a car that has not synced its configuration', async () => {
    const { configId: _, ...unmatched } = car
    const { model } = setup({ vehicle: unmatched })
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({ status: 'unmatched', nextUp: undefined })
  })

  it('counts the model year recalls once NHTSA has been checked', async () => {
    const { model, safety } = setup()
    model.getState().start()
    expect(model.getState().recalls).toBeUndefined()
    const recall = {
      id: 'r',
      configId: 'c1',
      campaign: '26V001000',
      summary: 'Wiring may short.',
      parkIt: false,
      parkOutside: true,
      overTheAir: false,
    }
    safety.set('c1', { recallsCheckedAt: TODAY, recalls: [recall], complaints: [] })
    expect(model.getState().recalls).toEqual({ count: 1, urgent: true })
  })

  it('stops following changes once disposed', async () => {
    const { model, records } = setup({ items: [tires] })
    model.getState().start()
    await settle()
    const before = model.getState().nextUp
    model.getState().dispose()
    await records.add(done('r3', 'tires', TODAY, 36_000))
    await settle()
    expect(model.getState().nextUp).toEqual(before)
  })
})
