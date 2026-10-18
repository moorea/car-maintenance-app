import type { UniversalBaseProps } from '@expo/ui'

/**
 * Modifiers that give a view the label screen readers announce for it. The web preview has no
 * native modifiers, so it gets none; iOS and Android have their own files.
 */
export const labelled = (_label: string): NonNullable<UniversalBaseProps['modifiers']> => []
