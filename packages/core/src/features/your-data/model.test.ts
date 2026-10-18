import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type {
  Attachment,
  FillUp,
  Renewal,
  ServiceRecord,
  TireSet,
  Vehicle,
  Warranty,
} from '../../domain/types'
import {
  fixedClock,
  memoryAttachments,
  memoryAuth,
  memoryDataFiles,
  memoryFillUps,
  memoryTireSets,
  memoryRenewals,
  memoryOdometer,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
  memoryWarranties,
  sequentialIds,
} from '../../testing'
import { createYourDataModel } from './model'

/** The value, failing the test when there is none. */
const got = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Expected a value')
  return value
}

const SAM = { id: 'sam', email: 'sam@example.com' }

const civic: Vehicle = {
  id: 'civic',
  configId: 'cfg-civic',
  year: 2019,
  make: 'Honda',
  model: 'Civic',
  vin: '19XFC2F59KE123456',
  nickname: 'Commuter',
  severeDuty: false,
}
const truck: Vehicle = {
  id: 'truck',
  year: 1999,
  make: 'Ford',
  model: 'F-150',
  nickname: '',
  severeDuty: true,
}
const oilChange: ServiceRecord = {
  id: 'svc-1',
  vehicleId: 'civic',
  itemId: 'item-oil',
  performedOn: '2026-04-02',
  odometerMiles: 41_000,
  costCents: 7450,
  shop: 'Quick Lube',
}
const receipt: Attachment = {
  id: 'att-1',
  vehicleId: 'civic',
  serviceRecordId: 'svc-1',
  kind: 'receipt',
  name: 'Receipt.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  addedOn: '2026-04-02',
}
const registration: Attachment = {
  id: 'att-2',
  vehicleId: 'civic',
  kind: 'registration',
  name: 'Registration.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2,
  addedOn: '2026-01-10',
}
const powertrain: Warranty = {
  id: 'w-1',
  vehicleId: 'civic',
  kind: 'powertrain',
  startsOn: '2019-05-01',
  months: 60,
  endMiles: 60_000,
  policyNumber: 'PT-1',
}

/** A phone signed in as `user`, holding `vehicles` and whatever else is given. */
const phone = (
  user: { id: string; email?: string },
  data: {
    vehicles?: Vehicle[]
    services?: ServiceRecord[]
    attachments?: Attachment[]
    warranties?: Warranty[]
    fillUps?: FillUp[]
    tireSets?: TireSet[]
    renewals?: Renewal[]
    remote?: string[]
    files?: Record<string, Uint8Array>
  } = {},
) => {
  const auth = memoryAuth({ user })
  const vehicles = memoryVehicles(data.vehicles ?? [], () => user.id)
  const odometer = memoryOdometer(
    data.vehicles?.some((v) => v.id === 'civic')
      ? [
          { vehicleId: 'civic', date: '2025-01-01', miles: 30_000 },
          { vehicleId: 'civic', date: '2026-04-02', miles: 41_000 },
        ]
      : [],
  )
  const services = memoryServiceRecords(data.services ?? [])
  const attachments = memoryAttachments(data.attachments ?? [], { remote: data.remote ?? [] })
  const warranties = memoryWarranties(data.warranties ?? [])
  const fillUps = memoryFillUps(data.fillUps ?? [])
  const tireSets = memoryTireSets(data.tireSets ?? [])
  const renewals = memoryRenewals(data.renewals ?? [])
  const files = memoryDataFiles(data.files ?? {})
  const schedule = memorySchedule([
    { id: 'item-oil', configId: 'cfg-civic', task: 'Engine oil', kind: 'engine-oil' },
  ])
  const model = createYourDataModel({
    auth,
    vehicles,
    odometer,
    services,
    attachments,
    warranties,
    fillUps,
    tireSets,
    renewals,
    schedule,
    files,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('new'),
  })
  model.getState().start()
  return {
    auth,
    vehicles,
    odometer,
    services,
    attachments,
    warranties,
    fillUps,
    tireSets,
    renewals,
    files,
    model,
  }
}

const samsPhone = () =>
  phone(SAM, {
    vehicles: [civic, truck],
    services: [oilChange],
    attachments: [receipt, registration],
    warranties: [powertrain],
    files: {
      'memory://att-1': new Uint8Array([9, 8, 7]),
      'memory://att-2': new Uint8Array([1, 2]),
    },
  })

/** Exports Sam's data and returns the zip that was shared. */
const exported = async () => {
  const sam = samsPhone()
  await sam.model.getState().exportAll()
  return got(sam.files.shared[0]).bytes
}

describe('your data model', () => {
  describe('export', () => {
    it('shares one zip of every car, named for the day, and says what it holds', async () => {
      const { model, files } = samsPhone()

      await model.getState().exportAll()

      expect(files.shared.map((s) => s.name)).toEqual(['Car data 2026-10-17.zip'])
      const data = JSON.parse(
        strFromU8(got(unzipSync(got(files.shared[0]).bytes)['car-data.json'])),
      )
      expect(data.cars.map((c: { model: string }) => c.model)).toEqual(['Civic', 'F-150'])
      expect(model.getState()).toMatchObject({
        status: 'ready',
        message: {
          tone: 'success',
          text: 'Exported 2 cars, 1 service, 1 warranty and 2 documents.',
        },
      })
    })

    it('downloads files this phone does not have yet', async () => {
      const sam = phone(SAM, {
        vehicles: [civic],
        attachments: [receipt],
        remote: ['att-1'],
        files: { 'memory://att-1': new Uint8Array([1]) },
      })

      await sam.model.getState().exportAll()

      expect(sam.attachments.downloads).toEqual(['att-1'])
      expect(Object.keys(unzipSync(got(sam.files.shared[0]).bytes))).toContain(
        'documents/Commuter/Receipt.jpg',
      )
    })

    it('leaves out files it cannot get, and says how to include them', async () => {
      const sam = phone(SAM, { vehicles: [civic], attachments: [receipt, registration] })
      sam.attachments.failNextOpen('offline')

      await sam.model.getState().exportAll()

      expect(sam.files.shared).toHaveLength(1)
      expect(sam.model.getState().message?.text).toBe(
        "Exported 1 car, 0 services, 0 warranties and 2 documents. 2 documents aren't on this phone and couldn't be downloaded, so they were left out. Connect to the internet and export again to include them.",
      )
    })

    it('says so when the account has no cars', async () => {
      const { model, files } = phone(SAM)

      await model.getState().exportAll()

      expect(files.shared).toHaveLength(1)
      expect(model.getState().message?.text).toBe(
        'Exported your account. There are no cars in it yet.',
      )
    })

    it('says the export failed when the zip could not be shared', async () => {
      const { model, files } = samsPhone()
      files.failNextShare('disk full')

      await model.getState().exportAll()

      expect(model.getState()).toMatchObject({
        status: 'ready',
        message: { tone: 'error', text: "Couldn't export your data. Try again." },
      })
    })

    it('runs one export at a time', async () => {
      const { model, files } = samsPhone()

      const first = model.getState().exportAll()
      expect(model.getState().status).toBe('exporting')
      await model.getState().exportAll()
      await first

      expect(files.shared).toHaveLength(1)
    })
  })

  describe('import', () => {
    it('shows what an export would add before adding anything', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(zip)

      await alex.model.getState().chooseImport()

      expect(alex.model.getState()).toMatchObject({
        status: 'confirming-import',
        plan: { adding: ['Commuter', '1999 Ford F-150'], skipping: [] },
      })
      expect(alex.vehicles.added).toEqual([])
    })

    it('adds every car with its readings, services, warranties and documents under new ids', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(zip)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      const [car, otherCar] = alex.vehicles.added
      expect(alex.vehicles.added.map((a) => a.ownerId)).toEqual(['alex', 'alex'])
      expect(car).toEqual({
        ownerId: 'alex',
        vehicle: { ...civic, id: 'new-1', configId: undefined },
        firstReading: { vehicleId: 'new-1', date: '2025-01-01', miles: 30_000 },
      })
      expect(otherCar?.vehicle).toEqual({ ...truck, id: expect.any(String) })
      expect(await alex.odometer.listForVehicle('new-1')).toEqual([
        { vehicleId: 'new-1', date: '2026-04-02', miles: 41_000 },
      ])
      const [service] = await alex.services.listForVehicle('new-1')
      expect(service).toEqual({ ...oilChange, id: 'new-2', vehicleId: 'new-1' })
      expect(await alex.warranties.listForVehicle('new-1')).toEqual([
        { ...powertrain, id: 'new-3', vehicleId: 'new-1' },
      ])

      let documents: Attachment[] = []
      alex.attachments.watchForVehicle('new-1', (a) => (documents = a))()
      expect(documents).toHaveLength(2)
      const newReceipt = got(documents.find((d) => d.kind === 'receipt'))
      expect(newReceipt).toMatchObject({
        vehicleId: 'new-1',
        serviceRecordId: 'new-2',
        name: 'Receipt.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 3,
        addedOn: '2026-04-02',
      })
      const staged = got(alex.attachments.files.get(newReceipt.id))
      expect(alex.files.staged.get(staged.uri)).toEqual(new Uint8Array([9, 8, 7]))

      expect(alex.model.getState()).toMatchObject({
        status: 'ready',
        plan: undefined,
        message: {
          tone: 'success',
          text: 'Added 2 cars with 1 service, 1 warranty and 2 documents.',
        },
      })
    })

    it('adds fill-ups under new ids, without copying their mileage in as readings', async () => {
      const fill: FillUp = {
        id: 'f-1',
        vehicleId: 'civic',
        filledOn: '2026-04-02',
        odometerMiles: 41_000,
        energy: 'fuel',
        quantity: 10.5,
        costCents: 3990,
        full: true,
        missedPrevious: false,
        station: 'Costco',
      }
      // The phone's readings already hold the fill-up's mileage, as the app's do.
      const sam = phone(SAM, { vehicles: [civic], fillUps: [fill] })
      await sam.model.getState().exportAll()
      expect(sam.model.getState().message?.text).toBe(
        'Exported 1 car, 0 services, 0 warranties, 1 fill-up and 0 documents.',
      )
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(sam.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      expect(await alex.fillUps.listForVehicle('new-1')).toEqual([
        { ...fill, id: 'new-2', vehicleId: 'new-1' },
      ])
      expect(await alex.odometer.listForVehicle('new-1')).toEqual([])
      expect(alex.model.getState().message?.text).toBe(
        'Added 1 car with 0 services, 0 warranties, 1 fill-up and 0 documents.',
      )
    })

    it('adds tire sets under new ids, with only one of them on the car', async () => {
      const set: TireSet = {
        id: 't-1',
        vehicleId: 'civic',
        name: 'All-season',
        madeWeek: 14,
        madeYear: 2024,
        mounted: true,
        mountedAtMiles: 30_000,
        priorMiles: 0,
        treadDepth32nds: 8,
        treadCheckedOn: '2026-03-01',
      }
      const sam = phone(SAM, { vehicles: [civic], tireSets: [set] })
      await sam.model.getState().exportAll()
      expect(sam.model.getState().message?.text).toBe(
        'Exported 1 car, 0 services, 0 warranties, 1 tire set and 0 documents.',
      )
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(sam.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      expect(await alex.tireSets.listForVehicle('new-1')).toEqual([
        { ...set, id: 'new-2', vehicleId: 'new-1' },
      ])
      expect(alex.model.getState().message?.text).toBe(
        'Added 1 car with 0 services, 0 warranties, 1 tire set and 0 documents.',
      )
    })

    it('carries renewal dates over under new ids', async () => {
      const insurance: Renewal = {
        id: 'r-1',
        vehicleId: 'civic',
        kind: 'insurance',
        dueOn: '2027-01-15',
        everyMonths: 6,
        notes: 'Policy 77',
      }
      const sam = phone(SAM, { vehicles: [civic], renewals: [insurance] })
      await sam.model.getState().exportAll()
      expect(sam.model.getState().message?.text).toBe(
        'Exported 1 car, 0 services, 0 warranties, 1 renewal date and 0 documents.',
      )
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(sam.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      expect(await alex.renewals.listForVehicle('new-1')).toEqual([
        { ...insurance, id: 'new-2', vehicleId: 'new-1' },
      ])
      expect(alex.model.getState().message?.text).toBe(
        'Added 1 car with 0 services, 0 warranties, 1 renewal date and 0 documents.',
      )
    })

    it('leaves cars already in the garage as they are, so importing twice adds nothing twice', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' }, { vehicles: [{ ...civic, id: 'mine', nickname: 'Mine' }] })
      alex.files.queueArchive(zip)

      await alex.model.getState().chooseImport()
      expect(alex.model.getState().plan).toEqual({
        adding: ['1999 Ford F-150'],
        skipping: ['Commuter'],
      })
      await alex.model.getState().confirmImport()

      expect(alex.vehicles.added.map((a) => a.vehicle.model)).toEqual(['F-150'])
      expect(alex.model.getState().message?.text).toBe(
        'Added 1 car with 0 services, 0 warranties and 0 documents. 1 car already in your garage was left as it was.',
      )

      alex.files.queueArchive(zip)
      await alex.model.getState().chooseImport()
      expect(alex.model.getState()).toMatchObject({
        status: 'ready',
        message: { text: 'Everything in that export is already in your garage.' },
      })
    })

    it('matches a car without a VIN by its year, make, model and nickname', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' }, { vehicles: [{ ...truck, id: 'old', make: 'FORD' }] })
      alex.files.queueArchive(zip)

      await alex.model.getState().chooseImport()

      expect(alex.model.getState().plan?.skipping).toEqual(['1999 Ford F-150'])
    })

    it('keeps a document the export has no file for out, and says so', async () => {
      const sam = phone(SAM, { vehicles: [civic], attachments: [receipt] })
      await sam.model.getState().exportAll()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(sam.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      expect(alex.model.getState().message?.text).toBe(
        'Added 1 car with 0 services, 0 warranties and 0 documents. 1 document was not in the export.',
      )
    })

    it('does nothing when the owner cancels the picker or the import', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' })

      await alex.model.getState().chooseImport()
      expect(alex.model.getState()).toMatchObject({ status: 'ready', message: undefined })

      alex.files.queueArchive(zip)
      await alex.model.getState().chooseImport()
      alex.model.getState().cancelImport()
      await alex.model.getState().confirmImport()

      expect(alex.model.getState()).toMatchObject({ status: 'ready', plan: undefined })
      expect(alex.vehicles.added).toEqual([])
    })

    it('explains a file that is not an export, or one from a newer app', async () => {
      const alex = phone({ id: 'alex' })

      alex.files.queueArchive(strToU8('a photo, not a zip'))
      await alex.model.getState().chooseImport()
      expect(alex.model.getState().message).toEqual({
        tone: 'error',
        text: "That file isn't a car data export. Choose a zip exported from this app.",
      })

      alex.files.queueArchive(
        zipSync({
          'car-data.json': strToU8(
            JSON.stringify({ format: 'car-maintenance-export', version: 9 }),
          ),
        }),
      )
      await alex.model.getState().chooseImport()
      expect(alex.model.getState().message?.text).toBe(
        'That export is from a newer version of the app. Update the app and try again.',
      )
    })

    it('says when the picker could not open the file', async () => {
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(new Error('no access'))

      await alex.model.getState().chooseImport()

      expect(alex.model.getState().message?.text).toBe("Couldn't open that file. Try again.")
    })

    it('says there is nothing to import from an export without cars', async () => {
      const empty = phone({ id: 'empty' })
      await empty.model.getState().exportAll()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(empty.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()

      expect(alex.model.getState().message?.text).toBe(
        'That export has no cars in it, so there is nothing to import.',
      )
    })

    it('adds nothing for a car whose documents cannot be saved, so importing again adds it whole', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(zip)
      await alex.model.getState().chooseImport()
      alex.files.failNextStage('disk full')

      await alex.model.getState().confirmImport()

      expect(alex.vehicles.added).toEqual([])
      expect(alex.model.getState().message?.tone).toBe('error')

      alex.files.queueArchive(zip)
      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()
      expect(alex.vehicles.added).toHaveLength(2)
    })

    it('imports notes and names of any length, as the app lets the owner type them', async () => {
      const notes = 'Invoice line. '.repeat(500)
      const sam = phone(SAM, {
        vehicles: [civic],
        services: [{ ...oilChange, notes, shop: 'S'.repeat(300) }],
        warranties: [{ ...powertrain, provider: 'P'.repeat(150), notes }],
      })
      await sam.model.getState().exportAll()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(got(sam.files.shared[0]).bytes)

      await alex.model.getState().chooseImport()
      await alex.model.getState().confirmImport()

      const [service] = await alex.services.listForVehicle('new-1')
      expect(service?.notes).toBe(notes)
      expect(alex.model.getState().message?.tone).toBe('success')
    })

    it('opens one picker at a time and shows it is opening meanwhile', async () => {
      const alex = phone({ id: 'alex' })
      const first = alex.model.getState().chooseImport()
      expect(alex.model.getState().status).toBe('reading')

      const second = alex.model.getState().chooseImport()
      const exporting = alex.model.getState().exportAll()
      await Promise.all([first, second, exporting])

      expect(alex.files.shared).toEqual([])
      expect(alex.model.getState().status).toBe('ready')
    })

    it('says not everything was imported when saving fails partway', async () => {
      const zip = await exported()
      const alex = phone({ id: 'alex' })
      alex.files.queueArchive(zip)
      await alex.model.getState().chooseImport()
      alex.services.failNextAdd('disk full')

      await alex.model.getState().confirmImport()

      expect(alex.vehicles.added).toHaveLength(1)
      expect(alex.model.getState()).toMatchObject({
        status: 'ready',
        message: {
          tone: 'error',
          text: 'Something went wrong partway through, so not everything was imported. Cars already added stay in your garage.',
        },
      })
    })
  })

  it('does nothing while signed out', async () => {
    const { model, auth, files } = samsPhone()
    await auth.signOut()

    await model.getState().exportAll()
    await model.getState().chooseImport()

    expect(files.shared).toEqual([])
    model.getState().dispose()
  })
})
