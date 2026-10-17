import type { Bulletin, BulletinKind, ComplaintSummary, MileageBand } from '../domain/types'
import { formatMiles } from './format'
import { componentLabel } from './nhtsa'

/** Complaint mileages are counted in bands this wide, from 0. The database uses the same width. */
export const MILEAGE_BAND = 10_000

/** A part of the car owners often reported trouble with around a given mileage. */
export interface NearbyIssue {
  /** NHTSA's component, upper case, such as "POWER TRAIN". */
  component: string
  /** Complaints about it in the window. */
  complaints: number
  /** Bulletins that name the same component. */
  bulletins: number
  /** True when one of them is a warranty extension or campaign, which may make the fix free. */
  covered: boolean
}

/** What owners of the model year reported around the car's mileage. */
export interface IssuesNearMileage {
  /** The window's lower edge: the start of the band the car is in. */
  from: number
  /** The window's upper edge, one band ahead of the car. */
  to: number
  /** Components with the most complaints in the window first. */
  issues: NearbyIssue[]
}

/** A component needs at least this many complaints in the window to be worth showing. */
export const MIN_NEARBY_COMPLAINTS = 2

/** NHTSA writes a few components with a qualifier after a comma; they count as the same part. */
const topLevel = (component: string) =>
  component.split(/[:,]/)[0]?.trim().toUpperCase() ?? component

// NHTSA names one part several ways ("ENGINE" and "ENGINE AND ENGINE COOLING", "FUEL SYSTEM,
// GASOLINE" and "FUEL/PROPULSION SYSTEM"), so parts are compared by their first word.
const family = (component: string) => topLevel(component).split(/[\s/]+/)[0] ?? ''

/**
 * True when two NHTSA components are the same part of the car, such as a bulletin's and a
 * complaint summary's. "Unknown or other" matches nothing.
 */
export const sameComponent = (a: string, b: string): boolean =>
  family(a) !== 'UNKNOWN' && family(a) === family(b)

const matchingBulletins = (bulletins: Bulletin[], component: string) => {
  const matching = bulletins.filter((b) => b.components.some((c) => sameComponent(c, component)))
  return { bulletins: matching.length, covered: matching.some(mayBeFree) }
}

const inWindow = (bands: MileageBand[], from: number, to: number) =>
  bands.filter((b) => b.from >= from && b.from < to).reduce((sum, b) => sum + b.complaints, 0)

/**
 * The components owners reported most around `miles`: in the band the car is in and the next one,
 * so a car at 88,000 miles sees what was reported between 80,000 and 100,000.
 */
export const issuesNearMileage = (
  summaries: ComplaintSummary[],
  bulletins: Bulletin[],
  miles: number,
  limit = 4,
): IssuesNearMileage => {
  const from = Math.floor(Math.max(0, miles) / MILEAGE_BAND) * MILEAGE_BAND
  const to = from + 2 * MILEAGE_BAND
  const issues = summaries
    .map((s) => ({
      component: s.component,
      complaints: inWindow(s.byMileage ?? [], from, to),
      ...matchingBulletins(bulletins, s.component),
    }))
    .filter((i) => i.complaints >= MIN_NEARBY_COMPLAINTS)
    .sort((a, b) => b.complaints - a.complaints || a.component.localeCompare(b.component))
    .slice(0, limit)
  return { from, to, issues }
}

/** True once any complaint of the model year has a known mileage. */
export const hasMileageData = (summaries: ComplaintSummary[]): boolean =>
  summaries.some((s) => (s.byMileage ?? []).some((b) => b.complaints > 0))

/** "80,000–100,000 mi". */
export const describeMileageWindow = (from: number, to: number): string =>
  `${from.toLocaleString('en-US')}–${formatMiles(to)}`

/**
 * The band most of a component's complaints with a mileage fall in, such as "60,000–70,000 mi",
 * when one stands out: it holds at least three complaints and more than any other band.
 */
export const peakMileage = (summary: ComplaintSummary): string | undefined => {
  const bands = [...(summary.byMileage ?? [])].sort((a, b) => b.complaints - a.complaints)
  const [top, next] = bands
  if (!top || top.complaints < 3 || (next && next.complaints === top.complaints)) return undefined
  return describeMileageWindow(top.from, top.from + MILEAGE_BAND)
}

// Warranty extensions can make a repair free and campaigns are free fixes, so they come first.
const KIND_ORDER: Record<BulletinKind, number> = {
  warranty: 0,
  campaign: 1,
  bulletin: 2,
  software: 3,
  emissions: 4,
  other: 5,
}

/** Warranty extensions and campaigns first, then newest first. */
export const byBulletinImportance = (a: Bulletin, b: Bulletin): number =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  (b.issuedOn ?? '').localeCompare(a.issuedOn ?? '') ||
  b.nhtsaId - a.nhtsaId

/** True for a bulletin that may make a repair free: a warranty extension or a service campaign. */
export const mayBeFree = (bulletin: Bulletin): boolean =>
  bulletin.kind === 'warranty' || bulletin.kind === 'campaign'

const KIND_LABELS: Record<BulletinKind, string> = {
  warranty: 'Warranty extension',
  campaign: 'Service campaign',
  bulletin: 'Service bulletin',
  software: 'Software update',
  emissions: 'Emissions',
  other: 'Notice',
}

/** "Service bulletin 19-047", or with NHTSA's number when the manufacturer's is not known. */
export const bulletinName = (bulletin: Bulletin): string =>
  `${KIND_LABELS[bulletin.kind]} ${bulletin.documentId ?? `#${bulletin.nhtsaId}`}`

/** The kind's label alone, such as "Warranty extension". */
export const bulletinKindLabel = (kind: BulletinKind): string => KIND_LABELS[kind]

// Kept in capitals when a summary is turned into sentence case.
const KEEP_UPPER =
  /^(?:ABS|AC|A\/C|ACC|AWD|BCM|CVT|DTC|DTCS|ECM|ECU|EGR|EPS|EV|EVAP|FWD|HVAC|LED|MIL|OBD|OTA|PCM|RWD|SRS|TCM|TPMS|TSB|VIN|VSA|[A-Z]?\d[A-Z\d-]*)$/

/**
 * Manufacturers often write bulletins in capitals. Mostly upper-case text becomes sentence case,
 * keeping acronyms and codes such as "P0420" and "4WD"; other text is left as written.
 */
export const readableSummary = (text: string): string => {
  const letters = text.replace(/[^A-Za-z]/g, '')
  const upper = letters.replace(/[^A-Z]/g, '').length
  if (letters.length === 0 || upper / letters.length < 0.6) return text.trim()
  const lowered = text
    .trim()
    .replace(/[A-Za-z0-9/-]+/g, (w) => (KEEP_UPPER.test(w) ? w : w.toLowerCase()))
  return lowered.replace(
    /(^|[.!?]\s+)([a-z])/g,
    (_, start: string, c: string) => start + c.toUpperCase(),
  )
}

const sentences = (bulletin: Bulletin) => readableSummary(bulletin.summary).split(/(?<=\.)\s+/)

/** The first sentence of a bulletin's summary, cut to a title's length. */
export const bulletinTitle = (bulletin: Bulletin): string => {
  const title = (sentences(bulletin)[0] ?? '').replace(/\.$/, '')
  if (title.length === 0) return componentLabel(bulletin.components[0] ?? 'Bulletin')
  return title.length > 90 ? `${title.slice(0, 87).trimEnd()}…` : title
}

/** The rest of a bulletin's summary after its title; empty when the title is all of it. */
export const bulletinBody = (bulletin: Bulletin): string => {
  const [first = '', ...rest] = sentences(bulletin)
  return first.replace(/\.$/, '').length > 90 ? readableSummary(bulletin.summary) : rest.join(' ')
}

/** Bulletins about one part of the car. */
export interface BulletinGroup {
  /** NHTSA's top-level component, upper case. */
  component: string
  /** Most important first (see `byBulletinImportance`). */
  bulletins: Bulletin[]
}

/** Groups bulletins by their first component, the groups with the most bulletins first. */
export const groupBulletins = (bulletins: Bulletin[]): BulletinGroup[] => {
  const groups = new Map<string, Bulletin[]>()
  for (const b of bulletins) {
    const component = topLevel(b.components[0] ?? 'UNKNOWN OR OTHER')
    groups.set(component, [...(groups.get(component) ?? []), b])
  }
  return [...groups]
    .map(([component, list]) => ({ component, bulletins: list.sort(byBulletinImportance) }))
    .sort(
      (a, b) => b.bulletins.length - a.bulletins.length || a.component.localeCompare(b.component),
    )
}
