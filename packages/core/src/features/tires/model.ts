import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import type { TireSet, Vehicle } from '../../domain/types'
import type {
  Clock,
  IdGenerator,
  OdometerRepo,
  ServiceRecordRepo,
  TireSetRepo,
  Unsubscribe,
} from '../../ports'
import { formatDay, formatMiles } from '../../lib/format'
import { dueItemsFor } from '../../reminders/getDueItems'
import { tireSetDraftSchema, type TireSetDraft } from '../../schemas/tireSet'
import {
  assessTires,
  describeAge,
  describeMade,
  madeOn,
  milesOnSet,
  putOn,
  takenOff,
  tireAgeMonths,
  type TireCondition,
} from './tires'

export type TireSetField = Exclude<keyof TireSetDraft, 'mounted'>
export type TireSetFieldErrors = Partial<Record<TireSetField, string>>

/** One set as the list shows it. */
export interface TireRow {
  id: string
  /** "Winter". */
  title: string
  /** "Michelin X-Ice · 225/65R17", leaving out what is unknown. */
  subtitle: string
  mounted: boolean
  /** "On the car" or "Stored". */
  place: string
  /** "3 years 2 months old · Made Jun 2021", or a nudge to add the DOT code. */
  age: string
  /** False when the age is unknown, so the view can show `age` as a hint. */
  ageKnown: boolean
  /** "12,400 mi on this set". */
  miles: string
  /** "6/32″ tread on Mar 3". */
  tread?: string | undefined
  condition: TireCondition
  /** What to do, when there is something to do. */
  advice?: string | undefined
}

export interface TireForm {
  /** The set being edited; absent for a new one. */
  id?: string | undefined
  draft: TireSetDraft
  fieldErrors: TireSetFieldErrors
  saving: boolean
  /** True after the owner tapped delete once, until they confirm or change their mind. */
  confirmingDelete: boolean
  error?: string | undefined
}

/** Putting a stored set on the car, which takes off the set that is on it. */
export interface TireSwap {
  id: string
  /** "Put Winter on the car". */
  title: string
  /** "All-season comes off and is stored.", when another set is on the car. */
  note?: string | undefined
  /** The odometer now, as typed; starts at the car's estimate. */
  miles: string
  error?: string | undefined
  saving: boolean
}

export interface TiresState {
  status: 'loading' | 'ready'
  /** The set on the car first, then stored sets by name. */
  rows: TireRow[]
  /** Present while the add or edit sheet is open. */
  form?: TireForm | undefined
  /** Present while the owner is confirming a swap. */
  swap?: TireSwap | undefined
}

export interface TiresActions {
  start: () => void
  openNew: () => void
  openEdit: (id: string) => void
  setField: (field: TireSetField, value: string) => void
  setMounted: (mounted: boolean) => void
  closeForm: () => void
  /** Validates and saves the form. Resolves true on success. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first call; deletes on the second. Resolves true once deleted. */
  remove: () => Promise<boolean>
  /** Starts putting a stored set on the car. */
  openSwap: (id: string) => void
  setSwapMiles: (value: string) => void
  closeSwap: () => void
  /** Puts the set on and takes the other off at the typed mileage. Resolves true on success. */
  confirmSwap: () => Promise<boolean>
  dispose: () => void
}

export type TiresModel = StoreApi<TiresState & TiresActions>

export interface TiresDeps {
  vehicle: Vehicle
  tireSets: TireSetRepo
  /** Readings and services give the car's estimated mileage, which a mounted set's miles use. */
  records: Pick<ServiceRecordRepo, 'listForVehicle' | 'watchForVehicle'>
  odometer: Pick<OdometerRepo, 'listForVehicle' | 'watchForVehicle'>
  clock: Clock
  ids: IdGenerator
}

const toFieldErrors = (error: z.ZodError): TireSetFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const MILES = /^\d{1,3}(,\d{3})*$|^\d+$/
const milesText = (miles: number | undefined) =>
  miles === undefined ? '' : Math.round(miles).toLocaleString('en-US')
const pad = (n: number) => String(n).padStart(2, '0')

const draftFrom = (s: TireSet): TireSetDraft => ({
  name: s.name,
  brand: s.brand ?? '',
  size: s.size ?? '',
  dotCode:
    s.madeWeek !== undefined && s.madeYear !== undefined
      ? `${pad(s.madeWeek)}${pad(s.madeYear % 100)}`
      : '',
  mounted: s.mounted,
  mountedAtMiles: milesText(s.mountedAtMiles),
  priorMiles: s.priorMiles > 0 ? milesText(s.priorMiles) : '',
  treadDepth: s.treadDepth32nds !== undefined ? String(s.treadDepth32nds) : '',
  notes: s.notes ?? '',
})

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/**
 * Screen model for a car's tires: each set with its age, miles and tread, adding and editing sets,
 * and swapping the set on the car for a stored one.
 */
export const createTiresModel = (deps: TiresDeps): TiresModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  let sets: TireSet[] = []
  let currentMiles: number | undefined
  let generation = 0

  return createStore<TiresState & TiresActions>()((set, get) => {
    const rowOf = (s: TireSet, today: string): TireRow => {
      const months = tireAgeMonths(s, today)
      const { condition, advice } = assessTires(s, today)
      return {
        id: s.id,
        title: s.name,
        subtitle: [s.brand, s.size].filter(Boolean).join(' · '),
        mounted: s.mounted,
        place: s.mounted ? 'On the car' : 'Stored',
        age:
          months === undefined
            ? 'Add the DOT code from the sidewall to track their age'
            : `${describeAge(months)} · ${describeMade(s)}`,
        ageKnown: months !== undefined,
        miles: `${formatMiles(milesOnSet(s, currentMiles))} on this set`,
        tread:
          s.treadDepth32nds !== undefined && s.treadCheckedOn !== undefined
            ? `${s.treadDepth32nds}/32″ tread on ${formatDay(s.treadCheckedOn, today)}`
            : undefined,
        condition,
        advice,
      }
    }

    const render = () => {
      const today = deps.clock.today()
      const rows = [...sets]
        .sort((a, b) => Number(b.mounted) - Number(a.mounted) || a.name.localeCompare(b.name))
        .map((s) => rowOf(s, today))
      set({ status: 'ready', rows })
    }

    /** Re-estimates the car's mileage, which the set on the car counts its miles from. */
    const refreshMiles = async () => {
      const mine = ++generation
      const [records, readings] = await Promise.all([
        deps.records.listForVehicle(vehicle.id),
        deps.odometer.listForVehicle(vehicle.id),
      ])
      if (mine !== generation) return
      currentMiles = dueItemsFor({
        vehicle,
        items: [],
        records,
        readings,
        today: deps.clock.today(),
      }).currentMiles
      render()
    }
    const refreshQuietly = () =>
      void refreshMiles().catch(() => {
        // The list keeps the miles it showed; the next change tries again.
        render()
      })

    const updateForm = (change: Partial<TireForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...change } })
    }
    const updateSwap = (change: Partial<TireSwap>) => {
      const swap = get().swap
      if (swap) set({ swap: { ...swap, ...change } })
    }

    return {
      status: 'loading',
      rows: [],

      openNew: () => {
        // The first set is usually the one on the car; a second is usually a stored one.
        const mounted = !sets.some((s) => s.mounted)
        set({
          form: {
            draft: {
              name: '',
              brand: '',
              size: '',
              dotCode: '',
              mounted,
              mountedAtMiles: mounted ? milesText(currentMiles) : '',
              priorMiles: '',
              treadDepth: '',
              notes: '',
            },
            fieldErrors: {},
            saving: false,
            confirmingDelete: false,
          },
        })
      },

      openEdit: (id) => {
        const s = sets.find((x) => x.id === id)
        if (!s) return
        set({
          form: {
            id,
            draft: draftFrom(s),
            fieldErrors: {},
            saving: false,
            confirmingDelete: false,
          },
        })
      },

      setField: (field, value) => {
        const form = get().form
        if (!form) return
        const { [field]: _, ...fieldErrors } = form.fieldErrors
        updateForm({
          draft: { ...form.draft, [field]: value },
          fieldErrors,
          confirmingDelete: false,
          error: undefined,
        })
      },

      setMounted: (mounted) => {
        const form = get().form
        // An existing set changes places by swapping, which takes the other set off too.
        if (!form || form.id !== undefined) return
        updateForm({
          draft: {
            ...form.draft,
            mounted,
            mountedAtMiles:
              mounted && form.draft.mountedAtMiles === ''
                ? milesText(currentMiles)
                : form.draft.mountedAtMiles,
          },
        })
      },

      closeForm: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const parsed = tireSetDraftSchema.safeParse(form.draft)
        if (!parsed.success) {
          updateForm({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        const d = parsed.data
        const today = deps.clock.today()
        if (d.dotCode && madeOn(d.dotCode.week, d.dotCode.year) > today) {
          updateForm({
            fieldErrors: { dotCode: 'That week has not happened yet. Check the last 4 digits' },
          })
          return false
        }
        const existing = form.id ? sets.find((s) => s.id === form.id) : undefined
        const mounted = existing ? existing.mounted : d.mounted
        // Left blank, an edit keeps the mileage the set went on at, and a new set goes on today.
        const mountedAtMiles = mounted
          ? (d.mountedAtMiles ?? (existing ? existing.mountedAtMiles : currentMiles))
          : undefined
        if (mounted && mountedAtMiles === undefined) {
          // Without it the set would never count miles, and the one it replaces would lose its season.
          updateForm({ fieldErrors: { mountedAtMiles: 'Enter the odometer when they went on' } })
          return false
        }
        const outgoing = !existing && mounted ? sets.filter((s) => s.mounted) : []
        const lowest = Math.max(...outgoing.map((s) => s.mountedAtMiles ?? 0), 0)
        if (mountedAtMiles !== undefined && mountedAtMiles < lowest) {
          updateForm({
            fieldErrors: {
              mountedAtMiles: `That's less than the ${formatMiles(lowest)} the other set went on at`,
            },
          })
          return false
        }
        // A new reading keeps today's date; an unchanged one keeps the day it was measured.
        const treadCheckedOn =
          d.treadDepth === undefined
            ? undefined
            : existing?.treadDepth32nds === d.treadDepth
              ? (existing.treadCheckedOn ?? today)
              : today
        const tireSet: TireSet = {
          id: form.id ?? deps.ids.next(),
          vehicleId: vehicle.id,
          name: d.name,
          mounted,
          priorMiles: d.priorMiles ?? 0,
          ...(d.brand !== undefined && { brand: d.brand }),
          ...(d.size !== undefined && { size: d.size }),
          ...(d.dotCode !== undefined && { madeWeek: d.dotCode.week, madeYear: d.dotCode.year }),
          ...(mountedAtMiles !== undefined && { mountedAtMiles: Math.round(mountedAtMiles) }),
          ...(d.treadDepth !== undefined && { treadDepth32nds: d.treadDepth }),
          ...(treadCheckedOn !== undefined && { treadCheckedOn }),
          ...(d.notes !== undefined && { notes: d.notes }),
        }
        // A new set going on the car takes the one there off, at the mileage it went on.
        const replaced = outgoing.map((s) => takenOff(s, tireSet.mountedAtMiles ?? lowest))
        updateForm({ saving: true, error: undefined })
        try {
          await deps.tireSets.save(tireSet, ...replaced)
        } catch (e) {
          updateForm({ saving: false, error: message(e, 'Could not save the tires') })
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
          await deps.tireSets.remove(form.id)
        } catch (e) {
          updateForm({
            saving: false,
            confirmingDelete: false,
            error: message(e, 'Could not delete the tires'),
          })
          return false
        }
        set({ form: undefined })
        return true
      },

      openSwap: (id) => {
        const incoming = sets.find((s) => s.id === id)
        if (!incoming || incoming.mounted) return
        const outgoing = sets.find((s) => s.mounted)
        set({
          swap: {
            id,
            title: `Put ${incoming.name} on the car`,
            note: outgoing ? `${outgoing.name} comes off and is stored.` : undefined,
            miles: milesText(currentMiles),
            saving: false,
          },
        })
      },

      setSwapMiles: (value) => updateSwap({ miles: value, error: undefined }),

      closeSwap: () => {
        if (!get().swap?.saving) set({ swap: undefined })
      },

      confirmSwap: async () => {
        const swap = get().swap
        if (!swap || swap.saving) return false
        const text = swap.miles.trim()
        if (!MILES.test(text)) {
          updateSwap({ error: 'Enter the odometer in whole miles, like 41,250' })
          return false
        }
        const miles = Number(text.replaceAll(',', ''))
        const incoming = sets.find((s) => s.id === swap.id)
        // Gone, or put on the car from another phone while the sheet was open.
        if (!incoming || incoming.mounted) {
          set({ swap: undefined })
          return false
        }
        const outgoing = sets.filter((s) => s.mounted && s.id !== incoming.id)
        const lowest = Math.max(...outgoing.map((s) => s.mountedAtMiles ?? 0), 0)
        if (miles < lowest) {
          updateSwap({
            error: `That's less than the ${formatMiles(lowest)} the other set went on at`,
          })
          return false
        }
        updateSwap({ saving: true, error: undefined })
        try {
          await deps.tireSets.save(
            putOn(incoming, miles),
            ...outgoing.map((s) => takenOff(s, miles)),
          )
        } catch (e) {
          updateSwap({ saving: false, error: message(e, 'Could not swap the tires') })
          return false
        }
        set({ swap: undefined })
        return true
      },

      start: () => {
        if (subscriptions.length > 0) return
        subscriptions.push(
          deps.tireSets.watchForVehicle(vehicle.id, (next) => {
            sets = next
            if (currentMiles === undefined) refreshQuietly()
            else render()
          }),
          // A new reading or a logged service moves the miles on the set that is on the car.
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
