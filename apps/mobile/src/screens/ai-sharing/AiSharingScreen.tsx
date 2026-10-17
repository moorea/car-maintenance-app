import { createAiSharingModel } from '@car/core'
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useStore } from 'zustand'
import { deps } from '../../bootstrap/deps'
import { openPrivacyPolicy } from '../../bootstrap/links'
import { useScreenModel } from '../../models/useScreenModel'
import { AiSharingView } from './AiSharingView'

/**
 * Shows `children`, a screen that sends data to Anthropic, only once the owner has allowed it;
 * until then it asks. No state or logic lives here (ADR 0003).
 */
export function AiSharingGate({
  feature,
  onBack,
  children,
}: {
  feature: 'ask' | 'quote'
  onBack: () => void
  children: ReactNode
}) {
  const model = useScreenModel('ai-sharing', () =>
    createAiSharingModel({ preferences: deps.preferences }),
  )
  const state = useStore(model)
  if (state.status === 'loading') return <ActivityIndicator style={styles.fill} />
  if (state.on) return children
  return (
    <AiSharingView
      {...state}
      feature={feature}
      onAllow={() => void state.setOn(true)}
      onBack={onBack}
      onPrivacyPolicy={openPrivacyPolicy}
    />
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
