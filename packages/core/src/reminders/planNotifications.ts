import { addDays, type IsoDate } from '../lib/date'
import type { Vehicle } from '../domain/types'
import type { LocalNotification } from '../ports'
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

export interface VehicleDue {
  vehicle: Vehicle
  due: DueProjection[]
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

/**
 * The notifications to have scheduled today: for every item with a projected due date, one two
 * weeks before it and one on the day, at REMINDER_HOUR. Items falling on the same day for the same
 * car share one notification. Only dates after today are scheduled, so planning again never
 * repeats a reminder that was due to fire already, and items that are already due are left to
 * the app's own screens. Soonest first, capped at MAX_SCHEDULED_REMINDERS.
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

  return [...groups.entries()]
    .map(([id, g]): LocalNotification => ({
      id,
      date: g.date,
      hour: REMINDER_HOUR,
      title: titleFor(g.stage, g.vehicle),
      body: bodyFor(g.stage, g.items),
      vehicleId: g.vehicle.id,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, MAX_SCHEDULED_REMINDERS)
}
