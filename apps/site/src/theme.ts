import type { Colors } from '../../mobile/src/theme/colors'

/** `textPrimary` → `--text-primary`. */
export const cssVar = (role: string) => `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`

const declarations = (colors: Colors) =>
  Object.entries(colors)
    .map(([role, value]) => `  ${cssVar(role)}: ${value};`)
    .join('\n')

/**
 * The app's semantic colour roles as CSS custom properties, light by default and dark when the
 * visitor's system is dark. The site's stylesheet only ever reads these variables, so it follows
 * the app's palette (apps/mobile/src/theme) without a colour of its own.
 */
export const themeCss = (light: Colors, dark: Colors) => `:root {
  color-scheme: light dark;
${declarations(light)}
}
@media (prefers-color-scheme: dark) {
  :root {
${declarations(dark).replace(/^/gm, '  ')}
  }
}
`
