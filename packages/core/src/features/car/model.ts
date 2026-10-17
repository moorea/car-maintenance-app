import { createStore, type StoreApi } from 'zustand/vanilla'
import { daysBetween, type IsoDate } from '../../lib/date'
import { formatMiles } from '../../lib/format'
import type { MaintenanceItem, OdometerReading, ServiceRecord, Vehicle } from '../../domain/types'
import type { Unsubscribe } from '../../ports'
import { getDueItems, type GetDueItemsDeps } from '../../reminders/getDueItems'
import { MAX_PLAUSIBLE_MILES_PER_DAY } from '../../reminders/mileage'
import type { DueProjection, DueStatus } from '../../reminders/projectDue'
import { odometerReadingSchema } from '../../schemas/odometer'
import { currentOdometer } from '../garage/odometer'

/** The parts of a car's page, one per segment of its segmented control. */
export type CarSection = 'schedule' | 'recalls' | 'issues'

export interface ScheduleRow {
  itemId: string
  task: string
  status: DueStatus
  /** The interval, such as "Every 5,000 mi or 6 months". */
  interval: string
  /** When it is next due, such as "36,500 mi", "Mar 2027" or "Overdue". */
  next: string
}

export interface OdometerEditor {
  value: string
  error?: string | undefined
  saving: boolean
}

export interface CarState {
  /** `loading` until the schedule has been read; `unmatched` before the car's config syncs. */
  status: 'loading' | 'unmatched' | 'ready'
  /** "2021 Toyota RAV4". */
  title: string
  /** "XLE · 2.5L 4-cyl · AWD · VIN ••••4352", leaving out what is unknown. */
  subtitle: string
  /** "About 36,180 mi", or undefined with no readings yet. */
  odometer?: string | undefined
  /** "About 1,900 mi a month", or a note that the average is assumed. */
  pace?: string | undefined
  section: CarSection
  /** "Toyota schedule · normal driving". */
  scheduleTitle: string
  schedule: ScheduleRow[]
  /** Present while the owner is typing a new odometer reading. */
  editingOdometer?: OdometerEditor | undefined
  error?: string | undefined
}

export interface CarActions {
  start: () => void
  showSection: (section: CarSection) => void
  editOdometer: () => void
  setOdometer: (value: string) => void
  cancelOdometer: () => void
  /** Validates and saves the reading. Resolves true when saved. */
  saveOdometer: () => Promise<boolean>
  dispose: () => void
}

export type CarModel = StoreApi<CarState & CarActions>

export interface CarDeps extends GetDueItemsDeps {
  vehicle: Vehicle
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const monthYear = (date: IsoDate) => {
  const [year, month] = date.split('-').map(Number) as [number, number]
  return `${MONTHS[month - 1]} ${year}`
}

const months = (n: number) =>
  n % 12 === 0 ? (n === 12 ? '12 months' : `${n / 12} years`) : `${n} months`

/** "Every 5,000 mi or 6 months", "Every 3 years", for the intervals that apply to this car. */
export const describeInterval = (item: MaintenanceItem, severeDuty: boolean): string => {
  const miles = (severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles
  const time = (severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths
  const parts = [
    miles !== undefined ? formatMiles(miles) : undefined,
    time !== undefined ? months(time) : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? `Every ${parts.join(' or ')}` : 'As needed'
}

const describeNextDue = (due: DueProjection): string => {
  if (due.status === 'overdue') return 'Overdue'
  if (due.trigger === 'miles' && due.dueMiles !== undefined) return formatMiles(due.dueMiles)
  return due.dueDate ? monthYear(due.dueDate) : 'Now'
}

const describeVehicle = (v: Vehicle) =>
  [v.trim, v.engine, v.drivetrain, v.vin ? `VIN ••••${v.vin.slice(-4)}` : undefined]
    .filter(Boolean)
    .join(' · ')

const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** Screen model for a car's page: its odometer, its maintenance schedule and which tab is open. */
export const createCarModel = (deps: CarDeps): CarModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  // The newest odometer reading, to reject a new one that goes backwards or jumps impossibly.
  let latest: OdometerReading | undefined
  let generation = 0
  let disposed = false

  return createStore<CarState & CarActions>()((set, get) => {
    const refresh = async () => {
      if (disposed) return
      const mine = ++generation
      try {
        const today = deps.clock.today()
        // Read the records here rather than keep the watch's copy, so a refresh started by a new
        // reading never runs before the records have arrived.
        const [due, readings, records, items] = await Promise.all([
          getDueItems(deps)(vehicle.id),
          deps.odometer.listForVehicle(vehicle.id),
          deps.records.listForVehicle(vehicle.id),
          vehicle.configId === undefined
            ? Promise.resolve([] as MaintenanceItem[])
            : deps.schedule.itemsForConfig(vehicle.configId),
        ])
        if (mine !== generation) return
        const odometer = currentOdometer(readings, records, today)
        latest = odometer.latest
        const byId = new Map(items.map((i) => [i.id, i]))
        set({
          status: vehicle.configId === undefined ? 'unmatched' : 'ready',
          odometer:
            odometer.miles === undefined
              ? undefined
              : odometer.latest?.date === today
                ? formatMiles(odometer.miles)
                : `About ${formatMiles(roundTo(odometer.miles, 10))}`,
          pace: odometer.isDefault
            ? 'Assuming the US average until there are two readings'
            : `About ${formatMiles(roundTo(odometer.milesPerDay * 30.44, 10))} a month`,
          schedule: due.map((d) => {
            const item = byId.get(d.itemId)
            return {
              itemId: d.itemId,
              task: d.task,
              status: d.status,
              interval: item ? describeInterval(item, vehicle.severeDuty) : '',
              next: describeNextDue(d),
            }
          }),
          error: undefined,
        })
      } catch (e) {
        if (mine !== generation) return
        set({
          status: 'ready',
          schedule: [],
          error: e instanceof Error ? e.message : 'Could not read the schedule',
        })
      }
    }

    return {
      status: 'loading',
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      subtitle: describeVehicle(vehicle),
      section: 'schedule',
      scheduleTitle: `${vehicle.make} schedule · ${vehicle.severeDuty ? 'severe' : 'normal'} driving`,
      schedule: [],

      showSection: (section) => set({ section }),

      editOdometer: () => set({ editingOdometer: { value: '', saving: false } }),

      setOdometer: (value) => {
        const editing = get().editingOdometer
        if (editing) set({ editingOdometer: { ...editing, value, error: undefined } })
      },

      cancelOdometer: () => set({ editingOdometer: undefined }),

      saveOdometer: async () => {
        const editing = get().editingOdometer
        if (!editing || editing.saving) return false
        const parsed = odometerReadingSchema.safeParse(editing.value)
        const fail = (error: string) => {
          set({ editingOdometer: { ...editing, saving: false, error } })
          return false
        }
        if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the miles')
        const today = deps.clock.today()
        if (latest && parsed.data < latest.miles)
          return fail(`That's less than the last reading of ${formatMiles(latest.miles)}`)
        // The estimate ignores a reading this far ahead as a typo, so saving it would change nothing.
        const days = latest ? daysBetween(latest.date, today) : 0
        if (latest && days > 0 && (parsed.data - latest.miles) / days > MAX_PLAUSIBLE_MILES_PER_DAY)
          return fail(
            `That's ${formatMiles(parsed.data - latest.miles)} since the last reading of ${formatMiles(latest.miles)}. Check the miles`,
          )
        const reading: OdometerReading = { vehicleId: vehicle.id, date: today, miles: parsed.data }
        set({ editingOdometer: { ...editing, saving: true, error: undefined } })
        try {
          await deps.odometer.add(reading)
        } catch (e) {
          return fail(e instanceof Error ? e.message : 'Could not save the reading')
        }
        set({ editingOdometer: undefined })
        await refresh()
        return true
      },

      start: () => {
        if (subscriptions.length > 0) return
        disposed = false
        // Logging a service or a new odometer reading (here or from sync) moves the schedule on,
        // so recompute whenever either changes.
        subscriptions.push(
          deps.records.watchForVehicle(vehicle.id, () => void refresh()),
          deps.odometer.watchForVehicle(vehicle.id, () => void refresh()),
        )
      },

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
        disposed = true
        generation++
      },
    }
  })
}
