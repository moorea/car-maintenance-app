import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type Colors } from './colors'

export type { ColorRole, Colors } from './colors'

/** The semantic colours for the system's current light or dark appearance. */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors
}
