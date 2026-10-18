import { describe, expect, it } from 'vitest'
import type { Vehicle } from '../domain/types'
import type { NotificationPermission } from '../ports'
import {
  memoryAuth,
  memoryNotifier,
  memoryOdometer,
  memoryReminderSettings,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
  memoryTireSets,
  memoryWarranties,
  memoryRenewals,
  OWNER,
} from '../testing'
import { createReminderScheduler } from './scheduler'

const setup = (
  options: { enabled?: boolean; permission?: NotificationPermission; signedIn?: boolean } = {},
) => {
  const calendar = { today: '2026-10-01' }
  const deps = {
    calendar,
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
    warranties: memoryWarranties(),
    tireSets: memoryTireSets(),
    renewals: memoryRenewals(),
    clock: { today: () => calendar.today },
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

/** Wraps the service log and odometer so a test can count the watches still open on them. */
const openWatches = (d: ReturnType<typeof setup>) => {
  let open = 0
  const counted =
    <T>(watch: (id: string, onChange: (v: T) => void) => () => void) =>
    (id: string, onChange: (v: T) => void) => {
      open++
      const stop = watch(id, onChange)
      return () => {
        open--
        stop()
      }
    }
  return {
    open: () => open,
    repos: {
      records: { ...d.records, watchForVehicle: counted(d.records.watchForVehicle) },
      odometer: { ...d.odometer, watchForVehicle: counted(d.odometer.watchForVehicle) },
      warranties: { ...d.warranties, watchForVehicle: counted(d.warranties.watchForVehicle) },
      tireSets: { ...d.tireSets, watchForVehicle: counted(d.tireSets.watchForVehicle) },
      renewals: { ...d.renewals, watchForVehicle: counted(d.renewals.watchForVehicle) },
    },
  }
}

const ids = async (notifier: ReturnType<typeof memoryNotifier>) =>
  (await notifier.scheduled()).map((n) => n.id)

// About 33,067 miles today at 33.3 a day: rotation is due 2026-11-28, oil 2027-04-27. The
// rotation's date rests on a reading from 2026-09-29, so a new one is asked for three weeks ahead.
const PLANNED = [
  'odometer:v1',
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
    const [checkIn, first] = await notifier.scheduled()
    expect(first).toMatchObject({
      title: 'RAV4: service coming up',
      body: 'Tire rotation is due in about two weeks (around 35,000 mi).',
      vehicleId: 'v1',
    })
    expect(checkIn).toMatchObject({
      date: '2026-11-07',
      title: 'RAV4: what does the odometer say?',
      body: 'Tire rotation is due around 35,000 mi, going by a reading from 6 weeks ago. A new reading keeps the reminder on the right day.',
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
      // The rotation's check-in moves with it.
      'schedule odometer:v1',
      'schedule reminder:v1:soon:2027-02-14',
      'schedule reminder:v1:due:2027-02-28',
    ])
  })

  it('moves mileage reminders as soon as an odometer reading is added', async () => {
    const { scheduler, notifier, odometer } = setup()
    scheduler.start()
    await scheduler.refresh()
    notifier.log.length = 0
    const replanned = new Promise<void>((resolve) => {
      let first = true
      scheduler.watchScheduled(() => (first ? (first = false) : resolve()))
    })

    // 1,500 miles in two days: the rotation is now due in about a week, and the oil change moves
    // forward too. The new reading is fresh for the rotation, so the next reading is asked for
    // ahead of the oil change instead.
    await odometer.add({ vehicleId: 'v1', date: '2026-10-01', miles: 34_500 })
    await replanned

    expect(notifier.log).toEqual([
      'cancel reminder:v1:soon:2026-11-14',
      'cancel reminder:v1:due:2026-11-28',
      'cancel reminder:v1:soon:2027-04-13',
      'cancel reminder:v1:due:2027-04-27',
      'schedule reminder:v1:due:2026-10-09',
      'schedule odometer:v1',
      'schedule reminder:v1:soon:2026-12-10',
      'schedule reminder:v1:due:2026-12-24',
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

  it('keeps a reminder due this morning when the app is opened before it fires', async () => {
    const { scheduler, notifier, calendar } = setup()
    scheduler.start()
    await scheduler.refresh()
    calendar.today = '2026-11-14'
    notifier.log.length = 0
    await scheduler.refresh()
    expect(notifier.log).toEqual([])
    expect(await ids(notifier)).toContain('reminder:v1:soon:2026-11-14')
  })

  it('still cancels a reminder due today when reminders are turned off', async () => {
    const { scheduler, notifier, calendar, settings } = setup()
    scheduler.start()
    await scheduler.refresh()
    calendar.today = '2026-11-14'
    await settings.set({ enabled: false })
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([])
  })

  it('touches nothing on a cold start until the setting and the cars have loaded', async () => {
    const d = setup()
    await d.notifier.schedule({
      id: 'reminder:v1:soon:2026-11-14',
      date: '2026-11-14',
      hour: 9,
      title: 'RAV4: service coming up',
      body: 'Tire rotation is due in about two weeks (around 35,000 mi).',
      vehicleId: 'v1',
    })
    d.notifier.log.length = 0
    // Settings and cars arrive later, as they do from storage and the database.
    let reportSettings: ((s: { enabled: boolean }) => void) | undefined
    let reportCars: ((v: Vehicle[]) => void) | undefined
    const scheduler = createReminderScheduler({
      ...d,
      settings: { watch: (on) => ((reportSettings = on), () => {}), set: async () => {} },
      vehicles: {
        ...d.vehicles,
        watchOwned: (_owner, on) => ((reportCars = on), () => {}),
      },
    })
    scheduler.start()
    await scheduler.refresh()
    reportSettings?.({ enabled: true })
    await scheduler.refresh()
    expect(d.notifier.log).toEqual([])

    const car = await d.vehicles.get('v1')
    reportCars?.(car ? [car] : [])
    await scheduler.refresh()
    expect(d.notifier.log).not.toContain('cancel reminder:v1:soon:2026-11-14')
    expect(await ids(d.notifier)).toEqual(PLANNED)
  })

  it('adds heads-ups before a warranty ends, and drops them when it is deleted', async () => {
    const { scheduler, notifier, warranties } = setup()
    scheduler.start()
    await scheduler.refresh()
    await warranties.save({
      id: 'w1',
      vehicleId: 'v1',
      kind: 'powertrain',
      startsOn: '2023-12-31',
      months: 36,
    })
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual([
      ...PLANNED.slice(0, 3),
      'warranty:v1:w1:30',
      'warranty:v1:w1:7',
      ...PLANNED.slice(3),
    ])
    const notice = (await notifier.scheduled()).find((n) => n.id === 'warranty:v1:w1:30')
    expect(notice).toMatchObject({
      date: '2026-12-01',
      title: 'RAV4: warranty ending',
      body: 'Powertrain coverage ends in about a month, on Dec 31, 2026. Have anything it covers looked at before then.',
    })
    await warranties.remove('w1')
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)
  })

  it('reminds before a tire set turns six, and drops the reminder when the set is gone', async () => {
    const { scheduler, notifier, tireSets } = setup()
    scheduler.start()
    await scheduler.refresh()
    await tireSets.save({
      id: 't1',
      vehicleId: 'v1',
      name: 'Winter',
      madeWeek: 2,
      madeYear: 2021,
      mounted: false,
      priorMiles: 0,
    })
    await scheduler.refresh()
    const notice = (await notifier.scheduled()).find((n) => n.id === 'tires:v1:t1:6')
    expect(notice).toMatchObject({
      date: '2026-12-12',
      title: 'RAV4: tires getting old',
      body: 'Winter tires turn 6 on Jan 11, 2027. Most carmakers say to replace tires by then, even with tread left.',
    })
    await tireSets.remove('t1')
    await scheduler.refresh()
    expect(await ids(notifier)).toEqual(PLANNED)
  })

  it('reminds before a registration expires, and moves the reminders when it is renewed', async () => {
    const { scheduler, notifier, renewals } = setup()
    scheduler.start()
    await scheduler.refresh()
    const registration = {
      id: 'r1',
      vehicleId: 'v1',
      kind: 'registration' as const,
      dueOn: '2026-12-15',
      everyMonths: 12,
    }
    await renewals.save(registration)
    await scheduler.refresh()
    const notices = (await notifier.scheduled()).filter((n) => n.id.startsWith('renewal:'))
    expect(notices.map((n) => [n.id, n.date])).toEqual([
      ['renewal:v1:r1:30', '2026-11-15'],
      ['renewal:v1:r1:7', '2026-12-08'],
      ['renewal:v1:r1:0', '2026-12-15'],
    ])
    expect(notices[0]).toMatchObject({
      title: 'RAV4: Registration coming up',
      body: 'Registration expires in about a month, on Dec 15, 2026. Renew it before then to avoid a late fee.',
    })

    await renewals.save({ ...registration, dueOn: '2027-12-15' })
    await scheduler.refresh()
    const moved = (await notifier.scheduled()).filter((n) => n.id.startsWith('renewal:'))
    expect(moved.map((n) => n.date)).toEqual(['2027-11-15', '2027-12-08', '2027-12-15'])
  })

  it("stops watching a car's service log and readings once it is gone", async () => {
    const d = setup()
    const counter = openWatches(d)
    const scheduler = createReminderScheduler({ ...d, ...counter.repos })
    scheduler.start()
    await scheduler.refresh()
    expect(counter.open()).toBe(5)

    const car = await d.vehicles.get('v1')
    if (!car) throw new Error('missing fixture')
    d.vehicles.set([])
    expect(counter.open()).toBe(0)

    d.vehicles.set([car])
    expect(counter.open()).toBe(5)
    await d.auth.signOut()
    expect(counter.open()).toBe(0)
  })

  it('stops following everything once disposed', async () => {
    const d = setup()
    const counter = openWatches(d)
    const scheduler = createReminderScheduler({ ...d, ...counter.repos })
    scheduler.start()
    await scheduler.refresh()
    scheduler.dispose()
    expect(counter.open()).toBe(0)
  })
})
