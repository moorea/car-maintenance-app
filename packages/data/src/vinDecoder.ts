import { VinDecodeError, type DecodedVin, type VinDecoder } from '@car/core'

/** NHTSA's free vPIC decoder. No key needed; US-market vehicles. */
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues'
const TIMEOUT_MS = 10_000

/** The fields of a vPIC DecodeVinValues result the app reads. Every value is a string. */
interface VpicResult {
  ModelYear?: string
  Make?: string
  Model?: string
  Trim?: string
  DisplacementL?: string
  EngineCylinders?: string
  FuelTypePrimary?: string
  DriveType?: string
}

// vPIC spells makes in capitals. These keep their capitals; the rest are title-cased.
const ACRONYMS = new Set(['BMW', 'GMC', 'MINI', 'SRT', 'AMC'])

/** "MERCEDES-BENZ" as "Mercedes-Benz", "LAND ROVER" as "Land Rover", "BMW" as is. */
export const makeName = (make: string): string =>
  make
    .trim()
    .split(/(\s+|-)/)
    .map((part) =>
      ACRONYMS.has(part.toUpperCase())
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join('')

const value = (s: string | undefined) => {
  const v = s?.trim()
  return v && v !== 'Not Applicable' ? v : undefined
}

/** "2.0L 4-cyl", "Electric" or undefined when vPIC does not say. */
const engineOf = (r: VpicResult): string | undefined => {
  if (value(r.FuelTypePrimary) === 'Electric') return 'Electric'
  const litres = Number(value(r.DisplacementL))
  const cylinders = value(r.EngineCylinders)
  const parts = [
    Number.isFinite(litres) && litres > 0 ? `${litres.toFixed(1)}L` : undefined,
    cylinders ? `${cylinders}-cyl` : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** vPIC's "AWD/All-Wheel Drive" as "AWD". */
const drivetrainOf = (r: VpicResult) => value(r.DriveType)?.split('/')[0]?.trim() || undefined

/** Reads one vPIC result, or undefined if it does not say what the car is. */
export const fromVpic = (vin: string, r: VpicResult): DecodedVin | undefined => {
  const year = Number(value(r.ModelYear))
  const make = value(r.Make)
  const model = value(r.Model)
  if (!Number.isInteger(year) || !make || !model) return undefined
  const trim = value(r.Trim)
  const engine = engineOf(r)
  const drivetrain = drivetrainOf(r)
  return {
    vin,
    year,
    make: makeName(make),
    model,
    ...(trim && { trim }),
    ...(engine && { engine }),
    ...(drivetrain && { drivetrain }),
  }
}

/** A VinDecoder over vPIC. `fetchFn` is the platform fetch; tests pass a fake. */
export const nhtsaVinDecoder = (fetchFn: typeof fetch = fetch): VinDecoder => ({
  decode: async (vin) => {
    let response: Response
    // AbortSignal.timeout is not in every React Native runtime.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      response = await fetchFn(`${VPIC}/${encodeURIComponent(vin)}?format=json`, {
        signal: controller.signal,
      })
    } catch (e) {
      throw new VinDecodeError('network', e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      throw new VinDecodeError(
        response.status >= 500 || response.status === 429 ? 'network' : 'unknown',
        `vPIC answered ${response.status}`,
      )
    }
    let body: { Results?: VpicResult[] }
    try {
      body = (await response.json()) as { Results?: VpicResult[] }
    } catch {
      throw new VinDecodeError('unknown', 'vPIC sent something other than JSON')
    }
    const decoded = body.Results?.[0] && fromVpic(vin, body.Results[0])
    if (!decoded) throw new VinDecodeError('not-found')
    return decoded
  },
})
