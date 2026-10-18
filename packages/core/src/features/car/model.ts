import { createStore, type StoreApi } from 'zustand/vanilla'
import { daysBetween, type IsoDate } from '../../lib/date'
import { formatMiles } from '../../lib/format'
import { isGeneralGuidance } from '../../lib/schedule'
import {
  AssistantError,
  type AssistantErrorKind,
  type MaintenanceItem,
  type OdometerReading,
  type QuotePhoto,
  type Vehicle,
} from '../../domain/types'
import { cancellation } from '../../lib/cancel'
import type { OdometerReader, PhotoPicker, Unsubscribe } from '../../ports'
import { getDueItems, type GetDueItemsDeps } from '../../reminders/getDueItems'
import { MAX_PLAUSIBLE_MILES_PER_DAY } from '../../reminders/mileage'
import type { DueProjection, DueStatus } from '../../reminders/projectDue'
import { odometerReadingSchema } from '../../schemas/odometer'
import { MAX_QUOTE_PHOTO_BASE64 } from '../../schemas/quote'
import { watchAiSharing, type AiSharingDeps } from '../ai-sharing/model'
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
  /** True while a photo of the odometer is being read on the server. */
  reading: boolean
  /** Asks the owner to check miles a photo filled in before saving them. */
  note?: string | undefined
  /**
   * Set when the owner asked to read a photo but has not allowed sharing with Anthropic: the
   * screen explains what is sent and asks first (App Store guideline 5.1.2(i)).
   */
  asking?: PhotoSource | undefined
  /** True while allowing sharing is being saved. */
  allowing?: boolean | undefined
}

/** Where a photo of the odometer comes from. */
export type PhotoSource = 'camera' | 'library'

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
  /** "Toyota schedule · normal driving", or "General schedule · normal driving". */
  scheduleTitle: string
  /** Says the schedule is general guidance, not the manufacturer's; absent when it is theirs. */
  scheduleNote?: string | undefined
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
  /** Closes the editor, stopping a photo being read. */
  cancelOdometer: () => void
  /** Photographs the odometer with the camera and fills in the miles it shows. */
  takeOdometerPhoto: () => Promise<void>
  /** Picks a photo of the odometer from the library and fills in the miles it shows. */
  chooseOdometerPhoto: () => Promise<void>
  /** Allows sharing photos with Anthropic, then opens the camera or library the owner chose. */
  allowPhotoReading: () => Promise<void>
  /** Leaves sharing off and goes back to typing the miles. */
  declinePhotoReading: () => void
  /** Validates and saves the reading. Resolves true when saved. */
  saveOdometer: () => Promise<boolean>
  dispose: () => void
}

export type CarModel = StoreApi<CarState & CarActions>

export interface CarDeps extends GetDueItemsDeps, AiSharingDeps {
  vehicle: Vehicle
  photos: PhotoPicker
  odometerReader: OdometerReader
}

const READ_ERRORS: Record<AssistantErrorKind, string> = {
  offline: "You're offline. Reading a photo needs a connection, but you can type the miles.",
  'signed-out': 'Sign in again to read photos.',
  'not-found': 'Something went wrong. Try again.',
  'rate-limited': "You've used the assistant a lot today. Type the miles, or try tomorrow.",
  unavailable: "Reading photos isn't available right now. Type the miles instead.",
  declined: "That photo couldn't be read. Try another, or type the miles.",
  'not-allowed':
    'Reading photos is turned off in Account. Turn on sharing with Anthropic, or type the miles.',
  unknown: 'Something went wrong reading the photo. Try again, or type the miles.',
}

const CHECK_PHOTO = 'Read from your photo. Check it matches the dashboard, then save.'

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

const scheduleTitle = (whose: string, severeDuty: boolean) =>
  `${whose} schedule · ${severeDuty ? 'severe' : 'normal'} driving`

const roundTo = (n: number, step: number) => Math.round(n / step) * step

const EMPTY_EDITOR: OdometerEditor = { value: '', saving: false, reading: false }

/** Screen model for a car's page: its odometer, its maintenance schedule and which tab is open. */
export const createCarModel = (deps: CarDeps): CarModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  // The newest odometer reading, to reject a new one that goes backwards or jumps impossibly.
  let latest: OdometerReading | undefined
  let generation = 0
  let disposed = false
  let photoRead: { cancel: () => void } | undefined
  // True while the camera or photo picker is open, so a second tap does not open another.
  let picking = false
  // Whether the signed-in owner allowed sharing with Anthropic, and who that owner is; undefined
  // until both are known.
  let sharing: { allowed: boolean; userId: string | null } | undefined
  let stopSharing: Unsubscribe | undefined

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
        const general = isGeneralGuidance(items)
        set({
          scheduleTitle: scheduleTitle(general ? 'General' : vehicle.make, vehicle.severeDuty),
          scheduleNote: general
            ? `General guidance for most cars, not ${vehicle.make}'s own schedule. Your owner's manual has the exact intervals for this car.`
            : undefined,
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

    /** The miles typed or read, or why they can't be saved. */
    const check = (value: string): { miles: number } | string => {
      const parsed = odometerReadingSchema.safeParse(value)
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Check the miles'
      const miles = parsed.data
      if (latest && miles < latest.miles)
        return `That's less than the last reading of ${formatMiles(latest.miles)}`
      // The estimate ignores a reading this far ahead as a typo, so saving it would change nothing.
      const days = latest ? daysBetween(latest.date, deps.clock.today()) : 0
      if (latest && days > 0 && (miles - latest.miles) / days > MAX_PLAUSIBLE_MILES_PER_DAY)
        return `That's ${formatMiles(miles - latest.miles)} since the last reading of ${formatMiles(latest.miles)}. Check the miles`
      return { miles }
    }

    // The editor as it is now, if the owner is still in it and nothing else is running.
    const idleEditor = () => {
      const editing = get().editingOdometer ?? EMPTY_EDITOR
      return editing.reading || editing.saving ? undefined : editing
    }

    const readPhoto = async (source: PhotoSource) => {
      const idle = idleEditor()
      // Until the owner's choice has loaded, asking could ask someone who already said yes.
      if (disposed || picking || !idle || idle.allowing || !sharing) return
      if (sharing.userId === null) {
        set({ editingOdometer: { ...idle, error: READ_ERRORS['signed-out'] } })
        return
      }
      if (!sharing.allowed) {
        set({ editingOdometer: { ...idle, asking: source, error: undefined } })
        return
      }
      const pick = () => (source === 'camera' ? deps.photos.take() : deps.photos.choose())
      // Photographing straight from the card opens the editor, so the result has somewhere to go.
      if (!get().editingOdometer) set({ editingOdometer: EMPTY_EDITOR })
      const failed = (error: string) => {
        const editing = get().editingOdometer
        if (editing)
          set({ editingOdometer: { ...editing, reading: false, error, note: undefined } })
      }
      let photo: QuotePhoto | undefined
      picking = true
      try {
        photo = await pick()
      } catch {
        failed("Couldn't open the photo. Check that the app may use your camera and photos.")
        return
      } finally {
        picking = false
      }
      // The owner may have closed the editor while the camera was open.
      const editing = get().editingOdometer
      if (!photo || disposed || !editing || editing.reading || editing.saving) return
      if (photo.base64.length > MAX_QUOTE_PHOTO_BASE64) {
        failed('That photo is too large to read. Try a closer photo, or type the miles.')
        return
      }
      const { signal, cancel } = cancellation()
      photoRead = { cancel }
      set({ editingOdometer: { ...editing, reading: true, error: undefined, note: undefined } })
      try {
        const miles = await deps.odometerReader.read(photo, signal)
        if (signal.aborted) return
        photoRead = undefined
        if (miles === undefined) {
          failed("Couldn't find the miles in that photo. Try a closer photo, or type them.")
          return
        }
        const value = String(miles)
        const checked = check(value)
        set({
          editingOdometer: {
            value,
            saving: false,
            reading: false,
            // A misread shows the same reason a typo would, so the owner fixes it before saving.
            ...(typeof checked === 'string' ? { error: checked } : { note: CHECK_PHOTO }),
          },
        })
      } catch (e) {
        if (signal.aborted) return
        photoRead = undefined
        failed(READ_ERRORS[e instanceof AssistantError ? e.kind : 'unknown'])
      }
    }

    return {
      status: 'loading',
      title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      subtitle: describeVehicle(vehicle),
      section: 'schedule',
      scheduleTitle: scheduleTitle(vehicle.make, vehicle.severeDuty),
      schedule: [],

      showSection: (section) => set({ section }),

      editOdometer: () => set({ editingOdometer: EMPTY_EDITOR }),

      setOdometer: (value) => {
        const editing = get().editingOdometer
        if (editing && !editing.reading)
          set({ editingOdometer: { ...editing, value, error: undefined, note: undefined } })
      },

      cancelOdometer: () => {
        photoRead?.cancel()
        photoRead = undefined
        set({ editingOdometer: undefined })
      },

      takeOdometerPhoto: () => readPhoto('camera'),
      chooseOdometerPhoto: () => readPhoto('library'),

      allowPhotoReading: async () => {
        const editing = get().editingOdometer
        const source = editing?.asking
        const userId = sharing?.userId
        if (!editing || !source || editing.allowing || !userId) return
        set({ editingOdometer: { ...editing, allowing: true, error: undefined } })
        try {
          await deps.preferences.update({ aiSharingOwner: userId })
        } catch {
          const now = get().editingOdometer
          if (now)
            set({
              editingOdometer: {
                ...now,
                allowing: false,
                error: "Couldn't save that choice. Try again.",
              },
            })
          return
        }
        sharing = { userId, allowed: true }
        const now = get().editingOdometer
        // The owner may have closed the editor or left the page while the choice was saved.
        if (!now || disposed) return
        set({ editingOdometer: { ...now, asking: undefined, allowing: false } })
        await readPhoto(source)
      },

      declinePhotoReading: () => {
        const editing = get().editingOdometer
        if (editing && !editing.allowing)
          set({ editingOdometer: { ...editing, asking: undefined, error: undefined } })
      },

      saveOdometer: async () => {
        const editing = get().editingOdometer
        if (!editing || editing.saving || editing.reading) return false
        const checked = check(editing.value)
        if (typeof checked === 'string') {
          set({ editingOdometer: { ...editing, saving: false, error: checked } })
          return false
        }
        const reading: OdometerReading = {
          vehicleId: vehicle.id,
          date: deps.clock.today(),
          miles: checked.miles,
        }
        set({ editingOdometer: { ...editing, saving: true, error: undefined } })
        try {
          await deps.odometer.add(reading)
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Could not save the reading'
          set({ editingOdometer: { ...editing, saving: false, error } })
          return false
        }
        set({ editingOdometer: undefined })
        await refresh()
        return true
      },

      start: () => {
        if (subscriptions.length > 0) return
        disposed = false
        stopSharing = watchAiSharing(deps, (allowed, userId) => {
          sharing = { allowed, userId }
        })
        // Logging a service or a new odometer reading (here or from sync) moves the schedule on,
        // so recompute whenever either changes.
        subscriptions.push(
          deps.records.watchForVehicle(vehicle.id, () => void refresh()),
          deps.odometer.watchForVehicle(vehicle.id, () => void refresh()),
        )
      },

      dispose: () => {
        photoRead?.cancel()
        photoRead = undefined
        stopSharing?.()
        stopSharing = undefined
        for (const stop of subscriptions.splice(0)) stop()
        disposed = true
        generation++
      },
    }
  })
}
