import { describe, expect, it } from 'vitest'
import type { LocalNotification, NotificationPermission } from '../../ports'
import { fixedClock, memoryNotifier, memoryReminderSettings } from '../../testing'
import { createRemindersModel } from './model'

const reminder = (date: string, n = 1): LocalNotification => ({
  id: `r${n}`,
  date,
  hour: 9,
  title: 'RAV4: service coming up',
  body: 'Oil and filter is due in about two weeks.',
  vehicleId: 'v1',
})

/** Stands in for the scheduler: `publish` is what it would report after planning. */
const fakeScheduler = () => {
  const watchers = new Set<(s: LocalNotification[]) => void>()
  let current: LocalNotification[] = []
  return {
    watchScheduled: (onChange: (s: LocalNotification[]) => void) => {
      watchers.add(onChange)
      onChange(current)
      return () => watchers.delete(onChange)
    },
    publish: (next: LocalNotification[]) => {
      current = next
      for (const w of watchers) w(current)
    },
  }
}

const setup = (
  options: {
    enabled?: boolean
    permission?: NotificationPermission
    answer?: 'granted' | 'denied'
  } = {},
) => {
  const notifier = memoryNotifier({
    permission: options.permission ?? 'undetermined',
    answer: options.answer ?? 'granted',
  })
  const settings = memoryReminderSettings({ enabled: options.enabled ?? false })
  const scheduler = fakeScheduler()
  const model = createRemindersModel({
    notifier,
    settings,
    scheduler,
    clock: fixedClock('2026-10-01'),
  })
  return { notifier, settings, scheduler, model }
}

/** Lets the model's permission check finish. */
const settled = () => Promise.resolve()

const started = async (options?: Parameters<typeof setup>[0]) => {
  const s = setup(options)
  s.model.getState().start()
  await settled()
  return s
}

describe('reminders screen model', () => {
  it('stays loading until it knows the setting and the permission', () => {
    expect(setup().model.getState().status).toBe('loading')
  })

  it('starts off on a new phone', async () => {
    const { model } = await started()
    expect(model.getState()).toMatchObject({ status: 'ready', on: false, blocked: false })
  })

  it('asks for permission when turned on, then turns on', async () => {
    const { model, notifier } = await started()
    await model.getState().setOn(true)
    expect(notifier.prompts).toBe(1)
    expect(model.getState()).toMatchObject({ status: 'ready', on: true, blocked: false })
  })

  it('stays off and points to Settings when permission is refused', async () => {
    const { model } = await started({ answer: 'denied' })
    await model.getState().setOn(true)
    expect(model.getState()).toMatchObject({ on: false, blocked: true })
  })

  it('shows reminders as off when the phone no longer allows them', async () => {
    const { model, notifier, scheduler } = await started({ enabled: true, permission: 'granted' })
    expect(model.getState().on).toBe(true)

    // Turned off in the Settings app; the next re-plan notices.
    notifier.setPermission('denied')
    scheduler.publish([])
    await settled()
    expect(model.getState()).toMatchObject({ on: false, blocked: true })
  })

  it('turns off without asking anything', async () => {
    const { model, notifier, settings } = await started({ enabled: true, permission: 'granted' })
    await model.getState().setOn(false)
    expect(model.getState().on).toBe(false)
    expect(notifier.prompts).toBe(0)
    const seen: boolean[] = []
    settings.watch((s) => seen.push(s.enabled))
    expect(seen).toEqual([false])
  })

  it('lists the next few reminders with short dates', async () => {
    const { model, scheduler } = await started({ enabled: true, permission: 'granted' })
    scheduler.publish([
      reminder('2026-11-14', 1),
      reminder('2027-02-28', 2),
      ...[3, 4, 5, 6].map((n) => reminder('2027-03-01', n)),
    ])
    const { upcoming } = model.getState()
    expect(upcoming).toHaveLength(5)
    expect(upcoming.slice(0, 2).map((u) => u.when)).toEqual(['Nov 14', 'Feb 28, 2027'])
    expect(upcoming[0]).toMatchObject({
      title: 'RAV4: service coming up',
      body: 'Oil and filter is due in about two weeks.',
    })
  })

  it('still loads when the permission cannot be read', async () => {
    const s = setup()
    s.notifier.permission = async () => {
      throw new Error('not available')
    }
    s.model.getState().start()
    await settled()
    expect(s.model.getState()).toMatchObject({ status: 'ready', on: false, blocked: false })
  })

  it('opens the system settings', async () => {
    const { model, notifier } = await started({ permission: 'denied' })
    model.getState().openSettings()
    expect(notifier.settingsOpened).toBe(1)
  })
})
