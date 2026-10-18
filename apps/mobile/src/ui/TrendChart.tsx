import { Column, Row, Spacer, type UniversalStyle } from '@expo/ui'
import { useColors, type ColorRole } from '../theme'
import { Text } from './Text'

export interface TrendChartProps {
  /** Oldest first. */
  points: { label: string; value: number }[]
  color: ColorRole
  height?: number
}

/**
 * How a value moved over time. Here a dot per point on a scale from just under the lowest to
 * just over the highest, so a change of a few mpg shows; iOS draws a Swift Charts line instead.
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
    <Column spacing={4}>
      <Row spacing={2} alignment="end" style={{ height }}>
        {points.map((p, i) => (
          <Column
            key={i}
            alignment="center"
            style={{
              ...({ flex: 1 } as UniversalStyle),
              height,
              paddingBottom: ((p.value - min) / (max - min)) * (height - dot),
            }}
          >
            <Spacer flexible />
            <Row
              style={{
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: colors[color],
              }}
            />
          </Column>
        ))}
      </Row>
      <Row>
        <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>
          {points[0]?.label ?? ''}
        </Text>
        <Row style={{ flex: 1 } as UniversalStyle} />
        <Text textStyle={{ fontSize: 10, color: colors.textSecondary }}>
          {points.at(-1)?.label ?? ''}
        </Text>
      </Row>
    </Column>
  )
}
