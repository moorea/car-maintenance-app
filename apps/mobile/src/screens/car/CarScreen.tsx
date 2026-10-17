import { createAttachmentsModel, createCarModel, createSafetyModel, type Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { CarView } from './CarView'

/** Wires the car, safety and documents models to the view. No state or logic lives here (ADR 0003). */
export function CarScreen({
  vehicle,
  onCheckQuote,
  onWarranty,
  onFuel,
}: {
  vehicle: Vehicle
  onCheckQuote: () => void
  onWarranty: () => void
  onFuel: () => void
}) {
  // A new car gets its configuration once it has synced back, and severe driving changes the
  // intervals, so either starts fresh models.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  const car = useStore(useScreenModel(key, () => createCarModel({ vehicle, ...deps })))
  const safety = useStore(
    useScreenModel(key, () => createSafetyModel({ vehicle, safety: deps.safety })),
  )
  const documents = useStore(
    useScreenModel(vehicle.id, () => createAttachmentsModel({ vehicleId: vehicle.id, ...deps })),
  )
  return (
    <CarView
      car={car}
      safety={safety}
      documents={documents}
      onCheckQuote={onCheckQuote}
      onWarranty={onWarranty}
      onFuel={onFuel}
    />
  )
}
