import type { UniversalBaseProps } from '@expo/ui'
import { accessibilityLabel } from '@expo/ui/swift-ui/modifiers'

/** Modifiers that give a view the label screen readers announce for it (VoiceOver here). */
export const labelled = (label: string): NonNullable<UniversalBaseProps['modifiers']> => [
  accessibilityLabel(label),
]
