import { Column, Row, Spacer, Text } from '@expo/ui'
import {
  background,
  clip,
  fillMaxWidth,
  height as heightModifier,
  Shapes,
  weight,
} from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import type { StackedBarsProps } from './StackedBars'

/** A row of stacked bars, scaled to the tallest, each bar an equal share of the width. */
export function StackedBars({ bars, height = 120 }: StackedBarsProps) {
  const colors = useColors()
  const max = Math.max(1, ...bars.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0)))
  // Room for the 2-point gaps above each segment, so the tallest stack fits its height.
  const room = height - 2 * Math.max(0, ...bars.map((b) => b.segments.length))
  return (
    <Row spacing={4} alignment="end" modifiers={[fillMaxWidth()]}>
      {bars.map((bar, i) => (
        <Column key={i} spacing={4} alignment="center" modifiers={[weight(1)]}>
          <Column spacing={2} modifiers={[fillMaxWidth(), heightModifier(height)]}>
            <Spacer flexible />
            {bar.segments
              .filter((s) => s.value > 0)
              .reverse()
              .map((s, j) => (
                <Row
                  key={j}
                  modifiers={[
                    fillMaxWidth(),
                    heightModifier(Math.max(2, (s.value / max) * room)),
                    clip(Shapes.RoundedCorner(3)),
                    background(colors[s.color]),
                  ]}
                />
              ))}
          </Column>
          <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>{bar.label}</Text>
        </Column>
      ))}
    </Row>
  )
}
