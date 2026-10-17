import type { Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { askModelFor } from '../../models/askModels'
import { AskView } from './AskView'

interface Props {
  vehicle: Vehicle
  onBack: () => void
}

/** Wires the car's Ask model to the view. No state or logic lives here (ADR 0003). */
export function AskScreen({ vehicle, onBack }: Props) {
  const state = useStore(askModelFor(vehicle))
  return <AskView {...state} onBack={onBack} />
}
