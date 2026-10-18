import type { EnergyKind, Vehicle } from '../../domain/types'

/** An electric car charges; anything else, hybrids included, starts on fuel. */
export const usualEnergy = (vehicle: Pick<Vehicle, 'engine'>): EnergyKind =>
  /electric/i.test(vehicle.engine ?? '') ? 'electric' : 'fuel'

/** How the fuel screen, and the car page's link to it, talk about what the car runs on. */
export interface EnergyWording {
  /** "Fuel & costs": the screen's title and the car page's link to it. */
  title: string
  /** "Log fill-ups, see economy…": under the title on the car page. */
  summary: string
  /** "Log a fill-up": what the add button says to a screen reader. */
  add: string
  /** "Fill-ups": the log's tab. */
  tab: string
  /** "FILL-UPS": the heading over the log. */
  heading: string
  /** "Show earlier fill-ups". */
  showEarlier: string
  /** What the log says before anything is in it. */
  empty: string
  /** "Add fill-up": the sheet's title for a new one. */
  addTitle: string
  /** "Edit fill-up". */
  editTitle: string
  /** "Delete fill-up". */
  remove: string
}

export const ENERGY_WORDING: Record<EnergyKind, EnergyWording> = {
  fuel: {
    title: 'Fuel & costs',
    summary: 'Log fill-ups, see economy and what the car costs each month',
    add: 'Log a fill-up',
    tab: 'Fill-ups',
    heading: 'FILL-UPS',
    showEarlier: 'Show earlier fill-ups',
    empty:
      'Log each fill-up or charge with the odometer reading. Economy shows after two full fill-ups, and every reading keeps your reminders on time. Tap + to start.',
    addTitle: 'Add fill-up',
    editTitle: 'Edit fill-up',
    remove: 'Delete fill-up',
  },
  electric: {
    title: 'Charging & costs',
    summary: 'Log charges, see efficiency and what the car costs each month',
    add: 'Log a charge',
    tab: 'Charges',
    heading: 'CHARGES',
    showEarlier: 'Show earlier charges',
    empty:
      'Log each charge with the odometer reading. Efficiency shows after two full charges, and every reading keeps your reminders on time. Tap + to start.',
    addTitle: 'Add charge',
    editTitle: 'Edit charge',
    remove: 'Delete charge',
  },
}

/** One fill-up or charging session, in a sentence: "the Oct 1 fill-up", "a missed charge". */
export const FILL_UP_NOUN: Record<EnergyKind, string> = { fuel: 'fill-up', electric: 'charge' }

/** What a fill-up's cost is called: "Fuel", "Charging", or both once both are logged. */
export const energyCostLabel = (logged: ReadonlySet<EnergyKind>, usual: EnergyKind): string => {
  if (logged.has('fuel') && logged.has('electric')) return 'Fuel & charging'
  const only = logged.has('electric') ? 'electric' : logged.has('fuel') ? 'fuel' : usual
  return only === 'electric' ? 'Charging' : 'Fuel'
}

/** How the add and edit sheet explains full and missed, for what is going in. */
export const FORM_NOTE: Record<EnergyKind, string> = {
  fuel: 'Economy is measured from one full fill-up to the next. Turn off the first switch for a top-up, and turn on the second if a fill-up went unlogged, so neither skews it.',
  electric:
    'Efficiency is measured from one full charge to the next. Turn off the first switch for a top-up, and turn on the second if a charge went unlogged, so neither skews it.',
}

/** What an economy chart says until it has two points. */
export const CHART_WAITING: Record<EnergyKind, string> = {
  fuel: 'The chart starts once two stretches between full fill-ups are logged.',
  electric: 'The chart starts once two stretches between full charges are logged.',
}
