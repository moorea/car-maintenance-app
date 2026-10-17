import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import type { ServiceRecord, VehicleId } from '../../domain/types'
import type { Clock, IdGenerator, ServiceRecordRepo, Unsubscribe } from '../../ports'
import { serviceRecordDraftSchema, type ServiceRecordDraft } from '../../schemas/serviceRecord'

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
}

export interface ServiceLogActions {
  /** Starts watching the database. Safe to call again after dispose. */
  start: () => void
  setField: (field: DraftField, value: string) => void
  /** Validates and saves the draft. Resolves true on success. */
  save: () => Promise<boolean>
  /** Stops watching the database. Call when the screen unmounts. */
  dispose: () => void
}

export type ServiceLogModel = StoreApi<ServiceLogState & ServiceLogActions>

export interface ServiceLogDeps {
  vehicleId: VehicleId
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

/** Screen model for a vehicle's service log: the record list plus the "log service" form. */
export const createServiceLogModel = (deps: ServiceLogDeps): ServiceLogModel => {
  let unsubscribe: Unsubscribe | undefined

  return createStore<ServiceLogState & ServiceLogActions>()((set, get) => ({
    status: 'loading',
    records: [],
    draft: emptyDraft(deps.clock.today()),
    fieldErrors: {},

    setField: (field, value) =>
      set((s) => {
        const { [field]: _cleared, ...fieldErrors } = s.fieldErrors
        return { draft: { ...s.draft, [field]: value }, fieldErrors }
      }),

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
        set({ status: 'ready', draft: emptyDraft(deps.clock.today()), fieldErrors: {} })
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
          records: [...records].sort((a, b) => b.performedOn.localeCompare(a.performedOn)),
          status: s.status === 'loading' ? 'ready' : s.status,
        })),
      )
    },

    dispose: () => {
      unsubscribe?.()
      unsubscribe = undefined
    },
  }))
}
