import type { UniversalBaseProps } from '@expo/ui'
import { semantics } from '@expo/ui/jetpack-compose/modifiers'

/** Modifiers that give a view the label screen readers announce for it (TalkBack here). */
export const labelled = (label: string): NonNullable<UniversalBaseProps['modifiers']> => [
  semantics({ contentDescription: label }),
]
