import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import type { ServiceRecord, VehicleId } from '../../domain/types'
import type { Clock, IdGenerator, ScheduleRepo, ServiceRecordRepo, Unsubscribe } from '../../ports'
import { serviceRecordDraftSchema, type ServiceRecordDraft } from '../../schemas/serviceRecord'
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
  closeForm: () => void
  setQuery: (query: string) => void
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
  /** Open the form on start, for this scheduled task if one is given. */
  startWith?: { itemId?: string | undefined } | undefined
  schedule: ScheduleRepo
  records: ServiceRecordRepo
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

    return {
      status: 'loading',
      records: [],
      draft: draftFor(deps.startWith?.itemId),
      fieldErrors: {},
      adding: deps.startWith !== undefined,
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
        set({ adding: true, draft: draftFor(itemId), fieldErrors: {}, saveError: undefined }),

      closeForm: () => {
        if (get().status !== 'saving') set({ adding: false })
      },

      setQuery: (query) => set((s) => show(s.records, query)),

      save: async () => {
        if (get().status === 'saving') return false
        set({ saveError: undefined })
        const parsed = serviceRecordDraftSchema.safeParse(get().draft)
        if (!parsed.success) {
          set({ fieldErrors: toFieldErrors(parsed.error) })
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
          set({ status: 'ready', adding: false, draft: draftFor(), fieldErrors: {} })
          return true
        } catch (e) {
          set({ status: 'error', saveError: e instanceof Error ? e.message : 'Could not save' })
          return false
        }
      },

      start: () => {
        if (unsubscribe) return
        unsubscribe = deps.records.watchForVehicle(deps.vehicleId, (records) =>
          set((s) => ({
            ...show([...records].sort(newestFirst), s.query),
            status: s.status === 'loading' ? 'ready' : s.status,
          })),
        )
        if (deps.configId === undefined) return
        const watching = unsubscribe
        void deps.schedule.itemsForConfig(deps.configId).then(
          (items) => {
            if (unsubscribe !== watching) return
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
      },

      dispose: () => {
        unsubscribe?.()
        unsubscribe = undefined
      },
    }
  })
}
