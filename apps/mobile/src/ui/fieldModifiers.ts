import type { TextInputProps } from '@expo/ui'

/**
 * The web preview has no SwiftUI modifiers, and importing them there loads a native module that
 * does not exist, so the field takes none.
 */
export const fieldModifiers = (_label: string): NonNullable<TextInputProps['modifiers']> => []
