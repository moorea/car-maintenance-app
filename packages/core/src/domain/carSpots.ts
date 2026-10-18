import { identifyService } from '../quotes/identifyService'
import type { DueStatus } from '../reminders/projectDue'

/**
 * Where on the car a service item or recall is, for pinning it to the drawing of the car. Coarse
 * on purpose: the drawing is a generic body (ADR 0022), so a pin says "under the hood", not
 * "the PCV valve".
 */
export type CarSpot = 'hood' | 'wheels' | 'cabin' | 'glass' | 'lights' | 'underbody' | 'body'

/** Spots in the order the Car screen lists them, with their names. */
export const CAR_SPOTS: readonly { id: CarSpot; label: string }[] = [
  { id: 'hood', label: 'Under the hood' },
  { id: 'wheels', label: 'Wheels, tires and brakes' },
  { id: 'underbody', label: 'Underneath' },
  { id: 'cabin', label: 'Inside' },
  { id: 'glass', label: 'Glass and wipers' },
  { id: 'lights', label: 'Lights' },
  { id: 'body', label: 'Body and doors' },
]

const SPOT_OF_KIND: Record<string, CarSpot> = {
  'engine-oil': 'hood',
  'engine-air-filter': 'hood',
  'engine-coolant': 'hood',
  'engine-flush': 'hood',
  'spark-plugs': 'hood',
  'timing-belt': 'hood',
  'serpentine-belt': 'hood',
  'brake-fluid': 'hood',
  'power-steering-fluid': 'hood',
  'fuel-system-cleaning': 'hood',
  'ac-service': 'hood',
  battery: 'hood',
  'battery-test': 'hood',
  'battery-terminals': 'hood',
  'tire-rotation': 'wheels',
  'tire-pressure': 'wheels',
  tires: 'wheels',
  'nitrogen-fill': 'wheels',
  'wheel-alignment': 'wheels',
  'wheel-balance': 'wheels',
  'brake-inspection': 'wheels',
  'brake-pads': 'wheels',
  'brake-rotors': 'wheels',
  shocks: 'wheels',
  'transmission-fluid': 'underbody',
  'differential-fluid': 'underbody',
  'transfer-case-fluid': 'underbody',
  'fuel-filter': 'underbody',
  'hybrid-battery': 'underbody',
  'cabin-air-filter': 'cabin',
  'wiper-blades': 'glass',
  bulbs: 'lights',
  'headlight-restoration': 'lights',
  corrosion: 'body',
}

// Names the quote patterns would place wrongly: "Brake light bulb" is a light, not a brake, and
// a hybrid's battery sits underneath, not under the hood.
const SPOT_OF_NAME: [RegExp, CarSpot][] = [
  [/\bhybrid\b|\btraction\b|high[\s-]?voltage/i, 'underbody'],
  [/\bbulbs?\b|\blights?\b|\blamps?\b/i, 'lights'],
]

/**
 * Where a schedule item is on the car, from its kind, or for an item without one (such as one
 * the owner added) from its name. Undefined for one that is nowhere in particular, such as an
 * inspection of the whole car: it stays in the Service list only.
 */
export const spotOfItem = (item: {
  kind?: string | undefined
  task: string
}): CarSpot | undefined =>
  SPOT_OF_KIND[item.kind ?? ''] ??
  SPOT_OF_NAME.find(([pattern]) => pattern.test(item.task))?.[1] ??
  SPOT_OF_KIND[identifyService(item.task) ?? '']

// NHTSA's top-level components, before any ":", matched from the start.
const SPOT_OF_COMPONENT: [RegExp, CarSpot][] = [
  [/^(ENGINE|COOLING)/, 'hood'],
  [/^(SERVICE BRAKES|PARKING BRAKE|TIRES|WHEELS|SUSPENSION|STEERING)/, 'wheels'],
  [/^(POWER TRAIN|FUEL SYSTEM|EXHAUST|HYBRID PROPULSION)/, 'underbody'],
  [/^EXTERIOR LIGHTING/, 'lights'],
  [/^VISIBILITY/, 'glass'],
  [/^(STRUCTURE|LATCHES|TRAILER)/, 'body'],
  [
    /^(AIR BAGS|SEAT BELTS|SEATS|CHILD SEAT|ELECTRICAL|ELECTRONIC STABILITY|VEHICLE SPEED CONTROL|BACK OVER|FORWARD COLLISION|LANE DEPARTURE|COMMUNICATION|EQUIPMENT)/,
    'cabin',
  ],
]

/**
 * Where a recall or complaint is on the car, from NHTSA's component such as "SERVICE BRAKES,
 * HYDRAULIC: ANTILOCK". A recall naming several components is placed by the first.
 */
export const spotOfComponent = (component: string | undefined): CarSpot | undefined => {
  const named = component?.split(';')[0]?.trim().toUpperCase() ?? ''
  // An electric car's battery is underneath and a 12-volt one under the hood, though NHTSA files
  // both under the electrical system.
  if (/^ELECTRICAL/.test(named)) {
    if (/TRACTION|PROPULSION|HIGH VOLTAGE/.test(named)) return 'underbody'
    if (/12V|BATTERY/.test(named)) return 'hood'
  }
  const first = named.split(':')[0]?.trim() ?? ''
  return first ? SPOT_OF_COMPONENT.find(([pattern]) => pattern.test(first))?.[1] : undefined
}

/** How much a spot needs the owner, worst first. */
export type SpotAttention = 'recall' | 'overdue' | 'due-soon' | 'fine'

/** A pin on the drawing of the car: one spot, with what is there. */
export interface CarHotspot {
  spot: CarSpot
  label: string
  attention: SpotAttention
  /** Schedule items here, most urgent first. */
  itemIds: string[]
  recallIds: string[]
  /** "1 recall · 2 overdue", "Due soon: Oil change", "3 items, none due". */
  summary: string
}

const RANK: Record<DueStatus, number> = { overdue: 0, 'due-soon': 1, upcoming: 2, unknown: 3 }

/**
 * The pins for the drawing of the car: a spot for every place with a schedule item or an open
 * recall, in the order of `CAR_SPOTS`. Items and recalls with no spot are left out; the Service
 * list still shows them.
 */
export const carHotspots = (
  items: readonly { itemId: string; task: string; status: DueStatus; spot?: CarSpot | undefined }[],
  recalls: readonly { id: string; spot?: CarSpot | undefined }[],
): CarHotspot[] =>
  CAR_SPOTS.flatMap(({ id: spot, label }) => {
    const here = items
      .filter((i) => i.spot === spot)
      .sort((a, b) => RANK[a.status] - RANK[b.status])
    const recallIds = recalls.filter((r) => r.spot === spot).map((r) => r.id)
    if (here.length === 0 && recallIds.length === 0) return []
    const overdue = here.filter((i) => i.status === 'overdue')
    const dueSoon = here.filter((i) => i.status === 'due-soon')
    const attention: SpotAttention =
      recallIds.length > 0
        ? 'recall'
        : overdue.length > 0
          ? 'overdue'
          : dueSoon.length > 0
            ? 'due-soon'
            : 'fine'
    return [
      {
        spot,
        label,
        attention,
        itemIds: here.map((i) => i.itemId),
        recallIds,
        summary: summarize(
          recallIds.length,
          overdue,
          dueSoon,
          here.filter((i) => i.status === 'upcoming').length,
          here.length,
        ),
      },
    ]
  })

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const summarize = (
  recalls: number,
  overdue: readonly { task: string }[],
  dueSoon: readonly { task: string }[],
  upcoming: number,
  items: number,
): string => {
  const unknown = items - overdue.length - dueSoon.length - upcoming
  const parts = [
    recalls > 0 ? plural(recalls, 'open recall', 'open recalls') : undefined,
    overdue.length === 1 && recalls === 0 ? `Overdue: ${overdue[0]?.task}` : undefined,
    overdue.length > 1 || (overdue.length === 1 && recalls > 0)
      ? `${overdue.length} overdue`
      : undefined,
    dueSoon.length === 1 && recalls === 0 && overdue.length === 0
      ? `Due soon: ${dueSoon[0]?.task}`
      : undefined,
    dueSoon.length > 1 || (dueSoon.length === 1 && (recalls > 0 || overdue.length > 0))
      ? `${dueSoon.length} due soon`
      : undefined,
  ].filter((p) => p !== undefined)
  if (parts.length > 0) return parts.join(' · ')
  // An item that needs the mileage might be due; only say nothing is when the app can tell.
  if (unknown > 0) return unknown === 1 ? 'Needs your mileage' : `${unknown} need your mileage`
  return items === 1 ? 'Nothing due' : `${items} items, none due`
}
