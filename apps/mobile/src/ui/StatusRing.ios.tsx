// The number sits inside a ring of fixed size, so it stays a fixed size too: grown with Dynamic
// Type it would spill over the ring. The ring's label reads it out instead.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Text } from '@expo/ui'
import { Chart, VStack, ZStack } from '@expo/ui/swift-ui'
import {
  accessibilityElement,
  accessibilityLabel,
  frame,
  monospacedDigit,
} from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

/**
 * A ring of coloured segments around a number, drawn as a Swift Charts donut: one equal sector per
 * segment, with a gap between them. Pie charts need iOS 17; on iOS 16 only the number shows.
 */
export function StatusRing({ segments, count, caption, label, size = 200 }: StatusRingProps) {
  const colors = useColors()
  const thickness = size * RING_THICKNESS
  // With nothing to show, an empty track keeps the shape.
  const data =
    segments.length > 0
      ? segments.map((s) => ({ x: s.key, y: 1, color: colors[s.color] }))
      : [{ x: 'empty', y: 1, color: colors.separator }]
  return (
    <ZStack
      modifiers={[
        frame({ width: size, height: size }),
        accessibilityElement('ignore'),
        accessibilityLabel(label),
      ]}
    >
      <Chart
        type="pie"
        data={data}
        pieStyle={{
          innerRadius: 1 - (2 * thickness) / size,
          angularInset: data.length > 1 ? 1.5 : 0,
          // Rounded corners wider than the ring is thick fold the sectors into spikes.
          cornerRadius: 0,
          opacity: 1,
        }}
        animate={false}
        showLegend={false}
        modifiers={[frame({ width: size, height: size })]}
      />
      <VStack spacing={0}>
        <Text
          textStyle={{ fontSize: 56, fontWeight: '700', color: colors.textPrimary }}
          modifiers={[monospacedDigit()]}
        >
          {String(count)}
        </Text>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
      </VStack>
    </ZStack>
  )
}
