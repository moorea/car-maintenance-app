import { addDays, type IsoDate } from '../lib/date'
import type { MileageEstimate } from './mileage'
import { DUE_SOON_DAYS, type DueProjection } from './projectDue'

/**
 * A reading is worth asking for from this many days before a mileage-due item: a week ahead of
 * the two-week heads-up, so the heads-up itself lands on the right day.
 */
export const CHECK_IN_LEAD_DAYS = DUE_SOON_DAYS + 7

/** The last day a check-in notification may arrive, this many days before the item is due. */
export const CHECK_IN_LAST_DAYS = 7

/**
 * A reading this old has drifted enough to move a reminder by days: driving 10% more than the
 * learned pace at the US average is about 110 miles a month, three days of driving.
 */
export const STALE_READING_DAYS = 30

/** Until two readings teach the car's own pace, the rate is the US average, so ask sooner. */
export const STALE_DEFAULT_DAYS = 14

export interface OdometerCheckIn {
  itemId: string
  task: string
  dueMiles: number
  /** The projected date the car reaches `dueMiles`. */
  dueDate: IsoDate
  /** The date of the newest reading the projection rests on. */
  readOn: IsoDate
  /** The first day a reading is worth asking for: in the lead-up, once the reading is stale. */
  from: IsoDate
}

/**
 * Whether the owner should be asked for an odometer reading, and about which item. Asks only when
 * a reading would change a reminder: an item the car reaches by mileage rather than time is
 * coming up (or estimated just past), and its date rests on a reading that will by then be old
 * enough (or a pace guessed enough) to be off by days. Absent otherwise, so owners are never
 * nagged on a schedule.
 */
export const odometerCheckIn = (
  due: readonly DueProjection[],
  mileage: Pick<MileageEstimate, 'isDefault' | 'latest'>,
): OdometerCheckIn | undefined => {
  const { latest } = mileage
  if (!latest) return undefined
  const stale = addDays(latest.date, mileage.isDefault ? STALE_DEFAULT_DAYS : STALE_READING_DAYS)
  // Soonest first, so the check-in is about the next reminder a reading would move. An item a
  // reading has already passed is surely due; one only estimated past its mileage may not be.
  const unsure = [...due]
    .filter((d) => d.trigger === 'miles' && d.dueMiles !== undefined && d.dueMiles > latest.miles)
    .sort((a, b) => (a.dueDate ?? '￿').localeCompare(b.dueDate ?? '￿'))
  for (const d of unsure) {
    if (d.dueDate === undefined || d.dueMiles === undefined) continue
    const lead = addDays(d.dueDate, -CHECK_IN_LEAD_DAYS)
    const from = lead > stale ? lead : stale
    // A reading that stays fresh until the item is due already keeps its reminders on time.
    if (from > d.dueDate) continue
    return {
      itemId: d.itemId,
      task: d.task,
      dueMiles: d.dueMiles,
      dueDate: d.dueDate,
      readOn: latest.date,
      from,
    }
  }
  return undefined
}

/**
 * Whether to show the check-in in the app today: from its first day until a reading arrives, as
 * an item estimated to be overdue may not be due yet.
 */
export const checkInShowing = (checkIn: OdometerCheckIn | undefined, today: IsoDate): boolean =>
  checkIn !== undefined && checkIn.from <= today

/**
 * The day to send the check-in as a notification, once: its first day, if that is still ahead and
 * at least CHECK_IN_LAST_DAYS before the item is due. Once the day has come the app shows it
 * instead, so an owner who has not got to the car yet is not asked again every morning.
 */
export const checkInNoticeDate = (checkIn: OdometerCheckIn, today: IsoDate): IsoDate | undefined =>
  checkIn.from > today && checkIn.from <= addDays(checkIn.dueDate, -CHECK_IN_LAST_DAYS)
    ? checkIn.from
    : undefined
