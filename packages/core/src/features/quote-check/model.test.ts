import { describe, expect, it } from 'vitest'
import { AssistantError, type ServiceRecord, type Vehicle } from '../../domain/types'
import {
  controlledPriceEstimator,
  controlledQuoteReader,
  fixedClock,
  memoryOdometer,
  memoryPhotoPicker,
  memoryPreferences,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
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

const setup = (
  v: Vehicle = vehicle,
  repairs: ServiceRecord[] = [],
  preferences = memoryPreferences(),
) => {
  const reader = controlledQuoteReader()
  const estimator = controlledPriceEstimator()
  const vehicles = memoryVehicles([v])
  const photos = memoryPhotoPicker()
  const schedule = memorySchedule([
    { id: 'oil', configId: 'c1', kind: 'engine-oil', task: 'Oil change', intervalMiles: 5_000 },
  ])
  const model = createQuoteCheckModel({
    vehicle: v,
    vehicles,
    schedule,
    records: memoryServiceRecords([
      {
        id: 'r1',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
      ...repairs,
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
    estimator,
    preferences,
  })
  model.getState().start()
  const call = (n: number) => {
    const c = reader.calls[n]
    if (!c) throw new Error(`No call ${n}`)
    return c
  }
  const estimateCall = (n: number) => {
    const c = estimator.calls[n]
    if (!c) throw new Error(`No estimate ${n}`)
    return c
  }
  return {
    model,
    reader,
    estimator,
    preferences,
    photos,
    schedule,
    vehicles,
    call,
    estimateCall,
    state: () => model.getState(),
  }
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
    schedule.itemsForVehicle = () => Promise.reject(new Error('Database closed'))
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

  describe('repair or replace', () => {
    const BIG = 'Transmission rebuild $3,200'

    it('weighs a big quote and asks what the car is worth when it is not known', async () => {
      const { state } = setup()
      state().setDraft(BIG)
      await state().check()
      expect(state().weighing).toMatchObject({
        quoteCents: 320_000,
        share: undefined,
        headline: 'Is a $3,200.00 repair worth it?',
      })
      expect(state().valueDraft).toBe('')
    })

    it('leaves a small quote alone', async () => {
      const { state } = setup()
      state().setDraft('Oil change $89.95')
      await state().check()
      expect(state().weighing).toBeUndefined()
    })

    it('saves the value the owner types and weighs the quote against it', async () => {
      const { state, vehicles } = setup()
      state().setDraft(BIG)
      await state().check()
      state().setValueDraft('$8,000')
      await state().saveValue()

      expect(await vehicles.get('v1')).toMatchObject({
        valueCents: 800_000,
        valuedOn: '2026-10-17',
      })
      expect(state().valueDraft).toBe('8,000')
      expect(state().weighing).toMatchObject({
        share: 'large',
        headline: 'This quote is 40% of the $8,000.00 you think the car is worth',
      })
    })

    it('weighs a smaller quote that is a large share of a cheap car', async () => {
      const { state } = setup({ ...vehicle, valueCents: 200_000, valuedOn: '2026-09-01' })
      expect(state().valueDraft).toBe('2,000')
      state().setDraft('Brake pads and rotors $640')
      await state().check()
      expect(state().weighing).toMatchObject({ quoteCents: 64_000, share: 'large' })
    })

    it('counts the last year of repairs alongside the quote', async () => {
      const { state } = setup({ ...vehicle, valueCents: 1_000_000, valuedOn: '2026-09-01' }, [
        { id: 'a', vehicleId: 'v1', performedOn: '2026-03-02', costCents: 90_000 },
        { id: 'b', vehicleId: 'v1', performedOn: '2025-01-10', costCents: 50_000 },
      ])
      state().setDraft(BIG)
      await state().check()
      expect(state().weighing?.points).toContain(
        'You’ve logged $900.00 of repairs in the last 12 months. With this quote, that’s $4,100.00 in a year, 41% of its value.',
      )
    })

    it('forgets the value when the field is cleared', async () => {
      const { state, vehicles } = setup({ ...vehicle, valueCents: 800_000, valuedOn: '2026-09-01' })
      state().setDraft(BIG)
      await state().check()
      state().setValueDraft('')
      await state().saveValue()
      const saved = await vehicles.get('v1')
      expect(saved?.valueCents).toBeUndefined()
      expect(saved?.valuedOn).toBeUndefined()
      expect(state().weighing?.share).toBeUndefined()
    })

    it('explains a value it cannot read without saving it', async () => {
      const { state, vehicles } = setup()
      state().setDraft(BIG)
      await state().check()
      state().setValueDraft('about 8k')
      await state().saveValue()
      expect(state().valueError).toBe('Enter the value in dollars, like 9,500')
      expect((await vehicles.get('v1'))?.valueCents).toBeUndefined()
    })

    it('says when saving the value fails, keeping what was typed', async () => {
      const { state, vehicles } = setup()
      state().setDraft(BIG)
      await state().check()
      vehicles.failNextAdd('Disk full')
      state().setValueDraft('8000')
      await state().saveValue()
      expect(state()).toMatchObject({ valueError: 'Disk full', valueDraft: '8000' })
      expect(state().weighing?.share).toBeUndefined()
    })

    it('keeps weighing a quote after a new value makes it small, until the lines change', async () => {
      const { state } = setup({ ...vehicle, valueCents: 300_000, valuedOn: '2026-09-01' })
      state().setDraft('Brake pads and rotors $900')
      await state().check()
      state().setValueDraft('5,000')
      await state().saveValue()
      expect(state().weighing).toMatchObject({ share: 'small' })
    })

    it('stops weighing when the owner goes back to edit the lines', async () => {
      const { state } = setup()
      state().setDraft(BIG)
      await state().check()
      state().edit()
      expect(state().weighing).toBeUndefined()
    })
  })

  describe('fair prices', () => {
    const estimate = {
      laborRateCents: { low: 12_000, high: 18_000 },
      lines: [
        { index: 0, laborHours: { low: 0.4, high: 0.4 }, partsCents: { low: 3_500, high: 6_000 } },
      ],
    }

    const checked = async (preferences = memoryPreferences()) => {
      const s = setup(vehicle, [], preferences)
      s.state().setDraft('Oil change $89.95\nEngine flush $129')
      await s.state().check()
      return s
    }

    it('asks for the car, ZIP and lines, without the shop’s prices, and compares them', async () => {
      const { state, estimateCall, preferences } = await checked()
      expect(state().canEstimate).toBe(false)
      state().setZip('94110')
      expect(state().canEstimate).toBe(true)
      void state().estimatePrices()
      expect(state()).toMatchObject({ prices: { status: 'estimating' }, canEstimate: false })
      expect(estimateCall(0).request).toEqual({
        car: { year: 2021, make: 'Toyota', model: 'RAV4' },
        zip: '94110',
        lines: [
          { index: 0, text: 'Oil change' },
          { index: 1, text: 'Engine flush' },
        ],
      })
      estimateCall(0).resolve(estimate)
      await settle()
      const prices = state().prices
      expect(prices?.status === 'ready' && prices.fair.lines).toEqual([
        expect.objectContaining({ index: 0, range: 'Usually $80–$135', fit: 'within' }),
      ])
      expect(watchZip(preferences)).toBe('94110')
    })

    it('offers the ZIP saved last time', async () => {
      const { state } = await checked(memoryPreferences({ zip: '10001' }))
      expect(state()).toMatchObject({ zipDraft: '10001', canEstimate: true })
    })

    it('keeps only five digits of what is typed and needs all five', async () => {
      const { state } = await checked()
      state().setZip('9 4-1')
      expect(state()).toMatchObject({ zipDraft: '941', canEstimate: false })
      state().setZip('941101234')
      expect(state().zipDraft).toBe('94110')
    })

    it('explains a failed estimate in words and lets the owner try again', async () => {
      const { state, estimateCall } = await checked()
      state().setZip('94110')
      void state().estimatePrices()
      estimateCall(0).reject(new AssistantError('rate-limited'))
      await settle()
      expect(state().prices).toEqual({
        status: 'failed',
        error: "You've used the assistant a lot today. Try again tomorrow.",
      })
      expect(state().canEstimate).toBe(true)
    })

    it('drops the estimate when the quote is edited or the ZIP changes, ignoring a late answer', async () => {
      const { state, estimateCall } = await checked()
      state().setZip('94110')
      void state().estimatePrices()
      state().setZip('10001')
      expect(estimateCall(0).signal?.aborted).toBe(true)
      estimateCall(0).resolve(estimate)
      await settle()
      expect(state().prices).toBeUndefined()

      void state().estimatePrices()
      estimateCall(1).resolve(estimate)
      await settle()
      expect(state().prices?.status).toBe('ready')
      state().edit()
      expect(state()).toMatchObject({ prices: undefined, canEstimate: false })
    })

    it('stops estimating when the screen goes away', async () => {
      const { state, estimateCall, model } = await checked()
      state().setZip('94110')
      void state().estimatePrices()
      model.getState().dispose()
      expect(estimateCall(0).signal?.aborted).toBe(true)
    })
  })
})

const watchZip = (preferences: ReturnType<typeof memoryPreferences>) => {
  let zip: string | null = null
  preferences.watch((p) => (zip = p.zip))()
  return zip
}
