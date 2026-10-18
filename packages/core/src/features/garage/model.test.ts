import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryOdometer,
  memoryPreferences,
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
    preferences?: ReturnType<typeof memoryPreferences>
  } = {},
) => {
  const vehicle = options.vehicle ?? car
  const records = memoryServiceRecords(options.records ?? [])
  const safety = memorySafety()
  const odometer = memoryOdometer(options.odometer ?? readings)
  const model = createGarageModel({
    vehicle,
    vehicles: memoryVehicles([vehicle]),
    schedule: memorySchedule(options.items ?? [oil, tires, brakeFluid]),
    records,
    odometer,
    clock: fixedClock(TODAY),
    safety,
    ...(options.preferences && { preferences: options.preferences }),
  })
  return { model, records, odometer, safety }
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

  it('asks the assistant about the next item, saying whether it is overdue', async () => {
    const { model } = setup({
      items: [oil, tires],
      records: [done('r1', 'oil', '2026-07-09', 30_000), done('r2', 'tires', '2026-02-01', 25_000)],
    })
    model.getState().start()
    await settle()
    expect(model.getState().nextUp?.question).toBe(
      'My car is overdue for tire rotation. What does it involve, and can it wait?',
    )
  })

  it('asks about a next item that is not due yet as coming up', async () => {
    const { model } = setup({ items: [oil], records: [done('r1', 'oil', '2026-07-09', 30_000)] })
    model.getState().start()
    await settle()
    expect(model.getState().nextUp?.question).toBe(
      'My car is due soon for oil & filter change. What does it involve, and can it wait?',
    )
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

  it('stops following odometer readings once disposed', async () => {
    const { model, odometer } = setup({ items: [tires] })
    model.getState().start()
    await settle()
    const before = model.getState().odometer
    model.getState().dispose()
    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 36_600 })
    await settle()
    expect(model.getState().odometer).toBe(before)
  })

  it('refreshes when an odometer reading is added', async () => {
    const { model, odometer } = setup({
      items: [tires],
      records: [done('r2', 'tires', '2026-07-01', 31_500)],
    })
    model.getState().start()
    await settle()
    expect(model.getState().odometer).toBe('About 35,800 mi · updated 10 days ago')
    expect(model.getState().nextUp).toMatchObject({ status: 'upcoming', when: 'In 700 mi' })
    // A reading saved elsewhere, here or arriving by sync, not a logged service.
    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 36_600 })
    await settle()
    expect(model.getState().odometer).toBe('36,600 mi')
    expect(model.getState().nextUp).toMatchObject({
      status: 'overdue',
      when: 'Was due at 36,500 mi',
    })
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

  it('shows an error and no stale rows when the schedule cannot be read', async () => {
    // The vehicle repo does not know the car, so reading its schedule throws.
    const failing = createGarageModel({
      vehicle: car,
      vehicles: memoryVehicles([]),
      schedule: memorySchedule([oil]),
      records: memoryServiceRecords(),
      odometer: memoryOdometer(readings),
      clock: fixedClock(TODAY),
      safety: memorySafety(),
    })
    failing.getState().start()
    await settle()
    expect(failing.getState()).toMatchObject({
      status: 'ready',
      nextUp: undefined,
      comingUp: [],
      error: 'Unknown vehicle v1',
    })
  })
})

describe('garage model, filling in the history', () => {
  const engineOil = { ...oil, kind: 'engine-oil' }

  it('asks about oil first when the car has no service records', async () => {
    const { model } = setup({ items: [tires, engineOil, brakeFluid] })
    model.getState().start()
    await settle()
    expect(model.getState().catchUp).toEqual({
      itemId: 'oil',
      task: 'Oil & filter change',
      others: 2,
    })
  })

  it('moves on to the next item once one is logged, and stops once all are', async () => {
    const { model, records } = setup({ items: [engineOil, tires] })
    model.getState().start()
    await settle()
    await records.add(done('r1', 'oil', '2026-09-01', 34_000))
    await settle()
    expect(model.getState().catchUp).toEqual({ itemId: 'tires', task: 'Tire rotation', others: 0 })
    await records.add(done('r2', 'tires', '2026-08-01', 33_000))
    await settle()
    expect(model.getState().catchUp).toBeUndefined()
  })

  it('only asks about services the car is old enough or has driven far enough to have needed', async () => {
    const plugs = item('plugs', 'Spark plugs', 60_000)
    const coolant = item('coolant', 'Engine coolant', undefined, 120)
    const { model } = setup({ items: [engineOil, plugs, coolant, brakeFluid] })
    model.getState().start()
    await settle()
    // 36,000 miles on a 2021: oil (10,000) and brake fluid (36 months) have come round; spark
    // plugs (60,000) and coolant (10 years) have not.
    expect(model.getState().catchUp).toMatchObject({ itemId: 'oil', others: 1 })
  })

  it('stops asking about a car once the owner says not now, and remembers it', async () => {
    const preferences = memoryPreferences({ historyDismissed: ['other-car'] })
    const { model } = setup({ items: [engineOil], preferences })
    model.getState().start()
    await settle()
    expect(model.getState().catchUp).toBeDefined()
    model.getState().dismissCatchUp()
    expect(model.getState().catchUp).toBeUndefined()
    await settle()
    let saved: string[] = []
    preferences.watch((p) => (saved = p.historyDismissed))()
    expect(saved).toEqual(['other-car', 'v1'])

    const again = setup({ items: [engineOil], preferences }).model
    again.getState().start()
    await settle()
    expect(again.getState().catchUp).toBeUndefined()
  })

  it('asks for a reading when the next mileage item is close and rests on an old one', async () => {
    // Last read eight weeks ago at 60 miles a day: the tire rotation at 40,000 is about 19 days off.
    const old: OdometerReading[] = [
      { vehicleId: 'v1', date: '2026-05-23', miles: 30_000 },
      { vehicleId: 'v1', date: '2026-08-21', miles: 35_400 },
    ]
    const { model, odometer } = setup({ items: [tires], odometer: old })
    model.getState().start()
    await settle()
    expect(model.getState().checkOdometer).toEqual({
      task: 'Tire rotation',
      dueMiles: 'around 40,000 mi',
      readAgo: '8 weeks ago',
    })

    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 38_900 })
    await settle()
    expect(model.getState().checkOdometer).toBeUndefined()
  })

  it('does not ask for a reading while the last one is recent', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().checkOdometer).toBeUndefined()
  })
})
