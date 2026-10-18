import { describe, expect, it } from 'vitest'
import type { NotificationPermission } from '../../ports'
import { memoryNotifier, memoryPreferences, memoryReminderSettings } from '../../testing'
import { createReminderOfferModel } from './model'

const setup = (
  options: {
    enabled?: boolean
    offered?: boolean
    permission?: NotificationPermission
    answer?: 'granted' | 'denied'
  } = {},
) => {
  const notifier = memoryNotifier({
    permission: options.permission ?? 'undetermined',
    answer: options.answer ?? 'granted',
  })
  const settings = memoryReminderSettings({ enabled: options.enabled ?? false })
  const preferences = memoryPreferences({ remindersOffered: options.offered ?? false })
  let done = 0
  const model = createReminderOfferModel({
    notifier,
    settings,
    preferences,
    onDone: () => done++,
  })
  return { notifier, settings, preferences, model, done: () => done }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const current = <T>(repo: { watch: (f: (v: T) => void) => () => void }) => {
  let value: T | undefined
  repo.watch((v) => (value = v))()
  return value as T
}

describe('reminder offer model', () => {
  it('offers reminders to an owner who has not been asked on this phone', async () => {
    const { model, done } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().status).toBe('showing')
    expect(done()).toBe(0)
  })

  it('turns reminders on once the phone allows them, and does not offer again', async () => {
    const { model, notifier, settings, preferences, done } = setup()
    model.getState().start()
    await settle()
    await model.getState().accept()
    expect(notifier.prompts).toBe(1)
    expect(current(settings)).toEqual({ enabled: true })
    expect(current(preferences).remindersOffered).toBe(true)
    expect(model.getState().status).toBe('done')
    expect(done()).toBe(1)
  })

  it('leaves reminders off when the owner refuses the permission, and moves on', async () => {
    const { model, settings, preferences, done } = setup({ answer: 'denied' })
    model.getState().start()
    await settle()
    await model.getState().accept()
    expect(current(settings)).toEqual({ enabled: false })
    expect(current(preferences).remindersOffered).toBe(true)
    expect(done()).toBe(1)
  })

  it('leaves reminders off on "not now" without asking the phone', async () => {
    const { model, notifier, settings, preferences, done } = setup()
    model.getState().start()
    await settle()
    model.getState().decline()
    await settle()
    expect(notifier.prompts).toBe(0)
    expect(current(settings)).toEqual({ enabled: false })
    expect(current(preferences).remindersOffered).toBe(true)
    expect(done()).toBe(1)
  })

  it('skips the offer once this phone has answered it', async () => {
    const { model, done } = setup({ offered: true })
    model.getState().start()
    await settle()
    expect(model.getState().status).toBe('done')
    expect(done()).toBe(1)
  })

  it('skips the offer when reminders are already on', async () => {
    const { model, done } = setup({ enabled: true, permission: 'granted' })
    model.getState().start()
    await settle()
    expect(done()).toBe(1)
  })

  it('skips the offer when the phone blocks notifications, since only Settings can change that', async () => {
    const { model, done } = setup({ permission: 'denied' })
    model.getState().start()
    await settle()
    expect(done()).toBe(1)
  })

  it('offers again when reminders were on but the phone no longer allows them', async () => {
    const { model } = setup({ enabled: true, permission: 'undetermined' })
    model.getState().start()
    await settle()
    expect(model.getState().status).toBe('showing')
  })

  it('moves on even if remembering the answer fails', async () => {
    const { model, preferences, done } = setup()
    model.getState().start()
    await settle()
    preferences.failNextUpdate()
    model.getState().decline()
    await settle()
    expect(done()).toBe(1)
  })

  it('answers once, however many times it is tapped', async () => {
    const { model, notifier, done } = setup()
    model.getState().start()
    await settle()
    await Promise.all([model.getState().accept(), model.getState().accept()])
    model.getState().decline()
    expect(notifier.prompts).toBe(1)
    expect(done()).toBe(1)
  })
})
