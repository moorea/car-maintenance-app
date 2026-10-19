import { describe, expect, it } from 'vitest'
import type { Bulletin, MaintenanceItem, Recall, Vehicle } from '../../domain/types'
import {
  controlledOdometerReader,
  fixedClock,
  memoryAuth,
  memoryOdometer,
  memoryPhotoPicker,
  memoryPreferences,
  memorySafety,
  memorySchedule,
  memoryServiceRecords,
  memoryVehicles,
} from '../../testing'
import type { ScheduleRow } from '../car/model'
import {
  createStatusModel,
  describeStatus,
  type StatusCarInput,
  type StatusSafetyInput,
} from './model'

const TODAY = '2026-10-17'

const row = (task: string, status: ScheduleRow['status'], extra: Partial<ScheduleRow> = {}) =>
  ({
    itemId: task.toLowerCase().replace(/\W+/g, '-'),
    task,
    status,
    interval: '',
    next: '',
    trigger: 'time',
    ...extra,
  }) satisfies ScheduleRow

const oil = row('Oil & filter change', 'upcoming', { trigger: 'miles', dueMiles: 40_540 })
const tires = row('Tire rotation', 'overdue', { trigger: 'miles', dueMiles: 39_000 })
const brakes = row('Brake fluid', 'upcoming', { dueDate: '2027-03-14' })
const cabin = row('Cabin air filter', 'due-soon', { dueDate: '2026-10-25' })
const wipers = row('Wiper blades', 'overdue', { dueDate: '2026-09-01' })

const carInput = (extra: Partial<StatusCarInput> = {}): StatusCarInput => ({
  status: 'ready',
  schedule: [oil, brakes],
  miles: 40_000,
  milesPerMonth: 1_234,
  readOn: '2026-10-14',
  ...extra,
})

const recall = (id: string): Recall => ({
  id,
  configId: 'c1',
  campaign: id,
  summary: `Recall ${id}`,
  parkIt: false,
  parkOutside: false,
  overTheAir: false,
})

const bulletin = (nhtsaId: number): Bulletin => ({
  id: `b-${nhtsaId}`,
  configId: 'c1',
  nhtsaId,
  kind: 'bulletin',
  components: ['ENGINE'],
  summary: `Bulletin ${nhtsaId}.`,
})

const safetyInput = (extra: Partial<StatusSafetyInput> = {}): StatusSafetyInput => ({
  status: 'ready',
  recalls: [],
  bulletinsChecked: true,
  extensions: [],
  bulletinGroups: [],
  ...extra,
})

const describe_ = (car: Partial<StatusCarInput> = {}, safety: Partial<StatusSafetyInput> = {}) =>
  describeStatus(carInput(car), safetyInput(safety), TODAY)

describe('describeStatus', () => {
  it("doesn't say all good when the schedule couldn't be read", () => {
    const s = describe_({ schedule: [], error: "Couldn't load the schedule." })
    expect(s).toMatchObject({ level: 'unknown', word: "Can't check", needYou: 0 })
    expect(s.sentence).toBe("The maintenance schedule couldn't be read. Try again later.")
    expect(s.ringLabel).toBe("The schedule couldn't be read.")
  })

  it('still counts open recalls when the schedule could not be read', () => {
    const s = describe_({ schedule: [], error: 'x' }, { recalls: [recall('r1')] })
    expect(s).toMatchObject({ level: 'attention', needYou: 1 })
  })

  it("doesn't call the rest on track when the rest can't be dated", () => {
    const s = describe_({
      schedule: [tires, row('Spark plugs', 'unknown', { trigger: 'miles' })],
    })
    expect(s.sentence).toBe('Tire rotation is overdue.')
  })

  it('keeps an initialism in the second name as it is', () => {
    const s = describe_({
      schedule: [tires, row('CVT fluid', 'overdue'), row('Brake fluid', 'upcoming')],
    })
    expect(s.sentence).toBe('Tire rotation and CVT fluid are overdue. Everything else is on track.')
  })

  it('counts overdue items and open recalls as what needs the owner', () => {
    const s = describe_({ schedule: [tires, wipers, oil] }, { recalls: [recall('r1')] })
    expect(s.needYou).toBe(3)
  })

  it('says all good with nothing due, naming what is next and how far away by mileage', () => {
    const s = describe_()
    expect(s).toMatchObject({ level: 'good', word: 'All good', needYou: 0 })
    expect(s.sentence).toBe('Nothing is due right now. Oil & filter change is next, in 540 mi.')
  })

  it('names the date of the next item when it goes by date', () => {
    const s = describe_({ schedule: [brakes] })
    expect(s.sentence).toBe('Nothing is due right now. Brake fluid is next, on Mar 14, 2027.')
    expect(s.stats[0]).toEqual({ value: 'Mar 14, 2027', label: 'next due' })
  })

  it('shows the miles to the next item as the first stat', () => {
    expect(describe_().stats[0]).toEqual({ value: '540', label: 'mi to next' })
  })

  it('says coming up when something is due soon but nothing needs the owner', () => {
    const s = describe_({ schedule: [cabin, oil] })
    expect(s).toMatchObject({ level: 'soon', word: 'Coming up' })
    expect(s.sentence).toBe('Cabin air filter is due soon, on Oct 25.')
  })

  it('names two items due soon together and counts three or more', () => {
    const two = row('Engine air filter', 'due-soon')
    const three = row('Coolant', 'due-soon')
    expect(describe_({ schedule: [cabin, two] }).sentence).toBe(
      'Cabin air filter and engine air filter are due soon.',
    )
    expect(describe_({ schedule: [cabin, two, three] }).sentence).toBe('3 items are due soon.')
  })

  it('needs attention with one item overdue and one open recall, saying the rest is on track', () => {
    const s = describe_({ schedule: [tires, oil] }, { recalls: [recall('r1')] })
    expect(s).toMatchObject({ level: 'attention', word: 'Needs attention', needYou: 2 })
    expect(s.sentence).toBe(
      "Tire rotation is overdue and there's an open recall. Everything else is on track.",
    )
  })

  it('names two overdue items and counts several recalls', () => {
    const s = describe_({ schedule: [tires, wipers] }, { recalls: [recall('r1'), recall('r2')] })
    expect(s.sentence).toBe(
      'Tire rotation and wiper blades are overdue and there are 2 open recalls.',
    )
  })

  it('counts three or more overdue items rather than listing them', () => {
    const third = row('Coolant', 'overdue')
    const s = describe_({ schedule: [tires, wipers, third, oil] })
    expect(s.sentence).toBe('3 items are overdue. Everything else is on track.')
  })

  it('needs attention for an open recall alone', () => {
    const s = describe_({}, { recalls: [recall('r1')] })
    expect(s.level).toBe('attention')
    expect(s.sentence).toBe("There's an open recall. Everything else is on track.")
  })

  it('mentions what is due soon after what needs the owner', () => {
    const s = describe_({ schedule: [tires, cabin, oil] })
    expect(s.sentence).toBe('Tire rotation is overdue. Cabin air filter is due soon.')
  })

  it('puts recalls first in the ring, then overdue, due soon and later items', () => {
    const s = describe_({ schedule: [oil, cabin, tires] }, { recalls: [recall('r1')] })
    expect(s.segments.map((x) => x.tone)).toEqual(['attention', 'attention', 'soon', 'later'])
  })

  it('leaves items whose due point is unknown out of the ring', () => {
    const s = describe_({ schedule: [oil, row('Coolant', 'unknown')] })
    expect(s.segments).toHaveLength(1)
  })

  it('reads the ring as a count and what it is made of', () => {
    expect(describe_({ schedule: [tires, cabin] }, { recalls: [recall('r1')] }).ringLabel).toBe(
      '2 things need you: 1 item overdue and 1 open recall. 1 due soon.',
    )
    expect(describe_({ schedule: [tires, wipers] }).ringLabel).toBe(
      '2 things need you: 2 items overdue.',
    )
    expect(describe_({}, { recalls: [recall('r1')] }).ringLabel).toBe(
      '1 thing needs you: 1 open recall.',
    )
    expect(describe_().ringLabel).toBe('Nothing needs you right now.')
  })

  it('does not count recalls while NHTSA is still being asked, and says so', () => {
    const s = describe_({}, { status: 'checking', recalls: [] })
    expect(s.level).toBe('good')
    expect(s.stats[1]).toEqual({ value: '—', label: 'open recalls' })
    expect(s.checks.find((c) => c.key === 'recalls')).toMatchObject({
      value: 'Checking…',
      tone: 'quiet',
    })
  })

  it('says no recall is open once NHTSA has none', () => {
    const s = describe_()
    expect(s.stats[1]).toEqual({ value: '0', label: 'open recalls' })
    expect(s.checks.find((c) => c.key === 'recalls')).toMatchObject({
      value: 'None open',
      tone: 'ok',
    })
  })

  it('counts open recalls in the stat and the check', () => {
    const s = describe_({}, { recalls: [recall('r1')] })
    expect(s.stats[1]).toEqual({ value: '1', label: 'open recall' })
    expect(s.checks.find((c) => c.key === 'recalls')).toMatchObject({
      value: '1 open',
      tone: 'attention',
    })
  })

  it('shows miles a month rounded, or a dash while the pace is assumed', () => {
    expect(describe_().stats[2]).toEqual({ value: '1,230', label: 'mi a month' })
    expect(describe_({ milesPerMonth: undefined }).stats[2]).toEqual({
      value: '—',
      label: 'mi a month',
    })
  })

  it('checks the schedule as overdue, due soon or on track', () => {
    const schedule = (rows: ScheduleRow[]) =>
      describe_({ schedule: rows }).checks.find((c) => c.key === 'schedule')
    expect(schedule([tires, oil])).toMatchObject({ value: '1 overdue', tone: 'attention' })
    expect(schedule([cabin, oil])).toMatchObject({ value: '1 due soon', tone: 'soon' })
    expect(schedule([oil])).toMatchObject({ value: 'On track', tone: 'ok' })
    expect(schedule([])).toMatchObject({ value: 'No schedule yet', tone: 'quiet' })
  })

  it('counts bulletins, including warranty extensions, as known issues', () => {
    const s = describe_(
      {},
      {
        extensions: [bulletin(1)],
        bulletinGroups: [{ component: 'ENGINE', bulletins: [bulletin(2), bulletin(3)] }],
      },
    )
    expect(s.checks.find((c) => c.key === 'issues')).toMatchObject({ value: '3 bulletins' })
    expect(describe_().checks.find((c) => c.key === 'issues')).toMatchObject({
      value: 'None found',
    })
    expect(
      describe_({}, { bulletinsChecked: false }).checks.find((c) => c.key === 'issues'),
    ).toMatchObject({ value: 'Checking…' })
  })

  it('says when the odometer was last read, or that it never was', () => {
    expect(describe_().checks.find((c) => c.key === 'odometer')).toMatchObject({
      value: 'Updated 3 days ago',
      tone: 'ok',
    })
    expect(
      describe_({ readOn: '2026-08-01' }).checks.find((c) => c.key === 'odometer'),
    ).toMatchObject({ value: 'Updated 3 months ago', tone: 'soon' })
    expect(
      describe_({ readOn: undefined, miles: undefined }).checks.find((c) => c.key === 'odometer'),
    ).toMatchObject({ value: 'No reading yet', tone: 'soon' })
  })

  it('asks for a reading when the only items left go by mileage and there is none', () => {
    const s = describe_({
      schedule: [row('Oil & filter change', 'unknown', { trigger: 'miles' })],
      miles: undefined,
      readOn: undefined,
    })
    expect(s.level).toBe('good')
    expect(s.sentence).toBe(
      'Nothing is due by date. Add an odometer reading to see what is due by mileage.',
    )
    expect(s.stats[0]).toEqual({ value: '—', label: 'needs miles' })
    expect(s.checks.find((c) => c.key === 'schedule')).toMatchObject({
      value: 'Needs your mileage',
    })
  })

  it('says when the car has no schedule', () => {
    expect(describe_({ schedule: [] }).sentence).toBe(
      "There's no maintenance schedule for this car yet.",
    )
  })
})

const vehicle: Vehicle = {
  id: 'v1',
  configId: 'c1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}

const item: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil & filter change',
  intervalMiles: 10_000,
}

const setup = (car: Vehicle = vehicle) => {
  const safety = memorySafety()
  const model = createStatusModel({
    vehicle: car,
    vehicles: memoryVehicles([car]),
    schedule: memorySchedule([item]),
    records: memoryServiceRecords([
      {
        id: 'r1',
        vehicleId: 'v1',
        itemId: 'oil',
        performedOn: '2026-07-09',
        odometerMiles: 30_000,
      },
    ]),
    odometer: memoryOdometer([
      { vehicleId: 'v1', date: '2026-07-09', miles: 30_000 },
      { vehicleId: 'v1', date: '2026-10-07', miles: 35_400 },
    ]),
    clock: fixedClock(TODAY),
    photos: memoryPhotoPicker(),
    odometerReader: controlledOdometerReader(),
    preferences: memoryPreferences({}),
    auth: memoryAuth({ user: { id: 'u1' }, userIdFor: (e) => `user-${e}` }),
    safety,
  })
  return { model, safety }
}

// The in-memory repos resolve at once, so a few microtask turns let a refresh finish.
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('status screen model', () => {
  it('is loading until the schedule has been read', () => {
    const { model } = setup()
    expect(model.getState()).toMatchObject({ status: 'loading', title: '2021 Toyota RAV4' })
  })

  it("describes the car's schedule and recalls once both are read", async () => {
    const { model, safety } = setup()
    model.getState().start()
    await settle()
    expect(model.getState().status).toBe('ready')
    expect(model.getState().summary?.word).toBe('All good')
    safety.set('c1', { recallsCheckedAt: TODAY, recalls: [recall('r1')], complaints: [] })
    expect(model.getState().summary).toMatchObject({ word: 'Needs attention', needYou: 1 })
    model.getState().dispose()
  })

  it('waits for a car whose configuration has not synced yet', async () => {
    const { configId: _, ...unmatched } = vehicle
    const { model } = setup(unmatched)
    model.getState().start()
    await settle()
    expect(model.getState()).toMatchObject({ status: 'unmatched', summary: undefined })
  })

  it('stops following the car once disposed', async () => {
    const { model, safety } = setup()
    model.getState().start()
    await settle()
    model.getState().dispose()
    safety.set('c1', { recallsCheckedAt: TODAY, recalls: [recall('r1')], complaints: [] })
    expect(model.getState().summary?.needYou).toBe(0)
  })
})
