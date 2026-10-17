import {
  AuthError,
  VinDecodeError,
  type AuthErrorKind,
  type AuthUser,
  type DecodedVin,
  type VinDecodeErrorKind,
  type MaintenanceItem,
  type OdometerReading,
  type SafetyReport,
  type ServiceRecord,
  type Vehicle,
  type VehicleId,
} from '../domain/types'
import type {
  AccountPort,
  AuthPort,
  Clock,
  IdGenerator,
  LocalNotification,
  NotificationPermission,
  Notifier,
  ReminderSettings,
  ReminderSettingsRepo,
  SyncStatus,
  OdometerRepo,
  SafetyRepo,
  VinDecoder,
  ScheduleRepo,
  ServiceRecordRepo,
  VehicleRepo,
} from '../ports'
import type { IsoDate } from '../lib/date'

/** In-memory adapters for tests and headless runs. They behave like the real ones, minus I/O. */
/** The owner `memoryVehicles` assumes when not told otherwise. */
export const OWNER = 'u1'

/**
 * Vehicles keyed by owner, so tests can model what each signed-in user sees. `added` records the
 * first odometer reading saved with each new car; `failNextAdd` makes the next save throw.
 */
export const memoryVehicles = (
  initial: Vehicle[] = [],
  ownerOf: (vehicle: Vehicle) => string = () => OWNER,
): VehicleRepo & {
  set: (vehicles: Vehicle[]) => void
  added: { ownerId: string; vehicle: Vehicle; firstReading?: OdometerReading }[]
  failNextAdd: (message: string) => void
} => {
  let vehicles = [...initial]
  const addedOwners = new Map<string, string>()
  const added: { ownerId: string; vehicle: Vehicle; firstReading?: OdometerReading }[] = []
  let nextFailure: string | undefined
  const watchers = new Set<{ ownerId: string; onChange: (v: Vehicle[]) => void }>()
  const owner = (v: Vehicle) => addedOwners.get(v.id) ?? ownerOf(v)
  const owned = (ownerId: string) => vehicles.filter((v) => owner(v) === ownerId)
  const notify = () => {
    for (const w of watchers) w.onChange(owned(w.ownerId))
  }
  return {
    added,
    get: async (id) => vehicles.find((v) => v.id === id),
    watchOwned: (ownerId, onChange) => {
      const watcher = { ownerId, onChange }
      watchers.add(watcher)
      onChange(owned(ownerId))
      return () => watchers.delete(watcher)
    },
    add: async (ownerId, vehicle, firstReading) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      addedOwners.set(vehicle.id, ownerId)
      vehicles = [...vehicles, vehicle]
      added.push({ ownerId, vehicle, ...(firstReading && { firstReading }) })
      notify()
    },
    /** Replaces the vehicles, as a sync would, and notifies watchers. */
    set: (next) => {
      vehicles = [...next]
      notify()
    },
    failNextAdd: (message) => {
      nextFailure = message
    },
  }
}

/** Decodes the VINs it is given; any other VIN is not found. `failNext` makes the next one throw. */
export const memoryVinDecoder = (known: DecodedVin[] = []) => {
  let nextFailure: VinDecodeErrorKind | undefined
  const looked: string[] = []
  const decoder: VinDecoder & { looked: string[]; failNext: (kind: VinDecodeErrorKind) => void } = {
    looked,
    failNext: (kind) => {
      nextFailure = kind
    },
    decode: async (vin) => {
      looked.push(vin)
      if (nextFailure !== undefined) {
        const kind = nextFailure
        nextFailure = undefined
        throw new VinDecodeError(kind)
      }
      const found = known.find((d) => d.vin === vin)
      if (!found) throw new VinDecodeError('not-found')
      return found
    },
  }
  return decoder
}

/**
 * Email sign-in that accepts one fixed code. `sent` records where codes went; `failNext` makes
 * the next request throw an AuthError of that kind.
 */
export const memoryAuth = (
  options: { user?: AuthUser; validCode?: string; userIdFor?: (email: string) => string } = {},
) => {
  const validCode = options.validCode ?? '123456'
  const userIdFor = options.userIdFor ?? ((email: string) => `user-${email}`)
  let user: AuthUser | null = options.user ?? null
  let nextFailure: AuthErrorKind | undefined
  const sent: string[] = []
  const watchers = new Set<(u: AuthUser | null) => void>()
  const setUser = (next: AuthUser | null) => {
    user = next
    for (const w of watchers) w(user)
  }
  const failIfScheduled = () => {
    if (nextFailure === undefined) return
    const kind = nextFailure
    nextFailure = undefined
    throw new AuthError(kind)
  }
  const auth: AuthPort & {
    sent: string[]
    failNext: (kind: AuthErrorKind) => void
  } = {
    sent,
    failNext: (kind) => {
      nextFailure = kind
    },
    watchUser: (onChange) => {
      watchers.add(onChange)
      onChange(user)
      return () => watchers.delete(onChange)
    },
    sendCode: async (email) => {
      failIfScheduled()
      sent.push(email)
    },
    verifyCode: async (email, code) => {
      failIfScheduled()
      if (!sent.includes(email) || code !== validCode) throw new AuthError('invalid-code')
      setUser({ id: userIdFor(email), email })
    },
    // Like Supabase, signs out locally even when the server call fails.
    signOut: async () => {
      setUser(null)
      failIfScheduled()
    },
  }
  return auth
}

/**
 * Account deletion for a pretend owner signed in with `auth`: deleting signs them out.
 * `failNext` makes the next deletion throw and delete nothing.
 */
export const memoryAccount = (auth: Pick<AuthPort, 'signOut'>) => {
  let nextFailure: AuthErrorKind | undefined
  const account: AccountPort & { deletions: number; failNext: (kind: AuthErrorKind) => void } = {
    deletions: 0,
    failNext: (kind) => {
      nextFailure = kind
    },
    deleteAccount: async () => {
      if (nextFailure !== undefined) {
        const kind = nextFailure
        nextFailure = undefined
        throw new AuthError(kind)
      }
      account.deletions++
      await auth.signOut()
    },
  }
  return account
}

export const memorySchedule = (items: MaintenanceItem[] = []): ScheduleRepo => ({
  itemsForConfig: async (configId) => items.filter((i) => i.configId === configId),
})

export const memoryOdometer = (initial: OdometerReading[] = []): OdometerRepo => {
  const readings = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (r: OdometerReading[]) => void }>()
  const forVehicle = (vehicleId: VehicleId) => readings.filter((r) => r.vehicleId === vehicleId)

  return {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    add: async (reading) => {
      readings.push(reading)
      for (const w of watchers)
        if (w.vehicleId === reading.vehicleId) w.onChange(forVehicle(w.vehicleId))
    },
  }
}

export const memoryServiceRecords = (
  initial: ServiceRecord[] = [],
): ServiceRecordRepo & { failNextAdd: (message: string) => void } => {
  const records = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (r: ServiceRecord[]) => void }>()
  let nextFailure: string | undefined
  const forVehicle = (vehicleId: VehicleId) => records.filter((r) => r.vehicleId === vehicleId)

  return {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    add: async (record) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      records.push(record)
      for (const w of watchers)
        if (w.vehicleId === record.vehicleId) w.onChange(forVehicle(w.vehicleId))
    },
    failNextAdd: (message) => {
      nextFailure = message
    },
  }
}

export const fixedClock = (today: IsoDate): Clock => ({ today: () => today })

export const sequentialIds = (prefix = 'id'): IdGenerator => {
  let n = 0
  return { next: () => `${prefix}-${++n}` }
}

/** First-sync status. Already synced unless `{ synced: false }`; `complete()` finishes it. */
export const memorySync = (options: { synced?: boolean } = {}) => {
  let synced = options.synced ?? true
  const waiting = new Set<() => void>()
  const sync: SyncStatus & { complete: () => void } = {
    onFirstSync: (_ownerId, onSynced) => {
      if (synced) {
        onSynced()
        return () => {}
      }
      waiting.add(onSynced)
      return () => waiting.delete(onSynced)
    },
    complete: () => {
      synced = true
      for (const w of [...waiting]) w()
      waiting.clear()
    },
  }
  return sync
}

const EMPTY_REPORT: SafetyReport = { recalls: [], complaints: [] }

/** Safety reports keyed by config id. `set` replaces one, as a sync would, and notifies watchers. */
export const memorySafety = (initial: Record<string, SafetyReport> = {}) => {
  const reports = new Map(Object.entries(initial))
  const watchers = new Set<{ configId: string; onChange: (r: SafetyReport) => void }>()
  const repo: SafetyRepo & { set: (configId: string, report: SafetyReport) => void } = {
    watchForConfig: (configId, onChange) => {
      const watcher = { configId, onChange }
      watchers.add(watcher)
      onChange(reports.get(configId) ?? EMPTY_REPORT)
      return () => watchers.delete(watcher)
    },
    set: (configId, report) => {
      reports.set(configId, report)
      for (const w of watchers) if (w.configId === configId) w.onChange(report)
    },
  }
  return repo
}

/**
 * Notifications on a pretend device. `answer` is what the owner says to the permission prompt;
 * once answered, asking again changes nothing, as on iOS. `setPermission` changes it as the
 * Settings app would, and `failNextSchedule` makes the next schedule throw.
 */
export const memoryNotifier = (
  options: { permission?: NotificationPermission; answer?: 'granted' | 'denied' } = {},
) => {
  let permission = options.permission ?? 'undetermined'
  const pending = new Map<string, LocalNotification>()
  const log: string[] = []
  let nextFailure: string | undefined
  const openWatchers = new Set<(vehicleId: string) => void>()
  const notifier: Notifier & {
    /** Every schedule and cancel, in order, as "schedule <id>" or "cancel <id>". */
    log: string[]
    prompts: number
    settingsOpened: number
    setPermission: (p: NotificationPermission) => void
    failNextSchedule: (message: string) => void
    /** The owner taps a reminder about `vehicleId`. */
    tap: (vehicleId: string) => void
  } = {
    log,
    prompts: 0,
    settingsOpened: 0,
    setPermission: (p) => {
      permission = p
    },
    failNextSchedule: (message) => {
      nextFailure = message
    },
    permission: async () => permission,
    requestPermission: async () => {
      if (permission === 'undetermined') {
        notifier.prompts++
        permission = options.answer ?? 'granted'
      }
      return permission
    },
    scheduled: async () =>
      [...pending.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
    schedule: async (n) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      log.push(`schedule ${n.id}`)
      pending.set(n.id, n)
    },
    cancel: async (id) => {
      log.push(`cancel ${id}`)
      pending.delete(id)
    },
    openSettings: async () => {
      notifier.settingsOpened++
    },
    watchOpened: (onOpen) => {
      openWatchers.add(onOpen)
      return () => openWatchers.delete(onOpen)
    },
    tap: (vehicleId) => {
      for (const w of openWatchers) w(vehicleId)
    },
  }
  return notifier
}

/** Reminder settings kept in memory. Reminders are off until turned on, as on a new phone. */
export const memoryReminderSettings = (
  initial: ReminderSettings = { enabled: false },
): ReminderSettingsRepo => {
  let settings = initial
  const watchers = new Set<(s: ReminderSettings) => void>()
  return {
    watch: (onChange) => {
      watchers.add(onChange)
      onChange(settings)
      return () => watchers.delete(onChange)
    },
    set: async (next) => {
      settings = next
      for (const w of watchers) w(settings)
    },
  }
}
