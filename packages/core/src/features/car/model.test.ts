import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import { AssistantError } from '../../domain/types'
import {
  controlledOdometerReader,
  fixedClock,
  memoryAuth,
  memoryCustomItems,
  memoryOdometer,
  memoryPhotoPicker,
  memoryPreferences,
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
  kind: 'tire-rotation',
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
  options: {
    vehicle?: Vehicle
    odometer?: OdometerReading[]
    records?: ServiceRecord[]
    schedule?: MaintenanceItem[]
    custom?: ReturnType<typeof memoryCustomItems>
    /** Who allowed sharing with Anthropic on this phone; the signed-in owner by default. */
    aiSharingOwner?: string | null | undefined
    signedOut?: boolean
  } = {},
) => {
  const vehicle = options.vehicle ?? car
  const photos = memoryPhotoPicker()
  const preferences = memoryPreferences({
    aiSharingOwner: options.aiSharingOwner === undefined ? 'u1' : options.aiSharingOwner,
  })
  const reader = controlledOdometerReader()
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
    schedule: memorySchedule(options.schedule ?? [oil, tires, brakeFluid], options.custom),
    records,
    odometer,
    clock: fixedClock(TODAY),
    photos,
    odometerReader: reader,
    preferences,
    auth: sharingAuth(options.signedOut),
  })
  return { model, odometer, records, photos, reader, preferences }
}

const sharingAuth = (signedOut = false) =>
  memoryAuth({
    ...(!signedOut && { user: { id: 'u1', email: 'a@example.com' } }),
    userIdFor: (e) => `user-${e}`,
  })

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

  it('links a gas car to its fuel and costs', () => {
    expect(setup().model.getState().fuelLink).toEqual({
      energy: 'fuel',
      title: 'Fuel & costs',
      detail: 'Log fill-ups, see economy and what the car costs each month',
    })
  })

  it('links an electric car to its charging and costs, in charging words', () => {
    const vehicle = { ...car, engine: 'Electric' }
    expect(setup({ vehicle }).model.getState().fuelLink).toEqual({
      energy: 'electric',
      title: 'Charging & costs',
      detail: 'Log charges, see efficiency and what the car costs each month',
    })
  })

  it('links a plug-in hybrid, or a car whose engine is unknown, to fuel', () => {
    const hybrid = { ...car, engine: '2.0L 4-cyl plug-in hybrid' }
    const { engine: _, ...unknown } = car
    expect(setup({ vehicle: hybrid }).model.getState().fuelLink.title).toBe('Fuel & costs')
    expect(setup({ vehicle: unknown }).model.getState().fuelLink.title).toBe('Fuel & costs')
  })

  it("titles a provider's schedule with the make and adds no note", async () => {
    const { model } = setup({
      schedule: [oil, tires, brakeFluid].map((i) => ({ ...i, source: 'motor' })),
    })
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({
      scheduleTitle: 'Toyota schedule · normal driving',
      scheduleNote: undefined,
    })
  })

  it("says the baseline schedule is general guidance, not the manufacturer's", async () => {
    const { model } = setup({
      vehicle: { ...car, severeDuty: true },
      schedule: [oil, tires, brakeFluid].map((i) => ({ ...i, source: 'baseline' })),
    })
    model.getState().start()
    await settle()
    expect(model.getState().scheduleTitle).toBe('General schedule · severe driving')
    expect(model.getState().scheduleNote).toBe(
      "General guidance for most cars, not Toyota's own schedule. Your owner's manual has the exact intervals for this car.",
    )
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

  it('places each schedule item on the car, by its kind or else its name', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().schedule.map((r) => [r.task, r.spot])).toEqual([
      ['Tire rotation', 'wheels'],
      ['Oil & filter change', 'hood'],
      ['Brake fluid', 'hood'],
    ])
  })

  it('says a mileage-only item needs the mileage, last, when the car has no reading', async () => {
    const { model } = setup({ odometer: [], records: [] })
    model.getState().start()
    await settle()
    expect(model.getState().schedule.map((r) => [r.task, r.status, r.next])).toEqual([
      ['Oil & filter change', 'upcoming', 'Jan 2027'],
      ['Brake fluid', 'upcoming', 'Jan 2027'],
      ['Tire rotation', 'unknown', 'Needs your mileage'],
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

  it('refreshes when an odometer reading is added', async () => {
    const { model, odometer } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().odometer).toBe('About 35,960 mi')
    // A reading from another device arrives through sync, not through this page's editor.
    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 36_500 })
    await settle()
    expect(model.getState().odometer).toBe('36,500 mi')
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

  it('rejects a reading too far ahead to be real, which the estimate would ignore', async () => {
    const { model, odometer } = setup()
    model.getState().start()
    await settle()
    model.getState().editOdometer()
    // Ten days after 35,400 mi, 50,000 mi would be 1,460 mi a day.
    model.getState().setOdometer('50000')
    expect(await model.getState().saveOdometer()).toBe(false)
    expect(model.getState().editingOdometer?.error).toBe(
      "That's 14,600 mi since the last reading of 35,400 mi. Check the miles",
    )
    expect(await odometer.listForVehicle('v1')).toHaveLength(2)
  })

  it('keeps the editor open with the error when the reading cannot be saved', async () => {
    const { model, odometer } = setup()
    model.getState().start()
    await settle()
    odometer.add = () => Promise.reject(new Error('Offline'))
    model.getState().editOdometer()
    model.getState().setOdometer('36500')
    expect(await model.getState().saveOdometer()).toBe(false)
    expect(model.getState().editingOdometer).toEqual({
      value: '36500',
      saving: false,
      reading: false,
      error: 'Offline',
    })
  })

  it('shows an error and no stale rows when the schedule cannot be read', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().schedule).toHaveLength(3)
    const failing = createCarModel({
      vehicle: car,
      // The vehicle repo does not know the car, so reading its schedule throws.
      vehicles: memoryVehicles([]),
      schedule: memorySchedule([oil]),
      records: memoryServiceRecords(),
      odometer: memoryOdometer(readings),
      clock: fixedClock(TODAY),
      photos: memoryPhotoPicker(),
      odometerReader: controlledOdometerReader(),
      preferences: memoryPreferences(),
      auth: sharingAuth(),
    })
    failing.getState().start()
    await settle()
    expect(failing.getState()).toMatchObject({
      status: 'ready',
      schedule: [],
      error: 'Unknown vehicle v1',
    })
  })

  it('shows the latest refresh when an earlier one finishes last', async () => {
    const { model, records } = setup()
    const list = records.listForVehicle.bind(records)
    let release: () => void = () => {}
    const slow = new Promise<void>((resolve) => (release = resolve))
    let calls = 0
    // The first refresh reads the records before the tire rotation is logged, and hangs until the
    // second refresh has finished.
    records.listForVehicle = async (id) => {
      const snapshot = await list(id)
      if (++calls === 1) await slow
      return snapshot
    }
    model.getState().start()
    while (calls === 0) await Promise.resolve()
    await records.add(done('tires', TODAY, 35_960))
    await settle()
    const latest = model.getState().schedule
    expect(latest[0]?.task).not.toBe('Tire rotation')
    release()
    await settle()
    expect(model.getState().schedule).toEqual(latest)
  })

  it('does not update after it is disposed, even mid-save', async () => {
    const { model } = setup()
    model.getState().start()
    await settle()
    model.getState().editOdometer()
    model.getState().setOdometer('36500')
    const saving = model.getState().saveOdometer()
    model.getState().dispose()
    await saving
    expect(model.getState().odometer).toBe('About 35,960 mi')
  })

  it('stops following odometer readings once disposed', async () => {
    const { model, odometer } = setup()
    model.getState().start()
    await settle()
    model.getState().dispose()
    await odometer.add({ vehicleId: 'v1', date: TODAY, miles: 36_500 })
    await settle()
    expect(model.getState().odometer).toBe('About 35,960 mi')
  })

  it('estimates the odometer from service records when an odometer change comes first', async () => {
    // No readings, so the only mileage is on the records; the odometer watch reports first.
    const odometer = memoryOdometer([])
    const records = memoryServiceRecords([done('oil', '2026-10-07', 35_400)])
    let notifyRecords: (() => void) | undefined
    const model = createCarModel({
      vehicle: car,
      vehicles: memoryVehicles([car]),
      schedule: memorySchedule([oil]),
      records: {
        ...records,
        // Holds back the first emission, as a slower database watch would.
        watchForVehicle: (id, onChange) => {
          notifyRecords = () => records.watchForVehicle(id, onChange)
          return () => {}
        },
      },
      odometer,
      clock: fixedClock(TODAY),
      photos: memoryPhotoPicker(),
      odometerReader: controlledOdometerReader(),
      preferences: memoryPreferences(),
      auth: sharingAuth(),
    })
    model.getState().start()
    await settle()
    expect(notifyRecords).toBeDefined()
    expect(model.getState().odometer).toBe('About 35,770 mi')
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

  it("follows the owner's own items and intervals as they change", async () => {
    const custom = memoryCustomItems()
    const { model } = setup({
      schedule: [oil, tires],
      records: [done('oil', '2026-07-09', 30_000)],
      custom,
    })
    model.getState().start()
    await settle()
    await custom.save({
      id: 'own-oil',
      vehicleId: 'v1',
      replacesItemId: 'oil',
      task: 'Oil & filter change',
      intervalMiles: 5_000,
    })
    await custom.save({ id: 'wipers', vehicleId: 'v1', task: 'Wiper blades', intervalMonths: 12 })
    await settle()
    expect(model.getState().schedule.map((r) => [r.task, r.interval, r.next, r.own])).toEqual([
      // 5,000 miles after the last change at 30,000 has passed; the maker's 10,000 had not.
      ['Oil & filter change', 'Every 5,000 mi', 'Overdue', 'changed'],
      ['Tire rotation', 'Every 5,000 mi', '40,000 mi', undefined],
      // Never logged, so assumed done every 12 months since the car's model year.
      ['Wiper blades', 'Every 12 months', 'Jan 2027', 'added'],
    ])
  })
})

describe('describeInterval', () => {
  it('uses the severe intervals for severe driving', () => {
    expect(describeInterval(oil, true)).toBe('Every 5,000 mi or 6 months')
  })

  it('falls back to the normal interval when there is no severe one', () => {
    expect(describeInterval(tires, true)).toBe('Every 5,000 mi')
  })

  it('names whole years, and months otherwise', () => {
    expect(describeInterval({ ...brakeFluid, intervalMonths: 24 }, false)).toBe('Every 2 years')
    expect(describeInterval({ ...brakeFluid, intervalMonths: 12 }, false)).toBe('Every 12 months')
    expect(describeInterval({ ...brakeFluid, intervalMonths: 18 }, false)).toBe('Every 18 months')
  })

  it('says as needed when there is no interval', () => {
    expect(describeInterval({ id: 'x', configId: 'c1', task: 'Wipers' }, false)).toBe('As needed')
  })
})

describe('reading the odometer from a photo', () => {
  const started = async (aiSharingOwner?: string | null) => {
    const s = setup({ aiSharingOwner })
    s.model.getState().start()
    await settle()
    return s
  }

  it('fills in the miles a photo shows and asks the owner to check them before saving', async () => {
    const { model, reader, photos, odometer } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    expect(photos.picks).toEqual(['camera'])
    expect(model.getState().editingOdometer).toMatchObject({ reading: true })
    reader.calls[0]?.resolve(36_012)
    await done
    expect(model.getState().editingOdometer).toEqual({
      value: '36012',
      saving: false,
      reading: false,
      note: 'Read from your photo. Check it matches the dashboard, then save.',
    })
    // Nothing is saved until the owner confirms.
    expect(await odometer.listForVehicle('v1')).toHaveLength(2)
    expect(await model.getState().saveOdometer()).toBe(true)
    expect((await odometer.listForVehicle('v1')).at(-1)).toEqual({
      vehicleId: 'v1',
      date: TODAY,
      miles: 36_012,
    })
  })

  it('reads a photo from the library too', async () => {
    const { model, reader, photos } = await started()
    model.getState().editOdometer()
    const done = model.getState().chooseOdometerPhoto()
    await settle()
    reader.calls[0]?.resolve(36_100)
    await done
    expect(photos.picks).toEqual(['library'])
    expect(model.getState().editingOdometer?.value).toBe('36100')
  })

  it('says why miles read below the last reading cannot be saved', async () => {
    const { model, reader } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    reader.calls[0]?.resolve(3_540)
    await done
    expect(model.getState().editingOdometer).toMatchObject({
      value: '3540',
      error: "That's less than the last reading of 35,400 mi",
    })
    expect(model.getState().editingOdometer?.note).toBeUndefined()
  })

  it('asks for a closer photo when no miles could be read, keeping what was typed', async () => {
    const { model, reader } = await started()
    model.getState().editOdometer()
    model.getState().setOdometer('360')
    const done = model.getState().takeOdometerPhoto()
    await settle()
    reader.calls[0]?.resolve(undefined)
    await done
    expect(model.getState().editingOdometer).toMatchObject({
      value: '360',
      reading: false,
      error: "Couldn't find the miles in that photo. Try a closer photo, or type them.",
    })
  })

  it('explains a failed read in terms of typing the miles instead', async () => {
    const { model, reader } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    reader.calls[0]?.reject(new AssistantError('offline'))
    await done
    expect(model.getState().editingOdometer?.error).toBe(
      "You're offline. Reading a photo needs a connection, but you can type the miles.",
    )
  })

  it('does nothing when the owner cancels the camera', async () => {
    const { model, reader, photos } = await started()
    photos.next(undefined)
    await model.getState().takeOdometerPhoto()
    expect(reader.calls).toHaveLength(0)
    expect(model.getState().editingOdometer).toMatchObject({ value: '', reading: false })
  })

  it('refuses a photo too large to send', async () => {
    const { model, reader, photos } = await started()
    photos.next({ mediaType: 'image/jpeg', base64: 'A'.repeat(5_000_004) })
    await model.getState().takeOdometerPhoto()
    expect(reader.calls).toHaveLength(0)
    expect(model.getState().editingOdometer?.error).toBe(
      'That photo is too large to read. Try a closer photo, or type the miles.',
    )
  })

  it('stops reading when the owner cancels, and ignores the late answer', async () => {
    const { model, reader } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    model.getState().cancelOdometer()
    expect(reader.calls[0]?.signal?.aborted).toBe(true)
    reader.calls[0]?.resolve(36_012)
    await done
    expect(model.getState().editingOdometer).toBeUndefined()
  })

  it('neither saves nor accepts typing while a photo is being read', async () => {
    const { model, reader } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    model.getState().setOdometer('99')
    expect(await model.getState().saveOdometer()).toBe(false)
    expect(model.getState().editingOdometer?.value).toBe('')
    void model.getState().takeOdometerPhoto()
    await settle()
    expect(reader.calls).toHaveLength(1)
    reader.calls[0]?.resolve(36_012)
    await done
  })

  it('clears the photo note once the owner edits the miles', async () => {
    const { model, reader } = await started()
    const done = model.getState().takeOdometerPhoto()
    await settle()
    reader.calls[0]?.resolve(36_012)
    await done
    model.getState().setOdometer('36013')
    expect(model.getState().editingOdometer?.note).toBeUndefined()
  })

  it('asks before sending the first photo to Anthropic, then opens the camera', async () => {
    const { model, reader, photos, preferences } = await started(null)
    await model.getState().takeOdometerPhoto()
    expect(photos.picks).toEqual([])
    expect(model.getState().editingOdometer).toMatchObject({ asking: 'camera', reading: false })
    const done = model.getState().allowPhotoReading()
    await settle()
    expect(photos.picks).toEqual(['camera'])
    reader.calls[0]?.resolve(36_012)
    await done
    expect(model.getState().editingOdometer?.value).toBe('36012')
    expect(model.getState().editingOdometer?.asking).toBeUndefined()
    let owner: string | null | undefined
    preferences.watch((p) => (owner = p.aiSharingOwner))()
    expect(owner).toBe('u1')
  })

  it('goes back to typing when the owner does not allow it', async () => {
    const { model, photos, preferences } = await started(null)
    await model.getState().chooseOdometerPhoto()
    model.getState().declinePhotoReading()
    expect(model.getState().editingOdometer?.asking).toBeUndefined()
    expect(photos.picks).toEqual([])
    let owner: string | null | undefined
    preferences.watch((p) => (owner = p.aiSharingOwner))()
    expect(owner).toBeNull()
  })

  it('asks again when someone else allowed it on this phone', async () => {
    const { model, photos } = await started('someone-else')
    await model.getState().takeOdometerPhoto()
    expect(model.getState().editingOdometer?.asking).toBe('camera')
    expect(photos.picks).toEqual([])
  })

  it('keeps asking, with the reason, when the choice cannot be saved', async () => {
    const { model, photos, preferences } = await started(null)
    preferences.update = () => Promise.reject(new Error('disk full'))
    await model.getState().takeOdometerPhoto()
    await model.getState().allowPhotoReading()
    expect(model.getState().editingOdometer).toMatchObject({
      asking: 'camera',
      allowing: false,
      error: "Couldn't save that choice. Try again.",
    })
    expect(photos.picks).toEqual([])
  })

  it('does not open the camera when the page closes while the choice is saved', async () => {
    const { model, photos, preferences } = await started(null)
    let saved: (() => void) | undefined
    const update = preferences.update
    preferences.update = (patch) =>
      new Promise((resolve) => (saved = () => void update(patch).then(resolve)))
    await model.getState().takeOdometerPhoto()
    const allowing = model.getState().allowPhotoReading()
    model.getState().dispose()
    saved?.()
    await allowing
    expect(photos.picks).toEqual([])
  })

  it('asks again once the owner turns sharing off in Account', async () => {
    const { model, photos, preferences } = await started()
    await preferences.update({ aiSharingOwner: null })
    await model.getState().takeOdometerPhoto()
    expect(model.getState().editingOdometer?.asking).toBe('camera')
    expect(photos.picks).toEqual([])
  })

  it('says to sign in again rather than asking when nobody is signed in', async () => {
    const s = setup({ aiSharingOwner: null, signedOut: true })
    s.model.getState().start()
    await settle()
    await s.model.getState().takeOdometerPhoto()
    expect(s.model.getState().editingOdometer).toMatchObject({
      error: 'Sign in again to read photos.',
    })
    expect(s.model.getState().editingOdometer?.asking).toBeUndefined()
  })

  it('says how to fix a camera that cannot be opened', async () => {
    const { model, photos, reader } = await started()
    photos.take = () => Promise.reject(new Error('denied'))
    await model.getState().takeOdometerPhoto()
    expect(reader.calls).toHaveLength(0)
    expect(model.getState().editingOdometer?.error).toBe(
      "Couldn't open the photo. Check that the app may use your camera and photos.",
    )
  })
})
