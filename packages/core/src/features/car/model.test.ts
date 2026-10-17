import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
} from '../../testing'
import { createCarModel, describeInterval } from './model'

const TODAY = '2026-10-17'
const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  trim: 'XLE',
  engine: '2.5L 4-cyl',
  drivetrain: 'AWD',
  vin: '2T3P1RFV5MC123456',
  nickname: 'RAV4',
  severeDuty: false,
}

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil & filter change',
  intervalMiles: 10_000,
  intervalMonths: 12,
  severeMiles: 5_000,
  severeMonths: 6,
}
const tires: MaintenanceItem = {
  id: 'tires',
  configId: 'c1',
  task: 'Tire rotation',
  intervalMiles: 5_000,
}
const brakeFluid: MaintenanceItem = {
  id: 'brake-fluid',
  configId: 'c1',
  task: 'Brake fluid',
  intervalMonths: 36,
}

// 60 miles a day, last read ten days ago.
const readings: OdometerReading[] = [
  { vehicleId: 'v1', date: '2026-07-09', miles: 30_000 },
  { vehicleId: 'v1', date: '2026-10-07', miles: 35_400 },
]

const done = (itemId: string, performedOn: string, odometerMiles?: number): ServiceRecord => ({
  id: `r-${itemId}`,
  vehicleId: 'v1',
  itemId,
  performedOn,
  ...(odometerMiles !== undefined && { odometerMiles }),
})

const setup = (
  options: { vehicle?: Vehicle; odometer?: OdometerReading[]; records?: ServiceRecord[] } = {},
) => {
  const vehicle = options.vehicle ?? car
  const odometer = memoryOdometer([...(options.odometer ?? readings)])
  const records = memoryServiceRecords(
    options.records ?? [
      done('oil', '2026-07-09', 30_000),
      done('tires', '2026-02-01', 25_000),
      done('brake-fluid', '2025-01-10'),
    ],
  )
  const model = createCarModel({
    vehicle,
    vehicles: memoryVehicles([vehicle]),
    schedule: memorySchedule([oil, tires, brakeFluid]),
    records,
    odometer,
    clock: fixedClock(TODAY),
  })
  return { model, odometer, records }
}

// The in-memory repos resolve at once, so a few microtask turns let a refresh finish.
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('car model', () => {
  it('names the car and what is known about it', () => {
    const s = setup().model.getState()
    expect(s.title).toBe('2021 Toyota RAV4')
    expect(s.subtitle).toBe('XLE · 2.5L 4-cyl · AWD · VIN ••••3456')
    expect(s.scheduleTitle).toBe('Toyota schedule · normal driving')
    expect(s.section).toBe('schedule')
  })

  it('lists the schedule soonest first with intervals and when each is next due', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().schedule.map((r) => [r.task, r.interval, r.next])).toEqual([
      ['Tire rotation', 'Every 5,000 mi', 'Overdue'],
      ['Oil & filter change', 'Every 10,000 mi or 12 months', '40,000 mi'],
      ['Brake fluid', 'Every 3 years', 'Jan 2028'],
    ])
  })

  it('shows the estimated odometer and how much the car is driven', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({
      status: 'ready',
      odometer: 'About 35,960 mi',
      pace: 'About 1,720 mi a month',
    })
  })

  it('says when the driving rate is only the US average', async () => {
    const { model } = setup({ odometer: [], records: [] })
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({
      odometer: undefined,
      pace: 'Assuming the US average until there are two readings',
    })
  })

  it('saves a new odometer reading and updates the page', async () => {
    const { model, odometer } = setup()
    model.getState().start()
    await settle()
    model.getState().editOdometer()
    model.getState().setOdometer('36,500')
    expect(await model.getState().saveOdometer()).toBe(true)
    expect(await odometer.listForVehicle('v1')).toContainEqual({
      vehicleId: 'v1',
      date: TODAY,
      miles: 36_500,
    })
    expect(model.getState()).toMatchObject({ editingOdometer: undefined, odometer: '36,500 mi' })
  })

  it('rejects a reading that is not whole miles or goes backwards', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    model.getState().editOdometer()
    model.getState().setOdometer('36.5k')
    expect(await model.getState().saveOdometer()).toBe(false)
    expect(model.getState().editingOdometer?.error).toBe('Enter whole miles, digits only')
    model.getState().setOdometer('20000')
    expect(model.getState().editingOdometer?.error).toBeUndefined()
    expect(await model.getState().saveOdometer()).toBe(false)
    expect(model.getState().editingOdometer?.error).toBe(
      "That's less than the last reading of 35,400 mi",
    )
  })

  it('closes the odometer editor without saving on cancel', () => {
    const { model } = setup()
    model.getState().editOdometer()
    model.getState().cancelOdometer()
    expect(model.getState().editingOdometer).toBeUndefined()
  })

  it('switches between the schedule, recalls and known issues', () => {
    const { model } = setup()
    model.getState().showSection('recalls')
    expect(model.getState().section).toBe('recalls')
  })

  it('has no schedule before the car has synced its configuration', async () => {
    const { configId: _, ...unmatched } = car
    const { model } = setup({ vehicle: unmatched })
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({ status: 'unmatched', schedule: [] })
  })
})

describe('describeInterval', () => {
  it('uses the severe intervals for severe driving', () => {
    expect(describeInterval(oil, true)).toBe('Every 5,000 mi or 6 months')
  })

  it('falls back to the normal interval when there is no severe one', () => {
    expect(describeInterval(tires, true)).toBe('Every 5,000 mi')
  })
})
