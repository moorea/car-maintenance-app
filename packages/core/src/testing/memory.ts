import {
  AuthError,
  type AuthErrorKind,
  type AuthUser,
  type MaintenanceItem,
  type OdometerReading,
  type ServiceRecord,
  type Vehicle,
  type VehicleId,
} from '../domain/types'
import type {
  AuthPort,
  Clock,
  IdGenerator,
  SyncStatus,
  OdometerRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  VehicleRepo,
} from '../ports'
import type { IsoDate } from '../lib/date'

/** In-memory adapters for tests and headless runs. They behave like the real ones, minus I/O. */
/** The owner `memoryVehicles` assumes when not told otherwise. */
export const OWNER = 'u1'

/** Vehicles keyed by owner, so tests can model what each signed-in user sees. */
export const memoryVehicles = (
  initial: Vehicle[] = [],
  ownerOf: (vehicle: Vehicle) => string = () => OWNER,
): VehicleRepo & { set: (vehicles: Vehicle[]) => void } => {
  let vehicles = [...initial]
  const watchers = new Set<{ ownerId: string; onChange: (v: Vehicle[]) => void }>()
  const owned = (ownerId: string) => vehicles.filter((v) => ownerOf(v) === ownerId)
  return {
    get: async (id) => vehicles.find((v) => v.id === id),
    watchOwned: (ownerId, onChange) => {
      const watcher = { ownerId, onChange }
      watchers.add(watcher)
      onChange(owned(ownerId))
      return () => watchers.delete(watcher)
    },
    /** Replaces the vehicles, as a sync would, and notifies watchers. */
    set: (next) => {
      vehicles = [...next]
      for (const w of watchers) w.onChange(owned(w.ownerId))
    },
  }
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

export const memorySchedule = (items: MaintenanceItem[] = []): ScheduleRepo => ({
  itemsForConfig: async (configId) => items.filter((i) => i.configId === configId),
})

export const memoryOdometer = (readings: OdometerReading[] = []): OdometerRepo => ({
  listForVehicle: async (vehicleId) => readings.filter((r) => r.vehicleId === vehicleId),
  add: async (reading) => {
    readings.push(reading)
  },
})

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
