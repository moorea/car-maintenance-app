import { createAddCarModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { AddCarView } from './AddCarView'

interface Props {
  ownerId: string
  onAdded: (id: string) => void
  /** Absent when this is the owner's first car and there is nothing to go back to. */
  onCancel?: (() => void) | undefined
  /** Opens the account, for an owner who has no car to reach it from. */
  onAccount?: (() => void) | undefined
}

/** Wires the core model to the view. No state or logic lives here (ADR 0003). */
export function AddCarScreen({ ownerId, onAdded, onCancel, onAccount }: Props) {
  const model = useScreenModel(ownerId, () => createAddCarModel({ ownerId, onAdded, ...deps }))
  const state = useStore(model)
  return <AddCarView {...state} onCancel={onCancel} onAccount={onAccount} />
}
