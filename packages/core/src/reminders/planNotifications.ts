import { addDays, type IsoDate } from '../lib/date'
import { formatAgo, formatLongDate } from '../lib/format'
import type { Renewal, Vehicle } from '../domain/types'
import { RENEWAL_NOTICE_DAYS, renewalReminder, renewalTitle } from '../features/renewals/renewals'
import type { LocalNotification } from '../ports'
import { checkInNoticeDate, type OdometerCheckIn } from './odometerCheckIn'
import { DUE_SOON_DAYS, type DueProjection } from './projectDue'

/** Reminders arrive at 9am on the phone's clock: awake, and before the working day fills up. */
export const REMINDER_HOUR = 9

/**
 * iOS keeps at most 64 pending notifications per app and drops the rest silently. Staying under
 * it leaves room for anything else the app schedules; later reminders are added as earlier ones
 * fire and the plan is refreshed.
 */
export const MAX_SCHEDULED_REMINDERS = 60

/** A heads-up two weeks ahead, when an item turns "due soon", and a nudge on the due date. */
type Stage = 'soon' | 'due'

/**
 * Warranty heads-ups a month and a week before a coverage ends: a month leaves time to book the
 * dealer for anything that might be a claim, and a week catches an owner who let it slide.
 */
export const WARRANTY_NOTICE_DAYS = [30, 7] as const

/** A coverage still running, with when it is expected to end. */
export interface WarrantyEnding {
  id: string
  /** "Powertrain coverage", "Extended warranty". */
  coverage: string
  endsOn: IsoDate
  /** Whether the end is the time limit or the projected date the car reaches its mileage. */
  endsBy: 'time' | 'miles'
  endMiles?: number | undefined
}

export interface VehicleDue {
  vehicle: Vehicle
  due: DueProjection[]
  warranties?: WarrantyEnding[]
  renewals?: Renewal[]
  /** An odometer reading worth asking for, when one would move a reminder. */
  checkIn?: OdometerCheckIn | undefined
}

const formatMiles = (miles: number) => `${Math.round(miles).toLocaleString('en-US')} mi`

/** "Oil change", "Oil change and Tire rotation", "Oil change, Tire rotation and 2 more". */
const listTasks = (tasks: string[]): string => {
  const [first, second] = tasks
  if (tasks.length === 1) return first ?? ''
  if (tasks.length === 2) return `${first} and ${second}`
  return `${first}, ${second} and ${tasks.length - 2} more`
}

const bodyFor = (stage: Stage, items: DueProjection[]): string => {
  const subject = listTasks(items.map((i) => i.task))
  const verb = items.length === 1 ? 'is' : 'are'
  const only = items.length === 1 ? items[0] : undefined
  // A mileage-triggered date is an estimate, so give the mileage the owner can check.
  const miles =
    only?.trigger === 'miles' && only.dueMiles !== undefined
      ? ` (around ${formatMiles(only.dueMiles)})`
      : ''
  return stage === 'soon'
    ? `${subject} ${verb} due in about two weeks${miles}.`
    : `${subject} ${verb} due now${miles}.`
}

const titleFor = (stage: Stage, vehicle: Vehicle) =>
  stage === 'soon' ? `${vehicle.nickname}: service coming up` : `${vehicle.nickname}: service due`

const warrantyBody = (w: WarrantyEnding, days: number): string => {
  const when = days >= 30 ? 'about a month' : 'about a week'
  const end =
    w.endsBy === 'miles' && w.endMiles !== undefined
      ? `at ${formatMiles(w.endMiles)}, ${when} away at your usual driving`
      : `in ${when}, on ${formatLongDate(w.endsOn)}`
  return `${w.coverage} ends ${end}. Have anything it covers looked at before then.`
}

const warrantyNotices = (cars: VehicleDue[], today: IsoDate): LocalNotification[] =>
  cars.flatMap(({ vehicle, warranties = [] }) =>
    warranties.flatMap((w) =>
      WARRANTY_NOTICE_DAYS.flatMap((days): LocalNotification[] => {
        const date = addDays(w.endsOn, -days)
        if (date <= today) return []
        return [
          {
            // No date in the id: a projected mileage end moves as readings arrive, and the
            // scheduler then moves the notification rather than adding another.
            id: `warranty:${vehicle.id}:${w.id}:${days}`,
            date,
            hour: REMINDER_HOUR,
            title: `${vehicle.nickname}: warranty ending`,
            body: warrantyBody(w, days),
            vehicleId: vehicle.id,
          },
        ]
      }),
    ),
  )

const renewalNotices = (cars: VehicleDue[], today: IsoDate): LocalNotification[] =>
  cars.flatMap(({ vehicle, renewals = [] }) =>
    renewals.flatMap((r) =>
      RENEWAL_NOTICE_DAYS.flatMap((days): LocalNotification[] => {
        const date = addDays(r.dueOn, -days)
        if (date <= today) return []
        return [
          {
            // No date in the id: renewing moves the date, and the scheduler then moves the
            // notification rather than adding another.
            id: `renewal:${vehicle.id}:${r.id}:${days}`,
            date,
            hour: REMINDER_HOUR,
            title: `${vehicle.nickname}: ${renewalTitle(r)} ${days === 0 ? 'today' : 'coming up'}`,
            body: renewalReminder(r, days),
            vehicleId: vehicle.id,
          },
        ]
      }),
    ),
  )

const checkInNotices = (cars: VehicleDue[], today: IsoDate): LocalNotification[] =>
  cars.flatMap(({ vehicle, checkIn }): LocalNotification[] => {
    const date = checkIn && checkInNoticeDate(checkIn, today)
    if (!checkIn || !date) return []
    return [
      {
        // One per car and no date in the id: a new reading or service moves or drops it.
        id: `odometer:${vehicle.id}`,
        date,
        hour: REMINDER_HOUR,
        title: `${vehicle.nickname}: what does the odometer say?`,
        body: `${checkIn.task} is due around ${formatMiles(checkIn.dueMiles)}, going by a reading from ${formatAgo(checkIn.readOn, date)}. A new reading keeps the reminder on the right day.`,
        vehicleId: vehicle.id,
      },
    ]
  })

/**
 * The notifications to have scheduled today: for every item with a projected due date, one two
 * weeks before it and one on the day, at REMINDER_HOUR. Items falling on the same day for the same
 * car share one notification. Only dates after today are scheduled, so planning again never
 * repeats a reminder that was due to fire already, and items that are already due are left to
 * the app's own screens. Each warranty still running gets a heads-up WARRANTY_NOTICE_DAYS before
 * it ends, and each registration, inspection or insurance date RENEWAL_NOTICE_DAYS before it. A car
whose next mileage reminder rests on an old reading gets one request for a new reading.
 * Soonest first, capped at MAX_SCHEDULED_REMINDERS.
 */
export const planNotifications = (cars: VehicleDue[], today: IsoDate): LocalNotification[] => {
  const groups = new Map<
    string,
    { vehicle: Vehicle; stage: Stage; date: IsoDate; items: DueProjection[] }
  >()

  for (const { vehicle, due } of cars) {
    for (const item of due) {
      if (item.dueDate === undefined) continue
      const stages: [Stage, IsoDate][] = [
        ['soon', addDays(item.dueDate, -DUE_SOON_DAYS)],
        ['due', item.dueDate],
      ]
      for (const [stage, date] of stages) {
        if (date <= today) continue
        const id = `reminder:${vehicle.id}:${stage}:${date}`
        const group = groups.get(id) ?? { vehicle, stage, date, items: [] }
        group.items.push(item)
        groups.set(id, group)
      }
    }
  }

  const service = [...groups.entries()].map(([id, g]): LocalNotification => ({
    id,
    date: g.date,
    hour: REMINDER_HOUR,
    title: titleFor(g.stage, g.vehicle),
    body: bodyFor(g.stage, g.items),
    vehicleId: g.vehicle.id,
  }))
  return [
    ...service,
    ...warrantyNotices(cars, today),
    ...renewalNotices(cars, today),
    ...checkInNotices(cars, today),
  ]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED_REMINDERS)
}
