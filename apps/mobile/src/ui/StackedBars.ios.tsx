import { Column, Row, Spacer } from '@expo/ui'
import { frame } from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import type { StackedBarsProps } from './StackedBars'
import { Text } from './Text'

const barHeight = (share: number, height: number) => {
  const h = Math.max(2, share * height)
  return { minHeight: h, maxHeight: h }
}

/** A row of stacked bars, scaled to the tallest, each bar an equal share of the width. */
export function StackedBars({ bars, height = 120 }: StackedBarsProps) {
  const colors = useColors()
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0)))
  // Room for the 2-point gaps above each segment, so the tallest stack fits its height.
  const room = height - 2 * Math.max(0, ...bars.map((b) => b.segments.length))
  return (
    <Row spacing={4} alignment="end">
      {bars.map((bar, i) => (
        <Column key={i} spacing={4} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
          <Column
            spacing={2}
            modifiers={[frame({ maxWidth: Infinity, minHeight: height, maxHeight: height })]}
          >
            <Spacer flexible />
            {bar.segments
              .filter((s) => s.value > 0)
              .reverse()
              .map((s, j) => (
                <Row
                  key={j}
                  style={{ borderRadius: 3, backgroundColor: colors[s.color] }}
                  modifiers={[frame({ maxWidth: Infinity, ...barHeight(s.value / max, room) })]}
                />
              ))}
          </Column>
          <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>{bar.label}</Text>
        </Column>
      ))}
    </Row>
  )
}
