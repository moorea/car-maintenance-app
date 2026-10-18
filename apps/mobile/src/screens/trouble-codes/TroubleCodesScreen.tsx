import type { Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { codesModelFor } from '../../models/codesModels'
import { TroubleCodesView } from './TroubleCodesView'

interface Props {
  vehicle: Vehicle
  onBack: () => void
  /** Opens Ask with a question about one code. */
  onAsk: (question: string) => void
}

/** Wires the car's code lookup model to the view. No state or logic lives here (ADR 0003). */
export function TroubleCodesScreen({ vehicle, onBack, onAsk }: Props) {
  const state = useStore(codesModelFor(vehicle))
  return (
    <TroubleCodesView
      {...state}
      onBack={onBack}
      onAsk={(code) => {
        const question = state.questionFor(code)
        if (question) onAsk(question)
      }}
    />
  )
}
