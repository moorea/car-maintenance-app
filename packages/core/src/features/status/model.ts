import { createStore, type StoreApi } from 'zustand/vanilla'
import { daysBetween, type IsoDate } from '../../lib/date'
import { formatAgo, formatDay, formatMiles } from '../../lib/format'
import { createCarModel, type CarDeps, type CarState, type ScheduleRow } from '../car/model'
import { createSafetyModel, type SafetyDeps, type SafetyState } from '../safety/model'

/**
 * How things look at a glance:
 * - `attention`: something is overdue or a recall is open.
 * - `soon`: nothing needs the owner yet, but something is due soon.
 * - `good`: nothing is due.
 */
export type StatusLevel = 'attention' | 'soon' | 'good'

/**
 * What a ring segment or check stands for, which the app turns into a colour:
 * `attention` needs the owner, `soon` is due soon, `ok` is fine, `later` and `quiet` are neither.
 */
export type StatusTone = 'attention' | 'soon' | 'ok' | 'later' | 'quiet'

export interface StatusSegment {
  /** The schedule item or recall it stands for. */
  key: string
  tone: Extract<StatusTone, 'attention' | 'soon' | 'later'>
}

export interface StatusStat {
  /** "540", "Nov 14", "1" or "—". */
  value: string
  /** "mi to next", "open recall", "mi a month". */
  label: string
}

export interface StatusCheck {
  key: 'schedule' | 'recalls' | 'issues' | 'odometer'
  /** "Schedule". */
  title: string
  /** "1 overdue", "On track". */
  value: string
  tone: StatusTone
}

export interface StatusSummary {
  /** Overdue items plus open recalls: what needs the owner, shown in the ring's centre. */
  needYou: number
  /** One per schedule item with a known due point and per open recall, the most urgent first. */
  segments: StatusSegment[]
  /** What VoiceOver and TalkBack read for the ring: the count and what it is made of. */
  ringLabel: string
  level: StatusLevel
  /** "Needs attention", "Coming up" or "All good". */
  word: string
  /** One plain sentence saying why. */
  sentence: string
  /** What is next and when, open recalls, and miles a month. */
  stats: [StatusStat, StatusStat, StatusStat]
  checks: StatusCheck[]
}

/** The parts of the car model the status is read from. */
export type StatusCarInput = Pick<
  CarState,
  'status' | 'schedule' | 'miles' | 'milesPerMonth' | 'readOn' | 'error'
>

/** The parts of the safety model the status is read from. */
export type StatusSafetyInput = Pick<
  SafetyState,
  'status' | 'recalls' | 'bulletinsChecked' | 'extensions' | 'bulletinGroups'
>

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** "Tire rotation", "Tire rotation and brake fluid", or "3 items", for a sentence about them. */
const nameItems = (rows: ScheduleRow[]): string => {
  const [first, second] = rows
  if (!first) return ''
  if (rows.length === 1) return first.task
  if (rows.length === 2 && second) return `${first.task} and ${second.task.toLowerCase()}`
  return `${rows.length} items`
}

const isAre = (rows: ScheduleRow[]) => (rows.length === 1 ? 'is' : 'are')

/** Miles left until a row is due, rounded as the car's estimated odometer is; undefined by date. */
const milesLeft = (row: ScheduleRow, miles: number | undefined): number | undefined =>
  row.trigger === 'miles' && row.dueMiles !== undefined && miles !== undefined
    ? Math.max(0, roundTo(row.dueMiles - miles, 10))
    : undefined

/** "in 540 mi" or "on Nov 14", for when a row is next due; empty when that can't be told. */
const when = (row: ScheduleRow, miles: number | undefined, today: IsoDate): string => {
  const left = milesLeft(row, miles)
  if (left !== undefined) return `in ${formatMiles(left)}`
  return row.dueDate ? `on ${formatDay(row.dueDate, today)}` : ''
}

const SEGMENT_ORDER: Record<ScheduleRow['status'], number> = {
  overdue: 0,
  'due-soon': 1,
  upcoming: 2,
  unknown: 3,
}

const SEGMENT_TONE = {
  overdue: 'attention',
  'due-soon': 'soon',
  upcoming: 'later',
} as const

/**
 * The one-glance health of a car, from what its page already shows: the schedule and odometer
 * from the car model, and recalls and bulletins from the safety model.
 */
export const describeStatus = (
  car: StatusCarInput,
  safety: StatusSafetyInput,
  today: IsoDate,
): StatusSummary => {
  const rows = car.schedule
  const overdue = rows.filter((r) => r.status === 'overdue')
  const soon = rows.filter((r) => r.status === 'due-soon')
  const unknown = rows.filter((r) => r.status === 'unknown')
  const next = rows.find((r) => r.status === 'due-soon' || r.status === 'upcoming')
  // Until NHTSA has been asked, no recall is counted rather than claiming there are none.
  const recallsKnown = safety.status === 'ready'
  const recalls = recallsKnown ? safety.recalls : []
  const needYou = overdue.length + recalls.length

  const segments: StatusSegment[] = [
    ...recalls.map((r) => ({ key: `recall:${r.id}`, tone: 'attention' as const })),
    ...rows
      .filter((r) => r.status !== 'unknown')
      .sort((a, b) => SEGMENT_ORDER[a.status] - SEGMENT_ORDER[b.status])
      .map((r) => ({ key: r.itemId, tone: SEGMENT_TONE[r.status as keyof typeof SEGMENT_TONE] })),
  ]

  const level: StatusLevel = needYou > 0 ? 'attention' : soon.length > 0 ? 'soon' : 'good'
  const word = { attention: 'Needs attention', soon: 'Coming up', good: 'All good' }[level]

  return {
    needYou,
    segments,
    ringLabel: ringLabel(overdue.length, recalls.length, soon.length),
    level,
    word,
    sentence: sentence({ overdue, soon, unknown, next, recalls: recalls.length, car, today }),
    stats: [
      nextStat(next, car.miles, today, unknown.length > 0),
      {
        value: recallsKnown ? String(recalls.length) : '—',
        label: plural(recalls.length, 'open recall', 'open recalls'),
      },
      {
        value:
          car.milesPerMonth === undefined
            ? '—'
            : roundTo(car.milesPerMonth, 10).toLocaleString('en-US'),
        label: 'mi a month',
      },
    ],
    checks: [
      scheduleCheck(car, overdue.length, soon.length, unknown.length),
      recallsCheck(safety, recalls.length),
      issuesCheck(safety),
      odometerCheck(car, today),
    ],
  }
}

const ringLabel = (overdue: number, recalls: number, soon: number): string => {
  const parts = [
    overdue > 0 ? `${overdue} ${plural(overdue, 'item', 'items')} overdue` : undefined,
    recalls > 0 ? `${recalls} open ${plural(recalls, 'recall', 'recalls')}` : undefined,
  ].filter(Boolean)
  const soonNote = soon > 0 ? ` ${soon} due soon.` : ''
  const n = overdue + recalls
  if (n === 0) return `Nothing needs you right now.${soonNote}`
  return `${n} ${plural(n, 'thing needs', 'things need')} you: ${parts.join(' and ')}.${soonNote}`
}

const sentence = ({
  overdue,
  soon,
  unknown,
  next,
  recalls,
  car,
  today,
}: {
  overdue: ScheduleRow[]
  soon: ScheduleRow[]
  unknown: ScheduleRow[]
  next: ScheduleRow | undefined
  recalls: number
  car: StatusCarInput
  today: IsoDate
}): string => {
  const recallClause =
    recalls === 0
      ? ''
      : recalls === 1
        ? "there's an open recall"
        : `there are ${recalls} open recalls`
  if (overdue.length > 0 || recalls > 0) {
    const first =
      overdue.length > 0
        ? `${nameItems(overdue)} ${isAre(overdue)} overdue${recallClause ? ` and ${recallClause}` : ''}.`
        : `${capitalize(recallClause)}.`
    const rest =
      soon.length > 0
        ? `${nameItems(soon)} ${isAre(soon)} due soon.`
        : overdue.length < car.schedule.length
          ? 'Everything else is on track.'
          : ''
    return [first, rest].filter(Boolean).join(' ')
  }
  if (soon.length > 0) {
    const [only] = soon
    const timing = soon.length === 1 && only ? when(only, car.miles, today) : ''
    return `${nameItems(soon)} ${isAre(soon)} due soon${timing ? `, ${timing}` : ''}.`
  }
  if (car.schedule.length === 0) return "There's no maintenance schedule for this car yet."
  if (next) {
    const timing = when(next, car.miles, today)
    return `Nothing is due right now. ${next.task} is next${timing ? `, ${timing}` : ''}.`
  }
  if (unknown.length > 0)
    return 'Nothing is due by date. Add an odometer reading to see what is due by mileage.'
  return 'Nothing is due right now.'
}

const nextStat = (
  next: ScheduleRow | undefined,
  miles: number | undefined,
  today: IsoDate,
  needsMiles: boolean,
): StatusStat => {
  if (!next) return { value: '—', label: needsMiles ? 'needs miles' : 'nothing due' }
  const left = milesLeft(next, miles)
  if (left !== undefined) return { value: left.toLocaleString('en-US'), label: 'mi to next' }
  return next.dueDate
    ? { value: formatDay(next.dueDate, today), label: 'next due' }
    : { value: '—', label: 'next due' }
}

const scheduleCheck = (
  car: StatusCarInput,
  overdue: number,
  soon: number,
  unknown: number,
): StatusCheck => {
  const check = (value: string, tone: StatusTone): StatusCheck => ({
    key: 'schedule',
    title: 'Schedule',
    value,
    tone,
  })
  if (car.error) return check("Couldn't load", 'quiet')
  if (overdue > 0) return check(`${overdue} overdue`, 'attention')
  if (soon > 0) return check(`${soon} due soon`, 'soon')
  if (car.schedule.length === 0) return check('No schedule yet', 'quiet')
  if (unknown === car.schedule.length) return check('Needs your mileage', 'quiet')
  return check('On track', 'ok')
}

const recallsCheck = (safety: StatusSafetyInput, open: number): StatusCheck => {
  const check = (value: string, tone: StatusTone): StatusCheck => ({
    key: 'recalls',
    title: 'Recalls',
    value,
    tone,
  })
  if (safety.status !== 'ready') return check('Checking…', 'quiet')
  return open > 0 ? check(`${open} open`, 'attention') : check('None open', 'ok')
}

const issuesCheck = (safety: StatusSafetyInput): StatusCheck => {
  const check = (value: string, tone: StatusTone): StatusCheck => ({
    key: 'issues',
    title: 'Known issues',
    value,
    tone,
  })
  if (!safety.bulletinsChecked) return check('Checking…', 'quiet')
  const count =
    safety.extensions.length + safety.bulletinGroups.reduce((n, g) => n + g.bulletins.length, 0)
  if (count === 0) return check('None found', 'ok')
  return check(`${count} ${plural(count, 'bulletin', 'bulletins')}`, 'quiet')
}

/** A reading older than this is worth updating, so its check is no longer `ok`. */
const STALE_READING_DAYS = 30

const odometerCheck = (car: StatusCarInput, today: IsoDate): StatusCheck => {
  const check = (value: string, tone: StatusTone): StatusCheck => ({
    key: 'odometer',
    title: 'Odometer',
    value,
    tone,
  })
  if (!car.readOn) return check('No reading yet', 'soon')
  const stale = daysBetween(car.readOn, today) > STALE_READING_DAYS
  return check(`Updated ${formatAgo(car.readOn, today)}`, stale ? 'soon' : 'ok')
}

export interface StatusState {
  /** `loading` until the schedule has been read; `unmatched` before the car's config syncs. */
  status: 'loading' | 'unmatched' | 'ready'
  /** "2021 Toyota RAV4". */
  title: string
  /** Present once ready. */
  summary?: StatusSummary | undefined
}

export interface StatusActions {
  start: () => void
  dispose: () => void
}

export type StatusModel = StoreApi<StatusState & StatusActions>

export type StatusDeps = CarDeps & SafetyDeps

/**
 * Screen model for a car's one-glance status. Reads the same car and safety models as the car's
 * page, so it never disagrees with it, and describes them with `describeStatus`.
 */
export const createStatusModel = (deps: StatusDeps): StatusModel => {
  const car = createCarModel(deps)
  const safety = createSafetyModel(deps)
  const stops: (() => void)[] = []

  return createStore<StatusState & StatusActions>()((set) => {
    const show = () => {
      const c = car.getState()
      const s = safety.getState()
      if (c.status !== 'ready') {
        set({ status: c.status, summary: undefined })
        return
      }
      set({ status: 'ready', summary: describeStatus(c, s, deps.clock.today()) })
    }

    return {
      status: 'loading',
      title: car.getState().title,

      start: () => {
        if (stops.length > 0) return
        stops.push(car.subscribe(show), safety.subscribe(show))
        car.getState().start()
        safety.getState().start()
        show()
      },

      dispose: () => {
        for (const stop of stops.splice(0)) stop()
        car.getState().dispose()
        safety.getState().dispose()
      },
    }
  })
}
