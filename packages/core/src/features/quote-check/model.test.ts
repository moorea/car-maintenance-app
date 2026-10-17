import { describe, expect, it } from 'vitest'
import { AssistantError, type Vehicle } from '../../domain/types'
import {
  controlledQuoteReader,
  fixedClock,
  memoryOdometer,
  memoryPhotoPicker,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  SAMPLE_PHOTO,
} from '../../testing'
import { MAX_QUOTE_PHOTO_BASE64 } from '../../schemas/quote'
import { createQuoteCheckModel } from './model'

const vehicle: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}

const setup = (v: Vehicle = vehicle) => {
  const reader = controlledQuoteReader()
  const photos = memoryPhotoPicker()
  const schedule = memorySchedule([
    { id: 'oil', configId: 'c1', kind: 'engine-oil', task: 'Oil change', intervalMiles: 5_000 },
  ])
  const model = createQuoteCheckModel({
    vehicle: v,
    schedule,
    records: memoryServiceRecords([
      {
        id: 'r1',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
    ]),
    odometer: memoryOdometer([{ vehicleId: 'v1', date: '2026-10-10', miles: 36_000 }]),
    safety: memorySafety({
      c1: {
        recalls: [
          {
            id: 'rc',
            configId: 'c1',
            campaign: '24V123000',
            summary: 'A harness may short.',
            parkIt: false,
            parkOutside: false,
            overTheAir: false,
          },
        ],
        complaints: [],
      },
    }),
    clock: fixedClock('2026-10-17'),
    photos,
    reader,
  })
  model.getState().start()
  const call = (n: number) => {
    const c = reader.calls[n]
    if (!c) throw new Error(`No call ${n}`)
    return c
  }
  return { model, reader, photos, schedule, call, state: () => model.getState() }
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('quote check model', () => {
  it('starts with an empty quote that cannot be checked yet', () => {
    const { state } = setup()
    expect(state()).toMatchObject({
      status: 'editing',
      carTitle: '2021 Toyota RAV4',
      unmatched: false,
      draft: '',
      canCheck: false,
    })
  })

  it('checks typed lines against the car’s schedule, log and recalls', async () => {
    const { state } = setup()
    state().setDraft('Oil change $89.95\nEngine flush $129')
    expect(state().canCheck).toBe(true)
    await state().check()

    expect(state().status).toBe('checked')
    expect(state().result?.lines.map((l) => [l.text, l.verdict])).toEqual([
      ['Oil change', 'due'],
      ['Engine flush', 'not-scheduled'],
    ])
    expect(state().result?.recalls).toEqual([
      { campaign: '24V123000', title: 'A harness may short.' },
    ])
  })

  it('reads a photo from the camera, shows its lines for correcting and checks them', async () => {
    const { state, call, photos } = setup()
    const done = state().takePhoto()
    await settle()
    expect(photos.picks).toEqual(['camera'])
    expect(state()).toMatchObject({ status: 'reading', canCheck: false })
    expect(call(0).photo).toEqual(SAMPLE_PHOTO)

    call(0).resolve([{ text: 'Oil change', priceCents: 8_995 }, { text: 'Engine flush' }])
    await done
    expect(state().draft).toBe('Oil change  $89.95\nEngine flush')
    expect(state().status).toBe('checked')
    expect(state().result?.lines).toHaveLength(2)
  })

  it('picks a photo from the library too', async () => {
    const { state, photos, reader } = setup()
    void state().choosePhoto()
    await settle()
    expect(photos.picks).toEqual(['library'])
    expect(reader.calls).toHaveLength(1)
  })

  it('does nothing when the owner cancels the camera', async () => {
    const { state, photos, reader } = setup()
    photos.next(undefined)
    await state().takePhoto()
    expect(state().status).toBe('editing')
    expect(reader.calls).toHaveLength(0)
  })

  it('says when a photo shows no work, keeping the draft to type into', async () => {
    const { state, call } = setup()
    state().setDraft('Oil')
    const done = state().takePhoto()
    await settle()
    call(0).resolve([])
    await done
    expect(state()).toMatchObject({ status: 'editing', draft: 'Oil', canCheck: true })
    expect(state().error).toContain("Couldn't find any work")
  })

  it('explains a failed read in words and offers typing instead', async () => {
    const { state, call } = setup()
    const done = state().takePhoto()
    await settle()
    call(0).reject(new AssistantError('offline'))
    await done
    expect(state().status).toBe('editing')
    expect(state().error).toBe(
      "You're offline. Reading a photo needs a connection, but you can type the lines.",
    )
  })

  it('stops reading when cancelled and ignores the late result', async () => {
    const { state, call } = setup()
    const done = state().takePhoto()
    await settle()
    state().cancelReading()
    expect(call(0).signal?.aborted).toBe(true)
    expect(state().status).toBe('editing')
    call(0).resolve([{ text: 'Oil change' }])
    await done
    expect(state()).toMatchObject({ status: 'editing', draft: '' })
  })

  it('goes back to the lines to correct them, then starts over empty', async () => {
    const { state } = setup()
    state().setDraft('Oil change')
    await state().check()
    state().edit()
    expect(state()).toMatchObject({ status: 'editing', draft: 'Oil change', canCheck: true })
    expect(state().result).toBeUndefined()
    state().startOver()
    expect(state()).toMatchObject({ draft: '', canCheck: false })
  })

  it('writes a question for Ask about a checked line', async () => {
    const { state } = setup()
    state().setDraft('Engine flush $129')
    await state().check()
    expect(state().questionFor(0)).toBe(
      'A shop recommended "Engine flush" for $129.00. Does my car need it now?',
    )
    expect(state().questionFor(5)).toBeUndefined()
  })

  it('cannot check a car that has not synced its schedule yet', async () => {
    const { configId: _, ...unsynced } = vehicle
    const { state, reader } = setup(unsynced)
    state().setDraft('Oil change')
    expect(state()).toMatchObject({ unmatched: true, canCheck: false })
    await state().check()
    await state().takePhoto()
    expect(state().status).toBe('editing')
    expect(reader.calls).toHaveLength(0)
  })

  it('says when the camera cannot be opened', async () => {
    const { state, photos, reader } = setup()
    photos.take = () => Promise.reject(new Error('denied'))
    await state().takePhoto()
    expect(state().status).toBe('editing')
    expect(state().error).toContain("Couldn't open the photo")
    expect(reader.calls).toHaveLength(0)
  })

  it('keeps the lines to try again when checking fails', async () => {
    const { state, schedule } = setup()
    schedule.itemsForConfig = () => Promise.reject(new Error('Database closed'))
    state().setDraft('Oil change')
    await state().check()
    expect(state()).toMatchObject({
      status: 'editing',
      draft: 'Oil change',
      error: 'Database closed',
      canCheck: true,
    })
  })

  it('stops reading when the screen goes away', async () => {
    const { state, call, model } = setup()
    void state().takePhoto()
    await settle()
    model.getState().dispose()
    expect(call(0).signal?.aborted).toBe(true)
  })

  it('opens one picker and reads one photo when the button is tapped twice', async () => {
    const { state, photos, reader } = setup()
    void state().takePhoto()
    void state().takePhoto()
    await settle()
    expect(photos.picks).toEqual(['camera'])
    expect(reader.calls).toHaveLength(1)
  })

  it('says a photo is too large to read rather than sending it', async () => {
    const { state, photos, reader } = setup()
    photos.next({ mediaType: 'image/jpeg', base64: 'A'.repeat(MAX_QUOTE_PHOTO_BASE64 + 4) })
    await state().choosePhoto()
    expect(state().error).toContain('too large')
    expect(reader.calls).toHaveLength(0)
  })
})
