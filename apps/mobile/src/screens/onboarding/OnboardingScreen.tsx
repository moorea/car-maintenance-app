import { createOnboardingModel } from '@car/core'
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { useScreenModel } from '../../models/useScreenModel'
import { OnboardingView } from './OnboardingView'

/**
 * Shows the first-run introduction until it is finished, then `children`. No state or logic
 * lives here (ADR 0003).
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const model = useScreenModel('onboarding', () =>
    createOnboardingModel({ preferences: deps.preferences, auth: deps.auth }),
  )
  const state = useStore(model)
  if (state.status === 'loading') return <ActivityIndicator style={styles.fill} />
  if (state.status === 'showing') return <OnboardingView {...state} />
  return children
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
