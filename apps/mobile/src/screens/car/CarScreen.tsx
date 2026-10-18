import {
  createAttachmentsModel,
  createCarModel,
  createEditCarModel,
  createSafetyModel,
  createScheduleItemModel,
  type SessionState,
  type Vehicle,
} from '@car/core'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { openPrivacyPolicy } from '../../bootstrap/links'
import { useScreenModel } from '../../models/useScreenModel'
import { CarView } from './CarView'

/** Wires the car, safety, schedule item, edit car and documents models to the view. No state or logic lives here (ADR 0003). */
export function CarScreen({
  vehicle,
  odometerRequest,
  onOdometerRequestHandled,
  onCheckQuote,
  onTroubleCodes,
  onWarranty,
  onFuel,
  onTires,
  onDriving,
  onRenewals,
}: {
  vehicle: Vehicle
  /** Set when the owner asked elsewhere to update the odometer, so the editor opens. */
  odometerRequest?: SessionState['odometerRequest']
  /** Tells the session the editor has opened for the request. */
  onOdometerRequestHandled: () => void
  onCheckQuote: () => void
  onTroubleCodes: () => void
  onWarranty: () => void
  onFuel: () => void
  onTires: () => void
  onDriving: () => void
  onRenewals: () => void
}) {
  // A new car gets its configuration once it has synced back, and severe driving changes the
  // intervals, so either starts fresh models.
  const key = `${vehicle.id}:${vehicle.configId ?? ''}:${vehicle.severeDuty}`
  const carModel = useScreenModel(key, () => createCarModel({ vehicle, ...deps }))
  useEffect(() => {
    if (!odometerRequest) return
    carModel.getState().editOdometer()
    onOdometerRequestHandled()
  }, [carModel, odometerRequest, onOdometerRequestHandled])
  const car = useStore(carModel)
  const safety = useStore(useScreenModel(key, () => createSafetyModel({ vehicle, ...deps })))
  const scheduleItem = useStore(
    useScreenModel(key, () => createScheduleItemModel({ vehicle, ...deps })),
  )
  // Keyed by the name and look too, so the sheet opens with them as the car has them now.
  const editCar = useStore(
    useScreenModel(`${vehicle.id}:${vehicle.nickname}:${vehicle.bodyStyle}:${vehicle.paint}`, () =>
      createEditCarModel({ vehicle, ...deps }),
    ),
  )
  const documents = useStore(
    useScreenModel(vehicle.id, () => createAttachmentsModel({ vehicleId: vehicle.id, ...deps })),
  )
  return (
    <CarView
      car={car}
      safety={safety}
      scheduleItem={scheduleItem}
      editCar={editCar}
      documents={documents}
      onCheckQuote={onCheckQuote}
      onTroubleCodes={onTroubleCodes}
      onWarranty={onWarranty}
      onFuel={onFuel}
      onTires={onTires}
      onDriving={onDriving}
      onRenewals={onRenewals}
      onPrivacyPolicy={openPrivacyPolicy}
    />
  )
}
