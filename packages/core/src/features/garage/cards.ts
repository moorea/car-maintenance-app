import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Vehicle, VehicleId } from '../../domain/types'
import type { Unsubscribe } from '../../ports'
import { dueItemsFor, type GetDueItemsDeps } from '../../reminders/getDueItems'
import { toDueRow, type DueRow } from './describeDue'

export interface GarageCardsState {
  /**
   * Each car's item due soonest, overdue ones first, as the garage's next-up card works it out:
   * the owner's own items and intervals, and a guessed date for items with no record. A car is
   * missing until its schedule has been read, and when it has nothing scheduled or its schedule
   * could not be read.
   */
  nextDue: Partial<Record<VehicleId, DueRow>>
}

export interface GarageCardsActions {
  start: () => void
  dispose: () => void
}

export type GarageCardsModel = StoreApi<GarageCardsState & GarageCardsActions>

export interface GarageCardsDeps extends Omit<GetDueItemsDeps, 'vehicles'> {
  /** The owner's cars, as the garage lists them. */
  cars: Vehicle[]
}

/** Screen model for the garage's car cards: what each car needs next. */
export const createGarageCardsModel = (deps: GarageCardsDeps): GarageCardsModel => {
  const subscriptions: Unsubscribe[] = []
  // Each refresh of a car supersedes the one before, so a slow read never overwrites a newer one.
  // Disposing supersedes them all.
  let generation = 0
  const latest = new Map<VehicleId, number>()

  return createStore<GarageCardsState & GarageCardsActions>()((set) => {
    const refresh = async (vehicle: Vehicle) => {
      const mine = ++generation
      latest.set(vehicle.id, mine)
      let row: DueRow | undefined
      try {
        const today = deps.clock.today()
        const [items, records, readings] = await Promise.all([
          deps.schedule.itemsForVehicle(vehicle),
          deps.records.listForVehicle(vehicle.id),
          deps.odometer.listForVehicle(vehicle.id),
        ])
        const { items: due, currentMiles } = dueItemsFor({
          vehicle,
          items,
          records,
          readings,
          today,
        })
        row = due[0] && toDueRow(due[0], currentMiles, today)
      } catch {
        // One car's schedule failing only leaves its card without a next item.
        row = undefined
      }
      if (latest.get(vehicle.id) !== mine) return
      set((s) => {
        const others = Object.entries(s.nextDue).filter(([id]) => id !== vehicle.id)
        return { nextDue: Object.fromEntries(row ? [...others, [vehicle.id, row]] : others) }
      })
    }

    return {
      nextDue: {},

      start: () => {
        if (subscriptions.length > 0) return
        // Logging a service or a new odometer reading (here or from sync) moves a car's schedule
        // on, as does changing its own items, so recompute that car whenever any of them changes.
        for (const vehicle of deps.cars) {
          const changed = () => void refresh(vehicle)
          subscriptions.push(
            deps.records.watchForVehicle(vehicle.id, changed),
            deps.odometer.watchForVehicle(vehicle.id, changed),
            deps.schedule.watchForVehicle(vehicle, changed),
          )
        }
      },

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
        latest.clear()
      },
    }
  })
}
