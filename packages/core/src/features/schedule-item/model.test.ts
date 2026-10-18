import { describe, expect, it } from 'vitest'
import type { CustomItem, MaintenanceItem, Vehicle } from '../../domain/types'
import { memoryCustomItems, memorySchedule, sequentialIds } from '../../testing'
import { createScheduleItemModel } from './model'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil & filter change',
  source: 'motor',
  intervalMiles: 10_000,
  intervalMonths: 12,
  severeMiles: 5_000,
  severeMonths: 6,
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const setup = async (options: { vehicle?: Vehicle; custom?: CustomItem[] } = {}) => {
  const customItems = memoryCustomItems(options.custom)
  const schedule = memorySchedule([oil], customItems)
  const model = createScheduleItemModel({
    vehicle: options.vehicle ?? car,
    schedule,
    customItems,
    ids: sequentialIds('own'),
  })
  model.getState().start()
  await settle()
  const state = () => model.getState()
  const scheduleNow = () => schedule.itemsForVehicle(options.vehicle ?? car)
  return { state, customItems, scheduleNow }
}

describe('schedule item model', () => {
  it("adds an item of the owner's own to the car's schedule", async () => {
    const { state, scheduleNow } = await setup()
    state().openNew()
    state().setField('task', ' Cabin air filter ')
    state().setField('intervalMiles', '15,000')
    state().setField('intervalMonths', '12')
    expect(await state().save()).toBe(true)
    expect(state().form).toBeUndefined()
    expect((await scheduleNow())[1]).toMatchObject({
      id: 'own-1',
      task: 'Cabin air filter',
      intervalMiles: 15_000,
      intervalMonths: 12,
      owner: 'added',
    })
  })

  it('asks for a name and at least one interval', async () => {
    const { state, customItems } = await setup()
    state().openNew()
    expect(await state().save()).toBe(false)
    expect(state().form?.fieldErrors).toEqual({
      task: 'Name the item, like Cabin air filter',
      intervalMiles: 'Enter how often it is due in miles, months, or both',
    })
    // Typing months answers the "at least one interval" error on the miles field.
    state().setField('intervalMonths', '6')
    expect(state().form?.fieldErrors.intervalMiles).toBeUndefined()
    state().setField('intervalMiles', '5 thousand')
    state().setField('task', 'Wipers')
    expect(await state().save()).toBe(false)
    expect(state().form?.fieldErrors).toEqual({ intervalMiles: 'Enter whole miles, like 5,000' })
    expect(await customItems.listForVehicle('v1')).toEqual([])
  })

  it("opens a schedule item with the interval that applies, and what the maker's schedule says", async () => {
    const { state } = await setup({ vehicle: { ...car, severeDuty: true } })
    state().openItem('oil')
    expect(state().form).toMatchObject({
      mode: 'change',
      draft: { task: 'Oil & filter change', intervalMiles: '5000', intervalMonths: '6' },
      scheduleInterval: 'Toyota schedule: every 5,000 mi or 6 months',
      canReset: false,
    })
  })

  it("sets the owner's own interval for a schedule item, and puts it back", async () => {
    const { state, scheduleNow, customItems } = await setup()
    state().openItem('oil')
    state().setField('intervalMiles', '5000')
    state().setField('intervalMonths', '')
    expect(await state().save()).toBe(true)
    await settle()
    expect((await scheduleNow())[0]).toEqual({
      id: 'oil',
      configId: 'c1',
      task: 'Oil & filter change',
      source: 'motor',
      intervalMiles: 5_000,
      owner: 'changed',
    })

    // Changing it again edits the same replacement rather than adding another.
    state().openItem('oil')
    expect(state().form).toMatchObject({ canReset: true, draft: { intervalMiles: '5000' } })
    state().setField('intervalMiles', '7500')
    await state().save()
    await settle()
    expect(await customItems.listForVehicle('v1')).toEqual([
      {
        id: 'own-1',
        vehicleId: 'v1',
        replacesItemId: 'oil',
        task: 'Oil & filter change',
        intervalMiles: 7_500,
      },
    ])

    state().openItem('oil')
    expect(await state().reset()).toBe(true)
    expect(await customItems.listForVehicle('v1')).toEqual([])
    expect((await scheduleNow())[0]).toEqual(oil)
  })

  it("treats typing the schedule's own interval back in as going back to it", async () => {
    const { state, customItems } = await setup({
      custom: [
        { id: 'x', vehicleId: 'v1', replacesItemId: 'oil', task: 'Oil', intervalMiles: 5_000 },
      ],
    })
    state().openItem('oil')
    state().setField('intervalMiles', '10,000')
    state().setField('intervalMonths', '12')
    expect(await state().save()).toBe(true)
    expect(await customItems.listForVehicle('v1')).toEqual([])
  })

  it("edits and deletes the owner's own item, deleting only once confirmed", async () => {
    const { state, customItems } = await setup({
      custom: [{ id: 'w', vehicleId: 'v1', task: 'Wiper blades', intervalMonths: 12 }],
    })
    state().openItem('w')
    expect(state().form).toMatchObject({
      mode: 'own',
      draft: { task: 'Wiper blades', intervalMiles: '', intervalMonths: '12' },
    })
    state().setField('task', 'Wiper blades, front')
    await state().save()
    expect((await customItems.listForVehicle('v1'))[0]?.task).toBe('Wiper blades, front')

    state().openItem('w')
    expect(await state().remove()).toBe(false)
    expect(state().form?.confirmingDelete).toBe(true)
    expect(await state().remove()).toBe(true)
    expect(await customItems.listForVehicle('v1')).toEqual([])
  })

  it('keeps the form open with the error when saving fails', async () => {
    const { state, customItems } = await setup()
    state().openNew()
    state().setField('task', 'Cabin air filter')
    state().setField('intervalMonths', '12')
    customItems.failNext('Disk full')
    expect(await state().save()).toBe(false)
    expect(state().form).toMatchObject({ saving: false, error: 'Disk full' })
  })
})
