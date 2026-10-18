import { Column, Row } from '@expo/ui'
import type { ReactNode } from 'react'
import { Platform, useWindowDimensions } from 'react-native'
import { isAccessibilityTextSize } from './dynamicType'

/**
 * Lays children side by side, or stacks them at the accessibility text sizes so long words are
 * not broken across lines.
 */
export function Reflow({
  children,
  spacing,
  alignment = 'start',
}: {
  children: ReactNode
  spacing: number
  alignment?: 'start' | 'center'
}) {
  const { fontScale } = useWindowDimensions()
  // Text only follows the reader's text size on iOS (see Text.ios.tsx).
  if (Platform.OS === 'ios' && isAccessibilityTextSize(fontScale)) {
    return (
      <Column spacing={spacing} alignment="start">
        {children}
      </Column>
    )
  }
  return (
    <Row spacing={spacing} alignment={alignment}>
      {children}
    </Row>
  )
}
