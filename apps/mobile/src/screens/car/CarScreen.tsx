import { createCarModel, createSafetyModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { CarView } from './CarView'

/** Wires the car and safety models to the view. No state or logic lives here (ADR 0003). */
export function CarScreen({ vehicle }: { vehicle: Vehicle }) {
  // A new car gets its configuration once it has synced back, so that starts fresh models.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}`
  const car = useStore(useScreenModel(key, () => createCarModel({ vehicle, ...deps })))
  const safety = useStore(
    useScreenModel(key, () => createSafetyModel({ vehicle, safety: deps.safety })),
  )
  return <CarView car={car} safety={safety} />
}
