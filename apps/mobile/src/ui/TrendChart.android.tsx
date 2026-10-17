import { Column, Row, Spacer, Text } from '@expo/ui'
import {
  background,
  clip,
  fillMaxWidth,
  height as heightModifier,
  padding,
  Shapes,
  size,
  weight,
} from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import type { TrendChartProps } from './TrendChart'

/**
 * How a value moved over time: a dot per point on a scale from just under the lowest to just over
 * the highest, as the web preview draws it. Compose has no chart, unlike iOS's Swift Charts.
 */
export function TrendChart({ points, color, height = 96 }: TrendChartProps) {
  const colors = useColors()
  const values = points.map((p) => p.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const pad = Math.max((high - low) * 0.15, high * 0.02, 0.1)
  const [min, max] = [low - pad, high + pad]
  const dot = 8
  return (
    <Column spacing={4} modifiers={[fillMaxWidth()]}>
      <Row spacing={2} alignment="end" modifiers={[fillMaxWidth(), heightModifier(height)]}>
        {points.map((p, i) => (
          <Column
            key={i}
            alignment="center"
            modifiers={[
              weight(1),
              heightModifier(height),
              padding(0, 0, 0, ((p.value - min) / (max - min)) * (height - dot)),
            ]}
          >
            <Spacer flexible />
            <Row modifiers={[size(dot, dot), clip(Shapes.Circle), background(colors[color])]} />
          </Column>
        ))}
      </Row>
      <Row modifiers={[fillMaxWidth()]}>
        <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>
          {points[0]?.label ?? ''}
        </Text>
        <Spacer flexible />
        <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>
          {points.at(-1)?.label ?? ''}
        </Text>
      </Row>
    </Column>
  )
}
