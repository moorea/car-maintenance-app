import { accessibilityLabel } from '@expo/ui/swift-ui/modifiers'

/** VoiceOver reads a text field by the label shown above it, not just its placeholder. */
export const fieldModifiers = (label: string) => [accessibilityLabel(label)]
