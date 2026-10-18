import type { UniversalBaseProps } from '@expo/ui'

/**
 * Modifiers that give a view the label screen readers announce for it. The web preview has no
 * native modifiers, so it gets none; see labelled.ios.ts and labelled.android.ts.
 */
export const labelled = (_label: string): NonNullable<UniversalBaseProps['modifiers']> => []
