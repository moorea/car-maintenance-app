import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../../domain/types'
import { fixedClock, memoryOdometer, memorySafety } from '../../testing'
import { createTroubleCodesModel } from './model'

const vehicle: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}

const setup = (v: Vehicle = vehicle, miles = 36_000) => {
  const safety = memorySafety({
    c1: {
      recalls: [],
      complaints: [
        {
          id: 'c-engine',
          configId: 'c1',
          component: 'ENGINE',
          complaints: 14,
          crashes: 0,
          fires: 0,
          injuries: 0,
          deaths: 0,
          recent: [],
        },
      ],
    },
  })
  const model = createTroubleCodesModel({
    vehicle: v,
    safety,
    odometer: memoryOdometer([{ vehicleId: 'v1', date: '2026-10-10', miles }]),
    clock: fixedClock('2026-10-17'),
  })
  model.getState().start()
  return { model, state: () => model.getState() }
}

describe('trouble codes model', () => {
  it('starts empty, with nothing to look up', () => {
    const { state } = setup()
    expect(state()).toMatchObject({
      status: 'editing',
      carTitle: '2021 Toyota RAV4',
      draft: '',
      flashing: false,
      canCheck: false,
    })
  })

  it('can look up once a code is typed', () => {
    const { state } = setup()
    state().setDraft('p0420')
    expect(state().canCheck).toBe(true)
    state().setDraft('hello')
    expect(state().canCheck).toBe(false)
  })

  it('explains each code and leads with the most urgent', () => {
    const { state } = setup()
    state().setDraft('P0455 P0301')
    state().check()
    const result = state().result
    expect(state().status).toBe('checked')
    expect(result?.urgency).toBe('soon')
    expect(result?.headline).toBe('Get it checked this week')
    expect(result?.codes.map((c) => c.code)).toEqual(['P0455', 'P0301'])
  })

  it('says it is safe to drive when every code can wait', () => {
    const { state } = setup()
    state().setDraft('P0442')
    state().check()
    expect(state().result).toMatchObject({ urgency: 'later', headline: 'Safe to drive for now' })
  })

  it('says to stop driving when the light is flashing, whatever the codes', () => {
    const { state } = setup()
    state().setDraft('P0442')
    state().setFlashing(true)
    state().check()
    expect(state().result).toMatchObject({ urgency: 'stop', flashing: true })
    expect(state().result?.advice).toMatch(/misfiring/)
  })

  it('shows complaints other owners filed about the same part', () => {
    const { state } = setup()
    state().setDraft('P0300')
    state().check()
    expect(state().result?.codes[0]?.complaints.map((c) => c.complaints)).toEqual([14])
  })

  it('uses the latest odometer reading for the emissions warranty', () => {
    const covered = setup(vehicle, 36_000)
    covered.state().setDraft('P0420')
    covered.state().check()
    expect(covered.state().result?.codes[0]?.warranty).toBeDefined()

    const over = setup(vehicle, 90_000)
    over.state().setDraft('P0420')
    over.state().check()
    expect(over.state().result?.codes[0]?.warranty).toBeUndefined()
  })

  it('looks codes up before the car has synced its configuration', () => {
    const { configId: _, ...unsynced } = vehicle
    const { state } = setup(unsynced)
    state().setDraft('P0300')
    state().check()
    expect(state().result?.codes[0]).toMatchObject({ title: 'Random or multiple cylinder misfire' })
    expect(state().result?.codes[0]?.complaints).toEqual([])
  })

  it('points out a mistyped code instead of looking up the rest', () => {
    const { state } = setup()
    state().setDraft('P0420 P042')
    state().check()
    expect(state().status).toBe('editing')
    expect(state().error).toBe(
      '“P042” isn’t a trouble code. Codes are a letter and four characters, like P0420.',
    )
    state().setDraft('P0420')
    expect(state().error).toBeUndefined()
  })

  it('limits how many codes are looked up at once', () => {
    const { state } = setup()
    state().setDraft('P0301 P0302 P0303 P0304 P0305 P0306 P0307 P0308 P0309')
    state().check()
    expect(state().error).toBe('Look up at most 8 codes at a time.')
  })

  it('goes back to the codes to change them, or clears them to start over', () => {
    const { state } = setup()
    state().setDraft('P0420')
    state().setFlashing(true)
    state().check()
    state().edit()
    expect(state()).toMatchObject({ status: 'editing', draft: 'P0420', result: undefined })
    state().check()
    state().startOver()
    expect(state()).toMatchObject({
      status: 'editing',
      draft: '',
      flashing: false,
      canCheck: false,
    })
  })

  it('does not change the codes while the result shows', () => {
    const { state } = setup()
    state().setDraft('P0420')
    state().check()
    state().setDraft('P0171')
    expect(state().draft).toBe('P0420')
  })

  it('asks the assistant about one code with what it means', () => {
    const { state } = setup()
    state().setDraft('P0420 P1456')
    state().check()
    expect(state().questionFor('P0420')).toBe(
      'My check-engine light is on with code P0420, “Catalytic converter below efficiency (bank 1)”. What usually causes it on my car, and is it safe to drive?',
    )
    expect(state().questionFor('P1456')).toBe(
      'My check-engine light is on with code P1456. What usually causes it on my car, and is it safe to drive?',
    )
    expect(state().questionFor('P0171')).toBeUndefined()
  })

  it('stops watching the car when disposed', () => {
    const { state } = setup()
    state().dispose()
    state().dispose()
    state().start()
    state().setDraft('P0300')
    state().check()
    expect(state().result?.codes[0]?.complaints).toHaveLength(1)
  })
})
