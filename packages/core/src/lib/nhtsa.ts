/** Presenting NHTSA's data, which arrives in upper case. */

// Kept in capitals. Words with digits (12V, 4WD) are kept too.
const ACRONYMS = new Set([
  'ABS',
  'ACC',
  'ADAS',
  'AEB',
  'CNG',
  'ECM',
  'ESC',
  'EV',
  'EVAP',
  'HID',
  'HVAC',
  'LED',
  'LPG',
  'OCS',
  'PCM',
  'SRS',
  'TPMS',
  'VIN',
])

const word = (w: string) => (/\d/.test(w) || ACRONYMS.has(w.toUpperCase()) ? w : w.toLowerCase())

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * "SERVICE BRAKES, HYDRAULIC" as "Service brakes, hydraulic" and "ELECTRICAL SYSTEM:12V
 * BATTERY" as "Electrical system: 12V battery".
 */
export const componentLabel = (component: string): string =>
  capitalise(
    component
      .trim()
      .split(/\s*:\s*/)
      .map((part) => part.replace(/[A-Za-z0-9]+/g, word))
      .join(': '),
  )

/** NHTSA's page that says which recalls apply to this exact car and whether they were fixed. */
export const recallLookupUrl = (vin?: string): string =>
  vin
    ? `https://www.nhtsa.gov/recalls?vin=${encodeURIComponent(vin)}`
    : 'https://www.nhtsa.gov/recalls'
