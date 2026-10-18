import { createReminderOfferModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { ReminderOfferView } from './ReminderOfferView'

/** Wires the reminder offer model to the view. No state or logic lives here (ADR 0003). */
export function ReminderOfferScreen({ carName, onDone }: { carName: string; onDone: () => void }) {
  const model = useScreenModel('reminder-offer', () =>
    createReminderOfferModel({
      notifier: deps.notifier,
      settings: deps.reminderSettings,
      preferences: deps.preferences,
      onDone,
    }),
  )
  const state = useStore(model)
  return <ReminderOfferView {...state} carName={carName} />
}
