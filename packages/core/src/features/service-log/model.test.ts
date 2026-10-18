import { describe, expect, it } from 'vitest'
import type { Attachment, MaintenanceItem, ServiceRecord } from '../../domain/types'
import {
  memoryCustomItems,
  fixedClock,
  memoryAttachments,
  memoryFilePicker,
  memorySchedule,
  memoryServiceRecords,
  sequentialIds,
} from '../../testing'
import { withCustomItems } from '../../lib/customSchedule'
import { LIST_PAGE } from './history'
import { createServiceLogModel } from './model'

const tasks: MaintenanceItem[] = [
  { id: 'oil', configId: 'c1', task: 'Oil & filter change', intervalMiles: 10_000 },
  { id: 'tires', configId: 'c1', task: 'Tire rotation', intervalMiles: 5_000 },
]

const setup = (
  initial: ServiceRecord[] = [
    { id: 'old', vehicleId: 'v1', performedOn: '2026-01-10', shop: 'Old shop' },
    { id: 'other-car', vehicleId: 'v2', performedOn: '2026-05-01' },
  ],
) => {
  const records = memoryServiceRecords(initial)
  const attachments = memoryAttachments()
  const picker = memoryFilePicker()
  const model = createServiceLogModel({
    vehicleId: 'v1',
    configId: 'c1',
    schedule: memorySchedule(tasks),
    records,
    attachments,
    picker,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('rec'),
  })
  model.getState().start()
  return { model, records, attachments, picker }
}

// The in-memory schedule resolves at once, so a few microtask turns let it arrive.
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('service log screen model', () => {
  it('stays loading until started', () => {
    const model = createServiceLogModel({
      vehicleId: 'v1',
      schedule: memorySchedule(),
      records: memoryServiceRecords(),
      attachments: memoryAttachments(),
      picker: memoryFilePicker(),
      clock: fixedClock('2026-10-17'),
      ids: sequentialIds(),
    })
    expect(model.getState().status).toBe('loading')
  })

  it("loads this car's records and a draft dated today", () => {
    const { model } = setup()
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.records.map((r) => r.id)).toEqual(['old'])
    expect(s.draft.performedOn).toBe('2026-10-17')
  })

  it('saves a valid draft, shows it newest first and resets the form', async () => {
    const { model } = setup()
    const { setField, save } = model.getState()
    setField('notes', 'Wipers')
    setField('odometerMiles', '41250')
    setField('cost', '89.99')
    setField('shop', '  Main St Garage ')

    expect(await save()).toBe(true)

    const s = model.getState()
    expect(s.records[0]).toEqual({
      id: 'rec-1',
      vehicleId: 'v1',
      performedOn: '2026-10-17',
      odometerMiles: 41_250,
      costCents: 8_999,
      shop: 'Main St Garage',
      notes: 'Wipers',
    })
    expect(s.draft.shop).toBe('')
    expect(s.status).toBe('ready')
  })

  it('reports field errors without saving', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', '-5')
    model.getState().setField('performedOn', 'yesterday')

    expect(await model.getState().save()).toBe(false)

    const s = model.getState()
    expect(s.fieldErrors).toEqual({
      odometerMiles: 'Enter whole miles, like 41,250',
      performedOn: 'Enter a date like 3/14/2025',
    })
    expect(s.records).toHaveLength(1)
  })

  it('reads a date typed the US way', async () => {
    const { model } = setup()
    model.getState().setField('notes', 'Wipers')
    model.getState().setField('performedOn', '3/14/2026')
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().records[0]?.performedOn).toBe('2026-03-14')
  })

  it('refuses a service dated after today, which would push the schedule out', async () => {
    const { model } = setup()
    model.getState().setField('notes', 'Wipers')
    model.getState().setField('performedOn', '2062-10-17')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().fieldErrors).toEqual({ performedOn: "That's in the future" })
    expect(model.getState().records).toHaveLength(1)
    model.getState().setField('performedOn', '2026-10-17')
    expect(await model.getState().save()).toBe(true)
  })

  it('offers the picker no day after today', () => {
    const { model } = setup()
    model.getState().openForm(undefined, { earlier: true })
    expect(model.getState().latestDate).toBe('2026-10-17')
  })

  it('clears a field error when that field is edited', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', 'abc')
    await model.getState().save()
    model.getState().setField('odometerMiles', '100')
    expect(model.getState().fieldErrors.odometerMiles).toBeUndefined()
  })

  it('requires what was done when no scheduled task is picked', async () => {
    const { model } = setup()
    expect(await model.getState().save()).toBe(false)
    expect(model.getState().fieldErrors).toEqual({ notes: 'Say what was done' })
    model.getState().setField('itemId', 'oil')
    expect(await model.getState().save()).toBe(true)
  })

  it('surfaces a storage failure as an error state', async () => {
    const { model, records } = setup()
    model.getState().setField('itemId', 'oil')
    records.failNextAdd('Disk full')
    expect(await model.getState().save()).toBe(false)
    expect(model.getState()).toMatchObject({ status: 'error', saveError: 'Disk full' })
  })

  it('clears a previous save error once a save succeeds', async () => {
    const { model, records } = setup()
    model.getState().setField('itemId', 'oil')
    records.failNextAdd('Disk full')
    await model.getState().save()
    expect(await model.getState().save()).toBe(true)
    expect(model.getState()).toMatchObject({ status: 'ready', saveError: undefined })
  })

  it('ignores a second save while the first is still running', async () => {
    const { model } = setup()
    model.getState().setField('itemId', 'oil')
    const first = model.getState().save()
    const second = model.getState().save()
    expect(await Promise.all([first, second])).toEqual([true, false])
    expect(model.getState().records).toHaveLength(2)
  })

  it('rejects numbers written in unusual notation', async () => {
    const { model } = setup()
    model.getState().setField('odometerMiles', '1e3')
    model.getState().setField('cost', '0x10')
    expect(await model.getState().save()).toBe(false)
    expect(Object.keys(model.getState().fieldErrors).sort()).toEqual(['cost', 'odometerMiles'])
  })

  it('accepts amounts and miles written as a receipt prints them', async () => {
    const { model } = setup()
    model.getState().setField('notes', 'Brakes')
    model.getState().setField('odometerMiles', '41,250')
    model.getState().setField('cost', '$1,234.50')
    expect(await model.getState().save()).toBe(true)
    expect(model.getState().records[0]).toMatchObject({ odometerMiles: 41_250, costCents: 123_450 })
  })

  it('stops receiving updates after dispose', async () => {
    const { model, records } = setup()
    model.getState().dispose()
    await records.add({ id: 'late', vehicleId: 'v1', performedOn: '2026-10-18' })
    expect(model.getState().records.map((r) => r.id)).toEqual(['old'])
  })

  it('picks up changes made while stopped when started again', async () => {
    const { model, records } = setup()
    model.getState().dispose()
    await records.add({ id: 'late', vehicleId: 'v1', performedOn: '2026-10-18' })
    model.getState().start()
    expect(model.getState().records.map((r) => r.id)).toEqual(['late', 'old'])
  })

  describe('history', () => {
    const history: ServiceRecord[] = [
      {
        id: 'a',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-08-14',
        odometerMiles: 41_250,
        costCents: 8_995,
        shop: 'Main St Auto',
      },
      { id: 'b', vehicleId: 'v1', performedOn: '2026-10-02', costCents: 3_898, notes: 'Wipers' },
      {
        id: 'c',
        vehicleId: 'v1',
        itemId: 'tires',
        performedOn: '2025-05-20',
        costCents: 2_400,
        shop: 'Dealer',
      },
    ]

    it('groups records by month, newest first, naming the task done', async () => {
      const { model } = setup(history)
      await settle()
      const groups = model.getState().groups
      expect(groups.map((g) => g.label)).toEqual(['October', 'August', 'May 2025'])
      expect(groups[1]?.entries[0]).toEqual({
        id: 'a',
        month: 'Aug',
        day: '14',
        what: 'Oil & filter change',
        where: 'Main St Auto · 41,250 mi',
        cost: '$89.95',
        date: 'Aug 14, 2026',
        notes: undefined,
      })
      expect(groups[0]?.entries[0]).toMatchObject({ what: 'Wipers', notes: undefined })
    })

    it('keeps the notes of a service named by its task, to show with it', async () => {
      const { model } = setup([
        {
          id: 'a',
          vehicleId: 'v1',
          itemId: 'oil',
          performedOn: '2026-08-14',
          notes: '0W-20, 5 qt',
        },
      ])
      await settle()
      expect(model.getState().groups[0]?.entries[0]).toMatchObject({
        what: 'Oil & filter change',
        notes: '0W-20, 5 qt',
      })
    })

    it('totals what was spent this year and counts every service', () => {
      const { model } = setup(history)
      expect(model.getState().summary).toEqual({
        spentLabel: 'Spent in 2026',
        spent: '$128.93',
        count: 3,
      })
    })

    it('filters by task, shop or notes, ignoring case', async () => {
      const { model } = setup(history)
      await settle()
      model.getState().setQuery('main st')
      expect(model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(['a'])
      model.getState().setQuery('TIRE')
      expect(model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(['c'])
      model.getState().setQuery('')
      expect(model.getState().groups).toHaveLength(3)
    })

    it('lists the newest page of years of history, and older services on request', () => {
      // Fifteen years of monthly services.
      const years: ServiceRecord[] = Array.from({ length: 180 }, (_, i) => ({
        id: `r${i}`,
        vehicleId: 'v1',
        performedOn: `${2026 - Math.floor(i / 12)}-${String(12 - (i % 12)).padStart(2, '0')}-01`,
        notes: i % 2 === 0 ? 'Oil' : 'Wipers',
      }))
      const { model } = setup(years)
      const ids = () => model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))
      expect(ids()).toEqual(years.slice(0, LIST_PAGE).map((r) => r.id))
      expect(model.getState().hidden).toBe(180 - LIST_PAGE)
      expect(model.getState().summary.count).toBe(180)

      model.getState().showMore()
      expect(ids()).toHaveLength(2 * LIST_PAGE)
      expect(model.getState().hidden).toBe(180 - 2 * LIST_PAGE)

      // A search covers every record, and starts again from its newest matches.
      model.getState().setQuery('wipers')
      expect(ids()).toEqual(
        years
          .filter((r) => r.notes === 'Wipers')
          .slice(0, LIST_PAGE)
          .map((r) => r.id),
      )
      expect(model.getState().hidden).toBe(90 - LIST_PAGE)
    })

    it('searches the notes of a record that also has a task', async () => {
      const { model } = setup([
        { id: 'n', vehicleId: 'v1', itemId: 'oil', performedOn: '2026-09-01', notes: 'Synthetic' },
        ...history,
      ])
      await settle()
      model.getState().setQuery('synth')
      expect(model.getState().groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual(['n'])
    })

    it('names January without a year and last December with one', () => {
      const { model } = setup([
        { id: 'j', vehicleId: 'v1', performedOn: '2026-01-05', costCents: 1_000, notes: 'Wash' },
        { id: 'd', vehicleId: 'v1', performedOn: '2025-12-30', costCents: 5_000, notes: 'Wax' },
      ])
      expect(model.getState().groups.map((g) => g.label)).toEqual(['January', 'December 2025'])
      expect(model.getState().summary.spent).toBe('$10.00')
    })

    it('has no task names before the car has synced, and loads them once it has', async () => {
      const records = memoryServiceRecords(history)
      let reads = 0
      const schedule = memorySchedule(tasks)
      const model = createServiceLogModel({
        vehicleId: 'v1',
        schedule: withCustomItems(
          {
            itemsForConfig: (id) => {
              reads++
              return schedule.itemsForConfig(id)
            },
          },
          memoryCustomItems(),
        ),
        records,
        attachments: memoryAttachments(),
        picker: memoryFilePicker(),
        clock: fixedClock('2026-10-17'),
        ids: sequentialIds('rec'),
      })
      model.getState().start()
      model.getState().openForm()
      model.getState().setField('shop', 'Dealer')
      await settle()
      expect(reads).toBe(0)
      expect(model.getState().tasks).toEqual([])
      model.getState().setConfig('c1')
      await settle()
      expect(model.getState().tasks).toHaveLength(2)
      expect(model.getState().groups[1]?.entries[0]?.what).toBe('Oil & filter change')
      // The draft in the open form survives the config arriving.
      expect(model.getState()).toMatchObject({ adding: true, draft: { shop: 'Dealer' } })
    })

    it('falls back to notes when the schedule cannot be read', async () => {
      const model = createServiceLogModel({
        vehicleId: 'v1',
        configId: 'c1',
        schedule: withCustomItems(
          { itemsForConfig: () => Promise.reject(new Error('offline')) },
          memoryCustomItems(),
        ),
        records: memoryServiceRecords(history),
        attachments: memoryAttachments(),
        picker: memoryFilePicker(),
        clock: fixedClock('2026-10-17'),
        ids: sequentialIds('rec'),
      })
      model.getState().start()
      await settle()
      expect(model.getState()).toMatchObject({ status: 'ready', tasks: [] })
      expect(model.getState().groups[0]?.entries[0]?.what).toBe('Wipers')
    })

    it('ignores a schedule that arrives after dispose', async () => {
      const { model } = setup(history)
      model.getState().dispose()
      await settle()
      expect(model.getState().tasks).toEqual([])
    })

    it("offers the car's scheduled tasks for what was done", async () => {
      const { model } = setup(history)
      await settle()
      expect(model.getState().tasks).toEqual([
        { id: 'oil', task: 'Oil & filter change' },
        { id: 'tires', task: 'Tire rotation' },
      ])
    })
  })

  describe('the form', () => {
    it('is closed until opened, and opens with a task chosen', () => {
      const { model } = setup()
      expect(model.getState().adding).toBe(false)
      model.getState().openForm('oil')
      expect(model.getState()).toMatchObject({
        adding: true,
        draft: { itemId: 'oil', performedOn: '2026-10-17' },
      })
      model.getState().closeForm()
      expect(model.getState().adding).toBe(false)
    })

    it('leaves the date empty for a service done earlier, and asks for it on saving', async () => {
      const { model, records } = setup()
      const before = (await records.listForVehicle('v1')).length
      model.getState().openForm('oil', { earlier: true })
      expect(model.getState().draft).toMatchObject({ itemId: 'oil', performedOn: '' })
      expect(await model.getState().save()).toBe(false)
      expect(model.getState().fieldErrors.performedOn).toBe('Add the date it was done')
      expect(await records.listForVehicle('v1')).toHaveLength(before)
    })

    it('opens with an empty draft, clearing errors from before', async () => {
      const { model, records } = setup()
      model.getState().openForm('oil')
      model.getState().setField('odometerMiles', 'abc')
      await model.getState().save()
      model.getState().setField('odometerMiles', '100')
      records.failNextAdd('Disk full')
      await model.getState().save()
      model.getState().openForm()
      expect(model.getState()).toMatchObject({
        adding: true,
        draft: { itemId: '', odometerMiles: '' },
        fieldErrors: {},
        saveError: undefined,
      })
    })

    it('reopens with the error when a save fails after the form was closed', async () => {
      const { model, records } = setup()
      model.getState().openForm('oil')
      records.failNextAdd('Disk full')
      const saving = model.getState().save()
      model.getState().closeForm()
      expect(model.getState().adding).toBe(false)
      expect(await saving).toBe(false)
      expect(model.getState()).toMatchObject({
        adding: true,
        saveError: 'Disk full',
        draft: { itemId: 'oil' },
      })
    })

    it('stays closed when a save finishes after the form was closed', async () => {
      const { model } = setup()
      model.getState().openForm('oil')
      const saving = model.getState().save()
      model.getState().closeForm()
      expect(await saving).toBe(true)
      expect(model.getState().adding).toBe(false)
    })

    it('closes once the service is saved', async () => {
      const { model } = setup()
      model.getState().openForm('oil')
      expect(await model.getState().save()).toBe(true)
      expect(model.getState()).toMatchObject({ adding: false, draft: { itemId: '' } })
      expect(model.getState().records[0]?.itemId).toBe('oil')
    })
  })

  describe('receipts', () => {
    const receipt = {
      uri: 'file:///tmp/receipt.jpg',
      name: 'receipt.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 500_000,
    }

    it('attaches receipts picked in the form to the service once it is saved', async () => {
      const { model, attachments, picker } = setup()
      model.getState().openForm('oil')
      picker.queue(receipt)
      await model.getState().addReceipt('camera')
      picker.queue({ ...receipt, name: 'invoice.pdf', contentType: 'application/pdf' })
      await model.getState().addReceipt('files')
      expect(model.getState().receipts.map((r) => r.name)).toEqual(['receipt.jpg', 'invoice.pdf'])
      expect(attachments.files.size).toBe(0)

      expect(await model.getState().save()).toBe(true)

      const saved: Attachment[] = []
      attachments.watchForVehicle('v1', (a) => saved.push(...a))
      expect(saved.map((a) => [a.name, a.kind, a.serviceRecordId])).toEqual([
        ['invoice.pdf', 'receipt', 'rec-1'],
        ['receipt.jpg', 'receipt', 'rec-1'],
      ])
      expect(model.getState().receipts).toEqual([])
    })

    it('lets the owner take a picked receipt back out before saving', async () => {
      const { model, picker } = setup()
      model.getState().openForm()
      picker.queue(receipt)
      picker.queue({ ...receipt, name: 'second.jpg' })
      await model.getState().addReceipt('photos')
      await model.getState().addReceipt('photos')
      model.getState().removeReceipt(0)
      expect(model.getState().receipts.map((r) => r.name)).toEqual(['second.jpg'])
    })

    it('explains a receipt that cannot be attached, without losing the others', async () => {
      const { model, picker } = setup()
      model.getState().openForm()
      picker.queue(receipt)
      await model.getState().addReceipt('photos')
      picker.queue({ ...receipt, contentType: 'text/plain' })
      await model.getState().addReceipt('files')
      expect(model.getState().receiptError).toBe('Choose a photo or a PDF.')
      expect(model.getState().receipts).toHaveLength(1)
    })

    it('starts each new service with no receipts', async () => {
      const { model, picker } = setup()
      model.getState().openForm()
      picker.queue(receipt)
      await model.getState().addReceipt('photos')
      model.getState().closeForm()
      model.getState().openForm()
      expect(model.getState().receipts).toEqual([])
    })

    it('keeps the service when a receipt fails to attach, and says how to retry', async () => {
      const { model, picker, attachments } = setup()
      model.getState().openForm('oil')
      picker.queue(receipt)
      await model.getState().addReceipt('photos')
      attachments.failNextAdd('disk full')

      expect(await model.getState().save()).toBe(true)
      expect(model.getState().records[0]?.id).toBe('rec-1')
      expect(model.getState().adding).toBe(false)
      expect(model.getState().receiptError).toMatch(/could not be attached/)
    })

    it('opens a logged service filled in, and saves the correction in its place', async () => {
      const { model, records } = setup([
        {
          id: 'typo',
          vehicleId: 'v1',
          itemId: 'oil',
          performedOn: '2026-08-14',
          odometerMiles: 412_500,
          costCents: 8_995,
          shop: 'Main St Auto',
        },
      ])
      await settle()
      model.getState().openEntry('typo')
      model.getState().editEntry()
      const s = model.getState()
      expect(s).toMatchObject({ adding: true, editingId: 'typo', openEntryId: undefined })
      expect(s.draft).toEqual({
        performedOn: '2026-08-14',
        itemId: 'oil',
        odometerMiles: '412500',
        cost: '89.95',
        shop: 'Main St Auto',
        notes: '',
      })
      model.getState().setField('odometerMiles', '41250')
      expect(await model.getState().save()).toBe(true)
      expect(await records.listForVehicle('v1')).toEqual([
        {
          id: 'typo',
          vehicleId: 'v1',
          itemId: 'oil',
          performedOn: '2026-08-14',
          odometerMiles: 41_250,
          costCents: 8_995,
          shop: 'Main St Auto',
        },
      ])
      expect(model.getState()).toMatchObject({ adding: false, editingId: undefined })
    })

    it('keeps the task of a service being corrected, even one the schedule no longer lists', async () => {
      const { model } = setup([
        { id: 'gone', vehicleId: 'v1', itemId: 'dropped', performedOn: '2026-08-14', notes: 'DIY' },
      ])
      await settle()
      model.getState().openEntry('gone')
      model.getState().editEntry()
      expect(model.getState().draft.itemId).toBe('dropped')
    })

    it('shows a failed delete only on the service it was for', async () => {
      const { model, records } = setup([
        { id: 'a', vehicleId: 'v1', performedOn: '2026-08-14', notes: 'A' },
        { id: 'b', vehicleId: 'v1', performedOn: '2026-08-15', notes: 'B' },
      ])
      let fail: (e: Error) => void = () => {}
      records.remove = () => new Promise((_, reject) => (fail = reject))
      model.getState().openEntry('a')
      await model.getState().deleteEntry()
      const deleting = model.getState().deleteEntry()
      model.getState().closeEntry()
      model.getState().openEntry('b')
      fail(new Error('disk full'))
      await deleting
      expect(model.getState()).toMatchObject({ openEntryId: 'b', deleteError: undefined })
    })

    it('logs a new service after a correction, rather than correcting again', async () => {
      const { model, records } = setup()
      await settle()
      model.getState().openEntry('old')
      model.getState().editEntry()
      model.getState().closeForm()
      model.getState().openForm()
      model.getState().setField('notes', 'Wipers')
      expect(await model.getState().save()).toBe(true)
      expect(await records.listForVehicle('v1')).toHaveLength(2)
    })

    it('asks before deleting a logged service, then deletes it', async () => {
      const { model, records } = setup()
      model.getState().openEntry('old')
      await model.getState().deleteEntry()
      expect(model.getState().deleting).toBe('confirm')
      expect(await records.listForVehicle('v1')).toHaveLength(1)
      await model.getState().deleteEntry()
      expect(await records.listForVehicle('v1')).toEqual([])
      expect(model.getState()).toMatchObject({ openEntryId: undefined, deleting: undefined })
      expect(model.getState().summary.count).toBe(0)
    })

    it('forgets an unconfirmed delete when the service is closed', async () => {
      const { model, records } = setup()
      model.getState().openEntry('old')
      await model.getState().deleteEntry()
      model.getState().closeEntry()
      model.getState().openEntry('old')
      expect(model.getState().deleting).toBeUndefined()
      await model.getState().deleteEntry()
      expect(await records.listForVehicle('v1')).toHaveLength(1)
    })

    it('says so when a service cannot be deleted, keeping it', async () => {
      const { model, records } = setup()
      records.remove = async () => {
        throw new Error('disk full')
      }
      model.getState().openEntry('old')
      await model.getState().deleteEntry()
      await model.getState().deleteEntry()
      expect(model.getState()).toMatchObject({
        openEntryId: 'old',
        deleting: undefined,
        deleteError: 'The service could not be deleted. Try again.',
      })
    })

    it('opens a logged service to show its receipts', () => {
      const { model } = setup()
      model.getState().openEntry('old')
      expect(model.getState().openEntryId).toBe('old')
      model.getState().closeEntry()
      expect(model.getState().openEntryId).toBeUndefined()
    })
  })
})
