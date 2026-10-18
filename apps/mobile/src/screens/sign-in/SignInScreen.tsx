import { createSignInModel } from '@car/core'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { openPrivacyPolicy } from '../../bootstrap/links'
import { useScreenModel } from '../../models/useScreenModel'
import { SignInView } from './SignInView'

/** Wires the core model to the view. No state or logic lives here (ADR 0003). */
export function SignInScreen() {
  const model = useScreenModel('sign-in', () => createSignInModel(deps))
  const state = useStore(model)
  return <SignInView {...state} onPrivacyPolicy={openPrivacyPolicy} />
}
