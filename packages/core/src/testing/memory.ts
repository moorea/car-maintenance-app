import {
  AttachmentError,
  AuthError,
  type Attachment,
  type AttachmentErrorKind,
  type PickedFile,
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
  type Warranty,
  type FillUp,
  type Renewal,
} from '../domain/types'
import type {
  AttachmentRepo,
  DataFiles,
  DevicePreferences,
  DevicePreferencesRepo,
  AccountPort,
  AuthPort,
  CareReportExporter,
  Clock,
  FilePicker,
  FillUpRepo,
  FilePreview,
  FileSource,
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
  WarrantyRepo,
  RenewalRepo,
} from '../ports'
import type { IsoDate } from '../lib/date'
import type { CareReport } from '../features/care-report/report'

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
  /** Makes the next `add`, `setSevereDuty` or `setValue` throw. */
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
    setSevereDuty: async (id, severeDuty) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      vehicles = vehicles.map((v) => (v.id === id ? { ...v, severeDuty } : v))
      notify()
    },
    setValue: async (id, value) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      vehicles = vehicles.map((v) => {
        if (v.id !== id) return v
        const { valueCents: _cents, valuedOn: _on, ...rest } = v
        return value ? { ...rest, valueCents: value.cents, valuedOn: value.valuedOn } : rest
      })
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

/** Device preferences held in memory; `failNextUpdate` makes the next save throw. */
export const memoryPreferences = (
  initial: Partial<DevicePreferences> = {},
): DevicePreferencesRepo & { failNextUpdate: () => void } => {
  let preferences: DevicePreferences = {
    onboarded: false,
    aiSharingOwner: null,
    remindersOffered: false,
    historyDismissed: [],
    ...initial,
  }
  let fail = false
  const watchers = new Set<(p: DevicePreferences) => void>()
  return {
    watch: (onChange) => {
      watchers.add(onChange)
      onChange(preferences)
      return () => watchers.delete(onChange)
    },
    update: async (change) => {
      if (fail) {
        fail = false
        throw new Error('storage full')
      }
      preferences = { ...preferences, ...change }
      for (const w of watchers) w(preferences)
    },
    failNextUpdate: () => {
      fail = true
    },
  }
}

/**
 * Attachments with their files "on this phone" as `memory://<id>` URIs. `remote` lists ids whose
 * files are only on the server, so opening them downloads; `failNextOpen` and `failNextAdd` make
 * the next call throw.
 */
export const memoryAttachments = (
  initial: Attachment[] = [],
  options: { remote?: string[] } = {},
) => {
  let attachments = [...initial]
  const remote = new Set(options.remote)
  const files = new Map<string, PickedFile>()
  const downloads: string[] = []
  let nextOpenFailure: AttachmentErrorKind | undefined
  let nextAddFailure: string | undefined
  let pendingOpens: (() => void)[] = []
  let holdOpens = false
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (a: Attachment[]) => void }>()
  const forVehicle = (vehicleId: VehicleId) => attachments.filter((a) => a.vehicleId === vehicleId)
  const notify = () => {
    for (const w of watchers) w.onChange(forVehicle(w.vehicleId))
  }
  const repo: AttachmentRepo & {
    /** The picked file each attachment was saved from. */
    files: Map<string, PickedFile>
    /** Ids downloaded by `open`, in order. */
    downloads: string[]
    failNextOpen: (kind: AttachmentErrorKind) => void
    failNextAdd: (message: string) => void
    /** Makes opens wait until `releaseOpen`, to observe downloads in progress. */
    holdOpens: () => void
    releaseOpen: () => void
    /** Replaces the attachments, as a sync would, and notifies watchers. */
    set: (next: Attachment[]) => void
  } = {
    files,
    downloads,
    failNextOpen: (kind) => {
      nextOpenFailure = kind
    },
    failNextAdd: (message) => {
      nextAddFailure = message
    },
    holdOpens: () => {
      holdOpens = true
    },
    releaseOpen: () => {
      holdOpens = false
      for (const release of pendingOpens) release()
      pendingOpens = []
    },
    set: (next) => {
      attachments = [...next]
      notify()
    },
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    // Newest first, as the real repository orders them.
    add: async (attachment, file) => {
      if (nextAddFailure !== undefined) {
        const message = nextAddFailure
        nextAddFailure = undefined
        throw new Error(message)
      }
      files.set(attachment.id, file)
      attachments = [attachment, ...attachments]
      notify()
    },
    open: async (attachment) => {
      if (holdOpens) await new Promise<void>((resolve) => pendingOpens.push(resolve))
      if (nextOpenFailure !== undefined) {
        const kind = nextOpenFailure
        nextOpenFailure = undefined
        throw new AttachmentError(kind)
      }
      if (remote.delete(attachment.id)) downloads.push(attachment.id)
      return `memory://${attachment.id}`
    },
    remove: async (attachment) => {
      attachments = attachments.filter((a) => a.id !== attachment.id)
      files.delete(attachment.id)
      notify()
    },
  }
  return repo
}

/**
 * The camera and pickers, handing out queued files in order. With nothing queued the owner
 * cancels; `deny` makes the next pick fail as if access was refused.
 */
export const memoryFilePicker = (queued: PickedFile[] = []) => {
  const queue = [...queued]
  const asked: FileSource[] = []
  let denied = false
  const picker: FilePicker & {
    asked: FileSource[]
    queue: (file: PickedFile) => void
    deny: () => void
  } = {
    asked,
    queue: (file) => queue.push(file),
    deny: () => {
      denied = true
    },
    pick: async (source) => {
      asked.push(source)
      if (denied) {
        denied = false
        throw new AttachmentError('denied')
      }
      return queue.shift()
    },
  }
  return picker
}

/** The system viewer. `shown` lists the URIs shown, in order; `failNext` makes the next show throw. */
export const memoryFilePreview = () => {
  const shown: string[] = []
  let nextFailure = false
  const preview: FilePreview & { shown: string[]; failNext: () => void } = {
    shown,
    failNext: () => {
      nextFailure = true
    },
    show: async (uri) => {
      if (nextFailure) {
        nextFailure = false
        throw new Error('Cannot preview')
      }
      shown.push(uri)
    },
  }
  return preview
}

/** Warranties kept in memory. `failNext` makes the next save or removal throw. */
export const memoryWarranties = (initial: Warranty[] = []) => {
  let warranties = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (w: Warranty[]) => void }>()
  let nextFailure: string | undefined
  const forVehicle = (vehicleId: VehicleId) => warranties.filter((w) => w.vehicleId === vehicleId)
  const notify = () => {
    for (const w of watchers) w.onChange(forVehicle(w.vehicleId))
  }
  const failIfScheduled = () => {
    if (nextFailure === undefined) return
    const message = nextFailure
    nextFailure = undefined
    throw new Error(message)
  }
  const repo: WarrantyRepo & { failNext: (message: string) => void } = {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    save: async (warranty) => {
      failIfScheduled()
      warranties = [...warranties.filter((w) => w.id !== warranty.id), warranty]
      notify()
    },
    remove: async (id) => {
      failIfScheduled()
      warranties = warranties.filter((w) => w.id !== id)
      notify()
    },
    failNext: (message) => {
      nextFailure = message
    },
  }
  return repo
}

/** Keeps every report it is asked to share in `shared`. `failNext` makes the next one throw. */
export const memoryReportExporter = () => {
  let nextFailure: string | undefined
  const exporter: CareReportExporter & {
    shared: CareReport[]
    failNext: (message: string) => void
  } = {
    shared: [],
    failNext: (message) => {
      nextFailure = message
    },
    share: async (report) => {
      if (nextFailure !== undefined) {
        const message = nextFailure
        nextFailure = undefined
        throw new Error(message)
      }
      exporter.shared.push(report)
    },
  }
  return exporter
}

const soonestFirst = (a: Renewal, b: Renewal) =>
  a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id)

/** Renewals kept in memory, soonest first. `failNext` makes the next save or removal throw. */
export const memoryRenewals = (initial: Renewal[] = []) => {
  let renewals = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (r: Renewal[]) => void }>()
  let nextFailure: string | undefined
  const forVehicle = (vehicleId: VehicleId) =>
    renewals.filter((r) => r.vehicleId === vehicleId).sort(soonestFirst)
  const notify = () => {
    for (const w of watchers) w.onChange(forVehicle(w.vehicleId))
  }
  const failIfScheduled = () => {
    if (nextFailure === undefined) return
    const message = nextFailure
    nextFailure = undefined
    throw new Error(message)
  }
  const repo: RenewalRepo & { failNext: (message: string) => void } = {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    save: async (renewal) => {
      failIfScheduled()
      renewals = [...renewals.filter((r) => r.id !== renewal.id), renewal]
      notify()
    },
    remove: async (id) => {
      failIfScheduled()
      renewals = renewals.filter((r) => r.id !== id)
      notify()
    },
    failNext: (message) => {
      nextFailure = message
    },
  }
  return repo
}

const newestFirst = (a: FillUp, b: FillUp) =>
  b.filledOn.localeCompare(a.filledOn) || b.odometerMiles - a.odometerMiles

/** Fill-ups kept in memory, newest first. `failNext` makes the next save or removal throw. */
export const memoryFillUps = (initial: FillUp[] = []) => {
  let fillUps = [...initial]
  const watchers = new Set<{ vehicleId: VehicleId; onChange: (f: FillUp[]) => void }>()
  let nextFailure: string | undefined
  const forVehicle = (vehicleId: VehicleId) =>
    fillUps.filter((f) => f.vehicleId === vehicleId).sort(newestFirst)
  const notify = () => {
    for (const w of watchers) w.onChange(forVehicle(w.vehicleId))
  }
  const failIfScheduled = () => {
    if (nextFailure === undefined) return
    const message = nextFailure
    nextFailure = undefined
    throw new Error(message)
  }
  const repo: FillUpRepo & { failNext: (message: string) => void } = {
    listForVehicle: async (vehicleId) => forVehicle(vehicleId),
    watchForVehicle: (vehicleId, onChange) => {
      const watcher = { vehicleId, onChange }
      watchers.add(watcher)
      onChange(forVehicle(vehicleId))
      return () => watchers.delete(watcher)
    },
    save: async (fillUp) => {
      failIfScheduled()
      fillUps = [...fillUps.filter((f) => f.id !== fillUp.id), fillUp]
      notify()
    },
    remove: async (id) => {
      failIfScheduled()
      fillUps = fillUps.filter((f) => f.id !== id)
      notify()
    },
    failNext: (message) => {
      nextFailure = message
    },
  }
  return repo
}

/**
 * Files moving in and out of the app. `stored` holds the bytes behind each readable URI (memory
 * attachments open as `memory://<id>`); `shared` records every shared file; `queueArchive` sets
 * what the next pick returns; `failNextShare` and `failNextStage` make the next one throw; `staged` keeps the bytes of each staged file by its URI.
 */
export const memoryDataFiles = (stored: Record<string, Uint8Array> = {}) => {
  const queue: (Uint8Array | Error)[] = []
  let nextShareFailure: string | undefined
  let nextStageFailure: string | undefined
  const files: DataFiles & {
    stored: Record<string, Uint8Array>
    shared: { bytes: Uint8Array; name: string }[]
    staged: Map<string, Uint8Array>
    queueArchive: (bytes: Uint8Array | Error) => void
    failNextShare: (message: string) => void
    failNextStage: (message: string) => void
  } = {
    stored,
    shared: [],
    staged: new Map(),
    queueArchive: (bytes) => queue.push(bytes),
    failNextShare: (message) => {
      nextShareFailure = message
    },
    failNextStage: (message) => {
      nextStageFailure = message
    },
    read: async (uri) => {
      const bytes = stored[uri]
      if (!bytes) throw new Error(`No file at ${uri}`)
      return bytes
    },
    share: async (bytes, name) => {
      if (nextShareFailure !== undefined) {
        const message = nextShareFailure
        nextShareFailure = undefined
        throw new Error(message)
      }
      files.shared.push({ bytes, name })
    },
    pickArchive: async () => {
      const next = queue.shift()
      if (next instanceof Error) throw next
      return next
    },
    stage: async (bytes, file) => {
      if (nextStageFailure !== undefined) {
        const message = nextStageFailure
        nextStageFailure = undefined
        throw new Error(message)
      }
      const uri = `staged://${files.staged.size + 1}/${file.name}`
      files.staged.set(uri, bytes)
      return { uri, name: file.name, contentType: file.contentType, sizeBytes: bytes.length }
    },
  }
  return files
}
