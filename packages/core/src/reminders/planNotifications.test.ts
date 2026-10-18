import { describe, expect, it } from 'vitest'
import type { Renewal, Vehicle } from '../domain/types'
import { addDays } from '../lib/date'
import {
  isPlannedNotification,
  MAX_SCHEDULED_REMINDERS,
  planNotifications,
  type WarrantyEnding,
} from './planNotifications'
import type { DueProjection } from './projectDue'

const rav4: Vehicle = {
  id: 'v1',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  nickname: 'RAV4',
  severeDuty: false,
}
const civic: Vehicle = { ...rav4, id: 'v2', make: 'Honda', model: 'Civic', nickname: 'Civic' }

const due = (over: Partial<DueProjection> & Pick<DueProjection, 'itemId'>): DueProjection => ({
  task: over.itemId,
  trigger: 'time',
  status: 'upcoming',
  historyUnknown: false,
  ...over,
})

describe('planNotifications', () => {
  it('reminds two weeks ahead and again on the due date, at 9am', () => {
    const plan = planNotifications(
      [
        {
          vehicle: rav4,
          due: [due({ itemId: 'oil', task: 'Oil and filter', dueDate: '2026-11-28' })],
        },
      ],
      '2026-10-01',
    )
    expect(plan).toEqual([
      {
        id: 'reminder:v1:soon:2026-11-14',
        date: '2026-11-14',
        hour: 9,
        title: 'RAV4: service coming up',
        body: 'Oil and filter is due in about two weeks.',
        vehicleId: 'v1',
      },
      {
        id: 'reminder:v1:due:2026-11-28',
        date: '2026-11-28',
        hour: 9,
        title: 'RAV4: service due',
        body: 'Oil and filter is due now.',
        vehicleId: 'v1',
      },
    ])
  })

  it('gives the mileage for an item due by mileage, since its date is an estimate', () => {
    const [soon] = planNotifications(
      [
        {
          vehicle: rav4,
          due: [
            due({
              itemId: 'rotate',
              task: 'Tire rotation',
              dueDate: '2026-11-28',
              dueMiles: 35_000,
              trigger: 'miles',
            }),
          ],
        },
      ],
      '2026-10-01',
    )
    expect(soon?.body).toBe('Tire rotation is due in about two weeks (around 35,000 mi).')
  })

  it('combines items due the same day for the same car into one notification', () => {
    const plan = planNotifications(
      [
        {
          vehicle: rav4,
          due: [
            due({
              itemId: 'a',
              task: 'Oil and filter',
              dueDate: '2026-11-28',
              trigger: 'miles',
              dueMiles: 40_000,
            }),
            due({ itemId: 'b', task: 'Tire rotation', dueDate: '2026-11-28' }),
            due({ itemId: 'c', task: 'Cabin air filter', dueDate: '2026-11-28' }),
            due({ itemId: 'd', task: 'Wiper blades', dueDate: '2026-11-28' }),
          ],
        },
        {
          vehicle: civic,
          due: [due({ itemId: 'a', task: 'Oil and filter', dueDate: '2026-11-28' })],
        },
      ],
      '2026-10-01',
    )
    expect(plan.map((n) => [n.id, n.body])).toEqual([
      [
        'reminder:v1:soon:2026-11-14',
        'Oil and filter, Tire rotation and 2 more are due in about two weeks.',
      ],
      ['reminder:v2:soon:2026-11-14', 'Oil and filter is due in about two weeks.'],
      ['reminder:v1:due:2026-11-28', 'Oil and filter, Tire rotation and 2 more are due now.'],
      ['reminder:v2:due:2026-11-28', 'Oil and filter is due now.'],
    ])
    expect(
      planNotifications(
        [
          {
            vehicle: rav4,
            due: [
              due({ itemId: 'a', task: 'Oil and filter', dueDate: '2026-11-28' }),
              due({ itemId: 'b', task: 'Tire rotation', dueDate: '2026-11-28' }),
            ],
          },
        ],
        '2026-10-01',
      )[0]?.body,
    ).toBe('Oil and filter and Tire rotation are due in about two weeks.')
  })

  it('only schedules reminders after today, so planning again never repeats one', () => {
    const plan = planNotifications(
      [
        {
          vehicle: rav4,
          due: [
            // Due in ten days: the two-week heads-up has passed, the due-date one has not.
            due({ itemId: 'soon', dueDate: '2026-10-11', status: 'due-soon' }),
            due({ itemId: 'today', dueDate: '2026-10-01', status: 'due-soon' }),
            due({ itemId: 'late', dueDate: '2026-09-01', status: 'overdue' }),
            // Exactly two weeks out: the heads-up would be today.
            due({ itemId: 'edge', dueDate: '2026-10-15' }),
          ],
        },
      ],
      '2026-10-01',
    )
    expect(plan.map((n) => n.id)).toEqual([
      'reminder:v1:due:2026-10-11',
      'reminder:v1:due:2026-10-15',
    ])
  })

  it('skips items with no projected date, such as a parked car reaching its mileage', () => {
    expect(
      planNotifications(
        [{ vehicle: rav4, due: [due({ itemId: 'x', dueMiles: 50_000, trigger: 'miles' })] }],
        '2026-10-01',
      ),
    ).toEqual([])
  })

  it('keeps only the soonest reminders, under the limit iOS enforces', () => {
    // 50 items on different days make 100 reminders.
    const many = Array.from({ length: 50 }, (_, i) =>
      due({ itemId: `i${i}`, dueDate: addDays('2027-01-01', i * 3) }),
    )
    const plan = planNotifications([{ vehicle: rav4, due: many }], '2026-10-01')
    expect(plan).toHaveLength(MAX_SCHEDULED_REMINDERS)
    const dates = plan.map((n) => n.date)
    expect(dates).toEqual([...dates].sort())
    // 28 due-date and 33 heads-up reminders fall on or before 2027-03-23.
    expect(plan.at(-1)?.id).toBe('reminder:v1:due:2027-03-23')
  })

  describe('warranties', () => {
    const powertrain: WarrantyEnding = {
      id: 'w1',
      coverage: 'Powertrain coverage',
      endsOn: '2027-03-14',
      endsBy: 'time',
      endMiles: 60_000,
    }

    it('warns a month and a week before a coverage ends', () => {
      const plan = planNotifications(
        [{ vehicle: rav4, due: [], warranties: [powertrain] }],
        '2026-10-01',
      )
      expect(plan).toEqual([
        {
          id: 'warranty:v1:w1:30',
          date: '2027-02-12',
          hour: 9,
          title: 'RAV4: warranty ending',
          body: 'Powertrain coverage ends in about a month, on Mar 14, 2027. Have anything it covers looked at before then.',
          vehicleId: 'v1',
        },
        {
          id: 'warranty:v1:w1:7',
          date: '2027-03-07',
          hour: 9,
          title: 'RAV4: warranty ending',
          body: 'Powertrain coverage ends in about a week, on Mar 14, 2027. Have anything it covers looked at before then.',
          vehicleId: 'v1',
        },
      ])
    })

    it('gives the mileage when the car will reach the limit first', () => {
      const plan = planNotifications(
        [{ vehicle: rav4, due: [], warranties: [{ ...powertrain, endsBy: 'miles' }] }],
        '2027-02-20',
      )
      expect(plan.map((n) => n.body)).toEqual([
        'Powertrain coverage ends at 60,000 mi, about a week away at your usual driving. Have anything it covers looked at before then.',
      ])
    })

    it('shares the cap with service reminders, soonest first', () => {
      const services = Array.from({ length: MAX_SCHEDULED_REMINDERS }, (_, i) =>
        due({ itemId: `item${i}`, dueDate: addDays('2027-04-01', i) }),
      )
      const plan = planNotifications(
        [{ vehicle: rav4, due: services, warranties: [powertrain] }],
        '2026-10-01',
      )
      expect(plan).toHaveLength(MAX_SCHEDULED_REMINDERS)
      expect(plan[0]?.id).toBe('warranty:v1:w1:30')
    })
  })

  describe('renewals', () => {
    const insurance: Renewal = {
      id: 'r1',
      vehicleId: 'v1',
      kind: 'insurance',
      dueOn: '2027-03-14',
      everyMonths: 6,
    }

    it('reminds a month and a week ahead and on the day, with what to do', () => {
      const plan = planNotifications(
        [{ vehicle: rav4, due: [], renewals: [insurance] }],
        '2026-10-01',
      )
      expect(plan.map((n) => [n.date, n.title, n.body])).toEqual([
        [
          '2027-02-12',
          'RAV4: Insurance coming up',
          'Insurance renews in about a month, on Mar 14, 2027. A good time to compare quotes.',
        ],
        [
          '2027-03-07',
          'RAV4: Insurance coming up',
          'Insurance renews in a week, on Mar 14, 2027. A good time to compare quotes.',
        ],
        ['2027-03-14', 'RAV4: Insurance today', 'Insurance renews today.'],
      ])
    })

    it('names an inspection as due, and an owner-named one by its name', () => {
      const plan = planNotifications(
        [
          {
            vehicle: rav4,
            due: [],
            renewals: [
              { ...insurance, id: 'r2', kind: 'inspection' },
              { ...insurance, id: 'r3', kind: 'other', title: 'Parking permit' },
            ],
          },
        ],
        '2027-03-10',
      )
      expect(plan.map((n) => n.body)).toEqual([
        'Safety inspection is due today.',
        'Parking permit is due today.',
      ])
    })

    it('leaves out heads-ups whose day has passed', () => {
      const plan = planNotifications(
        [{ vehicle: rav4, due: [], renewals: [insurance] }],
        '2027-03-07',
      )
      expect(plan.map((n) => n.id)).toEqual(['renewal:v1:r1:0'])
    })
  })

  it('gives every kind of notification an id the device adapter recognises as its own', () => {
    const plan = planNotifications(
      [
        {
          vehicle: rav4,
          due: [due({ itemId: 'oil', trigger: 'miles', dueDate: '2026-12-01', dueMiles: 45_000 })],
          warranties: [
            { id: 'w1', coverage: 'Basic coverage', endsOn: '2027-01-01', endsBy: 'time' },
          ],
          renewals: [{ id: 'r1', vehicleId: 'v1', kind: 'registration', dueOn: '2027-01-01' }],
          checkIn: {
            itemId: 'oil',
            task: 'Oil change',
            dueMiles: 45_000,
            dueDate: '2026-12-01',
            readOn: '2026-09-01',
            from: '2026-11-10',
          },
        },
      ],
      '2026-10-01',
    )
    const kinds = new Set(plan.map((n) => n.id.split(':')[0]))
    expect(kinds).toEqual(new Set(['reminder', 'warranty', 'renewal', 'odometer']))
    expect(plan.every((n) => isPlannedNotification(n.id))).toBe(true)
    expect(isPlannedNotification('another-app:1')).toBe(false)
  })
})
