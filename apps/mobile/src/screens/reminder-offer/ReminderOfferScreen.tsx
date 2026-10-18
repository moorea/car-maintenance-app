import { createReminderOfferModel } from '@car/core'
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { BottomSafeArea } from '../../ui/BottomSafeArea'
import { ReminderOfferView } from './ReminderOfferView'

interface Props {
  /** The car just added, as the owner named it. */
  carName: string
  onDone: () => void
  /** What shows until the offer is decided, and after it: the garage. */
  children: ReactNode
}

/**
 * Shows the offer to turn reminders on over `children` when there is one to make. No state or
 * logic lives here (ADR 0003).
 */
export function ReminderOfferGate({ carName, onDone, children }: Props) {
  const model = useScreenModel('reminder-offer', () =>
    createReminderOfferModel({
      notifier: deps.notifier,
      settings: deps.reminderSettings,
      preferences: deps.preferences,
      onDone,
    }),
  )
  const state = useStore(model)
  if (state.status !== 'showing' && state.status !== 'saving') return children
  // It replaces the garage and its tab bar, so it keeps clear of the home indicator itself.
  return (
    <BottomSafeArea>
      <ReminderOfferView {...state} carName={carName} />
    </BottomSafeArea>
  )
}
