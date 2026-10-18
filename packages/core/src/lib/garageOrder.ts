import type { Vehicle } from '../domain/types'

/**
 * The order the garage lists cars in: as the owner arranged them, then any they have not placed
 * (such as a car added since) by name.
 */
export const byGarageOrder = (a: Vehicle, b: Vehicle): number =>
  (a.garagePosition ?? Infinity) - (b.garagePosition ?? Infinity) ||
  a.nickname.localeCompare(b.nickname)
