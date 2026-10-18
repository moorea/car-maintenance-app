import type { ReactNode } from 'react'

/**
 * Keeps a screen without the tab bar clear of the home indicator. Only iOS lays the app out to
 * the bottom edge; elsewhere the whole app already sits inside the safe area (`App`).
 */
export function BottomSafeArea({ children }: { children: ReactNode; inset?: boolean }) {
  return children
}
