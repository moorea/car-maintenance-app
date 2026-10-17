import { describe, expect, it } from 'vitest'
import type { NotificationPermission } from '../ports'
import {
  fixedClock,
  memoryAuth,
  memoryNotifier,
  memoryOdometer,
  memoryReminderSettings,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
  OWNER,
} from '../testing'
import { createReminderScheduler } from './scheduler'

const setup = (
  options: { enabled?: boolean; permission?: NotificationPermission; signedIn?: boolean } = {},
) => {
  const deps = {
    auth: memoryAuth({
      ...(options.signedIn !== false && { user: { id: OWNER } }),
      userIdFor: (email) => `user-${email}`,
    }),
    vehicles: memoryVehicles([
      {
        id: 'v1',
        configId: 'rav4-2021',
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        nickname: 'RAV4',
        severeDuty: false,
      },
    ]),
    schedule: memorySchedule([
      {
        id: 'oil',
        configId: 'rav4-2021',
        task: 'Oil and filter',
        intervalMiles: 10_000,
        intervalMonths: 12,
      },
      { id: 'rotate', configId: 'rav4-2021', task: 'Tire rotation', intervalMiles: 5_000 },
    ]),
    records: memoryServiceRecords([
      {
        id: 's1',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
      {
        id: 's2',
        vehicleId: 'v1',
        itemId: 'rotate',
        performedOn: '2026-07-01',
        odometerMiles: 30_000,
      },
    ]),
    odometer: memoryOdometer([{ vehicleId: 'v1', date: '2026-09-29', miles: 33_000 }]),
    clock: fixedClock('2026-10-01'),
    notifier: memoryNotifier({ permission: options.permission ?? 'granted' }),
    settings: memoryReminderSettings({ enabled: options.enabled ?? true }),
    errors: [] as string[],
  }
  const scheduler = createReminderScheduler({
    ...deps,
    log: (message, error) => deps.errors.push(`${message}: ${String(error)}`),
  })
  return { ...deps, scheduler }
}

const ids = async (notifier: ReturnType<typeof memoryNotifier>) =>
  (await notifier.scheduled()).map((n) => n.id)

// About 33,067 miles today at 33.3 a day: rotation is due 2026-11-28, oil 2027-04-27.
const PLANNED = [
  'reminder:v1:soon:2026-11-14',
  'reminder:v1:due:2026-11-28',
  'reminder:v1:soon:2027-04-13',
  'reminder:v1:due:2027-04-27',
]

describe('createReminderScheduler', () => {
  it("schedules reminders for the owner's cars once started", async () => {
    const { scheduler, notifier } = setup()
    scheduler.start()
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)
    const [first] = await notifier.scheduled()
    expect(first).toMatchObject({
      title: 'RAV4: service coming up',
      body: 'Tire rotation is due in about two weeks (around 35,000 mi).',
      vehicleId: 'v1',
    })
  })

  it('schedules nothing until reminders are turned on, and cancels them when turned off', async () => {
    const { scheduler, notifier, settings } = setup({ enabled: false })
    scheduler.start()
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])

    await settings.set({ enabled: true })
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)

    await settings.set({ enabled: false })
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])
  })

  it('schedules nothing without permission, and cancels everything if it is withdrawn', async () => {
    const { scheduler, notifier } = setup({ permission: 'undetermined' })
    scheduler.start()
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])

    notifier.setPermission('granted')
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)

    notifier.setPermission('denied')
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])
  })

  it("cancels a signed-out owner's reminders and never shows them to the next account", async () => {
    const { scheduler, notifier, auth } = setup()
    scheduler.start()
    await scheduler.refresh()

    await auth.signOut()
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])

    await auth.sendCode('someone@example.com')
    await auth.verifyCode('someone@example.com', '123456')
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])
  })

  it('moves the reminders when a service is logged, touching only those that changed', async () => {
    const { scheduler, notifier, records } = setup()
    scheduler.start()
    await scheduler.refresh()
    notifier.log.length = 0

    // Logged without its mileage, so the learned rate and the oil change stay as they were.
    await records.add({ id: 's3', vehicleId: 'v1', itemId: 'rotate', performedOn: '2026-10-01' })
    await scheduler.refresh()

    // Next rotation about 5,000 miles from today, at 33.3 a day: 150 days away.
    expect(notifier.log).toEqual([
      'cancel reminder:v1:soon:2026-11-14',
      'cancel reminder:v1:due:2026-11-28',
      'schedule reminder:v1:soon:2027-02-14',
      'schedule reminder:v1:due:2027-02-28',
    ])
  })

  it('leaves the device alone when nothing changed', async () => {
    const { scheduler, notifier } = setup()
    scheduler.start()
    await scheduler.refresh()
    notifier.log.length = 0
    await scheduler.refresh()
    expect(notifier.log).toEqual([])
  })

  it("follows a newly added car's reminders", async () => {
    const { scheduler, notifier, vehicles, records, odometer } = setup()
    scheduler.start()
    await scheduler.refresh()

    await odometer.add({ vehicleId: 'v2', date: '2026-10-01', miles: 12_000 })

    await vehicles.add(OWNER, {
      id: 'v2',
      configId: 'rav4-2021',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      nickname: 'Second',
      severeDuty: false,
    })
    await scheduler.refresh()
    expect((await ids(notifier)).filter((id) => id.startsWith('reminder:v2:'))).not.toEqual([])

    // Its service log is followed too.
    notifier.log.length = 0
    await records.add({
      id: 's4',
      vehicleId: 'v2',
      itemId: 'rotate',
      performedOn: '2026-10-01',
      odometerMiles: 12_000,
    })
    await scheduler.refresh()
    expect(notifier.log.some((line) => line.includes('reminder:v2:'))).toBe(true)
  })

  it('logs a failure and recovers on the next refresh', async () => {
    const { scheduler, notifier, errors } = setup()
    notifier.failNextSchedule('device busy')
    scheduler.start()
    await scheduler.refresh()
    expect(errors).toEqual(['Could not schedule reminders: Error: device busy'])

    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)
  })

  it('reports what is scheduled to watchers', async () => {
    const { scheduler } = setup()
    const seen: string[][] = []
    scheduler.watchScheduled((s) => seen.push(s.map((n) => n.id)))
    scheduler.start()
    await scheduler.refresh()
    expect(seen[0]).toEqual([])
    expect(seen.at(-1)).toEqual(PLANNED)
  })

  it('stops following changes once disposed', async () => {
    const { scheduler, notifier, settings } = setup()
    scheduler.start()
    await scheduler.refresh()
    scheduler.dispose()
    notifier.log.length = 0
    await settings.set({ enabled: false })
    expect(notifier.log).toEqual([])
  })
})
