import { Column, Row } from '@expo/ui'
import type { ReactNode } from 'react'
import { useWindowDimensions } from 'react-native'
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
  if (isAccessibilityTextSize(fontScale)) {
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
