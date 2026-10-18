import { accessibilityLabel } from '@expo/ui/swift-ui/modifiers'
import type { TextInputProps } from '@expo/ui'

/** VoiceOver reads a text field by the label shown above it, not just its placeholder. */
export const fieldModifiers = (label: string): NonNullable<TextInputProps['modifiers']> => [
  accessibilityLabel(label),
]
