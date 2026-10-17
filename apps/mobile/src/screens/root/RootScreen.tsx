import { createSessionModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { OnboardingGate } from '../onboarding/OnboardingScreen'
import { RootView } from './RootView'

/** Wires the session model to the root view. No state or logic lives here (ADR 0003). */
export function RootScreen() {
  const model = useScreenModel('session', () => createSessionModel(deps))
  const state = useStore(model)
  // The introduction shows before sign-in on a first launch; an owner already signed in, such
  // as one updating the app, is marked as introduced instead.
  return (
    <OnboardingGate>
      <RootView {...state} />
    </OnboardingGate>
  )
}
