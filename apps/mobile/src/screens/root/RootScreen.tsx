import { createSessionModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { RootView } from './RootView'

/** Wires the session model to the root view. No state or logic lives here (ADR 0003). */
export function RootScreen() {
  const model = useScreenModel('session', () => createSessionModel(deps))
  const state = useStore(model)
  return <RootView {...state} />
}
