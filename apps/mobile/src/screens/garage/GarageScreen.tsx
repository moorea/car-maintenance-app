import {
  createArrangeCarsModel,
  createGarageCardsModel,
  createGarageModel,
  type Vehicle,
} from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { GarageView, type GarageNavigation } from './GarageView'

interface Props extends GarageNavigation {
  vehicles: Vehicle[]
  /** The car whose schedule the garage shows. */
  vehicle: Vehicle
}

/** Wires the garage model to the view. No state or logic lives here (ADR 0003). */
export function GarageScreen({ vehicles, vehicle, ...navigation }: Props) {
  // A new car gets its configuration once it has synced back, and severe driving changes the
  // intervals, so either starts a fresh model.
  const model = useScreenModel(
    `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`,
    () => createGarageModel({ vehicle, ...deps }),
  )
  const state = useStore(model)
  // Every car's card shows what it needs next, so a new list of cars, or a car's schedule
  // changing as above, starts a fresh one.
  const cards = useScreenModel(
    vehicles.map((v) => `${v.id}:${v.configId ?? ''}:${v.severeDuty}:${v.year}`).join('|'),
    () => createGarageCardsModel({ cars: vehicles, ...deps }),
  )
  const nextDue = useStore(cards, (s) => s.nextDue)
  // Arranges the cars as the garage lists them now, so a new order or name from sync starts afresh.
  const arrange = useScreenModel(
    vehicles
      .map((v) => [v.id, v.nickname, v.year, v.make, v.model, v.trim ?? ''].join(':'))
      .join('|'),
    () => createArrangeCarsModel({ cars: vehicles, vehicles: deps.vehicles }),
  )
  const arrangeState = useStore(arrange)
  return (
    <GarageView
      {...state}
      vehicles={vehicles}
      vehicle={vehicle}
      nextDue={nextDue}
      arrange={arrangeState}
      {...navigation}
    />
  )
}
