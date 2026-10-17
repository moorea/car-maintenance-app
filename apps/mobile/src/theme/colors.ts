import { palette as p } from './palette'

/**
 * Semantic colour roles: what a colour is for, not what it looks like. Screens only ever ask for
 * a role. Rebranding or tuning dark mode means changing this file or the palette, nothing else.
 */
export interface Colors {
  /** Behind everything on a screen. */
  background: string
  /** Cards and grouped rows sitting on the background. */
  surface: string
  /** Hairlines between rows. */
  separator: string
  /** Body text and titles. */
  textPrimary: string
  /** Captions, hints and secondary details. */
  textSecondary: string
  /** Brand colour: primary buttons, selected tabs, links. Also the native tint for controls. */
  accent: string
  /** Quiet accent fill behind icons and secondary buttons. */
  accentSubtle: string
  /** Text and icons drawn on an `accent` fill. */
  onAccent: string
  /** Needs attention soon: overdue maintenance, open recalls. */
  warning: string
  /** Fill behind a warning card. */
  warningSubtle: string
  /** Something is wrong or unsafe: form errors, do-not-drive recalls. */
  danger: string
}

export type ColorRole = keyof Colors

export const lightColors: Colors = {
  background: p.gray50,
  surface: p.white,
  separator: p.gray100,
  textPrimary: p.gray950,
  textSecondary: p.gray600,
  accent: p.teal600,
  accentSubtle: p.teal50,
  onAccent: p.white,
  warning: p.orange700,
  warningSubtle: p.orange50,
  danger: p.red700,
}

export const darkColors: Colors = {
  background: p.black,
  surface: p.gray900,
  separator: p.gray800,
  textPrimary: p.gray25,
  textSecondary: p.gray400,
  accent: p.teal300,
  accentSubtle: p.teal950,
  onAccent: p.black,
  warning: p.orange300,
  warningSubtle: p.orange950,
  danger: p.red200,
}
