/**
 * Which of NHTSA's top-level components a line of a shop's quote is about, so bulletins and
 * warranty extensions for that part of the car can be shown beside it. Checked in order; a line
 * can name several.
 */
const PATTERNS: [string, RegExp][] = [
  ['SERVICE BRAKES', /\bbrakes?\b|caliper|rotor|\bpads?\b|master cylinder/i],
  ['PARKING BRAKE', /parking brake|e-?brake/i],
  [
    'POWER TRAIN',
    /transmission|\btrans\b|\bcvt\b|clutch|\baxles?\b|cv (?:joint|boot|axle)|differential|transfer case|drive ?shaft|torque converter/i,
  ],
  [
    'ENGINE',
    /engine|motor mount|\boil (?:leak|consumption)|gasket|timing (?:belt|chain)|turbo|cylinder|piston|valve cover|spark plug|ignition coil|misfire|coolant|radiator|water pump|thermostat|cooling/i,
  ],
  ['FUEL SYSTEM', /\bfuel (?:pump|injector|line|tank|leak)|injectors?|\bevap\b|purge valve/i],
  [
    'ELECTRICAL SYSTEM',
    /battery|alternator|starter|wiring|\bfuse|electrical|\bsensor|\bmodule\b|infotainment|\bradio\b|key fob/i,
  ],
  ['STEERING', /steering|\brack\b|tie rod/i],
  [
    'SUSPENSION',
    /suspension|strut|shocks?\b|control arm|ball joint|sway bar|stabili[sz]er|bushing/i,
  ],
  ['WHEELS', /wheel bearing|\bhub\b|lug nut|\brims?\b/i],
  ['TIRES', /\btires?\b|\btyres?\b/i],
  ['EXTERIOR LIGHTING', /headlight|head lamp|tail ?light|\bbulbs?\b|fog light/i],
  [
    'VISIBILITY',
    /wiper|windshield|windscreen|defrost|mirror|\ba\/?c\b|air condition|hvac|heater core|blower/i,
  ],
  ['AIR BAGS', /air ?bags?|\bsrs\b/i],
  ['SEAT BELTS', /seat ?belt/i],
  ['LATCHES/LOCKS/LINKAGES', /door lock|latch|lift ?gate|tail ?gate|hood release/i],
  ['HYBRID PROPULSION SYSTEM', /hybrid|high.voltage|inverter/i],
]

/** NHTSA components a quote line is about, such as ["SERVICE BRAKES"] for "Front pads & rotors". */
export const componentsForText = (text: string): string[] =>
  PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([component]) => component)
