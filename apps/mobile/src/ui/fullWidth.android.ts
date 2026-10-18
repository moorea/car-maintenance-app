import type { UniversalBaseProps, UniversalStyle } from '@expo/ui'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'

type ModifierConfig = NonNullable<UniversalBaseProps['modifiers']>[number]

/** Props that stretch an Expo UI view to its parent's width. */
export const fullWidth: { style: UniversalStyle; modifiers: ModifierConfig[] } = {
  style: {},
  modifiers: [fillMaxWidth()],
}
