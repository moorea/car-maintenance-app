import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, Vehicle } from '../../domain/types'
import { memorySchedule, memoryVehicles } from '../../testing'
import { assessDriving, DRIVING_QUESTIONS, severeDifferences } from './conditions'
import { createDrivingModel } from './model'

const vehicle: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}

const items: MaintenanceItem[] = [
  {
    id: 'oil',
    configId: 'c1',
    kind: 'engine-oil',
    source: 'baseline',
    task: 'Oil & filter change',
    intervalMiles: 5_000,
    intervalMonths: 6,
    severeMiles: 3_000,
    severeMonths: 6,
  },
  {
    id: 'tires',
    configId: 'c1',
    task: 'Tire rotation',
    intervalMiles: 5_000,
    intervalMonths: 6,
  },
]

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const setup = async (v: Vehicle = vehicle) => {
  const vehicles = memoryVehicles([v])
  const model = createDrivingModel({ vehicle: v, vehicles, schedule: memorySchedule(items) })
  model.getState().start()
  await settle()
  return { model, vehicles, state: () => model.getState() }
}

describe('assessDriving', () => {
  it('keeps the normal schedule when no condition applies', () => {
    expect(assessDriving({})).toEqual({ severe: false, reasons: [] })
    expect(assessDriving({ towing: false })).toEqual({ severe: false, reasons: [] })
  })

  it('picks the severe schedule when any condition applies, saying why', () => {
    expect(assessDriving({ 'short-trips': true, dust: true })).toEqual({
      severe: true,
      reasons: [
        'Short trips never get the oil hot enough to boil off water and fuel.',
        'Dust clogs the filters, and mud and salt get into the brakes and suspension.',
      ],
    })
  })

  it('asks about each condition once', () => {
    const ids = DRIVING_QUESTIONS.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('severeDifferences', () => {
  it('lists only the items that come due sooner on the severe schedule', () => {
    expect(severeDifferences(items)).toEqual([
      {
        task: 'Oil & filter change',
        normal: 'Every 5,000 mi or 6 months',
        severe: 'Every 3,000 mi or 6 months',
      },
    ])
  })
})

describe('driving model', () => {
  it('shows the current schedule and what severe driving changes', async () => {
    const { state } = await setup()
    expect(state()).toMatchObject({
      status: 'ready',
      carTitle: '2021 Toyota RAV4',
      severeNow: false,
      generalSchedule: true,
      assessment: { severe: false },
    })
    expect(state().differences).toHaveLength(1)
  })

  it('recommends the severe schedule as soon as a condition applies, and back again', async () => {
    const { state } = await setup()
    state().answer('stop-and-go', true)
    expect(state().assessment.severe).toBe(true)
    state().answer('stop-and-go', false)
    expect(state().assessment).toEqual({ severe: false, reasons: [] })
  })

  it('saves the chosen schedule to the car', async () => {
    const { state, vehicles } = await setup()
    state().answer('towing', true)
    await expect(state().choose(true)).resolves.toBe(true)
    expect(state()).toMatchObject({ status: 'ready', severeNow: true })
    expect((await vehicles.get('v1'))?.severeDuty).toBe(true)
  })

  it('lets the owner go back to the normal schedule', async () => {
    const { state, vehicles } = await setup({ ...vehicle, severeDuty: true })
    expect(state().severeNow).toBe(true)
    await state().choose(false)
    expect((await vehicles.get('v1'))?.severeDuty).toBe(false)
  })

  it('says when the choice could not be saved, keeping the old schedule', async () => {
    const { state, vehicles } = await setup()
    vehicles.failNextAdd('disk full')
    await expect(state().choose(true)).resolves.toBe(false)
    expect(state()).toMatchObject({
      status: 'ready',
      severeNow: false,
      error: 'Couldn’t save the schedule. Try again.',
    })
  })

  it('asks the questions before the car has synced its schedule', async () => {
    const { configId: _, ...unsynced } = vehicle
    const { state } = await setup(unsynced)
    expect(state()).toMatchObject({ status: 'ready', differences: [] })
  })

  it('still asks the questions when the schedule cannot be read', async () => {
    const model = createDrivingModel({
      vehicle,
      vehicles: memoryVehicles([vehicle]),
      schedule: { itemsForConfig: () => Promise.reject(new Error('offline')) },
    })
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({ status: 'ready', differences: [] })
  })

  it('ignores a second choice while the first is saving', async () => {
    const { state } = await setup()
    const first = state().choose(true)
    await expect(state().choose(false)).resolves.toBe(false)
    await first
    expect(state().severeNow).toBe(true)
  })
})
