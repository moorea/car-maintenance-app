/**
 * Raw colour swatches. The only file in the app allowed to contain colour literals (ESLint).
 * Nothing outside `src/theme` imports this: screens use the semantic roles in `colors.ts`, so a
 * swatch can change, or a role can point at another swatch, without touching a screen.
 */
export const palette = {
  white: '#FFFFFF',
  black: '#000000',

  gray50: '#F2F2F7',
  gray75: '#EEF0F3',
  gray50Cool: '#F2F4F7',
  gray100: '#E2E4E8',
  gray400: '#A1A8B2',
  gray600: '#5B6470',
  gray800: '#38383A',
  gray850: '#2C2C2E',
  gray900: '#1C1C1E',
  gray950: '#111418',

  teal50: '#E3EEF0',
  teal300: '#4FB3C2',
  teal600: '#0B5D6B',
  teal950: '#0D2A2F',

  orange50: '#FFF1E6',
  orange300: '#FB923C',
  orange700: '#C2410C',
  orange950: '#3B1A0A',

  red200: '#F2B8B5',
  red700: '#B3261E',

  // No fill at all.
  clear: 'transparent',

  // Translucent fills for Liquid Glass where the platform has no native glass (web, Android).
  whiteGlass: 'rgba(255, 255, 255, 0.62)',
  whiteGlassEdge: 'rgba(255, 255, 255, 0.85)',
  charcoalGlass: 'rgba(44, 44, 46, 0.62)',
  charcoalGlassEdge: 'rgba(255, 255, 255, 0.14)',
  graySelected: 'rgba(118, 124, 134, 0.16)',
  graySelectedDark: 'rgba(235, 235, 245, 0.16)',
  shadowSoft: 'rgba(16, 24, 32, 0.14)',
  shadowDark: 'rgba(0, 0, 0, 0.5)',
} as const
