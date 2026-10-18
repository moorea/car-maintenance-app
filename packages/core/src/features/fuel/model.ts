import { createStore, type StoreApi } from 'zustand/vanilla'
import { z } from 'zod'
import { daysBetween, type IsoDate } from '../../lib/date'
import type { EnergyKind, FillUp, Vehicle } from '../../domain/types'
import type {
  Clock,
  FillUpRepo,
  IdGenerator,
  OdometerRepo,
  ServiceRecordRepo,
  Unsubscribe,
} from '../../ports'
import { formatCents, formatDay, formatMiles, formatMonth } from '../../lib/format'
import { FUTURE_DATE_ERROR } from '../../schemas/date'
import { fillUpDraftSchema, type FillUpDraft } from '../../schemas/fillUp'
import { MAX_PLAUSIBLE_MILES_PER_DAY } from '../../reminders/mileage'
import { currentOdometer } from '../garage/odometer'
import { LIST_PAGE } from '../service-log/history'
import { climbing, runningCosts, type PeriodCost } from './costs'
import {
  formatEconomy,
  formatQuantity,
  measureEconomy,
  QUANTITY_UNIT,
  type EconomyStretch,
} from './economy'
import {
  CHART_WAITING,
  ENERGY_WORDING,
  energyCostLabel,
  FILL_UP_NOUN,
  PARTIAL_NOTE,
  FORM_NOTE,
  usualEnergy,
  type EnergyWording,
} from './wording'

export type FuelSection = 'fill-ups' | 'costs'
export type FillUpField = Exclude<keyof FillUpDraft, 'full' | 'missedPrevious'>
export type FillUpFieldErrors = Partial<Record<FillUpField, string>>

/** One fill-up as the list shows it. */
export interface FillUpRow {
  id: string
  /** "Oct 12". */
  date: string
  /** "12.4 gal · $48.20". */
  title: string
  /** "41,250 mi · Costco · $3.89/gal", leaving out what is unknown. */
  detail: string
  /** "31.2 mpg" when this fill-up ends a measured stretch. */
  economy?: string
  /** Why it has no economy, or why its economy is suspect: "Partial fill". */
  note?: string
  /** The economy is impossible, most likely a typo the owner should fix. */
  flagged: boolean
}

/** Economy for one kind of energy, for the summary and the chart. */
export interface EconomyTrend {
  energy: EnergyKind
  /** "Fuel economy" or "Charging efficiency". */
  title: string
  /** "31.2 mpg". */
  average: string
  /** Says the chart waits for a second stretch, for when it has fewer than two points. */
  waiting: string
  /** Each plausible stretch, oldest first, dated by the fill-up that ends it. */
  points: { date: IsoDate; label: string; value: number }[]
}

/** One month's bar on the cost chart. */
export interface MonthBar {
  /** "Oct". */
  label: string
  fuelCents: number
  serviceCents: number
  totalCents: number
}

/** A period's costs as the table shows them. */
export interface CostRow {
  /** "Last 12 months" or "2025". */
  label: string
  fuel: string
  service: string
  total: string
  /** "8,420 mi"; absent when the readings cannot tell. */
  miles?: string
  /** "$0.31/mi"; absent over too few miles. */
  perMile?: string
}

export interface FillUpForm {
  /** The fill-up being edited; absent for a new one. */
  id?: string | undefined
  draft: FillUpDraft
  fieldErrors: FillUpFieldErrors
  /** "About 41,250", the odometer the car is estimated to be at today, as a placeholder. */
  odometerHint: string
  /** The latest day a fill-up can be dated: today. */
  latestDate: IsoDate
  /** "$3.89/gal" once both quantity and total are typed. */
  unitPrice?: string | undefined
  /** How full and missed affect economy, for the energy going in. */
  note: string
  saving: boolean
  /** True after the owner tapped delete once, until they confirm or change their mind. */
  confirmingDelete: boolean
  error?: string | undefined
}

export interface FuelState {
  status: 'loading' | 'ready'
  section: FuelSection
  /** Over the last twelve months. */
  lastYear: CostRow
  /** One per kind of energy with a measured stretch, fuel first. */
  economy: EconomyTrend[]
  /** The newest fill-ups, newest first: at most `rowLimit` of them. */
  rows: FillUpRow[]
  /** How many fill-ups `rows` may hold; grows with "Show earlier". */
  rowLimit: number
  /** How many older fill-ups are left out of `rows`. */
  hiddenRows: number
  /** The twelve months to this one, oldest first. */
  months: MonthBar[]
  /** Each year with a cost, newest first. */
  years: CostRow[]
  /** The choices for what went in, the car's usual one first. */
  energies: { energy: EnergyKind; label: string }[]
  /** Titles, buttons and notes in the words of the car's usual energy. */
  wording: EnergyWording
  /** What fill-ups' costs are called: "Fuel", "Charging", or "Fuel & charging" once both. */
  costLabel: string
  /** Present while the add or edit sheet is open. */
  form?: FillUpForm | undefined
}

export interface FuelActions {
  start: () => void
  showSection: (section: FuelSection) => void
  /** Shows another page of older fill-ups. */
  showMoreRows: () => void
  openNew: () => void
  openEdit: (id: string) => void
  setField: (field: FillUpField, value: string) => void
  setFull: (full: boolean) => void
  setMissedPrevious: (missed: boolean) => void
  closeForm: () => void
  /** Validates and saves the form. Resolves true on success. */
  save: () => Promise<boolean>
  /** Asks to confirm on the first call; deletes on the second. Resolves true once deleted. */
  remove: () => Promise<boolean>
  dispose: () => void
}

export type FuelModel = StoreApi<FuelState & FuelActions>

export interface FuelDeps {
  vehicle: Vehicle
  fillUps: FillUpRepo
  records: ServiceRecordRepo
  /** The car's readings, fill-ups' included (see withFillUpReadings). */
  odometer: OdometerRepo
  clock: Clock
  ids: IdGenerator
}

const ENERGY_LABEL: Record<EnergyKind, string> = { fuel: 'Fuel', electric: 'Charge' }
const TREND_TITLE: Record<EnergyKind, string> = {
  fuel: 'Fuel economy',
  electric: 'Charging efficiency',
}

const toFieldErrors = (error: z.ZodError): FillUpFieldErrors =>
  Object.fromEntries(
    error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' ? [[field, issue.message]] : []
    }),
  )

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

const newestFirst = (a: FillUp, b: FillUp) =>
  b.filledOn.localeCompare(a.filledOn) || b.odometerMiles - a.odometerMiles

/** "$0.31/mi". */
const formatPerMile = (cents: number) => `${formatCents(Math.round(cents))}/mi`

const costRow = (label: string, cost: PeriodCost): CostRow => ({
  label,
  fuel: formatCents(cost.fuelCents),
  service: formatCents(cost.serviceCents),
  total: formatCents(cost.totalCents),
  ...(cost.miles !== undefined && { miles: formatMiles(cost.miles) }),
  ...(cost.centsPerMile !== undefined && { perMile: formatPerMile(cost.centsPerMile) }),
})

const energyOf = (draft: FillUpDraft): EnergyKind =>
  draft.energy === 'electric' ? 'electric' : 'fuel'

/** The price per gallon or kWh as typed so far, if both numbers read as numbers. */
const unitPriceOf = (draft: FillUpDraft): string | undefined => {
  const quantity = Number(draft.quantity.trim())
  const dollars = Number(draft.cost.trim().replace(/^\$/, '').replaceAll(',', ''))
  if (!(quantity > 0) || !(dollars > 0) || draft.cost.trim() === '') return undefined
  const energy = energyOf(draft)
  // Pumps price fuel to a tenth of a cent, so three decimals reads like the sign.
  return `$${(dollars / quantity).toFixed(3)}/${QUANTITY_UNIT[energy]}`
}

const draftFrom = (f: FillUp): FillUpDraft => ({
  filledOn: f.filledOn,
  odometerMiles: f.odometerMiles.toLocaleString('en-US'),
  energy: f.energy,
  quantity: String(f.quantity),
  cost: f.costCents !== undefined ? (f.costCents / 100).toFixed(2) : '',
  full: f.full,
  missedPrevious: f.missedPrevious,
  station: f.station ?? '',
  notes: f.notes ?? '',
})

/**
 * Screen model for a car's fill-ups and running costs: the log of fill-ups and charging sessions
 * with the economy each full one measured, what the car cost by month and by year, and the add
 * and edit sheet.
 */
export const createFuelModel = (deps: FuelDeps): FuelModel => {
  const { vehicle } = deps
  const subscriptions: Unsubscribe[] = []
  let fillUps: FillUp[] = []
  let generation = 0
  const usual = usualEnergy(vehicle)
  const energies = ([usual, usual === 'fuel' ? 'electric' : 'fuel'] as const).map((energy) => ({
    energy,
    label: ENERGY_LABEL[energy],
  }))

  return createStore<FuelState & FuelActions>()((set, get) => {
    let odometerHint = ''
    /** Mileages from readings and services that a fill-up must not contradict. */
    let checkpoints: { date: IsoDate; miles: number; what: string }[] = []
    // Every fill-up's row, newest first; the screen lists a page of them at a time.
    let allRows: FillUpRow[] = []
    const pageOfRows = (rowLimit: number) => ({
      rowLimit,
      rows: allRows.slice(0, rowLimit),
      hiddenRows: Math.max(0, allRows.length - rowLimit),
    })

    /** Recomputes economy and costs from the fill-ups, services and readings. */
    const refresh = async () => {
      const mine = ++generation
      const [records, readings] = await Promise.all([
        deps.records.listForVehicle(vehicle.id),
        deps.odometer.listForVehicle(vehicle.id),
      ])
      if (mine !== generation) return
      const today = deps.clock.today()

      const estimate = currentOdometer(readings, records, today).miles
      odometerHint =
        estimate === undefined ? '' : `About ${Math.round(estimate).toLocaleString('en-US')}`

      const stretches = new Map<string, { stretch: EconomyStretch; energy: EnergyKind }>()
      const economy: EconomyTrend[] = []
      for (const energy of ['fuel', 'electric'] as const) {
        const measured = measureEconomy(fillUps, energy)
        for (const stretch of measured.stretches)
          stretches.set(stretch.fillUpId, { stretch, energy })
        if (measured.average === undefined) continue
        economy.push({
          energy,
          title: TREND_TITLE[energy],
          average: formatEconomy(measured.average, energy),
          waiting: CHART_WAITING[energy],
          points: measured.stretches
            .filter((s) => !s.implausible)
            .map((s) => ({ date: s.to, label: formatDay(s.to, today), value: s.economy })),
        })
      }

      allRows = [...fillUps].sort(newestFirst).map((f): FillUpRow => {
        const measured = stretches.get(f.id)
        const note = measured?.stretch.implausible
          ? 'Check the odometer and amount'
          : f.missedPrevious
            ? `After a missed ${FILL_UP_NOUN[f.energy]}`
            : !f.full
              ? PARTIAL_NOTE[f.energy]
              : undefined
        return {
          id: f.id,
          date: formatDay(f.filledOn, today),
          title: [
            formatQuantity(f.quantity, f.energy),
            f.costCents !== undefined ? formatCents(f.costCents) : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          detail: [
            formatMiles(f.odometerMiles),
            f.station,
            f.costCents !== undefined && f.quantity > 0
              ? `$${(f.costCents / 100 / f.quantity).toFixed(3)}/${QUANTITY_UNIT[f.energy]}`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          ...(measured && !measured.stretch.implausible
            ? { economy: formatEconomy(measured.stretch.economy, measured.energy) }
            : {}),
          ...(note !== undefined && { note }),
          flagged: measured?.stretch.implausible ?? false,
        }
      })

      // Services logged with a mileage show miles driven too, as on the car page.
      const mileages = [
        ...readings,
        ...records.flatMap((r) =>
          r.odometerMiles === undefined
            ? []
            : [{ vehicleId: r.vehicleId, date: r.performedOn, miles: r.odometerMiles }],
        ),
      ]
      const costs = runningCosts({ fillUps, records, readings: mileages, today })
      const fromFillUps = new Set(fillUps.map((f) => `${f.filledOn}:${f.odometerMiles}`))
      const services = new Set(records.map((r) => `${r.performedOn}:${r.odometerMiles}`))
      // Only readings the mileage estimate trusts, so an old typo nobody can delete blocks nothing.
      checkpoints = climbing(mileages.filter((m) => !fromFillUps.has(`${m.date}:${m.miles}`))).map(
        (m) => ({
          date: m.date,
          miles: m.miles,
          what: services.has(`${m.date}:${m.miles}`) ? 'service' : 'odometer reading',
        }),
      )
      set({
        status: 'ready',
        economy,
        costLabel: energyCostLabel(new Set(fillUps.map((f) => f.energy)), usual),
        ...pageOfRows(get().rowLimit),
        lastYear: costRow('Last 12 months', costs.lastYear),
        months: costs.months.map((m) => ({
          label: formatMonth(m.month),
          fuelCents: m.fuelCents,
          serviceCents: m.serviceCents,
          totalCents: m.totalCents,
        })),
        years: costs.years.map((y) => costRow(String(y.year), y)),
      })
    }
    const refreshQuietly = () =>
      void refresh().catch(() => {
        // The page keeps what it showed; the next change tries again.
        if (get().status === 'loading') set({ status: 'ready' })
      })

    const updateForm = (change: Partial<FillUpForm>) => {
      const form = get().form
      if (form) set({ form: { ...form, ...change } })
    }

    const changeDraft = (change: Partial<FillUpDraft>, cleared: FillUpField[]) => {
      const form = get().form
      if (!form) return
      const draft = { ...form.draft, ...change }
      updateForm({
        draft,
        fieldErrors: Object.fromEntries(
          Object.entries(form.fieldErrors).filter(([f]) => !cleared.includes(f as FillUpField)),
        ),
        unitPrice: unitPriceOf(draft),
        note: FORM_NOTE[energyOf(draft)],
        confirmingDelete: false,
        error: undefined,
      })
    }

    /**
     * A mileage that goes backwards against another fill-up, a service or an odometer reading is
     * almost always a typo. A fill-up entered late is fine as long as its date and mileage sit
     * between its neighbours'. On the same day either can come first, unless they are further
     * apart than a day's driving.
     */
    const outOfOrder = (id: string, date: IsoDate, miles: number): string | undefined => {
      const others = [
        ...fillUps
          .filter((f) => f.id !== id)
          .map((f) => ({
            date: f.filledOn,
            miles: f.odometerMiles,
            what: FILL_UP_NOUN[f.energy],
          })),
        ...checkpoints,
      ]
      const today = deps.clock.today()
      const before = others
        .filter(
          (o) =>
            (o.date < date && o.miles > miles) ||
            (o.date === date && o.miles - miles > MAX_PLAUSIBLE_MILES_PER_DAY),
        )
        .sort((a, b) => b.miles - a.miles)[0]
      if (before) {
        return `Lower than the ${formatDay(before.date, today)} ${before.what} at ${formatMiles(before.miles)}`
      }
      const after = others
        .filter(
          (o) =>
            (o.date > date && o.miles < miles) ||
            (o.date === date && miles - o.miles > MAX_PLAUSIBLE_MILES_PER_DAY),
        )
        .sort((a, b) => a.miles - b.miles)[0]
      if (after) {
        return `Higher than the ${formatDay(after.date, today)} ${after.what} at ${formatMiles(after.miles)}`
      }
      const previous = others
        .filter((o) => o.date < date)
        .sort((a, b) => b.date.localeCompare(a.date) || b.miles - a.miles)[0]
      if (
        previous &&
        (miles - previous.miles) / daysBetween(previous.date, date) > MAX_PLAUSIBLE_MILES_PER_DAY
      ) {
        return `Too far past the ${formatDay(previous.date, today)} ${previous.what} at ${formatMiles(previous.miles)}`
      }
      return undefined
    }

    return {
      status: 'loading',
      section: 'fill-ups',
      lastYear: costRow('Last 12 months', { fuelCents: 0, serviceCents: 0, totalCents: 0 }),
      economy: [],
      rows: [],
      rowLimit: LIST_PAGE,
      hiddenRows: 0,
      months: [],
      years: [],
      energies,
      wording: ENERGY_WORDING[usual],
      costLabel: energyCostLabel(new Set(), usual),

      showSection: (section) => set({ section }),

      showMoreRows: () => set((s) => pageOfRows(s.rowLimit + LIST_PAGE)),

      openNew: () => {
        // A new fill-up is usually like the last one: same energy, same station.
        const last = [...fillUps].sort(newestFirst)[0]
        const energy = last?.energy ?? usual
        set({
          form: {
            draft: {
              filledOn: deps.clock.today(),
              odometerMiles: '',
              energy,
              quantity: '',
              cost: '',
              full: true,
              missedPrevious: false,
              station: last?.station ?? '',
              notes: '',
            },
            fieldErrors: {},
            odometerHint,
            latestDate: deps.clock.today(),
            note: FORM_NOTE[energy],
            saving: false,
            confirmingDelete: false,
          },
        })
      },

      openEdit: (id) => {
        const f = fillUps.find((x) => x.id === id)
        if (!f) return
        const draft = draftFrom(f)
        set({
          form: {
            id,
            draft,
            fieldErrors: {},
            odometerHint,
            latestDate: deps.clock.today(),
            unitPrice: unitPriceOf(draft),
            note: FORM_NOTE[f.energy],
            saving: false,
            confirmingDelete: false,
          },
        })
      },

      setField: (field, value) =>
        // A mileage out of order is reported on the odometer but may be the date's fault.
        changeDraft({ [field]: value }, field === 'filledOn' ? [field, 'odometerMiles'] : [field]),
      setFull: (full) => changeDraft({ full }, []),
      setMissedPrevious: (missedPrevious) => changeDraft({ missedPrevious }, []),

      closeForm: () => {
        if (!get().form?.saving) set({ form: undefined })
      },

      save: async () => {
        const form = get().form
        if (!form || form.saving) return false
        const parsed = fillUpDraftSchema.safeParse(form.draft)
        if (!parsed.success) {
          updateForm({ fieldErrors: toFieldErrors(parsed.error) })
          return false
        }
        const d = parsed.data
        const id = form.id ?? deps.ids.next()
        if (d.filledOn > deps.clock.today()) {
          updateForm({ fieldErrors: { filledOn: FUTURE_DATE_ERROR } })
          return false
        }
        const order = outOfOrder(id, d.filledOn, d.odometerMiles)
        if (order) {
          updateForm({ fieldErrors: { odometerMiles: order } })
          return false
        }
        const fillUp: FillUp = {
          id,
          vehicleId: vehicle.id,
          filledOn: d.filledOn,
          odometerMiles: d.odometerMiles,
          energy: d.energy,
          quantity: d.quantity,
          full: d.full,
          missedPrevious: d.missedPrevious,
          ...(d.cost !== undefined && { costCents: Math.round(d.cost * 100) }),
          ...(d.station !== undefined && { station: d.station }),
          ...(d.notes !== undefined && { notes: d.notes }),
        }
        updateForm({ saving: true, error: undefined })
        try {
          await deps.fillUps.save(fillUp)
        } catch (e) {
          updateForm({
            saving: false,
            error: message(e, `Could not save the ${FILL_UP_NOUN[energyOf(form.draft)]}`),
          })
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
          await deps.fillUps.remove(form.id)
        } catch (e) {
          updateForm({
            saving: false,
            confirmingDelete: false,
            error: message(e, `Could not delete the ${FILL_UP_NOUN[energyOf(form.draft)]}`),
          })
          return false
        }
        set({ form: undefined })
        return true
      },

      start: () => {
        if (subscriptions.length > 0) return
        subscriptions.push(
          deps.fillUps.watchForVehicle(vehicle.id, (next) => {
            fillUps = next
            refreshQuietly()
          }),
          // Service costs count toward running costs, and readings toward miles driven.
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
