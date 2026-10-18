import { describe, expect, it } from 'vitest'
import type { TireSet, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryOdometer,
  memoryServiceRecords,
  memoryTireSets,
  sequentialIds,
} from '../../testing'
import { createTiresModel } from './model'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Subaru',
  model: 'Outback',
  nickname: 'Outback',
  severeDuty: false,
}

const allSeason: TireSet = {
  id: 't-all',
  vehicleId: 'v1',
  name: 'All-season',
  brand: 'Michelin CrossClimate 2',
  size: '225/65R17',
  madeWeek: 14,
  madeYear: 2023,
  mounted: true,
  mountedAtMiles: 30_000,
  priorMiles: 0,
  treadDepth32nds: 7,
  treadCheckedOn: '2026-09-01',
}
const winter: TireSet = {
  id: 't-winter',
  vehicleId: 'v1',
  name: 'Winter',
  madeWeek: 40,
  madeYear: 2021,
  mounted: false,
  priorMiles: 9_000,
}

const { madeWeek: _week, madeYear: _year, ...undated } = winter

const setup = (initial: TireSet[] = [], options: { readings?: boolean } = {}) => {
  const tireSets = memoryTireSets(initial)
  const odometer = memoryOdometer(
    options.readings === false
      ? []
      : [
          { vehicleId: 'v1', date: '2026-09-17', miles: 40_000 },
          { vehicleId: 'v1', date: '2026-10-17', miles: 41_000 },
        ],
  )
  const model = createTiresModel({
    vehicle: car,
    tireSets,
    records: memoryServiceRecords(),
    odometer,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('t'),
  })
  model.getState().start()
  return { model, tireSets, odometer }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('tires screen', () => {
  it('lists the set on the car first, with its age, miles and tread', async () => {
    const { model } = setup([winter, allSeason])
    await settle()
    const { rows, status } = model.getState()
    expect(status).toBe('ready')
    expect(rows[0]).toEqual({
      id: 't-all',
      title: 'All-season',
      subtitle: 'Michelin CrossClimate 2 · 225/65R17',
      mounted: true,
      place: 'On the car',
      age: '3 years 6 months old · Made Apr 2023',
      ageKnown: true,
      miles: '11,000 mi on this set',
      tread: '7/32″ tread on Sep 1',
      condition: 'ok',
      advice: undefined,
    })
    expect(rows[1]).toMatchObject({
      title: 'Winter',
      place: 'Stored',
      miles: '9,000 mi on this set',
      condition: 'inspect',
      advice: 'Five years old or more. Have a shop inspect them every year.',
    })
  })

  it('asks for the DOT code when the age is unknown', async () => {
    const { model } = setup([undated])
    await settle()
    expect(model.getState().rows[0]).toMatchObject({
      age: 'Add the DOT code from the sidewall to track their age',
      ageKnown: false,
      condition: 'ok',
    })
  })

  it('counts on as the odometer moves', async () => {
    const { model, odometer } = setup([allSeason])
    await settle()
    await odometer.add({ vehicleId: 'v1', date: '2026-10-17', miles: 42_500 })
    await settle()
    expect(model.getState().rows[0]?.miles).toBe('12,500 mi on this set')
  })

  describe('adding a set', () => {
    it('starts the first set on the car at the current odometer', async () => {
      const { model } = setup([])
      await settle()
      model.getState().openNew()
      expect(model.getState().form?.draft).toMatchObject({
        mounted: true,
        mountedAtMiles: '41,000',
      })
    })

    it('starts a second set in storage', async () => {
      const { model } = setup([allSeason])
      await settle()
      model.getState().openNew()
      expect(model.getState().form?.draft).toMatchObject({ mounted: false, mountedAtMiles: '' })
    })

    it('saves the set with its DOT date and a tread reading dated today', async () => {
      const { model, tireSets } = setup([allSeason])
      await settle()
      const s = model.getState()
      s.openNew()
      s.setField('name', ' Winter ')
      s.setField('dotCode', 'DOT 4B9X 4020')
      s.setField('priorMiles', '9,000')
      s.setField('treadDepth', '9')
      expect(await model.getState().save()).toBe(true)
      expect(model.getState().form).toBeUndefined()
      expect((await tireSets.listForVehicle('v1')).find((t) => t.id === 't-1')).toEqual({
        id: 't-1',
        vehicleId: 'v1',
        name: 'Winter',
        madeWeek: 40,
        madeYear: 2020,
        mounted: false,
        priorMiles: 9_000,
        treadDepth32nds: 9,
        treadCheckedOn: '2026-10-17',
      })
    })

    it('takes the set on the car off when a new one goes on', async () => {
      const { model, tireSets } = setup([allSeason])
      await settle()
      const s = model.getState()
      s.openNew()
      s.setField('name', 'Summer')
      s.setMounted(true)
      expect(model.getState().form?.draft.mountedAtMiles).toBe('41,000')
      expect(await model.getState().save()).toBe(true)
      const saved = await tireSets.listForVehicle('v1')
      expect(saved.find((t) => t.id === 't-all')).toMatchObject({
        mounted: false,
        priorMiles: 11_000,
      })
      expect(saved.find((t) => t.id === 't-1')).toMatchObject({
        mounted: true,
        mountedAtMiles: 41_000,
      })
    })

    it('explains what is wrong with the form, field by field', async () => {
      const { model } = setup([])
      await settle()
      const s = model.getState()
      s.openNew()
      s.setField('dotCode', '5921')
      s.setField('treadDepth', 'six')
      expect(await model.getState().save()).toBe(false)
      expect(model.getState().form?.fieldErrors).toEqual({
        name: 'Give the set a name, like All-season',
        dotCode: 'Enter the last 4 digits of the DOT code, like 2321',
        treadDepth: 'Enter 32nds of an inch, like 6',
      })
      model.getState().setField('dotCode', '2321')
      expect(model.getState().form?.fieldErrors.dotCode).toBeUndefined()
    })

    it('refuses a DOT week that has not happened yet', async () => {
      const { model } = setup([])
      await settle()
      const s = model.getState()
      s.openNew()
      s.setField('name', 'Summer')
      s.setField('dotCode', '5026')
      expect(await model.getState().save()).toBe(false)
      expect(model.getState().form?.fieldErrors.dotCode).toBe(
        'That week has not happened yet. Check the last 4 digits',
      )
    })

    it('keeps the form and says why when saving fails', async () => {
      const { model, tireSets } = setup([])
      await settle()
      model.getState().openNew()
      model.getState().setField('name', 'Summer')
      tireSets.failNext('Disk full')
      expect(await model.getState().save()).toBe(false)
      expect(model.getState().form).toMatchObject({ saving: false, error: 'Disk full' })
    })
  })

  describe('editing a set', () => {
    it('fills the form from the set, DOT code included', async () => {
      const { model } = setup([allSeason])
      await settle()
      model.getState().openEdit('t-all')
      expect(model.getState().form?.draft).toEqual({
        name: 'All-season',
        brand: 'Michelin CrossClimate 2',
        size: '225/65R17',
        dotCode: '1423',
        mounted: true,
        mountedAtMiles: '30,000',
        priorMiles: '',
        treadDepth: '7',
        notes: '',
      })
    })

    it('keeps the day the tread was measured unless the depth changes', async () => {
      const { model, tireSets } = setup([allSeason])
      await settle()
      model.getState().openEdit('t-all')
      model.getState().setField('notes', 'Rotated at the dealer')
      await model.getState().save()
      expect((await tireSets.listForVehicle('v1'))[0]?.treadCheckedOn).toBe('2026-09-01')

      model.getState().openEdit('t-all')
      model.getState().setField('treadDepth', '6')
      await model.getState().save()
      expect((await tireSets.listForVehicle('v1'))[0]).toMatchObject({
        treadDepth32nds: 6,
        treadCheckedOn: '2026-10-17',
      })
    })

    it('does not move a set on or off the car from the form', async () => {
      const { model, tireSets } = setup([allSeason, winter])
      await settle()
      model.getState().openEdit('t-winter')
      model.getState().setMounted(true)
      await model.getState().save()
      expect(
        (await tireSets.listForVehicle('v1')).filter((t) => t.mounted).map((t) => t.id),
      ).toEqual(['t-all'])
    })

    it('deletes only after a second tap', async () => {
      const { model, tireSets } = setup([winter])
      await settle()
      model.getState().openEdit('t-winter')
      expect(await model.getState().remove()).toBe(false)
      expect(model.getState().form?.confirmingDelete).toBe(true)
      expect(await model.getState().remove()).toBe(true)
      expect(await tireSets.listForVehicle('v1')).toEqual([])
    })
  })

  describe('swapping sets', () => {
    it('puts a stored set on and stores the other, keeping each one’s miles', async () => {
      const { model, tireSets } = setup([allSeason, winter])
      await settle()
      model.getState().openSwap('t-winter')
      expect(model.getState().swap).toEqual({
        id: 't-winter',
        title: 'Put Winter on the car',
        note: 'All-season comes off and is stored.',
        miles: '41,000',
        saving: false,
      })
      model.getState().setSwapMiles('41,200')
      expect(await model.getState().confirmSwap()).toBe(true)
      expect(model.getState().swap).toBeUndefined()
      const saved = await tireSets.listForVehicle('v1')
      expect(saved.find((t) => t.id === 't-winter')).toMatchObject({
        mounted: true,
        mountedAtMiles: 41_200,
        priorMiles: 9_000,
      })
      expect(saved.find((t) => t.id === 't-all')).toMatchObject({
        mounted: false,
        priorMiles: 11_200,
      })
      expect(saved.find((t) => t.id === 't-all')?.mountedAtMiles).toBeUndefined()
      await settle()
      expect(model.getState().rows.map((r) => r.title)).toEqual(['Winter', 'All-season'])
    })

    it('refuses a mileage below where the set on the car went on', async () => {
      const { model } = setup([allSeason, winter])
      await settle()
      model.getState().openSwap('t-winter')
      model.getState().setSwapMiles('29,000')
      expect(await model.getState().confirmSwap()).toBe(false)
      expect(model.getState().swap?.error).toBe(
        "That's less than the 30,000 mi the other set went on at",
      )
      model.getState().setSwapMiles('lots')
      expect(await model.getState().confirmSwap()).toBe(false)
      expect(model.getState().swap?.error).toBe('Enter the odometer in whole miles, like 41,250')
    })

    it('asks for the odometer when the car has no reading yet', async () => {
      const { model } = setup([winter], { readings: false })
      await settle()
      model.getState().openSwap('t-winter')
      expect(model.getState().swap).toMatchObject({ miles: '', note: undefined })
    })

    it('ignores a swap to the set already on the car', async () => {
      const { model } = setup([allSeason])
      await settle()
      model.getState().openSwap('t-all')
      expect(model.getState().swap).toBeUndefined()
    })
  })
})
