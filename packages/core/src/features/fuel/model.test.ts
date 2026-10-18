import { describe, expect, it } from 'vitest'
import type { FillUp, Vehicle } from '../../domain/types'
import {
  fixedClock,
  memoryFillUps,
  memoryOdometer,
  memoryServiceRecords,
  sequentialIds,
} from '../../testing'
import { LIST_PAGE } from '../service-log/history'
import { createFuelModel } from './model'
import { withFillUpReadings } from './readings'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2022,
  make: 'Toyota',
  model: 'RAV4',
  engine: '2.5L 4-cyl',
  nickname: 'RAV',
  severeDuty: false,
}

const fill = (id: string, filledOn: string, odometerMiles: number, more: Partial<FillUp> = {}) =>
  ({
    id,
    vehicleId: 'v1',
    filledOn,
    odometerMiles,
    energy: 'fuel',
    quantity: 10,
    costCents: 3_500,
    full: true,
    missedPrevious: false,
    ...more,
  }) satisfies FillUp

const setup = (initial: FillUp[] = [], vehicle = car) => {
  const fillUps = memoryFillUps(initial)
  const odometer = withFillUpReadings(
    memoryOdometer([{ vehicleId: 'v1', date: '2026-01-02', miles: 30_000 }]),
    fillUps,
  )
  const records = memoryServiceRecords([
    {
      id: 'r1',
      vehicleId: 'v1',
      performedOn: '2026-09-15',
      odometerMiles: 32_400,
      costCents: 8_995,
    },
  ])
  const model = createFuelModel({
    vehicle,
    fillUps,
    records,
    odometer,
    clock: fixedClock('2026-10-17'),
    ids: sequentialIds('f'),
  })
  model.getState().start()
  return { model, fillUps }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const history = [
  fill('a', '2026-09-01', 32_000),
  fill('b', '2026-09-10', 32_300),
  fill('c', '2026-09-20', 32_550, { quantity: 5, full: false, station: 'Costco' }),
  fill('d', '2026-10-01', 32_900, { quantity: 6, costCents: 2_100, station: 'Costco' }),
]

describe('fuel and costs screen', () => {
  it('lists fill-ups newest first with the economy each full one measured', async () => {
    const { model } = setup(history)
    await settle()
    const { rows, status } = model.getState()
    expect(status).toBe('ready')
    expect(rows.map((r) => [r.date, r.title, r.economy, r.note])).toEqual([
      ['Oct 1', '6 gal · $21.00', '54.5 mpg', undefined],
      ['Sep 20', '5 gal · $35.00', undefined, 'Partial fill'],
      ['Sep 10', '10 gal · $35.00', '30.0 mpg', undefined],
      ['Sep 1', '10 gal · $35.00', undefined, undefined],
    ])
    expect(rows[0]?.detail).toBe('32,900 mi · Costco · $3.500/gal')
  })

  it('lists the newest page of years of fill-ups, and older ones on request', async () => {
    // Weekly fill-ups for about four years.
    const weekly = Array.from({ length: 200 }, (_, i) =>
      fill(
        `w${i}`,
        new Date(Date.UTC(2022, 10, 1 + i * 7)).toISOString().slice(0, 10),
        10_000 + i * 90,
      ),
    )
    const { model } = setup(weekly)
    await settle()
    expect(model.getState().rows.map((r) => r.id)).toEqual(
      weekly
        .slice(-LIST_PAGE)
        .reverse()
        .map((f) => f.id),
    )
    expect(model.getState().hiddenRows).toBe(200 - LIST_PAGE)

    model.getState().showMoreRows()
    expect(model.getState().rows).toHaveLength(2 * LIST_PAGE)
    expect(model.getState().hiddenRows).toBe(200 - 2 * LIST_PAGE)
  })

  it('averages economy over every measured mile', async () => {
    const { model } = setup(history)
    await settle()
    expect(model.getState().economy).toEqual([
      expect.objectContaining({
        energy: 'fuel',
        title: 'Fuel economy',
        average: '42.9 mpg',
        points: [
          { date: '2026-09-10', label: 'Sep 10', value: 30 },
          { date: '2026-10-01', label: 'Oct 1', value: 600 / 11 },
        ],
      }),
    ])
  })

  it('adds fuel and service into the last twelve months, with cost per mile', async () => {
    const { model } = setup(history)
    await settle()
    const { lastYear, months, years } = model.getState()
    expect(lastYear).toEqual({
      label: 'Last 12 months',
      fuel: '$126.00',
      service: '$89.95',
      total: '$215.95',
      miles: '2,900 mi',
      perMile: '$0.07/mi',
    })
    expect(months.at(-2)).toEqual({
      label: 'Sep',
      fuelCents: 10_500,
      serviceCents: 8_995,
      totalCents: 19_495,
    })
    expect(years.map((y) => y.label)).toEqual(['2026'])
  })

  it('flags a fill-up whose economy is impossible so the owner can fix it', async () => {
    const { model } = setup([fill('a', '2026-09-01', 32_000), fill('b', '2026-09-10', 35_300)])
    await settle()
    const [row] = model.getState().rows
    expect(row).toMatchObject({ flagged: true, note: 'Check the odometer and amount' })
    expect(row?.economy).toBeUndefined()
    expect(model.getState().economy).toEqual([])
  })

  it('starts a new fill-up on today, full, with the last energy and station', async () => {
    const { model } = setup(history)
    await settle()
    model.getState().openNew()
    expect(model.getState().form).toMatchObject({
      draft: { filledOn: '2026-10-17', energy: 'fuel', full: true, station: 'Costco' },
      odometerHint: expect.stringMatching(/^About 3[23],\d{3}$/),
    })
  })

  it('starts an electric car on charging', async () => {
    const { model } = setup([], { ...car, engine: 'Electric' })
    await settle()
    model.getState().openNew()
    expect(model.getState().form?.draft.energy).toBe('electric')
    expect(model.getState().energies.map((e) => e.label)).toEqual(['Charge', 'Fuel'])
  })

  it('speaks of fill-ups and fuel for a gas car', async () => {
    const { model } = setup(history)
    await settle()
    const { wording, costLabel } = model.getState()
    expect(wording).toMatchObject({
      title: 'Fuel & costs',
      add: 'Log a fill-up',
      tab: 'Fill-ups',
      heading: 'FILL-UPS',
      showEarlier: 'Show earlier fill-ups',
      addTitle: 'Add fill-up',
      editTitle: 'Edit fill-up',
      remove: 'Delete fill-up',
    })
    expect(wording.empty).toContain('after two full fill-ups')
    expect(wording.costsEmpty).toContain('from fill-ups and services')
    expect(costLabel).toBe('Fuel')
  })

  it('speaks of charges and charging for an electric car', async () => {
    const { model } = setup([], { ...car, engine: 'Electric' })
    await settle()
    const { wording, costLabel } = model.getState()
    expect(wording).toMatchObject({
      title: 'Charging & costs',
      add: 'Log a charge',
      tab: 'Charges',
      heading: 'CHARGES',
      showEarlier: 'Show earlier charges',
      addTitle: 'Add charge',
      editTitle: 'Edit charge',
      remove: 'Delete charge',
    })
    expect(wording.empty).toContain('after two full charges')
    expect(wording.empty).not.toMatch(/fill-up/)
    expect(wording.costsEmpty).toContain('from charges and services')
    expect(costLabel).toBe('Charging')
  })

  it('speaks of fuel for a plug-in hybrid, which starts on fuel', async () => {
    const { model } = setup([], { ...car, engine: '2.0L 4-cyl plug-in hybrid' })
    await settle()
    expect(model.getState().wording.title).toBe('Fuel & costs')
  })

  it('calls the costs fuel and charging once both have been logged', async () => {
    const charge = fill('e', '2026-10-05', 33_000, { energy: 'electric', quantity: 40 })
    const { model } = setup([...history, charge])
    await settle()
    expect(model.getState().costLabel).toBe('Fuel & charging')
  })

  it("names charges in an electric car's notes and mileage checks", async () => {
    const charges = [
      fill('a', '2026-09-01', 32_000, { energy: 'electric', quantity: 40 }),
      fill('b', '2026-09-10', 32_300, { energy: 'electric', quantity: 90 }),
      fill('c', '2026-10-01', 32_900, { energy: 'electric', quantity: 90, missedPrevious: true }),
      fill('d', '2026-09-20', 32_600, { energy: 'electric', quantity: 20, full: false }),
    ]
    const { model } = setup(charges, { ...car, engine: 'Electric' })
    await settle()
    const s = model.getState()
    expect(s.rows[0]?.note).toBe('After a missed charge')
    expect(s.rows[1]?.note).toBe('Partial charge')
    expect(s.economy[0]?.waiting).toBe(
      'The chart starts once two stretches between full charges are logged.',
    )
    s.openNew()
    expect(model.getState().form?.note).toMatch(/^Efficiency is measured from one full charge/)
    s.setField('odometerMiles', '32,090')
    s.setField('quantity', '40')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors.odometerMiles).toBe(
      'Lower than the Oct 1 charge at 32,900 mi',
    )
  })

  it('names what failed to save after the energy going in', async () => {
    const { model, fillUps } = setup(history)
    fillUps.save = () => Promise.reject('offline')
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('energy', 'electric')
    s.setField('odometerMiles', '33,500')
    s.setField('quantity', '40')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.error).toBe('Could not save the charge')
  })

  it('explains full and missed for the energy going in', async () => {
    const { model } = setup(history)
    await settle()
    const s = model.getState()
    s.openNew()
    expect(model.getState().form?.note).toMatch(/^Economy is measured from one full fill-up/)
    s.setField('energy', 'electric')
    expect(model.getState().form?.note).toMatch(/^Efficiency is measured from one full charge/)
  })

  it('saves a new fill-up from what was typed', async () => {
    const { model, fillUps } = setup(history)
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('odometerMiles', '33,240')
    s.setField('quantity', '11.482')
    s.setField('cost', '$41.20')
    expect(model.getState().form?.unitPrice).toBe('$3.588/gal')
    s.setMissedPrevious(true)
    expect(await s.save()).toBe(true)
    expect(model.getState().form).toBeUndefined()
    expect((await fillUps.listForVehicle('v1'))[0]).toEqual({
      id: 'f-1',
      vehicleId: 'v1',
      filledOn: '2026-10-17',
      odometerMiles: 33_240,
      energy: 'fuel',
      quantity: 11.482,
      costCents: 4_120,
      full: true,
      missedPrevious: true,
      station: 'Costco',
    })
  })

  it('lets a fill-up be saved without a cost, as for free charging', async () => {
    const { model, fillUps } = setup()
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('odometerMiles', '33240')
    s.setField('quantity', '40')
    s.setField('energy', 'electric')
    expect(await s.save()).toBe(true)
    const [saved] = await fillUps.listForVehicle('v1')
    expect(saved?.costCents).toBeUndefined()
    expect(saved?.energy).toBe('electric')
  })

  it('explains each missing or malformed field', async () => {
    const { model } = setup()
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('cost', 'forty')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors).toEqual({
      odometerMiles: 'Enter the odometer in whole miles, like 41,250',
      quantity: 'Enter how much went in, like 12.4',
      cost: 'Enter the total paid, like 48.20',
    })
    s.setField('quantity', '12')
    expect(model.getState().form?.fieldErrors.quantity).toBeUndefined()
  })

  it('refuses a mileage lower than an earlier fill-up, naming it', async () => {
    const { model } = setup(history)
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('odometerMiles', '32,090')
    s.setField('quantity', '10')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors.odometerMiles).toBe(
      'Lower than the Oct 1 fill-up at 32,900 mi',
    )
    // Dated where it belongs, it is a missed fill-up entered late, which is fine.
    s.setField('filledOn', '2026-09-02')
    expect(model.getState().form?.fieldErrors.odometerMiles).toBeUndefined()
    expect(await s.save()).toBe(true)
  })

  it('refuses a mileage lower than a reading or service, naming it', async () => {
    const { model } = setup()
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('odometerMiles', '3,240')
    s.setField('quantity', '10')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors.odometerMiles).toBe(
      'Lower than the Sep 15 service at 32,400 mi',
    )
  })

  it('refuses a mileage further on than the car could have been driven', async () => {
    const { model } = setup(history)
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('odometerMiles', '332,400')
    s.setField('quantity', '10')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors.odometerMiles).toBe(
      'Too far past the Oct 1 fill-up at 32,900 mi',
    )
  })

  it('offers the picker no day after today', async () => {
    const { model } = setup()
    await settle()
    model.getState().openNew()
    expect(model.getState().form?.latestDate).toBe(model.getState().form?.draft.filledOn)
  })

  it('refuses a fill-up dated in the future', async () => {
    const { model } = setup()
    await settle()
    const s = model.getState()
    s.openNew()
    s.setField('filledOn', '2027-10-17')
    s.setField('odometerMiles', '33,240')
    s.setField('quantity', '10')
    expect(await s.save()).toBe(false)
    expect(model.getState().form?.fieldErrors).toEqual({ filledOn: "That's in the future" })
  })

  it('corrects a fill-up in place', async () => {
    const { model, fillUps } = setup(history)
    await settle()
    const s = model.getState()
    s.openEdit('d')
    expect(model.getState().form?.draft).toMatchObject({
      odometerMiles: '32,900',
      quantity: '6',
      cost: '21.00',
    })
    s.setField('quantity', '11')
    s.setFull(false)
    expect(await s.save()).toBe(true)
    const saved = (await fillUps.listForVehicle('v1')).find((f) => f.id === 'd')
    expect(saved).toMatchObject({ quantity: 11, full: false })
    expect(await fillUps.listForVehicle('v1')).toHaveLength(4)
  })

  it('deletes a fill-up only on the second tap', async () => {
    const { model, fillUps } = setup(history)
    await settle()
    const s = model.getState()
    s.openEdit('a')
    expect(await s.remove()).toBe(false)
    expect(model.getState().form?.confirmingDelete).toBe(true)
    expect(await s.remove()).toBe(true)
    expect((await fillUps.listForVehicle('v1')).map((f) => f.id)).not.toContain('a')
  })

  it('keeps the sheet open with the error when saving fails', async () => {
    const { model, fillUps } = setup(history)
    await settle()
    fillUps.failNext('Disk full')
    const s = model.getState()
    s.openEdit('a')
    expect(await s.save()).toBe(false)
    expect(model.getState().form).toMatchObject({ saving: false, error: 'Disk full' })
  })

  it('switches between fill-ups and costs', () => {
    const { model } = setup()
    model.getState().showSection('costs')
    expect(model.getState().section).toBe('costs')
  })

  it('stops listening once disposed', async () => {
    const { model, fillUps } = setup(history)
    await settle()
    model.getState().dispose()
    await fillUps.remove('a')
    await settle()
    expect(model.getState().rows).toHaveLength(4)
  })
})
