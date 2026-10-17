import { describe, expect, it } from 'vitest'
import { memoryPreferences } from '../../testing'
import { createAiSharingModel } from './model'

const setup = (aiSharing = false) => {
  const preferences = memoryPreferences({ aiSharing })
  const model = createAiSharingModel({ preferences })
  model.getState().start()
  return { preferences, model }
}

describe('AI sharing model', () => {
  it('is off until the owner allows it', () => {
    expect(setup().model.getState()).toMatchObject({ status: 'ready', on: false })
  })

  it('shows a choice made before', () => {
    expect(setup(true).model.getState().on).toBe(true)
  })

  it('turns on and off, and saves each choice', async () => {
    const { model, preferences } = setup()
    await expect(model.getState().setOn(true)).resolves.toBe(true)
    expect(model.getState().on).toBe(true)
    await model.getState().setOn(false)
    let stored: boolean | undefined
    preferences.watch((p) => (stored = p.aiSharing))()
    expect(stored).toBe(false)
  })

  it('follows a change made on another screen', async () => {
    const { model, preferences } = setup()
    await preferences.update({ aiSharing: true })
    expect(model.getState().on).toBe(true)
  })

  it('stays as it was and says so when the choice cannot be saved', async () => {
    const { model, preferences } = setup()
    preferences.failNextUpdate()
    await expect(model.getState().setOn(true)).resolves.toBe(false)
    expect(model.getState()).toMatchObject({ status: 'ready', on: false })
    expect(model.getState().error).toBeDefined()
    await model.getState().setOn(true)
    expect(model.getState().error).toBeUndefined()
  })

  it('ignores a second change while the first is saving', async () => {
    const { model } = setup()
    const first = model.getState().setOn(true)
    await expect(model.getState().setOn(false)).resolves.toBe(false)
    await first
    expect(model.getState().on).toBe(true)
  })
})
