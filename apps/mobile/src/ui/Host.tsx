import { Host as ExpoHost, type UniversalHostProps } from '@expo/ui'
import { useColors } from '../theme'

/**
 * The Expo UI host every screen uses. It tints native controls (buttons, switches, pickers)
 * with the theme's accent, so no screen has to pass a colour to them.
 */
export function Host(props: UniversalHostProps) {
  const colors = useColors()
  return <ExpoHost seedColor={colors.accent} {...props} />
}
