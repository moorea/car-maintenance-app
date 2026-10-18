import { createStore, type StoreApi } from 'zustand/vanilla'
import type { AuthPort, DataFiles, IdGenerator, Unsubscribe } from '../../ports'
import type { Vehicle } from '../../domain/types'
import {
  ImportError,
  readArchive,
  type ExportedCar,
  type OpenedArchive,
} from '../../portability/archive'
import {
  exportData,
  firstValue,
  importData,
  planImport,
  type ExportDeps,
  type ExportResult,
  type ImportDeps,
  type ImportResult,
} from '../../portability/transfer'

/**
 * - `ready`: nothing running.
 * - `exporting`: gathering everything (downloading files this phone lacks) and sharing the zip.
 * - `sharing`: offering the last export's zip in the share sheet again.
 * - `reading`: picking an export and opening it.
 * - `confirming-import`: showing what the export would add, for the owner to confirm.
 * - `importing`: adding it to the garage.
 */
export type YourDataStatus =
  'ready' | 'exporting' | 'sharing' | 'reading' | 'confirming-import' | 'importing'

export interface YourDataState {
  status: YourDataStatus
  /** What the picked export would do, while confirming. Cars are named as the garage names them. */
  plan?: { adding: string[]; skipping: string[] } | undefined
  /** The outcome of the last export or import, until the next one starts. */
  message?: { tone: 'success' | 'error'; text: string } | undefined
  /**
   * The last export's zip can be offered again. The share sheet cannot say whether the owner
   * saved or sent it, so the export is kept for another try until something else starts.
   */
  canShareAgain: boolean
}

export interface YourDataActions {
  start: () => void
  /** Exports everything and opens the share sheet with the zip. */
  exportAll: () => Promise<void>
  /** Opens the share sheet again with the last export's zip, without gathering it again. */
  shareAgain: () => Promise<void>
  /** Opens the file picker for an export and shows what importing it would add. */
  chooseImport: () => Promise<void>
  /** Adds the confirmed export's cars to the garage. */
  confirmImport: () => Promise<void>
  cancelImport: () => void
  dispose: () => void
}

export type YourDataModel = StoreApi<YourDataState & YourDataActions>

export interface YourDataDeps extends Omit<ExportDeps, keyof ImportDeps> {
  auth: Pick<AuthPort, 'watchUser'>
  vehicles: ExportDeps['vehicles'] & ImportDeps['vehicles']
  odometer: ExportDeps['odometer'] & ImportDeps['odometer']
  services: ExportDeps['services'] & ImportDeps['services']
  attachments: ExportDeps['attachments'] & ImportDeps['attachments']
  warranties: ExportDeps['warranties'] & ImportDeps['warranties']
  fillUps: ExportDeps['fillUps'] & ImportDeps['fillUps']
  renewals: ExportDeps['renewals'] & ImportDeps['renewals']
  customItems: ExportDeps['customItems'] & ImportDeps['customItems']
  files: DataFiles
  ids: IdGenerator
}

/** "1 car", "2 cars". */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "a, b and c". */
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const carName = (car: ExportedCar) => car.nickname.trim() || `${car.year} ${car.make} ${car.model}`

const exportedText = (r: ExportResult) => {
  // The share sheet cannot say whether the zip was saved or sent, so this claims neither.
  if (r.cars === 0) return 'Your export is ready. There are no cars in your account yet.'
  const parts = [
    count(r.cars, 'car'),
    count(r.services, 'service'),
    count(r.warranties, 'warranty', 'warranties'),
    // Only cars with fill-ups or renewals mention them.
    ...(r.fillUps > 0 ? [count(r.fillUps, 'fill-up')] : []),
    ...(r.renewals > 0 ? [count(r.renewals, 'renewal date')] : []),
    count(r.documents, 'document'),
  ]
  const missing =
    r.missing > 0
      ? ` ${count(r.missing, 'document')} ${r.missing === 1 ? "isn't" : "aren't"} on this phone and couldn't be downloaded, so ${r.missing === 1 ? 'it was' : 'they were'} left out. Connect to the internet and export again to include ${r.missing === 1 ? 'it' : 'them'}.`
      : ''
  return `Your export is ready: ${list(parts)}.${missing}`
}

const importedText = (r: ImportResult) => {
  const added = `Added ${count(r.cars, 'car')} with ${list([
    count(r.services, 'service'),
    count(r.warranties, 'warranty', 'warranties'),
    ...(r.fillUps > 0 ? [count(r.fillUps, 'fill-up')] : []),
    ...(r.renewals > 0 ? [count(r.renewals, 'renewal date')] : []),
    count(r.documents, 'document'),
  ])}.`
  const skipped =
    r.skipped > 0
      ? ` ${count(r.skipped, 'car')} already in your garage ${r.skipped === 1 ? 'was' : 'were'} left as ${r.skipped === 1 ? 'it was' : 'they were'}.`
      : ''
  const missing =
    r.missing > 0
      ? ` ${count(r.missing, 'document')} ${r.missing === 1 ? 'was' : 'were'} not in the export.`
      : ''
  return added + skipped + missing
}

const IMPORT_ERRORS: Record<ImportError['kind'], string> = {
  'not-an-export': "That file isn't a car data export. Choose a zip exported from this app.",
  'newer-version': 'That export is from a newer version of the app. Update the app and try again.',
  damaged: 'That export is damaged and cannot be imported.',
}

/** A zip as it was offered in the share sheet. */
interface SharedZip {
  bytes: Uint8Array
  name: string
}

const ERROR = (text: string) => ({ tone: 'error' as const, text })

/**
 * Screen model for the owner's data: exporting all of it as an open-format zip, and importing such
 * a zip into this account, after showing what it would add.
 */
export const createYourDataModel = (deps: YourDataDeps): YourDataModel => {
  let stop: Unsubscribe | undefined
  let ownerId: string | undefined
  let picked: OpenedArchive | undefined
  let lastExport: SharedZip | undefined
  // What the export said, shown again once sharing it again works.
  let exportedMessage: YourDataState['message']

  return createStore<YourDataState & YourDataActions>()((set, get) => ({
    status: 'ready',
    canShareAgain: false,

    start: () => {
      if (stop) return
      stop = deps.auth.watchUser((user) => {
        ownerId = user?.id
      })
    },

    exportAll: async () => {
      if (get().status !== 'ready' || !ownerId) return
      lastExport = undefined
      set({ status: 'exporting', message: undefined, canShareAgain: false })
      // Set by the share below; a holder, since TypeScript cannot see the callback assign it.
      const built: { zip?: SharedZip } = {}
      const files: ExportDeps['files'] = {
        read: (uri) => deps.files.read(uri),
        share: (bytes, name) => {
          built.zip = { bytes, name }
          return deps.files.share(bytes, name)
        },
      }
      try {
        const result = await exportData({ ...deps, files }, ownerId)
        lastExport = built.zip
        exportedMessage = { tone: 'success', text: exportedText(result) }
        set({
          status: 'ready',
          message: exportedMessage,
          canShareAgain: lastExport !== undefined,
        })
      } catch {
        set({ status: 'ready', message: ERROR("Couldn't export your data. Try again.") })
      }
    },

    shareAgain: async () => {
      const again = lastExport
      if (get().status !== 'ready' || !again) return
      set({ status: 'sharing' })
      try {
        await deps.files.share(again.bytes, again.name)
        set({ status: 'ready', message: exportedMessage })
      } catch {
        set({ status: 'ready', message: ERROR("Couldn't share your export. Try again.") })
      }
    },

    chooseImport: async () => {
      if (get().status !== 'ready' || !ownerId) return
      const owner = ownerId
      // Reading from the moment the picker opens, so a second tap cannot open another.
      lastExport = undefined
      set({ status: 'reading', message: undefined, canShareAgain: false })
      let bytes: Uint8Array | undefined
      try {
        bytes = await deps.files.pickArchive()
      } catch {
        set({ status: 'ready', message: ERROR("Couldn't open that file. Try again.") })
        return
      }
      if (!bytes) {
        set({ status: 'ready' })
        return
      }
      try {
        picked = readArchive(bytes)
      } catch (e) {
        set({
          status: 'ready',
          message: ERROR(e instanceof ImportError ? IMPORT_ERRORS[e.kind] : IMPORT_ERRORS.damaged),
        })
        return
      }
      const garage = await firstValue<Vehicle[]>((cb) => deps.vehicles.watchOwned(owner, cb))
      const plan = planImport(picked, garage)
      if (plan.adding.length === 0) {
        picked = undefined
        set({
          status: 'ready',
          message: {
            tone: 'success',
            text:
              plan.skipping.length === 0
                ? 'That export has no cars in it, so there is nothing to import.'
                : 'Everything in that export is already in your garage.',
          },
        })
        return
      }
      set({
        status: 'confirming-import',
        plan: { adding: plan.adding.map(carName), skipping: plan.skipping.map(carName) },
      })
    },

    cancelImport: () => {
      if (get().status !== 'confirming-import') return
      picked = undefined
      set({ status: 'ready', plan: undefined })
    },

    confirmImport: async () => {
      if (get().status !== 'confirming-import' || !picked || !ownerId) return
      const archive = picked
      picked = undefined
      set({ status: 'importing' })
      try {
        const result = await importData(deps, ownerId, archive)
        set({
          status: 'ready',
          plan: undefined,
          message: { tone: 'success', text: importedText(result) },
        })
      } catch {
        set({
          status: 'ready',
          plan: undefined,
          message: ERROR(
            'Something went wrong partway through, so not everything was imported. Cars already added stay in your garage.',
          ),
        })
      }
    },

    dispose: () => {
      stop?.()
      stop = undefined
    },
  }))
}
