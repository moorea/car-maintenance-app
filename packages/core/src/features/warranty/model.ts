import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import type { MaintenanceItem, Vehicle, Warranty, WarrantyKind } from '../../domain/types'
import type {
  CareReportExporter,
  Clock,
  IdGenerator,
  OdometerRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  Unsubscribe,
  WarrantyRepo,
} from '../../ports'
import { dueItemsFor } from '../../reminders/getDueItems'
import { warrantyDraftSchema, type WarrantyDraft } from '../../schemas/warranty'
import { buildCareReport } from '../care-report/report'
import {
  coverageOf,
  describeCoverage,
  warrantyKindLabel,
  WARRANTY_KINDS,
  type CoverageState,
} from './coverage'

export type WarrantyField = keyof WarrantyDraft
export type WarrantyFieldErrors = Partial<Record<WarrantyField, string>>

/** One coverage as the list shows it. */
export interface WarrantyRow {
  id: string
  /** "Powertrain". */
  title: string
  /** "Toyota · Policy 12345", leaving out what is unknown. */
  subtitle: string
  state: CoverageState
  /** "Covered until Mar 14, 2029 or 60,000 mi". */
  status: string
  /** How much of the coverage is used, 0 to 1. */
  used: number
}

export interface WarrantyForm {
  /** The warranty being edited; absent for a new one. */
  id?: string | undefined
  draft: WarrantyDraft
  fieldErrors: WarrantyFieldErrors
  saving: boolean
  /** True after the owner tapped delete once, until they confirm or change their mind. */
  confirmingDelete: boolean
  error?: string | undefined
}

export interface WarrantyState {
  status: 'loading' | 'ready'
  /** Active coverages first, by when they end; ended ones last. */
  rows: WarrantyRow[]
  /** The choices for "what it covers". */
  kinds: { kind: WarrantyKind; label: string }[]
  /** Present while the add or edit sheet is open. */
  form?: WarrantyForm | undefined
  report: { status: 'idle' | 'preparing'; error?: string | undefined }
}

export interface WarrantyActions {
  start: () => void
  openNew: () => void
  openEdit: (id: string) => void
  setField: (field: WarrantyField, value: string) => void
  closeForm: () => void
  /** Validates and saves the form. Resolves true on success. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first call; deletes on the second. Resolves true once deleted. */
  remove: () => Promise<boolean>
  /** Builds the proof-of-care report and offers it to share. */
  shareReport: () => Promise<void>
  dispose: () => void
}

export type WarrantyModel = StoreApi<WarrantyState & WarrantyActions>

export interface WarrantyDeps {
  vehicle: Vehicle
  warranties: WarrantyRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  schedule: ScheduleRepo
  exporter: CareReportExporter
  clock: Clock
  ids: IdGenerator
}

const toFieldErrors = (error: z.ZodError): WarrantyFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const STATE_ORDER: Record<CoverageState, number> = { 'ending-soon': 0, active: 1, ended: 2 }

const draftFrom = (w: Warranty): WarrantyDraft => ({
  kind: w.kind,
  provider: w.provider ?? '',
  startsOn: w.startsOn,
  months: w.months !== undefined ? String(w.months) : '',
  endMiles: w.endMiles !== undefined ? w.endMiles.toLocaleString('en-US') : '',
  policyNumber: w.policyNumber ?? '',
  notes: w.notes ?? '',
})

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/**
 * Screen model for a car's warranties: each coverage with how much is left, the add and edit
 * sheet, and sharing the proof-of-care report.
 */
export const createWarrantyModel = (deps: WarrantyDeps): WarrantyModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  let warranties: Warranty[] = []
  let generation = 0

  const emptyDraft = (): WarrantyDraft => ({
    kind: 'basic',
    // A factory warranty starts on the in-service date; the owner corrects it from the paperwork.
    provider: vehicle.make,
    startsOn: deps.clock.today(),
    months: '',
    endMiles: '',
    policyNumber: '',
    notes: '',
  })

  return createStore<WarrantyState & WarrantyActions>()((set, get) => {
    /** Recomputes each coverage against the car's current mileage. */
    const refresh = async () => {
      const mine = ++generation
      const [records, readings] = await Promise.all([
        deps.records.listForVehicle(vehicle.id),
        deps.odometer.listForVehicle(vehicle.id),
      ])
      if (mine !== generation) return
      const today = deps.clock.today()
      const { mileage, currentMiles } = dueItemsFor({
        vehicle,
        items: [],
        records,
        readings,
        today,
      })
      const rows = warranties
        .map((w) => {
          const coverage = coverageOf({ warranty: w, mileage, currentMiles, today })
          const row: WarrantyRow = {
            id: w.id,
            title: warrantyKindLabel(w.kind),
            subtitle: [w.provider, w.policyNumber ? `Policy ${w.policyNumber}` : undefined]
              .filter(Boolean)
              .join(' · '),
            state: coverage.state,
            status: describeCoverage(w, coverage, today),
            used: coverage.used,
          }
          return { row, end: coverage.expectedEnd ?? coverage.endsOn ?? '￿' }
        })
        .sort(
          (a, b) =>
            STATE_ORDER[a.row.state] - STATE_ORDER[b.row.state] ||
            a.end.localeCompare(b.end) ||
            a.row.title.localeCompare(b.row.title),
        )
        .map((r) => r.row)
      set({ status: 'ready', rows })
    }
    const refreshQuietly = () =>
      void refresh().catch(() => {
        // The list keeps what it showed; the next change tries again.
        if (get().status === 'loading') set({ status: 'ready' })
      })

    const updateForm = (change: Partial<WarrantyForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...change } })
    }

    return {
      status: 'loading',
      rows: [],
      kinds: WARRANTY_KINDS,
      report: { status: 'idle' },

      openNew: () =>
        set({
          form: { draft: emptyDraft(), fieldErrors: {}, saving: false, confirmingDelete: false },
        }),

      openEdit: (id) => {
        const w = warranties.find((x) => x.id === id)
        if (!w) return
        set({
          form: {
            id,
            draft: draftFrom(w),
            fieldErrors: {},
            saving: false,
            confirmingDelete: false,
          },
        })
      },

      setField: (field, value) => {
        const form = get().form
        if (!form) return
        // The time limit's error also covers a missing mileage limit, so either field clears it.
        const cleared = field === 'endMiles' ? ['endMiles', 'months'] : [field]
        const fieldErrors: WarrantyFieldErrors = Object.fromEntries(
          Object.entries(form.fieldErrors).filter(([f]) => !cleared.includes(f)),
        )
        updateForm({
          draft: { ...form.draft, [field]: value },
          fieldErrors,
          confirmingDelete: false,
          error: undefined,
        })
      },

      closeForm: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const parsed = warrantyDraftSchema.safeParse(form.draft)
        if (!parsed.success) {
          updateForm({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        const d = parsed.data
        const warranty: Warranty = {
          id: form.id ?? deps.ids.next(),
          vehicleId: vehicle.id,
          kind: d.kind,
          startsOn: d.startsOn,
          ...(d.provider !== undefined && { provider: d.provider }),
          ...(d.months !== undefined && { months: d.months }),
          ...(d.endMiles !== undefined && { endMiles: d.endMiles }),
          ...(d.policyNumber !== undefined && { policyNumber: d.policyNumber }),
          ...(d.notes !== undefined && { notes: d.notes }),
        }
        updateForm({ saving: true, error: undefined })
        try {
          await deps.warranties.save(warranty)
        } catch (e) {
          updateForm({ saving: false, error: message(e, 'Could not save the warranty') })
          return false
        }
        set({ form: undefined })
        return true
      },

      remove: async () => {
        const form = get().form
        if (!form?.id || form.saving) return false
        if (!form.confirmingDelete) {
          updateForm({ confirmingDelete: true })
          return false
        }
        updateForm({ saving: true, error: undefined })
        try {
          await deps.warranties.remove(form.id)
        } catch (e) {
          updateForm({
            saving: false,
            confirmingDelete: false,
            error: message(e, 'Could not delete the warranty'),
          })
          return false
        }
        set({ form: undefined })
        return true
      },

      shareReport: async () => {
        if (get().report.status === 'preparing') return
        set({ report: { status: 'preparing' } })
        try {
          const [records, readings, items] = await Promise.all([
            deps.records.listForVehicle(vehicle.id),
            deps.odometer.listForVehicle(vehicle.id),
            vehicle.configId === undefined
              ? Promise.resolve([] as MaintenanceItem[])
              : deps.schedule.itemsForConfig(vehicle.configId),
          ])
          const report = buildCareReport({
            vehicle,
            items,
            records,
            readings,
            warranties: await deps.warranties.listForVehicle(vehicle.id),
            today: deps.clock.today(),
          })
          await deps.exporter.share(report)
          set({ report: { status: 'idle' } })
        } catch (e) {
          set({ report: { status: 'idle', error: message(e, 'Could not make the report') } })
        }
      },

      start: () => {
        if (subscriptions.length > 0) return
        subscriptions.push(
          deps.warranties.watchForVehicle(vehicle.id, (next) => {
            warranties = next
            refreshQuietly()
          }),
          // A new reading or a logged service moves the projected end of a mileage limit.
          deps.records.watchForVehicle(vehicle.id, refreshQuietly),
          deps.odometer.watchForVehicle(vehicle.id, refreshQuietly),
        )
      },

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
        generation++
      },
    }
  })
}
