import type { Vehicle } from '@car/core'
import { useStore } from 'zustand'
import { quoteModelFor } from '../../models/quoteModels'
import { QuoteCheckView } from './QuoteCheckView'

interface Props {
  vehicle: Vehicle
  onBack: () => void
  /** Opens Ask with a question about one line of the quote. */
  onAsk: (question: string) => void
}

/** Wires the car's quote check model to the view. No state or logic lives here (ADR 0003). */
export function QuoteCheckScreen({ vehicle, onBack, onAsk }: Props) {
  const state = useStore(quoteModelFor(vehicle))
  return (
    <QuoteCheckView
      {...state}
      onBack={onBack}
      onAsk={(index) => {
        const question = state.questionFor(index)
        if (question) onAsk(question)
      }}
    />
  )
}
