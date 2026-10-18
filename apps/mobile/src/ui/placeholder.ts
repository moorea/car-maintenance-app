import type { Colors } from '../theme'

/**
 * Props that colour a text field's placeholder. iOS draws placeholders in the system's own lighter
 * grey, so nothing is set there.
 */
export function placeholderProps(_colors: Colors): { placeholderTextColor?: string } {
  return {}
}
