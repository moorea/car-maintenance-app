import type { CodeSystem } from './lookupCode'

/**
 * How soon a trouble code needs a shop:
 * - `stop`: pull over and stop driving; going on can wreck the engine or transmission.
 * - `soon`: drive gently and get it looked at within days.
 * - `later`: safe to drive; fix it at the next service, or before an emissions inspection.
 */
export type CodeUrgency = 'stop' | 'soon' | 'later'

/** What a known code means, in plain words. */
export interface CodeEntry {
  title: string
  /** The area of the car, when the code's structure names the wrong one (P0217 is cooling). */
  system?: CodeSystem
  /** The usual causes, most likely first. */
  causes: string[]
  urgency: CodeUrgency
  /** Anything else worth knowing, such as checking the gas cap first. */
  tip?: string
  /** The part is covered by the federal emissions warranty (8 years or 80,000 miles). */
  emissionsWarranty?: true
  /** Words of NHTSA components this code is about, overriding its subsystem's. */
  components?: string[]
}

const GAS_CAP =
  'Check the gas cap first: tighten it until it clicks, or replace a cracked seal. The light goes off by itself after a few days of driving if that was it.'

const CATALYST: Omit<CodeEntry, 'title'> = {
  causes: [
    'An ageing catalytic converter',
    'A failing rear oxygen sensor',
    'An exhaust leak before the converter',
    'Misfires or oil burning that damaged the converter',
  ],
  urgency: 'later',
  tip: 'Fix any misfire codes first, since they damage a new converter too. Shops often replace the converter when a cheaper oxygen sensor is the cause, so ask what they tested.',
  emissionsWarranty: true,
  components: ['EXHAUST', 'EMISSION'],
}

const EVAP_LEAK: Omit<CodeEntry, 'title'> = {
  causes: [
    'Gas cap loose, missing or with a worn seal',
    'A cracked evaporative system hose',
    'A leaking purge or vent valve',
  ],
  urgency: 'later',
  tip: GAS_CAP,
}

const O2_HEATER: Omit<CodeEntry, 'title'> = {
  causes: ['A failed oxygen sensor heater', 'A blown fuse', 'Damaged wiring or connector'],
  urgency: 'later',
  tip: 'The sensor usually needs replacing; the heater is built into it.',
}

const O2_SLOW: Omit<CodeEntry, 'title'> = {
  causes: ['An ageing oxygen sensor', 'An exhaust leak near the sensor', 'Damaged wiring'],
  urgency: 'later',
}

const LEAN: Omit<CodeEntry, 'title'> = {
  causes: [
    'A vacuum leak, such as a cracked hose or intake gasket',
    'A dirty mass airflow sensor',
    'A weak fuel pump or clogged fuel filter',
    'A stuck-open PCV valve',
  ],
  urgency: 'soon',
  tip: 'Left alone, a lean engine runs hot and can misfire. A smoke test finds most vacuum leaks quickly.',
}

const RICH: Omit<CodeEntry, 'title'> = {
  causes: [
    'A leaking fuel injector',
    'Fuel pressure too high',
    'A dirty mass airflow sensor',
    'A failing oxygen sensor',
  ],
  urgency: 'soon',
  tip: 'Running rich wastes fuel and can overheat the catalytic converter.',
}

const TRANSMISSION: Omit<CodeEntry, 'title'> = {
  causes: [
    'Low or burnt transmission fluid',
    'A failing solenoid or sensor',
    'Wiring or a connector at the transmission',
  ],
  urgency: 'soon',
  tip: 'Check the transmission fluid if your car has a dipstick. Harsh or slipping shifts mean book a shop now, before it gets worse.',
}

const COMPUTER: Omit<CodeEntry, 'title'> = {
  causes: [
    'A weak battery or poor ground connection',
    'Damaged wiring to the engine computer',
    'A failed engine computer',
  ],
  urgency: 'soon',
  tip: 'Test the battery first; low voltage causes many computer codes. Ask about software updates for your car.',
  emissionsWarranty: true,
}

const OIL_PRESSURE: Omit<CodeEntry, 'title'> = {
  system: 'powertrain',
  causes: ['Low engine oil', 'The wrong oil or very old oil', 'A worn oil pump', 'A failed sensor'],
  urgency: 'stop',
  tip: 'Check the oil level now. Driving without oil pressure can destroy the engine within minutes.',
  components: ['ENGINE'],
}

const LOST_COMMUNICATION: Omit<CodeEntry, 'title'> = {
  causes: [
    'A weak battery or loose battery terminal',
    'Damaged wiring or a corroded connector',
    'A failed control module',
  ],
  urgency: 'soon',
  tip: 'Test the battery first. If the car drives oddly or several warning lights are on, have it towed.',
}

const ORDINALS = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** Codes that differ only by cylinder: misfires, injectors and ignition coils. */
const perCylinder = (): Record<string, CodeEntry> => {
  const entries: Record<string, CodeEntry> = {}
  for (let n = 1; n <= 12; n++) {
    entries[`P03${String(n).padStart(2, '0')}`] = {
      title: `Cylinder ${n} misfire`,
      causes: [
        'A worn spark plug',
        'A failing ignition coil',
        'A clogged or failing fuel injector',
        'Low compression in that cylinder',
      ],
      urgency: 'soon',
      tip: 'Mechanics often swap the coil with another cylinder’s: if the misfire moves, the coil is the culprit. Misfires left alone damage the catalytic converter.',
    }
  }
  for (let n = 1; n <= 8; n++) {
    entries[`P020${n}`] = {
      title: `Fuel injector circuit, cylinder ${n}`,
      causes: [
        'A failed fuel injector',
        'Damaged wiring or connector',
        'A fault in the engine computer',
      ],
      urgency: 'soon',
      components: ['FUEL', 'ENGINE'],
    }
    entries[`P035${n}`] = {
      title: `Ignition coil ${ORDINALS[n]} circuit (usually cylinder ${n})`,
      causes: ['A failed ignition coil', 'Damaged wiring or connector', 'A worn spark plug'],
      urgency: 'soon',
      tip: 'A coil fault usually causes a misfire in the same cylinder. Coils are often a do-it-yourself job.',
      components: ['ENGINE'],
    }
  }
  return entries
}

/**
 * Generic (SAE J2012) codes owners see most often, in plain words. Codes not listed are described
 * from their structure by `lookupCode`.
 */
export const TROUBLE_CODES: Record<string, CodeEntry> = {
  P0010: {
    title: 'Camshaft timing actuator circuit (bank 1)',
    causes: [
      'A failed variable valve timing solenoid',
      'Low or dirty engine oil',
      'Damaged wiring or connector',
    ],
    urgency: 'soon',
  },
  P0011: {
    title: 'Camshaft timing over-advanced (bank 1)',
    causes: [
      'Low or old engine oil',
      'A sticking variable valve timing solenoid',
      'A stretched timing chain',
    ],
    urgency: 'soon',
    tip: 'Check the oil level and when it was last changed: old oil is the cheapest cause.',
  },
  P0016: {
    title: 'Crankshaft and camshaft positions don’t agree (bank 1)',
    causes: [
      'A stretched timing chain or a timing belt that slipped a tooth',
      'A failing cam or crank sensor',
      'A sticking variable valve timing solenoid',
    ],
    urgency: 'soon',
    tip: 'A timing chain or belt that fails can wreck the engine, so do not put this off.',
  },
  P0087: {
    title: 'Fuel rail pressure too low',
    causes: ['A weak fuel pump', 'A clogged fuel filter', 'A failing fuel pressure sensor'],
    urgency: 'soon',
    tip: 'The engine can lose power or stall, so avoid highways until it is fixed.',
    components: ['FUEL'],
  },
  P0101: {
    title: 'Mass airflow sensor reading out of range',
    causes: ['A dirty mass airflow sensor', 'An air leak after the sensor', 'A clogged air filter'],
    urgency: 'soon',
    tip: 'Cleaning the sensor with MAF cleaner spray fixes it often enough to try first.',
    components: ['FUEL', 'ENGINE'],
  },
  P0102: {
    title: 'Mass airflow sensor signal low',
    causes: ['An unplugged or damaged sensor connector', 'A dirty or failed sensor'],
    urgency: 'soon',
    components: ['FUEL', 'ENGINE'],
  },
  P0106: {
    title: 'Manifold pressure sensor reading out of range',
    causes: ['A vacuum leak', 'A failed manifold pressure (MAP) sensor', 'Damaged wiring'],
    urgency: 'soon',
  },
  P0113: {
    title: 'Intake air temperature sensor signal high',
    causes: ['An unplugged sensor', 'Damaged wiring', 'A failed sensor'],
    urgency: 'later',
  },
  P0117: {
    system: 'cooling',
    title: 'Coolant temperature sensor signal low',
    causes: ['A failed coolant temperature sensor', 'Damaged wiring or connector'],
    urgency: 'soon',
    tip: 'The cooling fan may not run when it should, and the temperature gauge may read wrong too. If you see steam or smell coolant, stop.',
    components: ['ENGINE COOLING'],
  },
  P0118: {
    system: 'cooling',
    title: 'Coolant temperature sensor signal high',
    causes: ['A failed coolant temperature sensor', 'An unplugged sensor', 'Damaged wiring'],
    urgency: 'soon',
    tip: 'The cooling fan may not run when it should, and the temperature gauge may read wrong too. If you see steam or smell coolant, stop.',
    components: ['ENGINE COOLING'],
  },
  P0121: {
    title: 'Throttle position sensor reading out of range',
    causes: ['A failing throttle position sensor', 'A dirty throttle body', 'Damaged wiring'],
    urgency: 'soon',
    tip: 'The car may hesitate or go into a reduced-power mode.',
  },
  P0125: {
    system: 'cooling',
    title: 'Engine takes too long to warm up',
    causes: ['A thermostat stuck open', 'Low coolant', 'A failing coolant temperature sensor'],
    urgency: 'later',
    components: ['ENGINE COOLING'],
  },
  P0128: {
    system: 'cooling',
    title: 'Coolant stays below thermostat temperature',
    causes: ['A thermostat stuck open', 'Low coolant', 'A failing coolant temperature sensor'],
    urgency: 'later',
    tip: 'Safe to drive, but the heater may blow cool and fuel economy drops. A thermostat is usually an inexpensive fix.',
    components: ['ENGINE COOLING'],
  },
  P0130: {
    title: 'Oxygen sensor circuit (bank 1, sensor 1)',
    causes: ['A failed front oxygen sensor', 'Damaged wiring', 'An exhaust leak'],
    urgency: 'soon',
    tip: 'The front sensor sets the fuel mixture, so fuel economy suffers until it is fixed.',
  },
  P0133: { title: 'Oxygen sensor slow to respond (bank 1, sensor 1)', ...O2_SLOW },
  P0135: { title: 'Oxygen sensor heater circuit (bank 1, sensor 1)', ...O2_HEATER },
  P0136: {
    title: 'Oxygen sensor circuit (bank 1, sensor 2)',
    causes: ['A failed rear oxygen sensor', 'Damaged wiring', 'An exhaust leak'],
    urgency: 'later',
  },
  P0137: {
    title: 'Oxygen sensor signal low (bank 1, sensor 2)',
    causes: ['A failed rear oxygen sensor', 'An exhaust leak', 'Damaged wiring'],
    urgency: 'later',
  },
  P0141: { title: 'Oxygen sensor heater circuit (bank 1, sensor 2)', ...O2_HEATER },
  P0153: { title: 'Oxygen sensor slow to respond (bank 2, sensor 1)', ...O2_SLOW },
  P0155: { title: 'Oxygen sensor heater circuit (bank 2, sensor 1)', ...O2_HEATER },
  P0161: { title: 'Oxygen sensor heater circuit (bank 2, sensor 2)', ...O2_HEATER },
  P0171: { title: 'Engine running lean (bank 1)', ...LEAN },
  P0172: { title: 'Engine running rich (bank 1)', ...RICH },
  P0174: { title: 'Engine running lean (bank 2)', ...LEAN },
  P0175: { title: 'Engine running rich (bank 2)', ...RICH },
  P0191: {
    title: 'Fuel rail pressure sensor reading out of range',
    causes: ['A failing fuel pressure sensor', 'A weak fuel pump', 'Damaged wiring'],
    urgency: 'soon',
    components: ['FUEL'],
  },
  ...perCylinder(),
  P0217: {
    system: 'cooling',
    title: 'Engine overheating',
    causes: [
      'Low coolant or a leak',
      'A failed water pump',
      'A thermostat stuck shut',
      'A cooling fan that isn’t running',
    ],
    urgency: 'stop',
    tip: 'Pull over and turn the engine off. Do not open the radiator cap while it is hot. Driving an overheating engine can warp the head and ruin the engine.',
    components: ['ENGINE COOLING', 'ENGINE'],
  },
  P0218: {
    system: 'transmission',
    title: 'Transmission overheating',
    causes: [
      'Towing or climbing hard in hot weather',
      'Low or burnt transmission fluid',
      'A blocked transmission cooler',
    ],
    urgency: 'stop',
    tip: 'Pull over and let it cool with the engine idling in park. Overheated fluid quickly damages the transmission.',
    components: ['POWER TRAIN'],
  },
  P0234: {
    title: 'Turbo or supercharger overboost',
    causes: [
      'A stuck wastegate',
      'A failing boost control solenoid',
      'A faulty boost pressure sensor',
    ],
    urgency: 'soon',
    tip: 'Avoid hard acceleration until it is fixed; too much boost can damage the engine.',
  },
  P0299: {
    title: 'Turbo or supercharger underboost',
    causes: ['A boost leak from a loose or split hose', 'A stuck wastegate', 'A worn turbo'],
    urgency: 'soon',
  },
  P0300: {
    title: 'Random or multiple cylinder misfire',
    causes: [
      'Worn spark plugs',
      'Failing ignition coils',
      'A vacuum leak',
      'Low fuel pressure or bad fuel',
    ],
    urgency: 'soon',
    tip: 'If the light starts flashing, the misfire is severe: stop driving. Misfires left alone damage the catalytic converter.',
  },
  P0316: {
    title: 'Misfire detected on start-up',
    causes: ['Worn spark plugs', 'Moisture in the ignition', 'A failing ignition coil'],
    urgency: 'soon',
  },
  P0325: {
    title: 'Knock sensor circuit (bank 1)',
    causes: ['A failed knock sensor', 'Damaged wiring', 'A loose sensor'],
    urgency: 'soon',
    tip: 'The engine protects itself by retarding timing, so it feels sluggish and uses more fuel.',
  },
  P0335: {
    title: 'Crankshaft position sensor circuit',
    causes: [
      'A failed crankshaft position sensor',
      'Damaged wiring or connector',
      'A damaged tone ring',
    ],
    urgency: 'soon',
    tip: 'The engine can stall while driving or refuse to restart, so get it fixed before a long trip.',
  },
  P0340: {
    title: 'Camshaft position sensor circuit (bank 1)',
    causes: [
      'A failed camshaft position sensor',
      'Damaged wiring or connector',
      'Timing chain or belt problems',
    ],
    urgency: 'soon',
    tip: 'The car may be hard to start or stall.',
  },
  P0341: {
    title: 'Camshaft position sensor reading out of range (bank 1)',
    causes: ['A failing camshaft position sensor', 'A stretched timing chain', 'Damaged wiring'],
    urgency: 'soon',
  },
  P0401: {
    title: 'Exhaust gas recirculation (EGR) flow too low',
    causes: ['Carbon-clogged EGR passages', 'A stuck EGR valve', 'A failing EGR pressure sensor'],
    urgency: 'later',
    tip: 'May cause pinging under load. It will fail an emissions inspection.',
  },
  P0402: {
    title: 'Exhaust gas recirculation (EGR) flow too high',
    causes: ['An EGR valve stuck open', 'A failing EGR solenoid'],
    urgency: 'soon',
    tip: 'The engine may idle roughly or stall when stopping.',
  },
  P0411: {
    title: 'Secondary air injection flow incorrect',
    causes: ['A failed air pump', 'A stuck check valve', 'A cracked hose'],
    urgency: 'later',
  },
  P0420: { title: 'Catalytic converter below efficiency (bank 1)', ...CATALYST },
  P0421: { title: 'Catalytic converter warm-up efficiency low (bank 1)', ...CATALYST },
  P0430: { title: 'Catalytic converter below efficiency (bank 2)', ...CATALYST },
  P0440: { title: 'Evaporative emission system malfunction', ...EVAP_LEAK },
  P0441: {
    title: 'Evaporative emission system purge flow incorrect',
    causes: ['A failed purge valve', 'A cracked or disconnected hose'],
    urgency: 'later',
  },
  P0442: { title: 'Small evaporative emission leak', ...EVAP_LEAK },
  P0446: {
    title: 'Evaporative emission vent control circuit',
    causes: ['A blocked or failed vent valve', 'A clogged charcoal canister', 'Damaged wiring'],
    urgency: 'later',
  },
  P0455: { title: 'Large evaporative emission leak', ...EVAP_LEAK },
  P0456: { title: 'Very small evaporative emission leak', ...EVAP_LEAK },
  P0457: { title: 'Evaporative emission leak: gas cap loose or off', ...EVAP_LEAK },
  P0496: {
    title: 'Evaporative emission purge flow too high',
    causes: ['A purge valve stuck open'],
    urgency: 'later',
    tip: 'The car may be hard to start just after filling up.',
  },
  P0500: {
    title: 'Vehicle speed sensor',
    causes: ['A failed speed sensor', 'Damaged wiring'],
    urgency: 'soon',
    tip: 'The speedometer, cruise control, shifting and ABS can act up until it is fixed.',
    components: ['POWER TRAIN', 'VEHICLE SPEED CONTROL'],
  },
  P0505: {
    title: 'Idle air control system',
    causes: ['A dirty throttle body', 'A failed idle air control valve', 'A vacuum leak'],
    urgency: 'soon',
    tip: 'The engine may idle unevenly or stall at stops.',
  },
  P0506: {
    title: 'Idle speed lower than expected',
    causes: ['A dirty throttle body', 'A vacuum leak'],
    urgency: 'later',
  },
  P0507: {
    title: 'Idle speed higher than expected',
    causes: ['A vacuum leak', 'A dirty or sticking throttle body'],
    urgency: 'later',
  },
  P0520: {
    system: 'powertrain',
    title: 'Engine oil pressure sensor circuit',
    causes: ['A failed oil pressure sensor', 'Damaged wiring', 'Low engine oil'],
    urgency: 'soon',
    tip: 'Check the oil level. If the red oil pressure light comes on too, stop driving.',
    components: ['ENGINE'],
  },
  P0521: { title: 'Engine oil pressure out of range', ...OIL_PRESSURE },
  P0524: { title: 'Engine oil pressure too low', ...OIL_PRESSURE },
  P0562: {
    system: 'charging',
    title: 'System voltage low',
    causes: ['A failing alternator', 'A weak battery', 'Loose or corroded battery terminals'],
    urgency: 'soon',
    tip: 'The car could leave you stranded. Most parts stores test the battery and alternator for free.',
    components: ['ELECTRICAL SYSTEM'],
  },
  P0563: {
    system: 'charging',
    title: 'System voltage high',
    causes: ['A failing alternator voltage regulator'],
    urgency: 'soon',
    tip: 'Too much voltage can damage the battery and electronics.',
    components: ['ELECTRICAL SYSTEM'],
  },
  P0600: { title: 'Engine computer communication fault', ...COMPUTER },
  P0601: { title: 'Engine computer memory error', ...COMPUTER },
  P0606: { title: 'Engine computer processor fault', ...COMPUTER },
  P0700: {
    title: 'Transmission control system fault',
    causes: ['A fault the transmission computer has its own code for'],
    urgency: 'soon',
    tip: 'This code only says the transmission computer found a problem. Ask the shop to read the transmission’s own codes, which say what it is.',
  },
  P0705: { title: 'Transmission range sensor circuit', ...TRANSMISSION },
  P0715: { title: 'Transmission input speed sensor', ...TRANSMISSION },
  P0720: { title: 'Transmission output speed sensor', ...TRANSMISSION },
  P0730: { title: 'Transmission gear ratio incorrect', ...TRANSMISSION },
  P0740: { title: 'Torque converter clutch circuit', ...TRANSMISSION },
  P0741: { title: 'Torque converter clutch stuck off', ...TRANSMISSION },
  P0750: { title: 'Shift solenoid A', ...TRANSMISSION },
  P0755: { title: 'Shift solenoid B', ...TRANSMISSION },
  P0868: { title: 'Transmission fluid pressure low', ...TRANSMISSION },
  P0A80: {
    title: 'Hybrid battery pack needs replacing',
    causes: ['Ageing hybrid battery cells', 'A blocked hybrid battery cooling fan or vent'],
    urgency: 'soon',
    tip: 'Hybrid batteries often have a longer warranty than the rest of the car, commonly 8 to 10 years. Check yours before paying.',
  },
  P2096: {
    title: 'Fuel mixture lean after the catalytic converter (bank 1)',
    causes: ['An exhaust leak', 'A failing rear oxygen sensor', 'A vacuum leak'],
    urgency: 'later',
  },
  P2097: {
    title: 'Fuel mixture rich after the catalytic converter (bank 1)',
    causes: ['A failing catalytic converter', 'A failing oxygen sensor', 'A leaking injector'],
    urgency: 'later',
  },
  P2135: {
    title: 'Throttle position sensors disagree',
    causes: [
      'A failing electronic throttle body',
      'Damaged wiring or connector',
      'A dirty throttle body',
    ],
    urgency: 'soon',
    tip: 'The car often drops into a reduced-power mode. Get it looked at before driving far.',
    components: ['ENGINE', 'VEHICLE SPEED CONTROL'],
  },
  P2138: {
    title: 'Accelerator pedal sensors disagree',
    causes: ['A failing accelerator pedal sensor', 'Damaged wiring or connector'],
    urgency: 'soon',
    tip: 'The car often drops into a reduced-power mode. Get it looked at before driving far.',
    components: ['VEHICLE SPEED CONTROL', 'ENGINE'],
  },
  P2187: {
    title: 'Engine lean at idle (bank 1)',
    causes: ['A vacuum leak', 'A stuck-open PCV valve', 'A dirty mass airflow sensor'],
    urgency: 'soon',
  },
  P2195: {
    title: 'Oxygen sensor stuck lean (bank 1, sensor 1)',
    causes: ['A vacuum leak', 'A failing front oxygen sensor', 'An exhaust leak'],
    urgency: 'soon',
  },
  P2270: {
    title: 'Oxygen sensor stuck lean (bank 1, sensor 2)',
    causes: ['An exhaust leak', 'A failing rear oxygen sensor'],
    urgency: 'later',
  },
  P2A00: { title: 'Oxygen sensor reading out of range (bank 1, sensor 1)', ...O2_SLOW },
  U0073: { title: 'Control module communication bus off', ...LOST_COMMUNICATION },
  U0100: { title: 'Lost communication with the engine computer', ...LOST_COMMUNICATION },
  U0101: { title: 'Lost communication with the transmission computer', ...LOST_COMMUNICATION },
  U0121: {
    title: 'Lost communication with the ABS module',
    ...LOST_COMMUNICATION,
    tip: 'The brakes still work, but ABS and stability control may not. Drive gently and get it checked.',
    components: ['SERVICE BRAKES', 'ELECTRONIC STABILITY', 'ELECTRICAL SYSTEM'],
  },
}
