import type {
  MaintenanceItem,
  OdometerReading,
  QuoteLine,
  Recall,
  ServiceRecord,
  Vehicle,
} from '../domain/types'
import { daysBetween, type IsoDate } from '../lib/date'
import { formatCents, formatDay, formatMiles } from '../lib/format'
import { isGeneralGuidance } from '../lib/schedule'
import { dueItemsFor } from '../reminders/getDueItems'
import type { DueProjection } from '../reminders/projectDue'
import {
  identifyServices,
  QUICK_CHECKS,
  UNSCHEDULED_SERVICES,
  WEAR_ITEMS,
  type ServiceKind,
} from './identifyService'

/**
 * What the app makes of one line of a shop's quote:
 * - `due`: the car's schedule says it is due now or very soon.
 * - `not-due`: on the schedule, but not due yet.
 * - `done`: on the schedule and in the service log recently enough that it is not due again.
 * - `severe-only`: due now only if the car followed the severe-duty schedule, which it does not.
 * - `not-scheduled`: not on the car's maintenance schedule at all.
 * - `condition`: a repair or a wear part, needed only if the shop can show it is worn or broken.
 * - `recall`: recall work, which is free.
 * - `no-record`: on the schedule, but the log has no record of it, so only the owner knows.
 * - `unknown`: the app cannot tell what the line is.
 */
export type QuoteVerdict =
  | 'due'
  | 'not-due'
  | 'done'
  | 'severe-only'
  | 'not-scheduled'
  | 'condition'
  | 'recall'
  | 'no-record'
  | 'unknown'

export interface CheckedLine {
  /** The line's position on the quote, from 0. */
  index: number
  text: string
  priceCents?: number | undefined
  verdict: QuoteVerdict
  /** A few words for the verdict, such as "Not due yet". */
  label: string
  /** Why, in a sentence or two, such as "Done Jul 1 at 30,000 mi. Next due at 35,000 mi." */
  detail: string
  /** True when the owner can reasonably say no to the line or ask for it to be justified. */
  questionable: boolean
}

/** A recall for the car's model year that the quote does not mention. */
export interface QuoteRecall {
  campaign: string
  /** "Electrical system: wiring", or the start of the summary when NHTSA names no component. */
  title: string
}

export interface QuoteCheck {
  lines: CheckedLine[]
  /** "3 of 7 lines aren't due" or "Everything here is due". */
  headline: string
  /** "$412.85 of $889.40 is worth questioning", when the questioned lines have prices. */
  savings?: string | undefined
  /** Recalls the quote does not mention, to ask about since their fixes are free. */
  recalls: QuoteRecall[]
  /** Scheduled work that is due now but missing from the quote. */
  alsoDue: string[]
  /** True when the car's schedule is general guidance rather than the manufacturer's. */
  generalSchedule: boolean
}

export interface QuoteCheckInput {
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'severeDuty'>
  items: MaintenanceItem[]
  records: ServiceRecord[]
  readings: OdometerReading[]
  recalls: Recall[]
  lines: QuoteLine[]
  today: IsoDate
}

/**
 * A shop recommends work at the visit, so anything due within this window counts as due now:
 * nobody should come back in three weeks for an oil change.
 */
export const QUOTE_DUE_WINDOW = { days: 45, miles: 1_000 }

const isDueNow = (due: DueProjection, currentMiles: number | undefined, today: IsoDate) =>
  due.status === 'overdue' ||
  (due.dueDate !== undefined && daysBetween(today, due.dueDate) <= QUOTE_DUE_WINDOW.days) ||
  (due.dueMiles !== undefined &&
    currentMiles !== undefined &&
    due.dueMiles - currentMiles <= QUOTE_DUE_WINDOW.miles)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "at 60,000 mi" or "in Mar 2027", whichever limit the projection says comes first. */
const describeNext = (due: DueProjection): string => {
  if (due.trigger === 'miles' && due.dueMiles !== undefined)
    return `at ${formatMiles(due.dueMiles)}`
  if (due.dueDate === undefined) return 'later'
  const [year, month] = due.dueDate.split('-').map(Number) as [number, number]
  return `in ${MONTHS[month - 1]} ${year}`
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Upper-case NHTSA components read better in sentence case: "Electrical system: wiring". */
const recallTitle = (recall: Recall) => {
  const component = recall.component?.split(':').slice(0, 2).join(':').toLowerCase()
  if (component) return sentence(component)
  const summary = recall.summary.split('. ')[0] ?? recall.summary
  return summary.length > 60 ? `${summary.slice(0, 57)}…` : summary
}

/** "24V123" for "24V-123", "24V123000" or "24v 123": how recalls are written varies. */
const recallKeys = (text: string) =>
  new Set(
    [...text.matchAll(/\b(\d{2})\s*-?\s*V\s*-?\s*(\d{3})(?:\s*-?\s*000)?\b/gi)].map(
      (m) => `${m[1]}V${m[2]}`,
    ),
  )

const recallKey = (recall: Recall) => [...recallKeys(recall.campaign)][0] ?? recall.campaign

const WEAR_DETAIL =
  'Replaced when worn, not on a schedule. Ask to see the measurement or the worn part.'

/**
 * Checks each line of a shop's quote against the car's own schedule, service log and recalls,
 * saying whether it is due, already done, severe-duty only, not on the schedule at all, or
 * something only the shop's inspection can justify.
 */
export const checkQuote = (input: QuoteCheckInput): QuoteCheck => {
  const { vehicle, items, records, readings, recalls, lines, today } = input
  const byKind = new Map(items.flatMap((i) => (i.kind ? [[i.kind, i] as const] : [])))

  const project = (item: MaintenanceItem, severeDuty: boolean) => {
    const summary = dueItemsFor({
      vehicle: { id: vehicle.id, severeDuty },
      items: [item],
      records,
      readings,
      today,
    })
    return { due: summary.items[0], currentMiles: summary.currentMiles }
  }

  const lastDone = (item: MaintenanceItem) =>
    records
      .filter((r) => r.itemId === item.id)
      .sort((a, b) => b.performedOn.localeCompare(a.performedOn))[0]

  /** True when the car is too new for an item's first interval to have come up, by miles and age. */
  const tooNewFor = (
    item: MaintenanceItem,
    currentMiles: number | undefined,
    severeDuty: boolean,
  ) => {
    const miles = (severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles
    const months = (severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths
    // A model year goes on sale the summer before, so this is the oldest the car can be.
    const maxAgeMonths = (Number(today.slice(0, 4)) - vehicle.year + 1) * 12
    const underMiles =
      miles === undefined ||
      (currentMiles !== undefined && currentMiles + QUOTE_DUE_WINDOW.miles < miles)
    const underTime = months === undefined || maxAgeMonths < months
    return (miles !== undefined || months !== undefined) && underMiles && underTime
  }

  const scheduled = (
    item: MaintenanceItem,
  ): Pick<CheckedLine, 'verdict' | 'label' | 'detail' | 'questionable'> => {
    const { due, currentMiles } = project(item, vehicle.severeDuty)
    if (!due)
      return {
        verdict: 'unknown',
        label: 'As needed',
        detail: `${item.task} has no set interval.`,
        questionable: false,
      }
    const last = lastDone(item)

    if (!last) {
      if (tooNewFor(item, currentMiles, vehicle.severeDuty)) {
        if (!vehicle.severeDuty && !tooNewFor(item, currentMiles, true))
          return {
            verdict: 'severe-only',
            label: 'Severe use only',
            detail: `Due by now only on the severe schedule, for towing, short trips or dusty roads. On your normal schedule it is first due ${describeNext(due)}.`,
            questionable: true,
          }
        return {
          verdict: 'not-due',
          label: 'Not due yet',
          detail: `First due ${describeNext(due)}${currentMiles !== undefined ? `. Your car is at about ${formatMiles(Math.round(currentMiles / 10) * 10)}` : ''}.`,
          questionable: true,
        }
      }
      return {
        verdict: 'no-record',
        label: 'No record',
        detail: `Your log has no record of it. If it was done elsewhere recently, it can wait; otherwise it is due.`,
        questionable: false,
      }
    }

    const doneOn = `Done ${formatDay(last.performedOn, today)}${last.odometerMiles !== undefined ? ` at ${formatMiles(last.odometerMiles)}` : ''}`
    if (isDueNow(due, currentMiles, today))
      return {
        verdict: 'due',
        label: due.status === 'overdue' ? 'Overdue' : 'Due now',
        detail: `${doneOn}, so it is due ${due.status === 'overdue' ? 'already' : 'about now'}.`,
        questionable: false,
      }

    if (!vehicle.severeDuty) {
      const severe = project(item, true)
      if (severe.due && isDueNow(severe.due, severe.currentMiles, today))
        return {
          verdict: 'severe-only',
          label: 'Severe use only',
          detail: `Due now only on the severe schedule, for towing, short trips or dusty roads. On your normal schedule it is next due ${describeNext(due)}.`,
          questionable: true,
        }
    }

    return {
      verdict: 'done',
      label: 'Done already',
      detail: `${doneOn}. Next due ${describeNext(due)}.`,
      questionable: true,
    }
  }

  type Judgement = Pick<CheckedLine, 'verdict' | 'label' | 'detail' | 'questionable'>

  const judgeKind = (
    kind: ServiceKind | undefined,
    text: string,
    priceCents: number | undefined,
  ): Judgement => {
    if (kind === 'recall') {
      const keys = recallKeys(text)
      const recall = recalls.find((r) => keys.has(recallKey(r)))
      return {
        verdict: 'recall',
        label: 'Recall',
        detail: `${recall ? `Recall ${recall.campaign}: ${recallTitle(recall)}. ` : ''}Recall fixes are free at any ${vehicle.make} dealer.`,
        questionable: priceCents !== undefined && priceCents > 0,
      }
    }
    if (kind === 'repair')
      return {
        verdict: 'condition',
        label: 'Repair',
        detail:
          'A fix for something the shop found, not maintenance. Ask what they found and to see it.',
        questionable: false,
      }
    if (kind === 'service-package')
      return {
        verdict: 'unknown',
        label: 'Package',
        detail: 'A bundle of several jobs. Ask the shop to list them, then check each one here.',
        questionable: false,
      }
    const item = kind ? byKind.get(kind) : undefined
    if (item) return scheduled(item)
    if (kind && kind in WEAR_ITEMS)
      return {
        verdict: 'condition',
        label: 'If worn',
        detail:
          kind === 'wheel-alignment'
            ? 'Needed when the car pulls or tires wear unevenly, not on a schedule. Ask to see the readings.'
            : kind === 'wheel-balance'
              ? 'Needed when new tires go on or the steering wheel shakes at speed, not on a schedule.'
              : WEAR_DETAIL,
        questionable: false,
      }
    if (kind && kind in QUICK_CHECKS)
      return {
        verdict: 'condition',
        label: 'Quick job',
        detail:
          'Most shops do this free or for a few dollars. Fine to say yes if the price is small.',
        questionable: false,
      }
    const unscheduled = kind ? UNSCHEDULED_SERVICES[kind] : undefined
    if (unscheduled)
      return {
        verdict: 'not-scheduled',
        label: 'Not on schedule',
        detail: unscheduled.why,
        questionable: true,
      }
    if (kind && items.length > 0)
      return {
        verdict: 'not-scheduled',
        label: 'Not on schedule',
        detail: 'Not on this car’s maintenance schedule. Ask the shop why it needs it.',
        questionable: true,
      }
    return {
      verdict: 'unknown',
      label: 'Can’t check',
      detail:
        'The app can’t match this to your schedule. Ask about it, or check your owner’s manual.',
      questionable: false,
    }
  }

  /** The name of one job on a line that lists several, such as "Tire rotation". */
  const nameOf = (kind: ServiceKind) =>
    byKind.get(kind)?.task ??
    WEAR_ITEMS[kind] ??
    QUICK_CHECKS[kind] ??
    UNSCHEDULED_SERVICES[kind]?.label ??
    sentence(kind.replace(/-/g, ' '))

  /**
   * A line naming several jobs is worth questioning only when every one of them is, so its price
   * never counts as questionable while part of it is due. It shows the verdict of the first job
   * that is needed, and each job's verdict in the detail.
   */
  const judge = (kinds: ServiceKind[], text: string, priceCents: number | undefined): Judgement => {
    const parts = kinds.map((kind) => ({ kind, ...judgeKind(kind, text, priceCents) }))
    const [first, second] = parts
    if (!first || !second) return judgeKind(kinds[0], text, priceCents)
    const needed = parts.find((p) => !p.questionable)
    const shown = needed ?? first
    return {
      verdict: shown.verdict,
      label: shown.label,
      detail: parts
        .map((p) => `${nameOf(p.kind)}: ${p.label.toLowerCase()}. ${p.detail}`)
        .join(' '),
      questionable: needed === undefined,
    }
  }

  const kinds = lines.map((l) => identifyServices(l.text))
  const checked = lines.map((line, index): CheckedLine => ({
    index,
    text: line.text,
    priceCents: line.priceCents,
    ...judge(kinds[index] ?? [], line.text, line.priceCents),
  }))

  const questioned = checked.filter((l) => l.questionable)
  const priced = (ls: CheckedLine[]) => ls.reduce((sum, l) => sum + (l.priceCents ?? 0), 0)
  const questionedCents = priced(questioned)
  const headline =
    checked.length === 0
      ? 'No lines to check'
      : questioned.length === 0
        ? 'Nothing here looks unneeded'
        : `${questioned.length} of ${checked.length} ${checked.length === 1 ? 'line isn’t' : 'lines aren’t'} needed now`

  const quoted = new Set(kinds.flat())
  const { items: due, currentMiles } = dueItemsFor({ vehicle, items, records, readings, today })
  const byId = new Map(items.map((i) => [i.id, i]))
  const alsoDue = due
    .filter((d) => !d.historyUnknown && isDueNow(d, currentMiles, today))
    .filter((d) => {
      const kind = byId.get(d.itemId)?.kind
      return kind === undefined || !quoted.has(kind)
    })
    .map((d) => d.task)

  const mentioned = recallKeys(lines.map((l) => l.text).join('\n'))
  return {
    lines: checked,
    headline,
    savings:
      questionedCents > 0
        ? `${formatCents(questionedCents)} of ${formatCents(priced(checked))} is worth questioning`
        : undefined,
    recalls: recalls
      .filter((r) => !mentioned.has(recallKey(r)))
      .map((r) => ({ campaign: r.campaign, title: recallTitle(r) })),
    alsoDue,
    generalSchedule: isGeneralGuidance(items),
  }
}
