import type { AttachmentKind, Renewal, RenewalKind } from '../../domain/types'
import { addMonths, daysBetween, type IsoDate } from '../../lib/date'
import { formatDay, formatLongDate } from '../../lib/format'

/** A renewal turns "due soon" a month ahead: enough time to book an inspection or compare quotes. */
export const RENEWAL_SOON_DAYS = 30

export type RenewalState = 'upcoming' | 'due-soon' | 'overdue'

interface KindInfo {
  label: string
  /** "Expires", "Renews", "Due": what happens on the date. */
  verb: string
  /** "Expired", "Was due to renew": the same once the date has passed. */
  pastVerb: string
  /** "expires", "is due": the verb inside a sentence, as a reminder says it. */
  phrase: string
  /** What to do before the date, for the reminder. */
  advice?: string
  /** How often it usually comes round, as the form's starting choice. */
  everyMonths?: number
  /** The kind of car document that goes with it, for the paperwork itself. */
  document?: AttachmentKind
}

const KINDS: Record<RenewalKind, KindInfo> = {
  registration: {
    label: 'Registration',
    verb: 'Expires',
    pastVerb: 'Expired',
    phrase: 'expires',
    advice: 'Renew it before then to avoid a late fee.',
    everyMonths: 12,
    document: 'registration',
  },
  inspection: {
    label: 'Safety inspection',
    verb: 'Due',
    pastVerb: 'Was due',
    phrase: 'is due',
    advice: 'Book it before then.',
    everyMonths: 12,
    document: 'inspection',
  },
  emissions: {
    label: 'Emissions test',
    verb: 'Due',
    pastVerb: 'Was due',
    phrase: 'is due',
    advice: 'Book it before then.',
    everyMonths: 24,
    document: 'inspection',
  },
  // Six-month policies are the most common in the US; the owner changes it for a yearly one.
  insurance: {
    label: 'Insurance',
    verb: 'Renews',
    pastVerb: 'Was due to renew',
    phrase: 'renews',
    advice: 'A good time to compare quotes.',
    everyMonths: 6,
    document: 'insurance',
  },
  other: { label: 'Other', verb: 'Due', pastVerb: 'Was due', phrase: 'is due' },
}

/** The choices for "what it is", in the order the form lists them. */
export const RENEWAL_KINDS: { kind: RenewalKind; label: string }[] = (
  Object.keys(KINDS) as RenewalKind[]
).map((kind) => ({ kind, label: KINDS[kind].label }))

/** The choices for "repeats". */
export const RENEWAL_REPEATS: { months: number | undefined; label: string }[] = [
  { months: undefined, label: 'Doesn’t repeat' },
  { months: 6, label: 'Every 6 months' },
  { months: 12, label: 'Every year' },
  { months: 24, label: 'Every 2 years' },
]

export const usualRepeat = (kind: RenewalKind): number | undefined => KINDS[kind].everyMonths

/** The kind of car document that goes with a renewal, if any. */
export const renewalDocumentKind = (kind: RenewalKind): AttachmentKind | undefined =>
  KINDS[kind].document

/** "Registration", or the owner's own name for an "other" one. */
export const renewalTitle = (r: Pick<Renewal, 'kind' | 'title'>): string =>
  r.title ?? KINDS[r.kind].label

/** "Every year", "Every 18 months", or undefined when it doesn't repeat. */
export const describeRepeat = (everyMonths: number | undefined): string | undefined => {
  if (everyMonths === undefined) return undefined
  const known = RENEWAL_REPEATS.find((r) => r.months === everyMonths)
  if (known) return known.label
  return everyMonths % 12 === 0 ? `Every ${everyMonths / 12} years` : `Every ${everyMonths} months`
}

export const renewalState = (r: Pick<Renewal, 'dueOn'>, today: IsoDate): RenewalState => {
  const days = daysBetween(today, r.dueOn)
  if (days < 0) return 'overdue'
  return days <= RENEWAL_SOON_DAYS ? 'due-soon' : 'upcoming'
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

/**
 * "Expires Mar 14, 2027", "Renews in 12 days, on Oct 30", "Due today", or "Expired 3 days ago, on
 * Oct 15" once the date has passed.
 */
export const describeRenewal = (r: Pick<Renewal, 'kind' | 'dueOn'>, today: IsoDate): string => {
  const info = KINDS[r.kind]
  const days = daysBetween(today, r.dueOn)
  const on = formatDay(r.dueOn, today)
  if (days < 0) {
    const ago = -days
    return `${info.pastVerb} ${ago === 1 ? 'yesterday' : `${plural(ago, 'day')} ago`}, on ${on}`
  }
  if (days === 0) return `${info.verb} today`
  if (days === 1) return `${info.verb} tomorrow`
  if (days <= RENEWAL_SOON_DAYS) return `${info.verb} in ${plural(days, 'day')}, on ${on}`
  return `${info.verb} ${on}`
}

/**
 * The next date after renewing: one period on from the date it was due, as a registration keeps
 * its anniversary. Renewed late, it steps on until the date is after today. Undefined when it
 * doesn't repeat, so the owner types the new date.
 */
export const nextDueOn = (
  r: Pick<Renewal, 'dueOn' | 'everyMonths'>,
  today: IsoDate,
): IsoDate | undefined => {
  if (r.everyMonths === undefined) return undefined
  let periods = 1
  let next = addMonths(r.dueOn, r.everyMonths)
  // From the original date each time, so Jan 31 stays the 31st after a short month.
  while (next <= today) next = addMonths(r.dueOn, r.everyMonths * ++periods)
  return next
}

/**
 * Reminder heads-ups a month and a week before the date, and one on the day: a month leaves time
 * to book an inspection or shop for insurance, and a week catches an owner who let it slide.
 */
export const RENEWAL_NOTICE_DAYS = [30, 7, 0] as const

/** "Registration expires in about a month, on Nov 17, 2026. Renew it before then to avoid a late fee." */
export const renewalReminder = (r: Pick<Renewal, 'kind' | 'title' | 'dueOn'>, days: number) => {
  const info = KINDS[r.kind]
  const title = renewalTitle(r)
  if (days === 0) return `${title} ${info.phrase} today.`
  const when = days >= 30 ? 'about a month' : 'a week'
  const sentence = `${title} ${info.phrase} in ${when}, on ${formatLongDate(r.dueOn)}.`
  return info.advice ? `${sentence} ${info.advice}` : sentence
}
