import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import type { PickedFile, ServiceRecord, VehicleId } from '../../domain/types'
import type {
  AttachmentRepo,
  Clock,
  FilePicker,
  FileSource,
  IdGenerator,
  ScheduleRepo,
  ServiceRecordRepo,
  Unsubscribe,
} from '../../ports'
import { serviceRecordDraftSchema, type ServiceRecordDraft } from '../../schemas/serviceRecord'
import { pickAttachable, saveAttachment } from '../attachments/model'
import { groupHistory, summarizeHistory, type LogGroup, type LogSummary } from './history'

export type ServiceLogStatus = 'loading' | 'ready' | 'saving' | 'error'
export type DraftField = keyof ServiceRecordDraft
export type FieldErrors = Partial<Record<DraftField, string>>

export interface ServiceLogState {
  status: ServiceLogStatus
  records: ServiceRecord[]
  draft: Required<ServiceRecordDraft>
  fieldErrors: FieldErrors
  /** Set when a save fails for a reason that is not a field error. */
  saveError?: string | undefined
  /** True while the "log a service" form is open. */
  adding: boolean
  /** Receipts picked in the form, attached to the service once it is saved. */
  receipts: PickedFile[]
  /** Why the last receipt could not be picked or attached. */
  receiptError?: string | undefined
  /** The logged service the owner opened, to see or add its receipts. */
  openEntryId?: string | undefined
  /** The car's scheduled tasks, for "what was done". */
  tasks: { id: string; task: string }[]
  /** What the owner typed in the search field. */
  query: string
  /** The records matching `query`, by month, newest first. */
  groups: LogGroup[]
  summary: LogSummary
}

export interface ServiceLogActions {
  /** Starts watching the database. Safe to call again after dispose. */
  start: () => void
  setField: (field: DraftField, value: string) => void
  /** Opens the form, optionally with a scheduled task already chosen. */
  openForm: (itemId?: string) => void
  /** Closes the form. A save already under way finishes, and reopens the form if it fails. */
  closeForm: () => void
  /** Loads the scheduled tasks for the car's configuration once it has synced or changed. */
  setConfig: (configId: string | undefined) => void
  setQuery: (query: string) => void
  /** Asks the system for a photo or PDF of the receipt, to attach when the service is saved. */
  addReceipt: (source: FileSource) => Promise<void>
  removeReceipt: (index: number) => void
  openEntry: (id: string) => void
  closeEntry: () => void
  /** Validates and saves the draft. Resolves true on success. */
  save: () => Promise<boolean>
  /** Stops watching the database. Call when the screen unmounts. */
  dispose: () => void
}

export type ServiceLogModel = StoreApi<ServiceLogState & ServiceLogActions>

export interface ServiceLogDeps {
  vehicleId: VehicleId
  /** The car's configuration, whose schedule names the tasks. Absent before it has synced. */
  configId?: string | undefined
  schedule: ScheduleRepo
  records: ServiceRecordRepo
  attachments: AttachmentRepo
  picker: FilePicker
  clock: Clock
  ids: IdGenerator
}

const emptyDraft = (today: string): Required<ServiceRecordDraft> => ({
  performedOn: today,
  itemId: '',
  odometerMiles: '',
  cost: '',
  shop: '',
  notes: '',
})

const toFieldErrors = (error: z.ZodError): FieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const newestFirst = (a: ServiceRecord, b: ServiceRecord) =>
  b.performedOn.localeCompare(a.performedOn)

/**
 * Screen model for a vehicle's service log: totals, the searchable history by month, and the
 * "log a service" form.
 */
export const createServiceLogModel = (deps: ServiceLogDeps): ServiceLogModel => {
  let unsubscribe: Unsubscribe | undefined
  let taskNames = new Map<string, string>()
  let configId = deps.configId
  // Each schedule read supersedes the one before, and dispose drops any still in flight.
  let scheduleRead = 0
  const today = () => deps.clock.today()
  const draftFor = (itemId?: string) => ({ ...emptyDraft(today()), itemId: itemId ?? '' })

  return createStore<ServiceLogState & ServiceLogActions>()((set, get) => {
    /** Recomputes what the history shows from the records and the search. */
    const show = (records: ServiceRecord[], query: string) => ({
      records,
      query,
      groups: groupHistory(records, taskNames, query, today()),
      summary: summarizeHistory(records, today()),
    })

    /** Reads the names of the scheduled tasks, for the form and the history. */
    const loadTasks = () => {
      const mine = ++scheduleRead
      if (configId === undefined) {
        taskNames = new Map()
        set((s) => ({ tasks: [], ...show(s.records, s.query) }))
        return
      }
      void deps.schedule.itemsForConfig(configId).then(
        (items) => {
          if (mine !== scheduleRead) return
          taskNames = new Map(items.map((i) => [i.id, i.task]))
          set((s) => ({
            tasks: items
              .map((i) => ({ id: i.id, task: i.task }))
              .sort((a, b) => a.task.localeCompare(b.task)),
            ...show(s.records, s.query),
          }))
        },
        // Without the schedule, entries fall back to their notes; nothing else is lost.
        () => {},
      )
    }

    return {
      status: 'loading',
      records: [],
      draft: draftFor(),
      fieldErrors: {},
      adding: false,
      receipts: [],
      tasks: [],
      query: '',
      groups: [],
      summary: summarizeHistory([], today()),

      setField: (field, value) =>
        set((s) => {
          const { [field]: _cleared, ...fieldErrors } = s.fieldErrors
          return { draft: { ...s.draft, [field]: value }, fieldErrors }
        }),

      openForm: (itemId) =>
        set({
          adding: true,
          draft: draftFor(itemId),
          fieldErrors: {},
          saveError: undefined,
          receipts: [],
          receiptError: undefined,
        }),

      closeForm: () => set({ adding: false }),

      setConfig: (next) => {
        if (next === configId) return
        configId = next
        if (unsubscribe) loadTasks()
      },

      setQuery: (query) => set((s) => show(s.records, query)),

      addReceipt: async (source) => {
        set({ receiptError: undefined })
        const picked = await pickAttachable(deps.picker, source)
        if (!picked) return
        if ('error' in picked) set({ receiptError: picked.error })
        else set((s) => ({ receipts: [...s.receipts, picked.file] }))
      },

      removeReceipt: (index) =>
        set((s) => ({ receipts: s.receipts.filter((_, i) => i !== index) })),

      openEntry: (id) => set({ openEntryId: id }),

      closeEntry: () => set({ openEntryId: undefined }),

      save: async () => {
        if (get().status === 'saving') return false
        set({ saveError: undefined })
        const parsed = serviceRecordDraftSchema.safeParse(get().draft)
        if (!parsed.success) {
          set({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        // Without a scheduled task, the notes are the only record of what was done.
        if (parsed.data.itemId === undefined && parsed.data.notes === undefined) {
          set({ fieldErrors: { notes: 'Say what was done' } })
          return false
        }
        const d = parsed.data
        const record: ServiceRecord = {
          id: deps.ids.next(),
          vehicleId: deps.vehicleId,
          performedOn: d.performedOn,
          ...(d.itemId !== undefined && { itemId: d.itemId }),
          ...(d.odometerMiles !== undefined && { odometerMiles: d.odometerMiles }),
          ...(d.cost !== undefined && { costCents: Math.round(d.cost * 100) }),
          ...(d.shop !== undefined && { shop: d.shop }),
          ...(d.notes !== undefined && { notes: d.notes }),
        }
        set({ status: 'saving' })
        try {
          await deps.records.add(record)
        } catch (e) {
          // Reopen the form if it was closed mid-save, so the error and the draft are not lost.
          set({
            status: 'error',
            adding: true,
            saveError: e instanceof Error ? e.message : 'Could not save',
          })
          return false
        }
        // After the service, so each receipt uploads after the service it points to.
        let failed = 0
        for (const file of get().receipts) {
          try {
            await saveAttachment(deps, { kind: 'receipt', serviceRecordId: record.id }, file)
          } catch {
            failed++
          }
        }
        set({
          status: 'ready',
          adding: false,
          draft: draftFor(),
          fieldErrors: {},
          receipts: [],
          receiptError:
            failed > 0
              ? 'The service was saved, but a receipt could not be attached. Open it to try again.'
              : undefined,
        })
        return true
      },

      start: () => {
        if (unsubscribe) return
        unsubscribe = deps.records.watchForVehicle(deps.vehicleId, (records) =>
          set((s) => ({
            ...show([...records].sort(newestFirst), s.query),
            status: s.status === 'loading' ? 'ready' : s.status,
          })),
        )
        loadTasks()
      },

      dispose: () => {
        unsubscribe?.()
        unsubscribe = undefined
        scheduleRead++
      },
    }
  })
}
