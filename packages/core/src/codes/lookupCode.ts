import type { ComplaintSummary, Recall } from '../domain/types'
import { TROUBLE_CODES, type CodeUrgency } from './troubleCodes'

export type { CodeUrgency } from './troubleCodes'

/** The most codes looked up at once; a scan rarely shows more. */
export const MAX_CODES = 8

const CODE = /^[PBCU][0-3][0-9A-F]{3}$/
const BARE_CODE = /^[0-3][0-9A-F]{3}$/

/** Words with a digit that people type around codes. */
const IGNORED = new Set(['OBD2', 'OBDII', 'OBD1'])

export type ParsedCodes = { codes: string[]; invalid: string[] }

/**
 * Reads trouble codes from what the owner typed, such as "p0420, P0171" or "P 0300". A bare
 * four-character code ("0420") is taken as an engine code, which is what a scan usually shows.
 * Bare numbers are ignored when a lettered code is typed too, so "2019 Camry P0420" reads P0420.
 * Words are ignored, so "OBD2 code P0420" works; anything else with a digit in it is invalid.
 */
export const parseCodes = (text: string): ParsedCodes => {
  const tokens = text
    .toUpperCase()
    // "P 0420" and "P-0420" are one code.
    .replace(/\b([PBCU])[\s-]+(?=[0-3][0-9A-F]{3}\b)/g, '$1')
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 0)
  // With a lettered code typed, a bare number is something else, such as a model year.
  const bareAllowed = !tokens.some((t) => CODE.test(t))
  const codes: string[] = []
  const invalid: string[] = []
  for (const token of tokens) {
    if (IGNORED.has(token) || (!bareAllowed && /^[0-9]+$/.test(token))) continue
    const code = CODE.test(token)
      ? token
      : bareAllowed && BARE_CODE.test(token)
        ? `P${token}`
        : undefined
    if (code) {
      if (!codes.includes(code)) codes.push(code)
    } else if (/[0-9]/.test(token) && !invalid.includes(token)) invalid.push(token)
  }
  return { codes, invalid }
}

/** The broad area a code is about, from its letter and, for engine codes, its third character. */
export type CodeSystem =
  | 'fuel-air'
  | 'ignition'
  | 'emissions'
  | 'idle-speed'
  | 'cooling'
  | 'charging'
  | 'computer'
  | 'transmission'
  | 'hybrid'
  | 'powertrain'
  | 'body'
  | 'chassis'
  | 'network'

const SYSTEMS: Record<CodeSystem, { label: string; components: string[] }> = {
  'fuel-air': { label: 'Fuel and air', components: ['FUEL', 'ENGINE'] },
  ignition: { label: 'Ignition and misfires', components: ['ENGINE'] },
  emissions: { label: 'Emissions', components: ['EXHAUST', 'EMISSION', 'FUEL'] },
  'idle-speed': { label: 'Speed and idle', components: ['ENGINE', 'VEHICLE SPEED CONTROL'] },
  cooling: { label: 'Cooling', components: ['ENGINE COOLING', 'ENGINE'] },
  charging: { label: 'Battery and charging', components: ['ELECTRICAL SYSTEM'] },
  computer: { label: 'Engine computer', components: ['ENGINE', 'ELECTRICAL SYSTEM'] },
  transmission: { label: 'Transmission', components: ['POWER TRAIN'] },
  hybrid: { label: 'Hybrid system', components: ['HYBRID', 'ELECTRICAL SYSTEM'] },
  powertrain: { label: 'Engine', components: ['ENGINE', 'POWER TRAIN'] },
  body: { label: 'Body', components: ['AIR BAGS', 'SEAT BELTS', 'ELECTRICAL SYSTEM'] },
  chassis: {
    label: 'Brakes, steering and suspension',
    components: ['SERVICE BRAKES', 'STEERING', 'SUSPENSION', 'ELECTRONIC STABILITY'],
  },
  network: { label: 'Module communication', components: ['ELECTRICAL SYSTEM'] },
}

/** An engine code's area, by its third character (SAE J2012). */
const ENGINE_SYSTEMS: Record<string, CodeSystem> = {
  '0': 'fuel-air',
  '1': 'fuel-air',
  '2': 'fuel-air',
  '3': 'ignition',
  '4': 'emissions',
  '5': 'idle-speed',
  '6': 'computer',
  '7': 'transmission',
  '8': 'transmission',
  '9': 'transmission',
  A: 'fuel-air',
}

/** P0A, P0B and P0C codes are the hybrid system's; P2A codes are fuel and air metering. */
const HYBRID = /^P0[ABC]/

const systemOf = (code: string): CodeSystem => {
  const letter = code[0]
  if (letter === 'B') return 'body'
  if (letter === 'C') return 'chassis'
  if (letter === 'U') return 'network'
  if (HYBRID.test(code)) return 'hybrid'
  // P3400 to P39FF are cylinder deactivation, an engine system of its own.
  if (code[1] === '3') return 'powertrain'
  return ENGINE_SYSTEMS[code[2] ?? ''] ?? 'powertrain'
}

/**
 * Whether a code means the same on every car (SAE) or is the manufacturer's own. P1, B1, B2, C1,
 * C2, U1 and U2 codes are the manufacturer's, and so are P3000 to P33FF.
 */
const isGeneric = (code: string): boolean => {
  const second = code[1]
  if (second === '1') return false
  if (code[0] === 'P') return second === '3' ? code[2] !== undefined && code[2] >= '4' : true
  return second === '0' || second === '3'
}

/** How urgent an unlisted code probably is, by its area. */
const FALLBACK_URGENCY: Record<CodeSystem, CodeUrgency> = {
  'fuel-air': 'soon',
  ignition: 'soon',
  emissions: 'later',
  'idle-speed': 'soon',
  cooling: 'soon',
  charging: 'soon',
  computer: 'soon',
  transmission: 'soon',
  hybrid: 'soon',
  powertrain: 'soon',
  body: 'soon',
  chassis: 'soon',
  network: 'soon',
}

const FALLBACK_TIP: Partial<Record<CodeSystem, string>> = {
  body: 'Body codes are often about airbags or seat belts. If the airbag light is on, have it checked soon: the airbags may not deploy.',
  chassis:
    'Chassis codes are usually about ABS, stability control or steering. The brakes still work, but ABS may not.',
}

/** What one trouble code means for the owner's car. */
export interface CodeLookup {
  code: string
  /** True when the code is in the app's list; otherwise it is described from its structure. */
  known: boolean
  /** True when the code means the same on every car; false when it is the manufacturer's own. */
  generic: boolean
  title: string
  system: CodeSystem
  /** "Emissions", for the line under the title. */
  systemLabel: string
  urgency: CodeUrgency
  causes: string[]
  tip?: string | undefined
  /** Set when the part is likely still under the federal emissions warranty. */
  warranty?: string | undefined
  /** Recalls for the model year about the same part of the car. */
  recalls: Recall[]
  /** Owner complaints for the model year about the same part of the car, most first. */
  complaints: ComplaintSummary[]
}

export interface LookupContext {
  make: string
  /** The car's model year, to tell whether the emissions warranty may still apply. */
  year: number
  /** The year today, from the clock. */
  currentYear: number
  /** The latest odometer reading, if any. */
  miles?: number | undefined
  recalls: Recall[]
  complaints: ComplaintSummary[]
}

/** The federal emissions warranty on catalytic converters and engine computers. */
const EMISSIONS_WARRANTY_YEARS = 8
const EMISSIONS_WARRANTY_MILES = 80_000

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'An' : 'A')

const matchesComponent = (component: string | undefined, words: string[]) =>
  component !== undefined && words.some((w) => component.toUpperCase().includes(w))

/** Describes one code for the car, with the recalls and complaints about the same part. */
export const lookupCode = (code: string, ctx: LookupContext): CodeLookup => {
  const entry = TROUBLE_CODES[code]
  const system = entry?.system ?? systemOf(code)
  const generic = isGeneric(code)
  const words = entry?.components ?? SYSTEMS[system].components
  const recalls = ctx.recalls.filter((r) => matchesComponent(r.component, words))
  const complaints = ctx.complaints
    .filter((c) => matchesComponent(c.component, words))
    .sort((a, b) => b.complaints - a.complaints)
    .slice(0, 3)
  const covered =
    entry?.emissionsWarranty &&
    ctx.currentYear - ctx.year < EMISSIONS_WARRANTY_YEARS &&
    (ctx.miles === undefined || ctx.miles < EMISSIONS_WARRANTY_MILES)
  const warranty = covered
    ? `Federal law covers this part for 8 years or 80,000 miles from when the car was first sold. On a ${ctx.year} car it may still be covered, so ask a ${ctx.make} dealer before paying for it.`
    : undefined
  const common = { code, generic, system, systemLabel: SYSTEMS[system].label, recalls, complaints }
  if (entry) {
    return {
      ...common,
      known: true,
      title: entry.title,
      urgency: entry.urgency,
      causes: entry.causes,
      tip: entry.tip,
      warranty,
    }
  }
  const label = SYSTEMS[system].label.toLowerCase()
  return {
    ...common,
    known: false,
    title: generic
      ? `${article(label)} ${label} code`
      : `${article(ctx.make)} ${ctx.make} ${code[0] === 'P' ? 'engine' : label} code`,
    urgency: FALLBACK_URGENCY[system],
    causes: [],
    tip:
      FALLBACK_TIP[system] ??
      (generic
        ? 'This code isn’t in our list yet. Ask can explain it for your car.'
        : `Its meaning is specific to ${ctx.make}. Ask can explain it, or a ${ctx.make} dealer can look it up.`),
  }
}

const RANK: Record<CodeUrgency, number> = { later: 0, soon: 1, stop: 2 }

/** The most urgent of several urgencies; `later` when there are none. */
export const mostUrgent = (urgencies: CodeUrgency[]): CodeUrgency =>
  urgencies.reduce<CodeUrgency>((top, u) => (RANK[u] > RANK[top] ? u : top), 'later')
