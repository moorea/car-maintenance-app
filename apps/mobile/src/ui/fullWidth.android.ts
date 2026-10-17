import type { UniversalBaseProps, UniversalStyle } from '@expo/ui'

type ModifierConfig = NonNullable<UniversalBaseProps['modifiers']>[number]
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'

/** Props that stretch an Expo UI view to its parent's width. */
export const fullWidth: { style: UniversalStyle; modifiers: ModifierConfig[] } = {
  style: {},
  modifiers: [fillMaxWidth()],
}
