import { createStore, type StoreApi } from 'zustand/vanilla'
import type { z } from 'zod'
import type { CustomItem, MaintenanceItem, Vehicle } from '../../domain/types'
import type { CustomItemRepo, IdGenerator, ScheduleRepo, Unsubscribe } from '../../ports'
import { customItemDraftSchema, type CustomItemDraft } from '../../schemas/customItem'
import { describeInterval } from '../car/model'

export type CustomItemField = keyof CustomItemDraft
export type CustomItemFieldErrors = Partial<Record<CustomItemField, string>>

/**
 * - `add`: a new item of the owner's own.
 * - `own`: editing one the owner added; it can be deleted.
 * - `change`: the owner's interval for an item of the car's schedule; it can go back to the
 *   schedule's.
 */
export type ScheduleItemFormMode = 'add' | 'own' | 'change'

export interface ScheduleItemForm {
  mode: ScheduleItemFormMode
  /** The schedule line being changed or edited; absent when adding. */
  itemId?: string | undefined
  draft: CustomItemDraft
  fieldErrors: CustomItemFieldErrors
  /**
   * What the schedule itself says, for a changed item: "Toyota schedule: every 5,000 mi or
   * 6 months".
   */
  scheduleInterval?: string | undefined
  /** True when a schedule item already has the owner's interval, so it can go back. */
  canReset: boolean
  saving: boolean
  /** True after the owner tapped delete once, until they confirm or change their mind. */
  confirmingDelete: boolean
  error?: string | undefined
}

export interface ScheduleItemState {
  /** Present while the item sheet is open. */
  form?: ScheduleItemForm | undefined
}

export interface ScheduleItemActions {
  start: () => void
  /** Opens the sheet to add an item of the owner's own. */
  openNew: () => void
  /** Opens the sheet for a line of the car's schedule, as the car page lists it. */
  openItem: (itemId: string) => void
  setField: (field: CustomItemField, value: string) => void
  close: () => void
  /** Validates and saves the form. Resolves true on success. */
  save: () => Promise<boolean>
  /** Puts a changed schedule item back on the schedule's interval. Resolves true once done. */
  reset: () => Promise<boolean>
  /** Asks to confirm on the first call; deletes the owner's item on the second. */
  remove: () => Promise<boolean>
  dispose: () => void
}

export type ScheduleItemModel = StoreApi<ScheduleItemState & ScheduleItemActions>

export interface ScheduleItemDeps {
  vehicle: Vehicle
  schedule: ScheduleRepo
  customItems: CustomItemRepo
  ids: IdGenerator
}

const toFieldErrors = (error: z.ZodError): CustomItemFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const numberText = (n: number | undefined) => (n === undefined ? '' : String(n))

/** The intervals that apply to the car on its driving, as the form's text. */
const draftFor = (item: MaintenanceItem, severeDuty: boolean): CustomItemDraft => ({
  task: item.task,
  intervalMiles: numberText((severeDuty ? item.severeMiles : undefined) ?? item.intervalMiles),
  intervalMonths: numberText((severeDuty ? item.severeMonths : undefined) ?? item.intervalMonths),
})

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/**
 * Screen model for changing a car's schedule: adding items of the owner's own, editing or
 * deleting them, and setting the owner's own interval for an item the schedule already has.
 */
export const createScheduleItemModel = (deps: ScheduleItemDeps): ScheduleItemModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  // The schedule as the car follows it, the owner's custom items, and the schedule as its
  // configuration gives it, before the owner's intervals.
  let items: MaintenanceItem[] = []
  let custom: CustomItem[] = []
  let original = new Map<string, MaintenanceItem>()

  return createStore<ScheduleItemState & ScheduleItemActions>()((set, get) => {
    const updateForm = (change: Partial<ScheduleItemForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...change } })
    }

    const openForm = (
      form: Omit<ScheduleItemForm, 'fieldErrors' | 'saving' | 'confirmingDelete'>,
    ) => set({ form: { ...form, fieldErrors: {}, saving: false, confirmingDelete: false } })

    const replacementOf = (itemId: string) =>
      custom.filter((c) => c.replacesItemId === itemId).sort((a, b) => a.id.localeCompare(b.id))[0]

    /** Runs a write with the form showing it is saving; closes the form once it succeeds. */
    const write = async (run: () => Promise<void>, failure: string) => {
      updateForm({ saving: true, error: undefined })
      try {
        await run()
      } catch (e) {
        updateForm({ saving: false, confirmingDelete: false, error: message(e, failure) })
        return false
      }
      set({ form: undefined })
      return true
    }

    return {
      start: () => {
        if (subscriptions.length > 0) return
        subscriptions.push(
          deps.schedule.watchForVehicle(vehicle, (next) => {
            items = next
          }),
          deps.customItems.watchForVehicle(vehicle.id, (next) => {
            custom = next
          }),
        )
        if (vehicle.configId !== undefined)
          deps.schedule.itemsForConfig(vehicle.configId).then(
            (configItems) => {
              original = new Map(configItems.map((i) => [i.id, i]))
            },
            // Without it, the sheet just doesn't say what the schedule's interval was.
            () => {},
          )
      },

      openNew: () =>
        openForm({
          mode: 'add',
          draft: { task: '', intervalMiles: '', intervalMonths: '' },
          canReset: false,
        }),

      openItem: (itemId) => {
        const item = items.find((i) => i.id === itemId)
        if (!item) return
        if (item.owner === 'added') {
          openForm({ mode: 'own', itemId, draft: draftFor(item, false), canReset: false })
          return
        }
        const schedule = original.get(itemId)
        const whose = item.source === 'baseline' ? 'General' : vehicle.make
        openForm({
          mode: 'change',
          itemId,
          // Severe driving shows the severe interval; the owner's own then applies to both.
          draft: draftFor(item, vehicle.severeDuty),
          scheduleInterval: schedule
            ? `${whose} schedule: ${describeInterval(schedule, vehicle.severeDuty).toLowerCase()}`
            : undefined,
          canReset: item.owner === 'changed',
        })
      },

      setField: (field, value) => {
        const form = get().form
        if (!form) return
        const fieldErrors: CustomItemFieldErrors = Object.fromEntries(
          Object.entries(form.fieldErrors).filter(
            // Either interval satisfies "at least one", which is reported on the miles field.
            ([f]) => f !== field && !(field === 'intervalMonths' && f === 'intervalMiles'),
          ),
        )
        updateForm({
          draft: { ...form.draft, [field]: value },
          fieldErrors,
          confirmingDelete: false,
          error: undefined,
        })
      },

      close: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const parsed = customItemDraftSchema.safeParse(form.draft)
        if (!parsed.success) {
          updateForm({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        const d = parsed.data
        const intervals = {
          ...(d.intervalMiles !== undefined && { intervalMiles: d.intervalMiles }),
          ...(d.intervalMonths !== undefined && { intervalMonths: d.intervalMonths }),
        }
        if (form.mode !== 'change' || form.itemId === undefined) {
          const item: CustomItem = {
            id: form.itemId ?? deps.ids.next(),
            vehicleId: vehicle.id,
            task: d.task,
            ...intervals,
          }
          return write(() => deps.customItems.save(item), 'Could not save. Try again.')
        }
        const itemId = form.itemId
        const existing = replacementOf(itemId)
        const schedule = original.get(itemId)
        // Typing the schedule's own interval back in is the same as going back to it.
        if (schedule && sameInterval(draftFor(schedule, vehicle.severeDuty), d)) {
          return write(async () => {
            if (existing) await deps.customItems.remove(existing.id)
          }, 'Could not save. Try again.')
        }
        const replacement: CustomItem = {
          id: existing?.id ?? deps.ids.next(),
          vehicleId: vehicle.id,
          replacesItemId: itemId,
          task: schedule?.task ?? d.task,
          ...intervals,
        }
        return write(() => deps.customItems.save(replacement), 'Could not save. Try again.')
      },

      reset: async () => {
        const form = get().form
        if (!form || form.saving || form.mode !== 'change' || form.itemId === undefined)
          return false
        const existing = replacementOf(form.itemId)
        return write(async () => {
          if (existing) await deps.customItems.remove(existing.id)
        }, 'Could not save. Try again.')
      },

      remove: async () => {
        const form = get().form
        if (!form || form.saving || form.mode !== 'own' || form.itemId === undefined) return false
        if (!form.confirmingDelete) {
          updateForm({ confirmingDelete: true })
          return false
        }
        const id = form.itemId
        return write(() => deps.customItems.remove(id), 'Could not delete. Try again.')
      },

      dispose: () => {
        for (const stop of subscriptions.splice(0)) stop()
      },
    }
  })
}

/** Whether what the owner typed is the schedule's own interval, compared as numbers. */
const sameInterval = (
  schedule: CustomItemDraft,
  parsed: { intervalMiles?: number | undefined; intervalMonths?: number | undefined },
) =>
  numberText(parsed.intervalMiles) === schedule.intervalMiles &&
  numberText(parsed.intervalMonths) === schedule.intervalMonths
