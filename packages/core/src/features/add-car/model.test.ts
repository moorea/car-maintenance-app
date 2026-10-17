import { describe, expect, it } from 'vitest'
import type { DecodedVin, Vehicle } from '../../domain/types'
import { fixedClock, memoryVehicles, memoryVinDecoder, OWNER, sequentialIds } from '../../testing'
import { createAddCarModel, defaultNickname } from './model'

const ACCORD_VIN = '1HGCM82633A004352'
const accord: DecodedVin = {
  vin: ACCORD_VIN,
  year: 2003,
  make: 'Honda',
  model: 'Accord',
  trim: 'EX-V6',
  engine: '3.0L 6-cyl',
}

const setup = (owned: Vehicle[] = []) => {
  const vehicles = memoryVehicles(owned)
  const vinDecoder = memoryVinDecoder([accord])
  const addedIds: string[] = []
  const model = createAddCarModel({
    ownerId: OWNER,
    vehicles,
    vinDecoder,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('car'),
    onAdded: (id) => addedIds.push(id),
  })
  model.getState().start()
  return { vehicles, vinDecoder, model, addedIds }
}

const fillManually = (model: ReturnType<typeof setup>['model']) => {
  model.getState().enterManually()
  model.getState().setField('year', '2019')
  model.getState().setField('make', 'Toyota')
  model.getState().setField('model', 'RAV4')
}

describe('add car model', () => {
  it('fills in the details from a VIN typed with spaces and lower case', async () => {
    const { model } = setup()
    model.getState().setVin('1hgcm 82633 a004352')
    expect(await model.getState().lookUpVin()).toBe(true)
    expect(model.getState()).toMatchObject({
      step: 'details',
      vin: ACCORD_VIN,
      decoded: accord,
      draft: { year: '2003', make: 'Honda', model: 'Accord', trim: 'EX-V6' },
    })
  })

  it('explains a mistyped VIN without looking it up', async () => {
    const { model, vinDecoder } = setup()
    model.getState().setVin('1HGCM82633A004353')
    expect(await model.getState().lookUpVin()).toBe(false)
    expect(model.getState().fieldErrors.vin).toMatch(/doesn't add up/)
    expect(vinDecoder.looked).toEqual([])
  })

  it('offers to enter the details by hand when the VIN is not found', async () => {
    const { model } = setup()
    model.getState().setVin('1M8GDM9AXKP042788')
    expect(await model.getState().lookUpVin()).toBe(false)
    expect(model.getState()).toMatchObject({ step: 'vin' })
    expect(model.getState().error).toMatch(/enter your car's details yourself/)
  })

  it('explains a lookup that fails for lack of a connection', async () => {
    const { model, vinDecoder } = setup()
    vinDecoder.failNext('network')
    model.getState().setVin(ACCORD_VIN)
    expect(await model.getState().lookUpVin()).toBe(false)
    expect(model.getState().error).toMatch(/connection/)
    expect(model.getState().busy).toBe(false)
  })

  it('refuses a VIN the owner has already added', async () => {
    const mine: Vehicle = { ...accord, id: 'v1', nickname: 'Accord', severeDuty: false }
    const { model, vinDecoder } = setup([mine])
    model.getState().setVin(ACCORD_VIN)
    expect(await model.getState().lookUpVin()).toBe(false)
    expect(model.getState().error).toMatch(/already added/)
    expect(vinDecoder.looked).toEqual([])
  })

  it('saves a decoded car with its VIN, engine and first odometer reading', async () => {
    const { model, vehicles } = setup()
    model.getState().setVin(ACCORD_VIN)
    await model.getState().lookUpVin()
    model.getState().setField('odometerMiles', '152000')
    model.getState().setSevereDuty(true)
    expect(await model.getState().save()).toBe('car-1')
    expect(vehicles.added).toEqual([
      {
        ownerId: OWNER,
        vehicle: {
          id: 'car-1',
          vin: ACCORD_VIN,
          year: 2003,
          make: 'Honda',
          model: 'Accord',
          trim: 'EX-V6',
          engine: '3.0L 6-cyl',
          nickname: '2003 Honda Accord',
          severeDuty: true,
        },
        firstReading: { vehicleId: 'car-1', date: '2026-10-17', miles: 152_000 },
      },
    ])
  })

  it('saves a car entered by hand, with the nickname the owner chose', async () => {
    const { model, vehicles } = setup()
    fillManually(model)
    model.getState().setField('nickname', ' Rav ')
    expect(await model.getState().save()).toBe('car-1')
    expect(vehicles.added[0]).toEqual({
      ownerId: OWNER,
      vehicle: {
        id: 'car-1',
        year: 2019,
        make: 'Toyota',
        model: 'RAV4',
        nickname: 'Rav',
        severeDuty: false,
      },
    })
  })

  it('does not keep a looked-up VIN once the owner chooses to enter the car by hand', async () => {
    const { model, vehicles } = setup()
    model.getState().setVin(ACCORD_VIN)
    await model.getState().lookUpVin()
    model.getState().back()
    fillManually(model)
    await model.getState().save()
    expect(vehicles.added[0]?.vehicle.vin).toBeUndefined()
    expect(vehicles.added[0]?.vehicle.engine).toBeUndefined()
  })

  it('shows what is missing or wrong in the details', async () => {
    const { model, vehicles } = setup()
    model.getState().enterManually()
    model.getState().setField('year', '1975')
    model.getState().setField('odometerMiles', '12,000')
    expect(await model.getState().save()).toBeUndefined()
    expect(model.getState().fieldErrors).toEqual({
      year: 'Only cars from 1981 on are supported',
      make: 'Enter the make',
      model: 'Enter the model',
      odometerMiles: 'Enter whole miles, digits only',
    })
    expect(vehicles.added).toEqual([])
  })

  it("accepts next year's models but not later ones", async () => {
    const { model } = setup()
    fillManually(model)
    model.getState().setField('year', '2028')
    expect(await model.getState().save()).toBeUndefined()
    expect(model.getState().fieldErrors.year).toBe('Enter a year up to 2027')
    model.getState().setField('year', '2027')
    expect(await model.getState().save()).toBe('car-1')
  })

  it('clears a field error once the owner edits that field', async () => {
    const { model } = setup()
    model.getState().enterManually()
    await model.getState().save()
    model.getState().setField('make', 'T')
    expect(model.getState().fieldErrors.make).toBeUndefined()
    expect(model.getState().fieldErrors.model).toBeDefined()
  })

  it('tells the app about the new car once it is saved', async () => {
    const { model, addedIds } = setup()
    fillManually(model)
    await model.getState().save()
    expect(addedIds).toEqual(['car-1'])
  })

  it('keeps the details and explains when the save fails', async () => {
    const { model, vehicles, addedIds } = setup()
    fillManually(model)
    vehicles.failNextAdd('disk full')
    expect(await model.getState().save()).toBeUndefined()
    expect(addedIds).toEqual([])
    expect(model.getState()).toMatchObject({ busy: false, draft: { make: 'Toyota' } })
    expect(model.getState().error).toMatch(/Could not save/)
  })

  it('ignores a second save while the first is still going', async () => {
    const { model, vehicles } = setup()
    fillManually(model)
    const first = model.getState().save()
    expect(await model.getState().save()).toBeUndefined()
    await first
    expect(vehicles.added).toHaveLength(1)
  })

  it('stops watching the owner’s cars once disposed', async () => {
    const { model, vehicles } = setup()
    model.getState().dispose()
    const mine: Vehicle = { ...accord, id: 'v1', nickname: 'Accord', severeDuty: false }
    vehicles.set([mine])
    model.getState().setVin(ACCORD_VIN)
    // Not told about the car added elsewhere, so the lookup goes ahead.
    expect(await model.getState().lookUpVin()).toBe(true)
  })
})

describe('default nickname', () => {
  it('is the year, make and model when that fits the 40-character limit', () => {
    expect(defaultNickname(2019, 'Toyota', 'RAV4')).toBe('2019 Toyota RAV4')
  })

  it('drops the year, then the make, to fit a long model name', () => {
    expect(defaultNickname(2024, 'Mercedes-Benz', 'Sprinter 2500 Crew Van')).toBe(
      'Mercedes-Benz Sprinter 2500 Crew Van',
    )
    const long = 'Sprinter 2500 Crew Van 170 High Roof AWD Extended'
    expect(defaultNickname(2024, 'Mercedes-Benz', long)).toHaveLength(40)
  })
})
