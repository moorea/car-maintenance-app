import type { ReportColors } from '@car/core'
import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type Colors } from './colors'

export type { ColorRole, Colors } from './colors'
export { paintColors } from './colors'

/** The semantic colours for the system's current light or dark appearance. */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors
}

/** Colours for printed reports: always the light theme, since they are read on white paper. */
export const reportColors: ReportColors = {
  text: lightColors.textPrimary,
  textSecondary: lightColors.textSecondary,
  accent: lightColors.accent,
  separator: lightColors.separator,
  warning: lightColors.warning,
  subtle: lightColors.background,
}
