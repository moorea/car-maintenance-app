import {
  createAttachmentsModel,
  createServiceLogModel,
  type SessionState,
  type Vehicle,
} from '@car/core'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { ServiceLogView } from './ServiceLogView'

interface Props {
  vehicle: Vehicle
  /** Set when the owner asked elsewhere to log a service, so the form opens. */
  request?: SessionState['logRequest']
  /** Tells the session the form has opened for the request. */
  onRequestHandled: () => void
}

/** Wires the core model to the view. No state or logic lives here (ADR 0003). */
export function ServiceLogScreen({ vehicle, request, onRequestHandled }: Props) {
  // A fresh model per car; the car's config arriving later only reloads its task names, so a
  // draft in the form survives it.
  const model = useScreenModel(vehicle.id, () =>
    createServiceLogModel({ vehicleId: vehicle.id, configId: vehicle.configId, ...deps }),
  )
  useEffect(() => model.getState().setConfig(vehicle.configId), [model, vehicle.configId])
  useEffect(() => {
    if (!request) return
    model.getState().openForm(request.itemId)
    onRequestHandled()
  }, [model, request, onRequestHandled])
  const state = useStore(model)
  const attachments = useStore(
    useScreenModel(vehicle.id, () => createAttachmentsModel({ vehicleId: vehicle.id, ...deps })),
  )
  return (
    <ServiceLogView
      {...state}
      attachments={attachments}
      carName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
    />
  )
}
