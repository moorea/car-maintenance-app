import { describe, expect, it } from 'vitest'
import type { Renewal } from '../../domain/types'
import { fixedClock, memoryRenewals, sequentialIds } from '../../testing'
import { createRenewalsModel } from './model'

const registration: Renewal = {
  id: 'r1',
  vehicleId: 'v1',
  kind: 'registration',
  dueOn: '2026-11-01',
  everyMonths: 12,
}

const setup = (initial: Renewal[] = []) => {
  const renewals = memoryRenewals(initial)
  const model = createRenewalsModel({
    vehicleId: 'v1',
    renewals,
    clock: fixedClock('2026-10-18'),
    ids: sequentialIds('new'),
  })
  model.getState().start()
  return { model, renewals, state: () => model.getState() }
}

describe('renewals model', () => {
  it('lists overdue ones first, then the soonest, with how long is left', () => {
    const { state } = setup([
      registration,
      { id: 'r2', vehicleId: 'v1', kind: 'insurance', dueOn: '2027-04-01', everyMonths: 6 },
      { id: 'r3', vehicleId: 'v1', kind: 'inspection', dueOn: '2026-10-10' },
      { id: 'other-car', vehicleId: 'v2', kind: 'insurance', dueOn: '2026-10-20' },
    ])
    expect(state().rows.map((r) => [r.title, r.state, r.status, r.canRenew])).toEqual([
      ['Safety inspection', 'overdue', 'Was due 8 days ago, on Oct 10', true],
      ['Registration', 'due-soon', 'Expires in 14 days, on Nov 1', true],
      ['Insurance', 'upcoming', 'Renews Apr 1, 2027', false],
    ])
    expect(state().rows[1]).toMatchObject({ repeat: 'Every year', documentKind: 'registration' })
  })

  it('offers the usual ones the car does not have yet', () => {
    const { state } = setup([registration])
    expect(state().suggestions.map((s) => s.kind)).toEqual(['inspection', 'insurance'])
  })

  it('adds one with the usual repeat for its kind', async () => {
    const { state, renewals } = setup()
    state().openNew('insurance')
    expect(state().form?.draft).toMatchObject({ kind: 'insurance', everyMonths: '6' })
    state().setField('dueOn', '2027-02-01')
    state().setField('notes', 'Policy 123')
    await expect(state().save()).resolves.toBe(true)
    expect(await renewals.listForVehicle('v1')).toEqual([
      {
        id: 'new-1',
        vehicleId: 'v1',
        kind: 'insurance',
        dueOn: '2027-02-01',
        everyMonths: 6,
        notes: 'Policy 123',
      },
    ])
    expect(state().form).toBeUndefined()
  })

  it('follows the kind with the repeat until the owner picks one', () => {
    const { state } = setup()
    state().openNew()
    state().setField('kind', 'emissions')
    expect(state().form?.draft.everyMonths).toBe('24')
    state().setField('everyMonths', '12')
    state().setField('kind', 'insurance')
    expect(state().form?.draft.everyMonths).toBe('12')
  })

  it('keeps a name only for one of the owner’s own', async () => {
    const { state, renewals } = setup()
    state().openNew('other')
    state().setField('title', 'Parking permit')
    state().setField('dueOn', '2027-01-01')
    await state().save()
    state().openEdit('new-1')
    state().setField('kind', 'registration')
    await state().save()
    expect((await renewals.listForVehicle('v1'))[0]).not.toHaveProperty('title')
  })

  it('asks for a date in the right form', async () => {
    const { state } = setup()
    state().openNew()
    state().setField('dueOn', '11/01/2026')
    await expect(state().save()).resolves.toBe(false)
    expect(state().form?.fieldErrors.dueOn).toBe('Enter the date as YYYY-MM-DD')
    state().setField('dueOn', '2026-11-01')
    expect(state().form?.fieldErrors.dueOn).toBeUndefined()
  })

  it('moves a repeating one on a period when renewed, and says to when', async () => {
    const { state, renewals } = setup([registration])
    await expect(state().markRenewed('r1')).resolves.toBe(true)
    expect((await renewals.listForVehicle('v1'))[0]?.dueOn).toBe('2027-11-01')
    expect(state().notice).toBe('Registration now expires Nov 1, 2027.')
    expect(state().rows[0]).toMatchObject({ state: 'upcoming', canRenew: false })
  })

  it('asks for the next date of one that does not repeat', async () => {
    const { everyMonths: _, ...once } = registration
    const { state, renewals } = setup([once])
    await expect(state().markRenewed('r1')).resolves.toBe(false)
    expect(state().form).toMatchObject({ id: 'r1', renewing: true, draft: { dueOn: '' } })
    state().setField('dueOn', '2027-05-01')
    await state().save()
    expect(await renewals.listForVehicle('v1')).toEqual([{ ...once, dueOn: '2027-05-01' }])
  })

  it('says when a renewal could not be saved, keeping the old date', async () => {
    const { state, renewals } = setup([registration])
    renewals.failNext('disk full')
    await expect(state().markRenewed('r1')).resolves.toBe(false)
    expect(state().error).toBe('Couldn’t save. Try again.')
    expect((await renewals.listForVehicle('v1'))[0]?.dueOn).toBe('2026-11-01')
  })

  it('deletes only after a second tap', async () => {
    const { state, renewals } = setup([registration])
    state().openEdit('r1')
    await expect(state().remove()).resolves.toBe(false)
    expect(state().form?.confirmingDelete).toBe(true)
    await expect(state().remove()).resolves.toBe(true)
    expect(await renewals.listForVehicle('v1')).toEqual([])
  })

  it('keeps the sheet open with the reason when saving fails', async () => {
    const { state, renewals } = setup()
    state().openNew()
    state().setField('dueOn', '2027-01-01')
    renewals.failNext('disk full')
    await expect(state().save()).resolves.toBe(false)
    expect(state().form).toMatchObject({ saving: false, error: 'disk full' })
  })
})
