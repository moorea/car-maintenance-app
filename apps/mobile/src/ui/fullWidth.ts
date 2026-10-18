import type { UniversalBaseProps, UniversalStyle } from '@expo/ui'

type ModifierConfig = NonNullable<UniversalBaseProps['modifiers']>[number]

/**
 * Props that stretch an Expo UI view to its parent's width: a percentage width here, and a
 * Compose modifier on Android, which takes no percentages.
 */
export const fullWidth: { style: UniversalStyle; modifiers: ModifierConfig[] } = {
  style: { width: '100%' },
  modifiers: [],
}
