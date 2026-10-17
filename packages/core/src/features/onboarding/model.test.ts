import { describe, expect, it } from 'vitest'
import { memoryAuth, memoryPreferences } from '../../testing'
import { createOnboardingModel, ONBOARDING_PAGES } from './model'

const setup = (options: { onboarded?: boolean; signedIn?: boolean } = {}) => {
  const preferences = memoryPreferences({ onboarded: options.onboarded ?? false })
  const auth = memoryAuth(options.signedIn ? { user: { id: 'u1', email: 'a@example.com' } } : {})
  const model = createOnboardingModel({ preferences, auth })
  return { preferences, auth, model }
}

const saved = (preferences: ReturnType<typeof memoryPreferences>) => {
  let onboarded: boolean | undefined
  preferences.watch((p) => (onboarded = p.onboarded))()
  return onboarded
}

describe('onboarding model', () => {
  it('is loading until it is started', () => {
    expect(setup().model.getState().status).toBe('loading')
  })

  it('shows the first page on a phone that has not seen it', () => {
    const { model } = setup()
    model.getState().start()
    expect(model.getState()).toMatchObject({ status: 'showing', page: 0, isLast: false })
  })

  it('stays out of the way once this phone has seen it', () => {
    const { model } = setup({ onboarded: true })
    model.getState().start()
    expect(model.getState().status).toBe('done')
  })

  it('never shows to an owner who is already signed in, and remembers that', () => {
    const { model, preferences } = setup({ signedIn: true })
    model.getState().start()
    expect(model.getState().status).toBe('done')
    expect(saved(preferences)).toBe(true)
  })

  it('pages forward and back without passing either end', () => {
    const { model } = setup()
    model.getState().start()
    model.getState().back()
    expect(model.getState().page).toBe(0)
    model.getState().next()
    model.getState().next()
    expect(model.getState().page).toBe(2)
    model.getState().back()
    expect(model.getState().page).toBe(1)
  })

  it('finishes from the last page and remembers it', () => {
    const { model, preferences } = setup()
    model.getState().start()
    for (let i = 1; i < ONBOARDING_PAGES.length; i++) model.getState().next()
    expect(model.getState().isLast).toBe(true)
    model.getState().next()
    expect(model.getState().status).toBe('done')
    expect(saved(preferences)).toBe(true)
  })

  it('can be skipped from any page', () => {
    const { model, preferences } = setup()
    model.getState().start()
    model.getState().next()
    model.getState().skip()
    expect(model.getState().status).toBe('done')
    expect(saved(preferences)).toBe(true)
  })

  it('still lets the owner through when the choice cannot be saved', async () => {
    const { model, preferences } = setup()
    model.getState().start()
    preferences.failNextUpdate()
    model.getState().skip()
    await Promise.resolve()
    expect(model.getState().status).toBe('done')
  })

  it('does not come back after signing out', async () => {
    const { model, auth } = setup()
    model.getState().start()
    model.getState().skip()
    await auth.sendCode('a@example.com')
    await auth.verifyCode('a@example.com', '123456')
    await auth.signOut()
    expect(model.getState().status).toBe('done')
  })
})
