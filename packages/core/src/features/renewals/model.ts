import { createStore, type StoreApi } from 'zustand/vanilla'
import type { z } from 'zod'
import type { AttachmentKind, Renewal, RenewalKind, VehicleId } from '../../domain/types'
import type { Clock, IdGenerator, RenewalRepo, Unsubscribe } from '../../ports'
import { RENEWAL_KIND_IDS, renewalDraftSchema, type RenewalDraft } from '../../schemas/renewal'
import {
  describeRenewal,
  describeRepeat,
  nextDueOn,
  RENEWAL_KINDS,
  RENEWAL_REPEATS,
  renewalDocumentKind,
  renewalState,
  renewalTitle,
  usualRepeat,
  type RenewalState,
} from './renewals'

export type RenewalField = keyof RenewalDraft
export type RenewalFieldErrors = Partial<Record<RenewalField, string>>

/** One renewal as the list shows it. */
export interface RenewalRow {
  id: string
  kind: RenewalKind
  /** "Registration". */
  title: string
  state: RenewalState
  /** "Expires in 12 days, on Oct 30". */
  status: string
  /** "Every year"; absent when it doesn't repeat. */
  repeat?: string | undefined
  notes?: string | undefined
  /** True once it is due soon or overdue, when "Renewed" moves it on. */
  canRenew: boolean
  /** The kind of car document that goes with it, to list and attach its paperwork. */
  documentKind?: AttachmentKind | undefined
}

export interface RenewalForm {
  /** The renewal being edited; absent for a new one. */
  id?: string | undefined
  draft: RenewalDraft
  fieldErrors: RenewalFieldErrors
  saving: boolean
  /**
   * True when the owner renewed one that doesn't repeat, so the form asks for its next date.
   */
  renewing: boolean
  /** True after the owner tapped delete once, until they confirm or change their mind. */
  confirmingDelete: boolean
  error?: string | undefined
}

export interface RenewalsState {
  status: 'loading' | 'ready'
  /** Overdue and soonest first. */
  rows: RenewalRow[]
  /** The usual ones the car doesn't have yet, offered as quick adds. */
  suggestions: { kind: RenewalKind; label: string }[]
  kinds: { kind: RenewalKind; label: string }[]
  /** The choices for "repeats", with the form's text value for each. */
  repeats: { value: string; label: string }[]
  /** Present while the add or edit sheet is open. */
  form?: RenewalForm | undefined
  /** "Registration now expires Oct 1, 2027.", after "Renewed" moved one on. */
  notice?: string | undefined
  /** Why the last "Renewed" could not be saved. */
  error?: string | undefined
}

export interface RenewalsActions {
  start: () => void
  /** Opens the add sheet, for `kind` when given. */
  openNew: (kind?: RenewalKind) => void
  openEdit: (id: string) => void
  setField: (field: RenewalField, value: string) => void
  closeForm: () => void
  /** Validates and saves the form. Resolves true on success. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first call; deletes on the second. Resolves true once deleted. */
  remove: () => Promise<boolean>
  /**
   * The owner renewed it: moves a repeating one on to its next date, or opens the sheet to ask
   * for the next date of one that doesn't repeat. Resolves true once moved on.
   */
  markRenewed: (id: string) => Promise<boolean>
  dispose: () => void
}

export type RenewalsModel = StoreApi<RenewalsState & RenewalsActions>

export interface RenewalsDeps {
  vehicleId: VehicleId
  renewals: RenewalRepo
  clock: Clock
  ids: IdGenerator
}

const SUGGESTED: RenewalKind[] = ['registration', 'inspection', 'insurance']

const STATE_ORDER: Record<RenewalState, number> = { overdue: 0, 'due-soon': 1, upcoming: 2 }

const toFieldErrors = (error: z.ZodError): RenewalFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const repeatText = (months: number | undefined) => (months === undefined ? '' : String(months))

const draftFrom = (r: Renewal): RenewalDraft => ({
  kind: r.kind,
  title: r.title ?? '',
  dueOn: r.dueOn,
  everyMonths: repeatText(r.everyMonths),
  notes: r.notes ?? '',
})

const isKind = (v: string): v is RenewalKind => (RENEWAL_KIND_IDS as readonly string[]).includes(v)

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/**
 * Screen model for a car's registration, inspection and insurance dates: each with how long is
 * left, the add and edit sheet, and "Renewed" to move one on to its next date.
 */
export const createRenewalsModel = (deps: RenewalsDeps): RenewalsModel => {
  let unsubscribe: Unsubscribe | undefined
  let renewals: Renewal[] = []

  return createStore<RenewalsState & RenewalsActions>()((set, get) => {
    const show = () => {
      const today = deps.clock.today()
      // The repo lists them soonest first; overdue ones then move to the top, then due soon.
      const rows = renewals
        .map((r): RenewalRow => {
          const state = renewalState(r, today)
          return {
            id: r.id,
            kind: r.kind,
            title: renewalTitle(r),
            state,
            status: describeRenewal(r, today),
            repeat: describeRepeat(r.everyMonths),
            notes: r.notes,
            canRenew: state !== 'upcoming',
            documentKind: renewalDocumentKind(r.kind),
          }
        })
        .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state])
      const have = new Set(renewals.map((r) => r.kind))
      const suggestions = RENEWAL_KINDS.filter(
        (k) => SUGGESTED.includes(k.kind) && !have.has(k.kind),
      )
      set({ status: 'ready', rows, suggestions })
    }

    const updateForm = (change: Partial<RenewalForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...change } })
    }

    const openForm = (form: Omit<RenewalForm, 'fieldErrors' | 'saving' | 'confirmingDelete'>) =>
      set({
        form: { ...form, fieldErrors: {}, saving: false, confirmingDelete: false },
        notice: undefined,
        error: undefined,
      })

    return {
      status: 'loading',
      rows: [],
      suggestions: [],
      kinds: RENEWAL_KINDS,
      repeats: RENEWAL_REPEATS.map((r) => ({ value: repeatText(r.months), label: r.label })),

      openNew: (kind = 'registration') =>
        openForm({
          draft: {
            kind,
            title: '',
            dueOn: '',
            everyMonths: repeatText(usualRepeat(kind)),
            notes: '',
          },
          renewing: false,
        }),

      openEdit: (id) => {
        const r = renewals.find((x) => x.id === id)
        if (r) openForm({ id, draft: draftFrom(r), renewing: false })
      },

      setField: (field, value) => {
        const form = get().form
        if (!form) return
        const draft = { ...form.draft, [field]: value }
        // A new one follows the kind's usual repeat until the owner picks another.
        if (
          field === 'kind' &&
          form.id === undefined &&
          isKind(value) &&
          isKind(form.draft.kind) &&
          form.draft.everyMonths === repeatText(usualRepeat(form.draft.kind))
        )
          draft.everyMonths = repeatText(usualRepeat(value))
        const fieldErrors: RenewalFieldErrors = Object.fromEntries(
          Object.entries(form.fieldErrors).filter(([f]) => f !== field),
        )
        updateForm({ draft, fieldErrors, confirmingDelete: false, error: undefined })
      },

      closeForm: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const parsed = renewalDraftSchema.safeParse(form.draft)
        if (!parsed.success) {
          updateForm({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        const d = parsed.data
        const renewal: Renewal = {
          id: form.id ?? deps.ids.next(),
          vehicleId: deps.vehicleId,
          kind: d.kind,
          dueOn: d.dueOn,
          // Only "other" has a name of the owner's own; the rest are named by their kind.
          ...(d.kind === 'other' && d.title !== undefined && { title: d.title }),
          ...(d.everyMonths !== undefined && { everyMonths: d.everyMonths }),
          ...(d.notes !== undefined && { notes: d.notes }),
        }
        updateForm({ saving: true, error: undefined })
        try {
          await deps.renewals.save(renewal)
        } catch (e) {
          updateForm({ saving: false, error: message(e, 'Could not save. Try again.') })
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
          await deps.renewals.remove(form.id)
        } catch (e) {
          updateForm({
            saving: false,
            confirmingDelete: false,
            error: message(e, 'Could not delete. Try again.'),
          })
          return false
        }
        set({ form: undefined })
        return true
      },

      markRenewed: async (id) => {
        const r = renewals.find((x) => x.id === id)
        if (!r) return false
        const today = deps.clock.today()
        const next = nextDueOn(r, today)
        if (next === undefined) {
          openForm({ id, draft: { ...draftFrom(r), dueOn: '' }, renewing: true })
          return false
        }
        set({ notice: undefined, error: undefined })
        try {
          await deps.renewals.save({ ...r, dueOn: next })
        } catch {
          set({ error: 'Couldn’t save. Try again.' })
          return false
        }
        const status = describeRenewal({ kind: r.kind, dueOn: next }, today)
        set({ notice: `${renewalTitle(r)} now ${lowerFirst(status)}.` })
        return true
      },

      start: () => {
        if (unsubscribe) return
        unsubscribe = deps.renewals.watchForVehicle(deps.vehicleId, (next) => {
          renewals = next
          show()
        })
      },

      dispose: () => {
        unsubscribe?.()
        unsubscribe = undefined
      },
    }
  })
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
