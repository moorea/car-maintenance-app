import { createGarageModel, type Vehicle } from '@car/core'
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
  return <GarageView {...state} vehicles={vehicles} vehicle={vehicle} {...navigation} />
}
