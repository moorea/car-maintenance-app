/**
 * What a line of a shop's quote is, as a schedule kind (the same keys providers use, such as
 * "engine-oil") or one of the jobs below that no general schedule lists.
 */
export type ServiceKind = string

/**
 * Jobs shops often sell that are not on a general maintenance schedule, with why. A provider's
 * schedule may still list some of them for a car, and then the schedule wins.
 */
export const UNSCHEDULED_SERVICES: Record<string, { label: string; why: string }> = {
  'differential-fluid': {
    label: 'Differential fluid',
    why: 'Most schedules change it only for towing, police or taxi use, or not at all. Check your owner’s manual.',
  },
  'transfer-case-fluid': {
    label: 'Transfer case fluid',
    why: 'Most schedules change it only for towing or off-road use, or at very high mileage. Check your owner’s manual.',
  },
  'power-steering-fluid': {
    label: 'Power steering fluid',
    why: 'Most schedules only ask for it to be checked, not flushed. Many newer cars have electric steering with no fluid.',
  },
  'fuel-system-cleaning': {
    label: 'Fuel or intake cleaning',
    why: 'Fuel injection, intake and throttle body cleanings are not on manufacturer schedules. Top Tier fuel does the same job.',
  },
  'engine-flush': {
    label: 'Engine flush',
    why: 'Manufacturers do not call for engine flushes, and some warn against them. Regular oil changes are enough.',
  },
  'nitrogen-fill': {
    label: 'Nitrogen in tires',
    why: 'Air is already 78% nitrogen. Checking tire pressure monthly does more.',
  },
  'headlight-restoration': {
    label: 'Headlight restoration',
    why: 'Cosmetic and optional. Do it if the lenses are cloudy enough to dim the lights.',
  },
  'ac-service': {
    label: 'A/C service',
    why: 'Not on a schedule. Only needed if the air conditioning blows warm.',
  },
}

/**
 * Parts replaced when they wear out rather than on a schedule. A shop should be able to show the
 * measurement or the worn part.
 */
export const WEAR_ITEMS: Record<string, string> = {
  'brake-pads': 'Brake pads',
  'brake-rotors': 'Brake rotors',
  tires: 'Tires',
  'wiper-blades': 'Wiper blades',
  battery: '12-volt battery',
  'serpentine-belt': 'Drive belt',
  'wheel-alignment': 'Wheel alignment',
  shocks: 'Shocks and struts',
  bulbs: 'Bulbs',
}

// Checked in order, so specific fluids win over the generic "oil" and "fluid" patterns, and a
// filter's kind is decided before "air" or "fuel" alone.
const PATTERNS: [ServiceKind, RegExp][] = [
  ['recall', /\brecall|\bcampaign\b|\b\d{2}V\d{3}(?:000)?\b|\bsafety notice/i],
  // A fix for something found wrong, not maintenance, even when it names a fluid ("oil leak").
  ['repair', /\bleak|gasket|\bseals?\b|diagnos|\brepair|\bcheck engine|\bnoise/i],
  [
    'service-package',
    /\b\d{1,3}\s?k\b|\b\d{1,3},?000[\s-]*(?:mi|mile)|\bmile(?:age)?\s*service|\b(?:major|minor|scheduled|factory)\s*(?:service|maintenance)|maintenance\s*package/i,
  ],
  ['transfer-case-fluid', /transfer\s*case|\bt\/?case\b/i],
  [
    'differential-fluid',
    /\bdiff(?:erential)?s?\b|\bgear\s*oil|\baxle\s*(?:fluid|oil)|\bpt?u\s*fluid/i,
  ],
  ['transmission-fluid', /\btrans(?:mission)?\b|\batf\b|\bcvt\b|\bgearbox/i],
  ['power-steering-fluid', /power\s*steering|\bp\/?s\s*(?:fluid|flush)/i],
  ['brake-fluid', /brake\s*(?:fluid|flush|bleed|system\s*(?:flush|service))/i],
  [
    'engine-coolant',
    /coolant|antifreeze|radiator\s*(?:flush|service|fluid)|cooling\s*system\s*(?:flush|service)/i,
  ],
  ['engine-flush', /engine\s*(?:oil\s*)?flush|motor\s*flush/i],
  [
    'fuel-system-cleaning',
    /fuel\s*(?:system|injection|injector|induction)|induction\s*(?:service|clean)|throttle\s*body|intake\s*(?:clean|service)|carbon\s*clean|\bbg\b|fuel\s*additive|decarb/i,
  ],
  ['fuel-filter', /fuel\s*filter/i],
  ['cabin-air-filter', /cabin|pollen|\ba\/?c\s*filter|hvac\s*filter/i],
  ['engine-air-filter', /air\s*filter|air\s*cleaner|engine\s*filter/i],
  ['engine-oil', /\boil\b|\blof\b|\blube\b|synthetic|\b\d+w-?\d+\b/i],
  ['tire-rotation', /rotat/i],
  ['wheel-alignment', /align/i],
  ['nitrogen-fill', /nitrogen/i],
  ['tires', /\btires?\b|\btyres?\b/i],
  ['brake-rotors', /rotors?\b|\bdiscs?\b/i],
  ['brake-pads', /\bpads?\b|\bshoes\b/i],
  ['brake-inspection', /brake/i],
  ['spark-plugs', /spark\s*plugs?|\bplugs\b|tune[\s-]?up|ignition\s*coil/i],
  ['timing-belt', /timing\s*belt/i],
  ['serpentine-belt', /serpentine|drive\s*belt|accessory\s*belt|\bbelts?\b/i],
  ['battery-test', /battery\s*(?:test|check|inspect)|charging\s*system\s*(?:test|check)/i],
  ['battery', /battery/i],
  ['wiper-blades', /wiper/i],
  ['headlight-restoration', /headlight\s*(?:restor|polish|lens)/i],
  ['ac-service', /\ba\/?c\b|air\s*condition|refrigerant|evac|recharge/i],
  ['shocks', /shocks?\b|struts?\b/i],
  ['bulbs', /\bbulbs?\b|\blamp\b/i],
]

/** What kind of job a quote line describes, or undefined when it is not recognised. */
export const identifyService = (text: string): ServiceKind | undefined =>
  PATTERNS.find(([, pattern]) => pattern.test(text))?.[0]
