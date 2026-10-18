import type { Colors } from '../theme'

/**
 * Props that colour a text field's placeholder. Compose draws it in the text colour unless told
 * otherwise, so a hint like YYYY-MM-DD looked typed in; it takes the hint colour instead.
 */
export function placeholderProps(colors: Colors): { placeholderTextColor?: string } {
  return { placeholderTextColor: colors.textSecondary }
}
