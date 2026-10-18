import { createRemindersModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { RemindersView } from './RemindersView'

/** Wires the reminders model to the view. No state or logic lives here (ADR 0003). */
export function RemindersScreen(props: { onBack: () => void }) {
  const model = useScreenModel('reminders', () =>
    createRemindersModel({
      notifier: deps.notifier,
      settings: deps.reminderSettings,
      scheduler: deps.reminders,
      clock: deps.clock,
    }),
  )
  const state = useStore(model)
  return <RemindersView {...state} onBack={props.onBack} />
}
