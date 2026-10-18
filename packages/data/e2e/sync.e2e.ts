import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  Attachment,
  CustomItem,
  FillUp,
  Renewal,
  SafetyReport,
  ServiceRecord,
  Vehicle,
  Warranty,
} from '@car/core'
import { afterEach, describe, expect, it } from 'vitest'
import { schema, UPLOADABLE_TABLES } from '../src'
import { attachmentPath } from '../src/upload'
import { admin, createUser, eventually, openPhone, until, type Phone, type TestUser } from './phone'

const phones: Phone[] = []
const open = async (user: TestUser) => {
  const phone = await openPhone(user)
  phones.push(phone)
  return phone
}
afterEach(async () => {
  await Promise.all(phones.splice(0).map((phone) => phone.close()))
})

const id = () => crypto.randomUUID()

// A make no other test file uses, so its configuration and schedule are created by these tests.
const car = (nickname = 'Daily'): Vehicle => ({
  id: id(),
  year: 2019,
  make: 'Honda',
  model: 'Civic',
  trim: 'EX',
  nickname,
  severeDuty: false,
})

const service = (vehicleId: string, fields: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id: id(),
  vehicleId,
  performedOn: '2026-09-01',
  odometerMiles: 42_000,
  costCents: 8_999,
  shop: 'Quick Lube',
  ...fields,
})

const warranty = (vehicleId: string, fields: Partial<Warranty> = {}): Warranty => ({
  id: id(),
  vehicleId,
  kind: 'powertrain',
  provider: 'Honda',
  startsOn: '2019-03-01',
  months: 60,
  endMiles: 60_000,
  ...fields,
})

const renewal = (vehicleId: string, fields: Partial<Renewal> = {}): Renewal => ({
  id: id(),
  vehicleId,
  kind: 'registration',
  dueOn: '2026-11-01',
  everyMonths: 12,
  ...fields,
})

const customItem = (vehicleId: string, fields: Partial<CustomItem> = {}): CustomItem => ({
  id: id(),
  vehicleId,
  task: 'Cabin air filter',
  intervalMiles: 15_000,
  intervalMonths: 12,
  ...fields,
})

const fillUp = (vehicleId: string, fields: Partial<FillUp> = {}): FillUp => ({
  id: id(),
  vehicleId,
  filledOn: '2026-10-02',
  odometerMiles: 42_300,
  energy: 'fuel',
  quantity: 11.2,
  costCents: 4_150,
  full: true,
  missedPrevious: false,
  station: 'Shell',
  ...fields,
})

/** A small PDF on disk, as the file picker would hand it over. */
const pickedPdf = (contents: string) => {
  const path = join(tmpdir(), `${id()}.pdf`)
  writeFileSync(path, `%PDF-1.4\n${contents}\n%%EOF\n`)
  return {
    uri: pathToFileURL(path).href,
    name: 'Receipt.pdf',
    contentType: 'application/pdf',
    sizeBytes: Buffer.byteLength(`%PDF-1.4\n${contents}\n%%EOF\n`),
  }
}

const attachment = (vehicleId: string, fields: Partial<Attachment> = {}): Attachment => ({
  id: id(),
  vehicleId,
  kind: 'receipt',
  name: 'Receipt.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1,
  addedOn: '2026-10-02',
  ...fields,
})

/** Every synced table on the phone, with its row count. */
const syncedTables = schema.tables.filter((t) => !t.localOnly).map((t) => t.name)
const counts = async (phone: Phone) =>
  Object.fromEntries(
    await Promise.all(
      syncedTables.map(async (table) => {
        const [row] = await phone.rows(`select count(*) as n from ${table}`)
        return [table, Number(row?.n)] as const
      }),
    ),
  )
const nothing = Object.fromEntries(syncedTables.map((table) => [table, 0]))

/** Adds a car on `phone` and waits until it has uploaded and come back matched to a config. */
const addCar = async (phone: Phone, vehicle = car()) => {
  await phone.vehicles.add(phone.user.id, vehicle, {
    vehicleId: vehicle.id,
    date: '2026-10-01',
    miles: 41_000,
  })
  await phone.uploaded()
  const synced = await eventually(
    () => phone.vehicles.get(vehicle.id),
    (v) => v?.configId !== undefined,
    'the car to come back with its configuration',
  )
  return synced as Vehicle & { configId: string }
}

const serverRows = async (table: string, column: string, value: string) => {
  const { data, error } = await admin.from(table).select('*').eq(column, value)
  if (error) throw error
  return data as Record<string, unknown>[]
}

describe('two phones signed in as one owner', () => {
  it("each see a car the other added, with the server's configuration and schedule", async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]

    const added = await addCar(a)

    const onB = await eventually(
      () => b.vehicles.get(added.id),
      (v) => v?.configId === added.configId,
      'the car on the second phone',
    )
    expect(onB).toEqual(added)
    expect(await b.odometer.listForVehicle(added.id)).toEqual([
      { vehicleId: added.id, date: '2026-10-01', miles: 41_000 },
    ])
    // The schedule is shared reference data the server made for the new configuration.
    const schedule = await eventually(
      () => b.schedule.itemsForConfig(added.configId),
      (items) => items.length > 0,
      "the configuration's schedule",
    )
    expect(schedule.every((item) => item.configId === added.configId)).toBe(true)
  })

  it('each see services, warranties and fill-ups the other logged', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await eventually(() => b.vehicles.get(vehicleId), Boolean, 'the car on the second phone')

    const oilChange = service(vehicleId)
    const powertrain = warranty(vehicleId)
    const fill = fillUp(vehicleId)
    await b.records.add(oilChange)
    await b.warranties.save(powertrain)
    await b.fillUps.save(fill)

    expect(
      await eventually(
        () => a.records.listForVehicle(vehicleId),
        (r) => r.length === 1,
        'service',
      ),
    ).toEqual([oilChange])
    expect(
      await eventually(
        () => a.warranties.listForVehicle(vehicleId),
        (w) => w.length === 1,
        'warranty',
      ),
    ).toEqual([powertrain])
    expect(
      await eventually(
        () => a.fillUps.listForVehicle(vehicleId),
        (f) => f.length === 1,
        'fill-up',
      ),
    ).toEqual([fill])
    expect([...a.dropped, ...b.dropped]).toEqual([])
  })

  it('each see the edits and deletions the other made', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const powertrain = warranty(vehicleId)
    const fill = fillUp(vehicleId)
    const oilChange = service(vehicleId)
    await a.warranties.save(powertrain)
    await a.fillUps.save(fill)
    await a.records.add(oilChange)
    await eventually(
      () => b.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 1,
      'fill-up',
    )
    await eventually(
      () => b.records.listForVehicle(vehicleId),
      (r) => r.length === 1,
      'service',
    )
    await eventually(
      () => b.warranties.listForVehicle(vehicleId),
      (w) => w.length === 1,
      'warranty',
    )

    const extended = { ...powertrain, months: 84, endMiles: 100_000, policyNumber: 'PT-1' }
    await b.warranties.save(extended)
    await b.vehicles.setSevereDuty(vehicleId, true)
    await b.fillUps.remove(fill.id)
    await b.db.execute('delete from service_records where id = ?', [oilChange.id])

    expect(
      await eventually(
        () => a.warranties.listForVehicle(vehicleId),
        (w) => w[0]?.months === 84,
        'the edited warranty',
      ),
    ).toEqual([extended])
    await eventually(
      () => a.vehicles.get(vehicleId),
      (v) => v?.severeDuty === true,
      'severe duty',
    )
    await eventually(
      () => a.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 0,
      'deletion',
    )
    await eventually(
      () => a.records.listForVehicle(vehicleId),
      (r) => r.length === 0,
      'deletion',
    )
    expect(await serverRows('fill_ups', 'vehicle_id', vehicleId)).toEqual([])
    expect(await serverRows('service_records', 'vehicle_id', vehicleId)).toEqual([])
  })

  it('each see the renewal dates the other added, renewed and deleted', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const registration = renewal(vehicleId, { notes: 'Plate 7ABC123' })
    const { everyMonths: _, ...permit } = renewal(vehicleId, {
      kind: 'other',
      title: 'Parking permit',
      dueOn: '2027-01-15',
    })
    await a.renewals.save(registration)
    await a.renewals.save(permit)
    expect(
      await eventually(
        () => b.renewals.listForVehicle(vehicleId),
        (r) => r.length === 2,
        'renewals',
      ),
    ).toEqual([registration, permit])

    // Renewing moves only the date; the notes the first phone typed survive.
    const renewed = { ...registration, dueOn: '2027-11-01' }
    await b.renewals.save(renewed)
    await b.renewals.remove(permit.id)
    expect(
      await eventually(
        () => a.renewals.listForVehicle(vehicleId),
        (r) => r.length === 1 && r[0]?.dueOn === '2027-11-01',
        'the renewed date',
      ),
    ).toEqual([renewed])
    expect(await serverRows('renewals', 'id', permit.id)).toEqual([])
    expect([...a.dropped, ...b.dropped]).toEqual([])
  })

  it('each follow the schedule items and intervals the other set, and log services against them', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const added = await addCar(a)
    const vehicleId = added.id
    const [oil] = await eventually(
      () => a.schedule.itemsForConfig(added.configId),
      (items) => items.length > 0,
      'the schedule',
    )
    if (!oil) throw new Error('The configuration has no schedule')
    const filter = customItem(vehicleId)
    const oilEvery5k = customItem(vehicleId, {
      replacesItemId: oil.id,
      task: oil.task,
      intervalMiles: 5_000,
    })
    await a.customItems.save(filter)
    await a.customItems.save(oilEvery5k)
    // A service counts as the owner's own item, which the server's schedule does not have.
    const changed = service(vehicleId, { itemId: filter.id })
    await a.records.add(changed)
    await a.uploaded()

    const onB = await eventually(
      () => b.schedule.itemsForVehicle(added),
      // Each save uploads on its own, so the two can reach the other phone in separate checkpoints.
      (items) =>
        items.some((i) => i.id === filter.id) &&
        items.some((i) => i.id === oil.id && i.owner === 'changed'),
      'the custom items on the second phone',
    )
    expect(onB.find((i) => i.id === oil.id)).toMatchObject({
      intervalMiles: 5_000,
      owner: 'changed',
    })
    expect(
      await eventually(
        () => b.records.listForVehicle(vehicleId),
        (r) => r.length === 1,
        'the service',
      ),
    ).toEqual([changed])

    await b.customItems.save({ ...filter, intervalMiles: 20_000 })
    await b.customItems.remove(oilEvery5k.id)
    expect(
      await eventually(
        () => a.customItems.listForVehicle(vehicleId),
        (items) => items.length === 1 && items[0]?.intervalMiles === 20_000,
        'the edit and the deletion',
      ),
    ).toEqual([{ ...filter, intervalMiles: 20_000 }])
    expect(await serverRows('service_records', 'id', changed.id)).toMatchObject([
      { item_id: filter.id },
    ])
    expect([...a.dropped, ...b.dropped]).toEqual([])
  })

  it('agree on one version when both edit the same warranty', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const powertrain = warranty(vehicleId)
    await a.warranties.save(powertrain)
    await eventually(
      () => b.warranties.listForVehicle(vehicleId),
      (w) => w.length === 1,
      'warranty',
    )

    await Promise.all([
      a.warranties.save({ ...powertrain, provider: 'Honda Care' }),
      b.warranties.save({ ...powertrain, policyNumber: 'B-7' }),
    ])
    await a.uploaded()
    await b.uploaded()

    // Each edit uploads only the columns it changed, so both survive.
    const merged = { ...powertrain, provider: 'Honda Care', policyNumber: 'B-7' }
    for (const phone of [a, b])
      expect(
        await eventually(
          () => phone.warranties.listForVehicle(vehicleId),
          (w) => w[0]?.provider === 'Honda Care' && w[0]?.policyNumber === 'B-7',
          'both edits',
        ),
      ).toEqual([merged])
  })
})

describe('offline', () => {
  it('keeps changes made offline on the phone, and uploads them on reconnect', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await eventually(() => b.vehicles.get(vehicleId), Boolean, 'the car on the second phone')

    await a.goOffline()
    const oilChange = service(vehicleId)
    const fill = fillUp(vehicleId)
    const powertrain = warranty(vehicleId)
    const offlineCar = car('Weekend')
    await a.records.add(oilChange)
    await a.fillUps.save(fill)
    await a.warranties.save(powertrain)
    await a.vehicles.add(owner.id, offlineCar, undefined)
    await a.odometer.add({ vehicleId, date: '2026-10-05', miles: 42_500 })

    // Shown on the phone straight away, and nowhere else while it is offline.
    expect(await a.records.listForVehicle(vehicleId)).toEqual([oilChange])
    expect((await a.db.getUploadQueueStats()).count).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    expect(await serverRows('service_records', 'vehicle_id', vehicleId)).toEqual([])
    expect(await b.records.listForVehicle(vehicleId)).toEqual([])

    await a.goOnline()
    await a.uploaded()

    await eventually(
      () => b.records.listForVehicle(vehicleId),
      (r) => r.length === 1,
      'service',
    )
    await eventually(
      () => b.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 1,
      'fill-up',
    )
    await eventually(
      () => b.warranties.listForVehicle(vehicleId),
      (w) => w.length === 1,
      'warranty',
    )
    await eventually(() => b.vehicles.get(offlineCar.id), Boolean, 'the car added offline')
    await eventually(
      () => b.odometer.listForVehicle(vehicleId),
      (r) => r.some((reading) => reading.miles === 42_500),
      'the reading',
    )
    expect(a.dropped).toEqual([])
  })

  it('keeps changes made offline across a sign-out, and uploads them at the next sign-in', async () => {
    const owner = await createUser()
    const a = await open(owner)
    const { id: vehicleId } = await addCar(a)

    await a.goOffline()
    const oilChange = service(vehicleId)
    await a.records.add(oilChange)
    await a.signOut()
    expect(await a.records.listForVehicle(vehicleId)).toEqual([oilChange])

    await a.signInAs(owner)
    await a.uploaded()
    expect(await serverRows('service_records', 'id', oilChange.id)).toHaveLength(1)
  })

  it('drops an offline edit to a fill-up deleted on the other phone, and both agree', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const fill = fillUp(vehicleId)
    await a.fillUps.save(fill)
    await eventually(
      () => b.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 1,
      'fill-up',
    )

    await a.goOffline()
    await a.fillUps.save({ ...fill, quantity: 12.5 })
    await b.fillUps.remove(fill.id)
    await b.uploaded()
    await a.goOnline()
    await a.uploaded()

    await eventually(
      () => a.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 0,
      'deletion',
    )
    expect(await serverRows('fill_ups', 'id', fill.id)).toEqual([])
    expect(a.dropped).toHaveLength(1)
  })

  it('drops a service logged offline on a car deleted on the other phone', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await eventually(() => b.vehicles.get(vehicleId), Boolean, 'the car on the second phone')

    await a.goOffline()
    const oilChange = service(vehicleId)
    await a.records.add(oilChange)
    await b.db.execute('delete from vehicles where id = ?', [vehicleId])
    await b.uploaded()
    await a.goOnline()
    await a.uploaded()

    await eventually(
      () => a.records.listForVehicle(vehicleId),
      (r) => r.length === 0,
      'deletion',
    )
    expect(await a.vehicles.get(vehicleId)).toBeUndefined()
    expect(await serverRows('service_records', 'id', oilChange.id)).toEqual([])
    expect(a.dropped).toHaveLength(1)
  })
})

describe('shared schedules', () => {
  it('moves services off schedule items a new provider drops, on the phone too', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId, configId } = await addCar(a, { ...car(), model: `Accord ${id()}` })
    const items = await eventually(
      () => a.schedule.itemsForConfig(configId),
      (list) => list.length > 1,
      'the schedule',
    )
    const [kept, dropped] = items as [(typeof items)[0], (typeof items)[0]]
    const loggedOnline = service(vehicleId, { itemId: dropped.id })
    await a.records.add(loggedOnline)
    await a.uploaded()

    // Logged offline against an item that is gone by the time it uploads.
    await b.goOffline()
    const loggedOffline = service(vehicleId, { itemId: dropped.id, performedOn: '2026-10-03' })
    await b.records.add(loggedOffline)
    const { error } = await admin.rpc('set_config_schedule', {
      p_config: configId,
      p_source: 'test-provider',
      p_items: [
        {
          kind: kept.kind,
          task: 'Oil and filter',
          interval_miles: 7_500,
          interval_months: 12,
          severe_miles: 5_000,
          severe_months: 6,
        },
      ],
    })
    expect(error).toBeNull()
    await b.goOnline()
    await b.uploaded()

    for (const phone of [a, b]) {
      const schedule = await eventually(
        () => phone.schedule.itemsForConfig(configId),
        (list) => list.length === 1,
        'the new schedule',
      )
      expect(schedule).toMatchObject([
        { id: kept.id, task: 'Oil and filter', source: 'test-provider' },
      ])
      const records = await eventually(
        () => phone.records.listForVehicle(vehicleId),
        (list) => list.length === 2 && list.every((r) => r.itemId === undefined),
        'both services without the link',
      )
      expect(records.map((r) => r.id).sort()).toEqual([loggedOnline.id, loggedOffline.id].sort())
    }
    expect(b.dropped).toEqual([])
  })
})

describe('service bulletins', () => {
  it("syncs a model year's bulletins to its owner's phones, and to no other owner", async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const [a, b] = [await open(alice), await open(bob)]
    const civic = await addCar(a)
    const tesla = await addCar(b, { ...car('Bob'), make: 'Tesla', model: 'Model 3', trim: 'LR' })

    // As the NHTSA importer stores them: one warranty extension for each car's model year.
    const { error } = await admin.from('bulletins').insert([
      {
        config_id: civic.configId,
        nhtsa_id: 10_181_234,
        document_id: '19-047',
        kind: 'warranty',
        issued_on: '2019-05-01',
        components: ['ENGINE'],
        summary: 'Coverage for the water pump is extended.',
      },
      {
        config_id: tesla.configId,
        nhtsa_id: 10_181_235,
        kind: 'bulletin',
        components: ['ELECTRICAL SYSTEM'],
        summary: 'Update the software.',
      },
    ])
    if (error) throw error
    const checked = await admin
      .from('vehicle_configs')
      .update({ bulletins_checked_at: '2026-10-18T00:00:00Z' })
      .eq('id', civic.configId)
    if (checked.error) throw checked.error

    const report = await eventually(
      () =>
        new Promise<SafetyReport>((resolve) => {
          const stop = a.safety.watchForConfig(civic.configId, (r) => {
            stop()
            resolve(r)
          })
        }),
      (r) => r.bulletins?.length === 1 && r.bulletinsCheckedAt !== undefined,
      "the bulletin on the owner's phone",
    )
    expect(report.bulletins).toEqual([
      expect.objectContaining({
        configId: civic.configId,
        nhtsaId: 10_181_234,
        documentId: '19-047',
        kind: 'warranty',
        issuedOn: '2019-05-01',
        components: ['ENGINE'],
        summary: 'Coverage for the water pump is extended.',
      }),
    ])
    await eventually(
      () => b.rows('select nhtsa_id from bulletins'),
      (rows) => rows.length === 1,
      "Bob's own bulletin",
    )
    expect(await b.rows('select config_id, nhtsa_id from bulletins')).toEqual([
      { config_id: tesla.configId, nhtsa_id: 10_181_235 },
    ])
  })
})

describe('changes that can no longer apply', () => {
  it('drops a document attached offline to a car deleted on the other phone, file and all', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await eventually(() => b.vehicles.get(vehicleId), Boolean, 'the car on the second phone')

    await a.goOffline()
    const registration = attachment(vehicleId, { kind: 'registration', sizeBytes: 20 })
    await a.attachments.add(registration, pickedPdf('registration'))
    await b.db.execute('delete from vehicles where id = ?', [vehicleId])
    await b.uploaded()
    await a.goOnline()
    await a.uploaded()

    expect(a.dropped).toHaveLength(1)
    expect(await serverRows('attachments', 'id', registration.id)).toEqual([])
    const { data, error } = await admin.storage.from('attachments').list(owner.id)
    expect(error).toBeNull()
    expect(data?.map((f) => f.name)).not.toContain(registration.id)
    await eventually(
      () => a.attachments.listForVehicle(vehicleId),
      (list) => list.length === 0,
      'the document to go from the phone',
    )
    await until(async () => (await a.files.read(registration.id)) === undefined, 'the local file')
  })

  it('drops changes a phone made offline after the account was deleted elsewhere', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await eventually(() => b.vehicles.get(vehicleId), Boolean, 'the car on the second phone')

    await b.goOffline()
    await b.records.add(service(vehicleId))
    await b.vehicles.add(owner.id, car('Second'), undefined)
    await a.account.deleteAccount()
    await b.goOnline()

    // Nothing is left to upload them to, so they must not block the queue forever.
    await b.uploaded()
    expect(b.dropped).toHaveLength(2)
    expect(await serverRows('vehicles', 'owner_id', owner.id)).toEqual([])
  })
})

describe('owner isolation', () => {
  it("never syncs another owner's data", async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const [a, b] = [await open(alice), await open(bob)]
    const { id: vehicleId } = await addCar(a)
    await a.records.add(service(vehicleId))
    await a.warranties.save(warranty(vehicleId))
    await a.fillUps.save(fillUp(vehicleId))
    await a.renewals.save(renewal(vehicleId))
    await a.customItems.save(customItem(vehicleId))
    await a.attachments.add(attachment(vehicleId, { sizeBytes: 20 }), pickedPdf('alice'))
    await a.uploaded()
    expect(await serverRows('attachments', 'vehicle_id', vehicleId)).toHaveLength(1)

    // Bob's own car coming back from the server means his phone has synced past Alice's writes.
    const bobs = await addCar(b, {
      ...car('Bob'),
      make: 'Tesla',
      model: 'Model 3',
      trim: 'Long Range',
    })
    expect(await b.rows('select id, owner_id from vehicles')).toEqual([
      { id: bobs.id, owner_id: bob.id },
    ])
    expect(await b.rows('select distinct config_id from maintenance_items')).toEqual([
      { config_id: bobs.configId },
    ])
    expect(await counts(b)).toMatchObject({
      vehicle_configs: 1,
      odometer_readings: 1,
      service_records: 0,
      warranties: 0,
      fill_ups: 0,
      renewals: 0,
      custom_items: 0,
      attachments: 0,
    })
  })

  it("refuses changes to another owner's car, and the owner never sees them", async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const [a, b] = [await open(alice), await open(bob)]
    const added = await addCar(a)
    const vehicleId = added.id

    // Bob's phone only knows the id, as if it had been leaked; it has none of Alice's rows.
    await b.records.add(service(vehicleId))
    await b.warranties.save(warranty(vehicleId))
    await b.fillUps.save(fillUp(vehicleId))
    await b.renewals.save(renewal(vehicleId))
    await b.customItems.save(customItem(vehicleId))
    await b.odometer.add({ vehicleId, date: '2026-10-05', miles: 99_999 })
    await b.db.execute(
      'insert into vehicles (id, owner_id, year, make, model, nickname) values (?, ?, ?, ?, ?, ?)',
      [vehicleId, alice.id, 2020, 'Tesla', 'Model 3', 'Taken'],
    )
    await b.uploaded()

    expect(b.dropped).toHaveLength(7)
    for (const table of ['service_records', 'warranties', 'fill_ups', 'renewals', 'custom_items'])
      expect(await serverRows(table, 'vehicle_id', vehicleId)).toEqual([])
    expect(await serverRows('odometer_readings', 'vehicle_id', vehicleId)).toHaveLength(1)
    expect(await serverRows('vehicles', 'id', vehicleId)).toMatchObject([
      { nickname: 'Daily', make: 'Honda', owner_id: alice.id },
    ])
    expect(await a.vehicles.get(vehicleId)).toEqual(added)
    // The refused changes do not linger on Bob's phone either.
    expect(
      await eventually(
        () => counts(b),
        (now) => now.vehicles === 0,
        "Bob's phone to settle",
      ),
    ).toEqual(nothing)
  })

  it('gives two owners who add the same model at once the same configuration', async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const [a, b] = [await open(alice), await open(bob)]
    const description = { year: 2021, make: 'Mazda', model: `CX-5 ${id()}`, trim: 'Touring' }
    const [onA, onB] = await Promise.all([
      addCar(a, { ...car(), ...description }),
      addCar(b, { ...car(), ...description, make: 'MAZDA' }),
    ])
    expect(onA.configId).toBe(onB.configId)
  })

  it("never shows the previous owner's data after another owner signs in on the same phone", async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const phone = await open(alice)
    const { id: vehicleId } = await addCar(phone)
    await phone.records.add(service(vehicleId))
    await phone.uploaded()

    await phone.signOut()
    expect(await counts(phone)).toEqual(nothing)
    await phone.signInAs(bob)
    await until(() => phone.db.currentStatus.hasSynced === true, "Bob's first sync")
    expect(await counts(phone)).toEqual(nothing)
  })
})

describe('attachments', () => {
  it('uploads the file with its row, and the other phone opens the same file', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const oilChange = service(vehicleId)
    await a.records.add(oilChange)
    const file = pickedPdf('oil change receipt')
    const receipt = attachment(vehicleId, {
      serviceRecordId: oilChange.id,
      sizeBytes: file.sizeBytes,
    })
    await a.attachments.add(receipt, file)
    await a.uploaded()

    const [synced] = await eventually(
      () => b.attachments.listForVehicle(vehicleId),
      (list) => list.length === 1,
      'the attachment on the second phone',
    )
    expect(synced).toEqual(receipt)
    const uri = await b.attachments.open(receipt)
    expect(new TextDecoder().decode(await b.files.read(receipt.id))).toContain('oil change receipt')
    expect(uri.startsWith('file:')).toBe(true)

    // Deleting on the other phone removes the row everywhere and the file from Storage.
    await b.attachments.remove(receipt)
    await b.uploaded()
    await eventually(
      () => a.attachments.listForVehicle(vehicleId),
      (list) => list.length === 0,
      'deletion',
    )
    await until(async () => (await a.files.read(receipt.id)) === undefined, 'the local file')
    const { data, error } = await admin.storage.from('attachments').list(owner.id)
    expect(error).toBeNull()
    expect(data?.map((f) => f.name)).not.toContain(receipt.id)
  })

  it("will not let another owner download an owner's file", async () => {
    const [alice, bob] = [await createUser(), await createUser()]
    const [a, b] = [await open(alice), await open(bob)]
    const { id: vehicleId } = await addCar(a)
    const receipt = attachment(vehicleId, { sizeBytes: 20 })
    await a.attachments.add(receipt, pickedPdf('private'))
    await a.uploaded()

    const path = attachmentPath(alice.id, receipt.id)
    // The file is there: its owner can download it.
    const own = await a.supabase.storage.from('attachments').createSignedUrl(path, 60)
    expect(own.error).toBeNull()

    const { data, error } = await b.supabase.storage.from('attachments').createSignedUrl(path, 60)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })
})

describe('deletes', () => {
  it('removes a deleted car and everything logged for it from both phones and the server', async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    const oilChange = service(vehicleId)
    await a.records.add(oilChange)
    await a.warranties.save(warranty(vehicleId))
    await a.fillUps.save(fillUp(vehicleId))
    await a.renewals.save(renewal(vehicleId))
    await a.customItems.save(customItem(vehicleId))
    const receipt = attachment(vehicleId, { sizeBytes: 20 })
    await a.attachments.add(receipt, pickedPdf('receipt'))
    await a.uploaded()
    await eventually(
      () => b.attachments.listForVehicle(vehicleId),
      (list) => list.length === 1,
      'everything on the second phone',
    )

    // The app has no screen for this yet; the uploader already sends a deleted car.
    await a.db.execute('delete from vehicles where id = ?', [vehicleId])
    await a.uploaded()

    // With no car left, the shared schedule and recalls for its configuration go too.
    for (const phone of [a, b])
      expect(
        await eventually(
          () => counts(phone),
          (now) => now.vehicles === 0 && now.attachments === 0 && now.maintenance_items === 0,
          'everything to go',
        ),
      ).toEqual(nothing)
    expect(await serverRows('vehicles', 'id', vehicleId)).toEqual([])
    for (const table of UPLOADABLE_TABLES.filter((t) => t !== 'vehicles'))
      expect(await serverRows(table, 'vehicle_id', vehicleId)).toEqual([])
  })

  it("removes a deleted account's data from the server and from every phone", async () => {
    const owner = await createUser()
    const [a, b] = [await open(owner), await open(owner)]
    const { id: vehicleId } = await addCar(a)
    await a.records.add(service(vehicleId))
    await a.fillUps.save(fillUp(vehicleId))
    const receipt = attachment(vehicleId, { sizeBytes: 20 })
    await a.attachments.add(receipt, pickedPdf('receipt'))
    await a.uploaded()
    await eventually(
      () => b.fillUps.listForVehicle(vehicleId),
      (f) => f.length === 1,
      'fill-up',
    )

    await a.account.deleteAccount()

    expect(await counts(a)).toEqual(nothing)
    expect(await serverRows('vehicles', 'owner_id', owner.id)).toEqual([])
    const { data } = await admin.auth.admin.getUserById(owner.id)
    expect(data.user).toBeNull()
    // The other phone is still signed in, and its copy empties as the deletion syncs.
    await eventually(
      () => counts(b),
      (now) => now.vehicles === 0 && now.service_records === 0 && now.fill_ups === 0,
      'the other phone to empty',
    )
    // Files are left for the server's cleanup job, which now lists them.
    const { data: orphans } = await admin.rpc('orphaned_files')
    expect(orphans).toContain(attachmentPath(owner.id, receipt.id))
  })
})

describe('coverage', () => {
  // Add an end-to-end case above for each table the phone writes, then list it here.
  const EXERCISED = [
    'vehicles',
    'odometer_readings',
    'service_records',
    'warranties',
    'fill_ups',
    'renewals',
    'custom_items',
    'attachments',
  ]

  it('exercises every table the phone uploads', () => {
    expect(new Set(EXERCISED)).toEqual(new Set(UPLOADABLE_TABLES))
  })
})
