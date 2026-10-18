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
import type { IsoDate } from '../../lib/date'
import { FUTURE_DATE_ERROR } from '../../schemas/date'
import { serviceRecordDraftSchema, type ServiceRecordDraft } from '../../schemas/serviceRecord'
import { pickAttachable, saveAttachment } from '../attachments/model'
import {
  firstEntries,
  groupHistory,
  LIST_PAGE,
  summarizeHistory,
  type LogGroup,
  type LogSummary,
} from './history'

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
  /** The logged service the owner opened, to see or add its receipts, correct or delete it. */
  openEntryId?: string | undefined
  /** The logged service the form is correcting; absent while logging a new one. */
  editingId?: string | undefined
  /** Deleting the open service: asked to confirm, or under way. */
  deleting?: 'confirm' | 'deleting' | undefined
  /** Why the open service could not be deleted. */
  deleteError?: string | undefined
  /** The car's scheduled tasks, for "what was done". */
  tasks: { id: string; task: string }[]
  /** What the owner typed in the search field. */
  query: string
  /** The newest records matching `query`, by month, newest first: at most `limit` of them. */
  groups: LogGroup[]
  /** How many entries `groups` may hold; grows with "Show earlier". */
  limit: number
  /** How many matching records are left out of `groups`. */
  hidden: number
  summary: LogSummary
  /** The latest day a service can be dated: today, as of when the form opened. */
  latestDate: IsoDate
}

export interface ServiceLogActions {
  /** Starts watching the database. Safe to call again after dispose. */
  start: () => void
  setField: (field: DraftField, value: string) => void
  /**
   * Opens the form, optionally with a scheduled task already chosen. Dated today, unless the
   * service was done `earlier`, when the date is left for the owner to fill in.
   */
  openForm: (itemId?: string, options?: { earlier?: boolean }) => void
  /** Closes the form. A save already under way finishes, and reopens the form if it fails. */
  closeForm: () => void
  /** Follows the schedule of the car's configuration once it has synced or changed. */
  setConfig: (configId: string | undefined) => void
  setQuery: (query: string) => void
  /** Shows another page of older services. */
  showMore: () => void
  /** Asks the system for a photo or PDF of the receipt, to attach when the service is saved. */
  addReceipt: (source: FileSource) => Promise<void>
  removeReceipt: (index: number) => void
  openEntry: (id: string) => void
  closeEntry: () => void
  /** Opens the form filled in with the open service, to correct it. */
  editEntry: () => void
  /** Deletes the open service and its receipts; the first call only asks to confirm. */
  deleteEntry: () => Promise<void>
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
  let stopSchedule: Unsubscribe | undefined
  const today = () => deps.clock.today()
  const draftFor = (itemId?: string, earlier = false) => ({
    ...emptyDraft(earlier ? '' : today()),
    itemId: itemId ?? '',
  })

  return createStore<ServiceLogState & ServiceLogActions>()((set, get) => {
    /** Recomputes what the history shows from the records, the search and how much is shown. */
    const show = (records: ServiceRecord[], query: string, limit: number) => ({
      records,
      query,
      limit,
      ...firstEntries(groupHistory(records, taskNames, query, today()), limit),
      summary: summarizeHistory(records, today()),
    })

    /** Follows the car's schedule, the owner's own items included, for the form and history. */
    const followSchedule = () => {
      stopSchedule?.()
      // Without the schedule, entries fall back to their notes; nothing else is lost.
      stopSchedule = deps.schedule.watchForVehicle({ id: deps.vehicleId, configId }, (items) => {
        taskNames = new Map(items.map((i) => [i.id, i.task]))
        set((s) => ({
          tasks: items
            .map((i) => ({ id: i.id, task: i.task }))
            .sort((a, b) => a.task.localeCompare(b.task)),
          ...show(s.records, s.query, s.limit),
        }))
      })
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
      limit: LIST_PAGE,
      hidden: 0,
      summary: summarizeHistory([], today()),
      latestDate: today(),

      setField: (field, value) =>
        set((s) => {
          const { [field]: _cleared, ...fieldErrors } = s.fieldErrors
          return { draft: { ...s.draft, [field]: value }, fieldErrors }
        }),

      openForm: (itemId, options) =>
        set({
          adding: true,
          editingId: undefined,
          draft: draftFor(itemId, options?.earlier),
          latestDate: today(),
          fieldErrors: {},
          saveError: undefined,
          receipts: [],
          receiptError: undefined,
        }),

      closeForm: () => set({ adding: false }),

      setConfig: (next) => {
        if (next === configId) return
        configId = next
        if (unsubscribe) followSchedule()
      },

      // A new search starts from the newest matches again.
      setQuery: (query) => set((s) => show(s.records, query, LIST_PAGE)),

      showMore: () => set((s) => show(s.records, s.query, s.limit + LIST_PAGE)),

      addReceipt: async (source) => {
        set({ receiptError: undefined })
        const picked = await pickAttachable(deps.picker, source)
        if (!picked) return
        if ('error' in picked) set({ receiptError: picked.error })
        else set((s) => ({ receipts: [...s.receipts, picked.file] }))
      },

      removeReceipt: (index) =>
        set((s) => ({ receipts: s.receipts.filter((_, i) => i !== index) })),

      openEntry: (id) => set({ openEntryId: id, deleting: undefined, deleteError: undefined }),

      closeEntry: () => {
        // A delete under way finishes; the sheet just stops showing it.
        if (get().deleting === 'deleting') set({ openEntryId: undefined })
        else set({ openEntryId: undefined, deleting: undefined, deleteError: undefined })
      },

      editEntry: () => {
        const record = get().records.find((r) => r.id === get().openEntryId)
        if (!record || get().deleting === 'deleting') return
        set({
          openEntryId: undefined,
          deleting: undefined,
          deleteError: undefined,
          adding: true,
          editingId: record.id,
          latestDate: today(),
          draft: {
            performedOn: record.performedOn,
            // Kept even when the schedule has not loaded or no longer lists it, so a correction to
            // the mileage never drops the link that reminders count from.
            itemId: record.itemId ?? '',
            odometerMiles: record.odometerMiles?.toString() ?? '',
            cost: record.costCents !== undefined ? (record.costCents / 100).toFixed(2) : '',
            shop: record.shop ?? '',
            notes: record.notes ?? '',
          },
          fieldErrors: {},
          saveError: undefined,
          receipts: [],
          receiptError: undefined,
        })
      },

      deleteEntry: async () => {
        const { openEntryId: id, deleting } = get()
        if (id === undefined || deleting === 'deleting') return
        if (deleting !== 'confirm') {
          set({ deleting: 'confirm', deleteError: undefined })
          return
        }
        set({ deleting: 'deleting' })
        try {
          await deps.records.remove(id)
        } catch {
          // Only the sheet still showing this service says so; another one opened since is left be.
          set((s) =>
            s.openEntryId === id
              ? { deleting: undefined, deleteError: 'The service could not be deleted. Try again.' }
              : { deleting: undefined },
          )
          return
        }
        set((s) => ({
          deleting: undefined,
          openEntryId: s.openEntryId === id ? undefined : s.openEntryId,
        }))
      },

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
        // A typo like 2062 would push the car's schedule decades out.
        if (parsed.data.performedOn > today()) {
          set({ fieldErrors: { performedOn: FUTURE_DATE_ERROR } })
          return false
        }
        const d = parsed.data
        const editingId = get().editingId
        const record: ServiceRecord = {
          id: editingId ?? deps.ids.next(),
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
          if (editingId !== undefined) await deps.records.update(record)
          else await deps.records.add(record)
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
          editingId: undefined,
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
            ...show([...records].sort(newestFirst), s.query, s.limit),
            status: s.status === 'loading' ? 'ready' : s.status,
          })),
        )
        followSchedule()
      },

      dispose: () => {
        unsubscribe?.()
        unsubscribe = undefined
        stopSchedule?.()
        stopSchedule = undefined
      },
    }
  })
}
