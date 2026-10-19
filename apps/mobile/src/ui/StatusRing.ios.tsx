// The number sits inside a ring of fixed size, so it stays a fixed size too: grown with Dynamic
// Type it would spill over the ring. The ring's label reads it out instead.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Text } from '@expo/ui'
import { Spacer, VStack, ZStack } from '@expo/ui/swift-ui'
import {
  accessibilityElement,
  accessibilityLabel,
  frame,
  monospacedDigit,
  rotationEffect,
  strokeBorder,
} from '@expo/ui/swift-ui/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

// The gap between segments, in degrees.
const GAP = 4

/**
 * A ring of coloured segments around a number. Each segment is the same circle's border, dashed so
 * that only its share of the ring is painted. A circle's path starts at three o'clock, so the
 * circles are turned a quarter back to start at the top. An empty spacer carries each border.
 */
export function StatusRing({ segments, count, caption, label, size = 200 }: StatusRingProps) {
  const colors = useColors()
  const thickness = size * RING_THICKNESS
  // The border is drawn inside the frame, so its centre line runs half a thickness in.
  const circumference = Math.PI * (size - thickness)
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = circumference / shown.length
  const gap = shown.length > 1 ? (circumference * GAP) / 360 : 0
  return (
    <ZStack
      modifiers={[
        frame({ width: size, height: size }),
        accessibilityElement('ignore'),
        accessibilityLabel(label),
      ]}
    >
      {shown.map((s, i) => {
        const start = i * share + gap / 2
        return (
          <Spacer
            key={s.key}
            modifiers={[
              frame({ width: size, height: size }),
              strokeBorder({
                content: colors[s.color],
                shape: 'circle',
                style: {
                  lineWidth: thickness,
                  dash: [share - gap, circumference - (share - gap)],
                  // A phase moves the pattern back along the path, so this starts the dash `start` in.
                  dashPhase: (circumference - start) % circumference,
                },
              }),
              rotationEffect(-90),
            ]}
          />
        )
      })}
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
