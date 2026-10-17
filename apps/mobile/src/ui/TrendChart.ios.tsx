import { Chart } from '@expo/ui/swift-ui'
import { frame } from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import type { TrendChartProps } from './TrendChart'

/** How a value moved over time, as a Swift Charts line with a point at each value. */
export function TrendChart({ points, color, height = 96 }: TrendChartProps) {
  const colors = useColors()
  return (
    <Chart
      type="line"
      // Plotted by position, as the other platforms draw it: two points on one date (a road trip)
      // would share a text label and stack on one spot.
      data={points.map((p, i) => ({ x: i + 1, y: Number(p.value.toFixed(1)) }))}
      showGrid
      lineStyle={{ color: colors[color], width: 2, pointStyle: 'circle', pointSize: 6 }}
      modifiers={[frame({ height: height + 24 })]}
    />
  )
}
