import type { IsoDate } from '../../lib/date'
import type { EnergyKind, FillUp } from '../../domain/types'

/** "gal" or "kWh", what a fill-up's quantity is counted in. */
export const QUANTITY_UNIT: Record<EnergyKind, string> = { fuel: 'gal', electric: 'kWh' }

/** "mpg" or "mi/kWh", what economy is measured in. */
export const ECONOMY_UNIT: Record<EnergyKind, string> = { fuel: 'mpg', electric: 'mi/kWh' }

/**
 * Economy no car reaches, outside which a stretch is almost certainly a typo in an odometer or a
 * quantity. Wide on purpose: a pickup towing gets 6 mpg, a careful hybrid driver over 70.
 */
const PLAUSIBLE: Record<EnergyKind, { min: number; max: number }> = {
  fuel: { min: 3, max: 150 },
  electric: { min: 0.5, max: 10 },
}

/** The distance between two full fill-ups and what went in to cover it. */
export interface EconomyStretch {
  /** The full fill-up that ends the stretch, whose row shows the result. */
  fillUpId: string
  from: IsoDate
  to: IsoDate
  miles: number
  /** Gallons or kWh put in over the stretch, the partial fill-ups included. */
  quantity: number
  /** Miles per gallon, or miles per kWh. */
  economy: number
  /** Outside what any car gets; left out of the average and flagged for the owner to check. */
  implausible: boolean
}

export interface Economy {
  /** Oldest first. */
  stretches: EconomyStretch[]
  /** All plausible miles over all their quantity; absent until a stretch is measured. */
  average?: number
}

/** Oldest first by odometer, which stays right when a missed fill-up is entered later. */
const byOdometer = (a: FillUp, b: FillUp) =>
  a.odometerMiles - b.odometerMiles || a.filledOn.localeCompare(b.filledOn)

/**
 * Measures economy the full-to-full way: from one full fill-up to the next, the miles driven over
 * everything put in since, partial fill-ups included. A fill-up after a missed one starts again,
 * since part of what was burned since the last logged one is unknown.
 */
export const measureEconomy = (fillUps: readonly FillUp[], energy: EnergyKind): Economy => {
  const range = PLAUSIBLE[energy]
  const stretches: EconomyStretch[] = []
  let start: FillUp | undefined
  let quantity = 0

  for (const fillUp of fillUps.filter((f) => f.energy === energy).sort(byOdometer)) {
    if (fillUp.missedPrevious || !start) {
      start = fillUp.full ? fillUp : undefined
      quantity = 0
      continue
    }
    quantity += fillUp.quantity
    if (!fillUp.full) continue
    const miles = fillUp.odometerMiles - start.odometerMiles
    if (miles > 0 && quantity > 0) {
      const economy = miles / quantity
      stretches.push({
        fillUpId: fillUp.id,
        from: start.filledOn,
        to: fillUp.filledOn,
        miles,
        quantity,
        economy,
        implausible: economy < range.min || economy > range.max,
      })
    }
    start = fillUp
    quantity = 0
  }

  const counted = stretches.filter((s) => !s.implausible)
  const miles = counted.reduce((sum, s) => sum + s.miles, 0)
  const used = counted.reduce((sum, s) => sum + s.quantity, 0)
  return used > 0 ? { stretches, average: miles / used } : { stretches }
}

/** "31.2 mpg" or "3.8 mi/kWh". */
export const formatEconomy = (economy: number, energy: EnergyKind): string =>
  `${economy.toFixed(1)} ${ECONOMY_UNIT[energy]}`

/** "12.4 gal" or "48.2 kWh", to at most three decimals. */
export const formatQuantity = (quantity: number, energy: EnergyKind): string =>
  `${quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${QUANTITY_UNIT[energy]}`
