import { describe, expect, it } from 'vitest'
import { AssistantError } from '../../domain/types'
import { memoryAuth, memoryPreferences } from '../../testing'
import { createAiSharingModel, guardAiSharing } from './model'

const owner = { id: 'u1', email: 'a@example.com' }

const setup = (aiSharingOwner: string | null = null) => {
  const preferences = memoryPreferences({ aiSharingOwner })
  const auth = memoryAuth({ user: owner, userIdFor: (email) => `user-${email}` })
  const model = createAiSharingModel({ preferences, auth })
  model.getState().start()
  return { preferences, auth, model }
}

const storedOwner = (preferences: ReturnType<typeof memoryPreferences>) => {
  let stored: string | null | undefined
  preferences.watch((p) => (stored = p.aiSharingOwner))()
  return stored
}

describe('AI sharing model', () => {
  it('is off until the owner allows it', () => {
    expect(setup().model.getState()).toMatchObject({ status: 'ready', on: false })
  })

  it('shows a choice the owner made before', () => {
    expect(setup('u1').model.getState().on).toBe(true)
  })

  it('turns on and off, and saves each choice for this owner', async () => {
    const { model, preferences } = setup()
    await expect(model.getState().setOn(true)).resolves.toBe(true)
    expect(model.getState().on).toBe(true)
    expect(storedOwner(preferences)).toBe('u1')
    await model.getState().setOn(false)
    expect(storedOwner(preferences)).toBeNull()
  })

  it('asks again when someone else signs in on this phone', async () => {
    const { model, auth } = setup('u1')
    await auth.signOut()
    await auth.sendCode('b@example.com')
    await auth.verifyCode('b@example.com', '123456')
    expect(model.getState().on).toBe(false)
  })

  it('cannot be turned on with nobody signed in', async () => {
    const { model, auth } = setup()
    await auth.signOut()
    await expect(model.getState().setOn(true)).resolves.toBe(false)
  })

  it('follows a change made on another screen', async () => {
    const { model, preferences } = setup()
    await preferences.update({ aiSharingOwner: 'u1' })
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

describe('guardAiSharing', () => {
  const photo = { mediaType: 'image/jpeg' as const, base64: '' }
  const services = () => {
    const sent: string[] = []
    return {
      sent,
      assistant: {
        ask: async (request: { question: string }) => void sent.push(request.question),
      },
      quoteReader: { read: async () => (sent.push('photo'), []) },
      odometerReader: { read: async () => (sent.push('odometer'), undefined) },
    }
  }

  it('sends nothing to Anthropic until the signed-in owner allows it', async () => {
    const { preferences, auth } = setup()
    const s = services()
    const guarded = guardAiSharing({ preferences, auth }, s)
    const ask = guarded.assistant.ask({ vehicleId: 'v1', question: 'Due?' }, () => {})
    await expect(ask).rejects.toEqual(new AssistantError('not-allowed'))
    await expect(guarded.quoteReader.read(photo)).rejects.toBeInstanceOf(AssistantError)
    await expect(guarded.odometerReader.read(photo)).rejects.toBeInstanceOf(AssistantError)
    expect(s.sent).toEqual([])
  })

  it('passes requests through once allowed, and stops when turned off', async () => {
    const { preferences, auth } = setup('u1')
    const s = services()
    const guarded = guardAiSharing({ preferences, auth }, s)
    await guarded.assistant.ask({ vehicleId: 'v1', question: 'Due?' }, () => {})
    await guarded.quoteReader.read(photo)
    await guarded.odometerReader.read(photo)
    await preferences.update({ aiSharingOwner: null })
    await expect(guarded.quoteReader.read(photo)).rejects.toBeInstanceOf(AssistantError)
    await expect(guarded.odometerReader.read(photo)).rejects.toBeInstanceOf(AssistantError)
    expect(s.sent).toEqual(['Due?', 'photo', 'odometer'])
  })

  it('says whether sharing is allowed right now', async () => {
    const { preferences, auth } = setup()
    const guarded = guardAiSharing({ preferences, auth }, services())
    expect(guarded.aiSharingAllowed()).toBe(false)
    await preferences.update({ aiSharingOwner: 'u1' })
    expect(guarded.aiSharingAllowed()).toBe(true)
  })
})
