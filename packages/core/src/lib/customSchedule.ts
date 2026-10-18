import type { CustomItem, MaintenanceItem } from '../domain/types'
import type { CustomItemRepo, ScheduledCar, ScheduleRepo } from '../ports'

/** Where an item the owner added came from, for `MaintenanceItem.source`. */
export const OWNER_SOURCE = 'owner'

const byTask = (a: { task: string }, b: { task: string }) => a.task.localeCompare(b.task)

/**
 * The schedule a car follows: the configuration's items with the owner's own intervals in place
 * of the schedule's (for normal and severe driving alike), then the owner's own items by name.
 * A replacement whose schedule item has gone is dropped; if two phones replaced the same item
 * before syncing, the one with the lower id wins on both.
 */
export const applyCustomItems = (
  items: readonly MaintenanceItem[],
  custom: readonly CustomItem[],
  vehicle: Pick<ScheduledCar, 'configId'>,
): MaintenanceItem[] => {
  const replacements = new Map<string, CustomItem>()
  for (const c of [...custom].sort((a, b) => a.id.localeCompare(b.id)))
    if (c.replacesItemId !== undefined && !replacements.has(c.replacesItemId))
      replacements.set(c.replacesItemId, c)

  const scheduled = items.map((item): MaintenanceItem => {
    const own = replacements.get(item.id)
    if (!own) return item
    const {
      intervalMiles: _m,
      intervalMonths: _t,
      severeMiles: _sm,
      severeMonths: _st,
      ...rest
    } = item
    return {
      ...rest,
      ...(own.intervalMiles !== undefined && { intervalMiles: own.intervalMiles }),
      ...(own.intervalMonths !== undefined && { intervalMonths: own.intervalMonths }),
      owner: 'changed',
    }
  })
  const added = custom
    .filter((c) => c.replacesItemId === undefined)
    .map((c): MaintenanceItem => ({
      id: c.id,
      configId: vehicle.configId ?? '',
      task: c.task,
      source: OWNER_SOURCE,
      ...(c.intervalMiles !== undefined && { intervalMiles: c.intervalMiles }),
      ...(c.intervalMonths !== undefined && { intervalMonths: c.intervalMonths }),
      owner: 'added',
    }))
    .sort(byTask)
  return [...scheduled, ...added]
}

/**
 * A schedule that applies the owner's custom items (`applyCustomItems`) to the configuration's,
 * so every screen, the reminder planner and the export see the schedule the owner set.
 */
export const withCustomItems = (
  base: Pick<ScheduleRepo, 'itemsForConfig'>,
  custom: Pick<CustomItemRepo, 'listForVehicle' | 'watchForVehicle'>,
): ScheduleRepo => {
  const configItems = (vehicle: Pick<ScheduledCar, 'configId'>) =>
    vehicle.configId === undefined
      ? Promise.resolve([] as MaintenanceItem[])
      : base.itemsForConfig(vehicle.configId)

  return {
    itemsForConfig: (configId) => base.itemsForConfig(configId),

    itemsForVehicle: async (vehicle) => {
      const [items, own] = await Promise.all([
        configItems(vehicle),
        custom.listForVehicle(vehicle.id),
      ])
      return applyCustomItems(items, own, vehicle)
    },

    watchForVehicle: (vehicle, onChange) => {
      let stopped = false
      // Each change supersedes the one before, so a slow read never overwrites a newer one.
      let generation = 0
      const stop = custom.watchForVehicle(vehicle.id, (own) => {
        const mine = ++generation
        void configItems(vehicle).then(
          (items) => {
            if (!stopped && mine === generation) onChange(applyCustomItems(items, own, vehicle))
          },
          // The screens read the schedule themselves and show that failure.
          () => {},
        )
      })
      return () => {
        stopped = true
        stop()
      }
    },
  }
}
