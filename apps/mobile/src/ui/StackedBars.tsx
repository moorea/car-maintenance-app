import { Column, Row, Spacer, type UniversalStyle } from '@expo/ui'
import { useColors, type ColorRole } from '../theme'
import { Text } from './Text'

export interface StackedBar {
  /** Under the bar, such as "Oct". */
  label: string
  /** Bottom to top. */
  segments: { value: number; color: ColorRole }[]
}

export interface StackedBarsProps {
  bars: StackedBar[]
  /** The tallest bar's height, in points. */
  height?: number
}

/**
 * A row of bars, each a stack of coloured segments, scaled to the tallest. Drawn from plain views
 * so it looks the same on every platform; segments have a gap between them, so two series only
 * need to stand out from the card behind them.
 */
export function StackedBars({ bars, height = 120 }: StackedBarsProps) {
  const colors = useColors()
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0)))
  // Room for the 2-point gaps above each segment, so the tallest stack fits its height.
  const room = height - 2 * Math.max(0, ...bars.map((b) => b.segments.length))
  return (
    <Row spacing={4} alignment="end">
      {bars.map((bar, i) => (
        <Column key={i} spacing={4} alignment="center" style={{ flex: 1 } as UniversalStyle}>
          <Column spacing={2} style={{ height, width: '100%' }}>
            <Spacer flexible />
            {bar.segments
              .filter((s) => s.value > 0)
              .reverse()
              .map((s, j) => (
                <Row
                  key={j}
                  style={{
                    height: Math.max(2, (s.value / max) * room),
                    width: '100%',
                    borderRadius: 3,
                    backgroundColor: colors[s.color],
                  }}
                />
              ))}
          </Column>
          <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>{bar.label}</Text>
        </Column>
      ))}
    </Row>
  )
}
