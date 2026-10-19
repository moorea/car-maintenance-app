import { describe, expect, it } from 'vitest'
import type { PhoneFor3d } from '../../domain/appearance'
import { memoryPhoneDisplay, memoryPreferences } from '../../testing'
import { createCar3dModel } from './model'

const setup = (car3d: boolean | null = null, phone = {}) => {
  const preferences = memoryPreferences({ car3d })
  const display = memoryPhoneDisplay(phone)
  const model = createCar3dModel({ preferences, phone: display })
  model.getState().start()
  return { model, preferences, display }
}

describe('car 3D setting', () => {
  it('is on by default on a capable phone', () => {
    expect(setup().model.getState()).toMatchObject({ status: 'ready', on: true })
  })

  it('turns off by itself under Reduce Motion, says why, and back on when it is turned off', () => {
    const { model, display } = setup()
    display.set({ reduceMotion: true })
    expect(model.getState()).toMatchObject({ on: false, offBecause: 'reduce-motion' })
    display.set({ reduceMotion: false })
    expect(model.getState()).toMatchObject({ on: true, offBecause: undefined })
  })

  it('stays loading until the phone has said how it is set', () => {
    let tell: ((phone: PhoneFor3d) => void) | undefined
    const model = createCar3dModel({
      preferences: memoryPreferences({ car3d: null }),
      phone: {
        watch: (onChange) => {
          tell = onChange
          return () => {}
        },
      },
    })
    model.getState().start()
    expect(model.getState().status).toBe('loading')
    tell?.({ capable: true, reduceMotion: false, lowPower: false })
    expect(model.getState()).toMatchObject({ status: 'ready', on: true })
  })

  it('names the slow phone first, then Reduce Motion, when several keep it off', () => {
    const all = { capable: false, reduceMotion: true, lowPower: true }
    expect(setup(null, all).model.getState().offBecause).toBe('slow-phone')
    const both = { reduceMotion: true, lowPower: true }
    expect(setup(null, both).model.getState().offBecause).toBe('reduce-motion')
  })

  it('says when low power or a slow phone is why it is off', () => {
    expect(setup(null, { lowPower: true }).model.getState().offBecause).toBe('low-power')
    expect(setup(null, { capable: false }).model.getState().offBecause).toBe('slow-phone')
  })

  it("keeps the owner's choice, whatever the phone says", async () => {
    const { model, display } = setup()
    await model.getState().setOn(false)
    expect(model.getState()).toMatchObject({ on: false, offBecause: undefined })
    await model.getState().setOn(true)
    display.set({ reduceMotion: true, lowPower: true })
    expect(model.getState().on).toBe(true)
  })

  it('says so when the choice cannot be saved, and keeps what was showing', async () => {
    const { model, preferences } = setup()
    preferences.failNextUpdate()
    await model.getState().setOn(false)
    expect(model.getState()).toMatchObject({ on: true, error: "Couldn't save that. Try again." })
  })

  it('stops following changes once disposed', () => {
    const { model, display } = setup()
    model.getState().dispose()
    display.set({ reduceMotion: true })
    expect(model.getState().on).toBe(true)
  })
})
