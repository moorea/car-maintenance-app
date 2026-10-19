// The number sits inside a ring of fixed size, so it stays a fixed size too: grown with Dynamic
// Type it would spill over the ring. The ring's label reads it out instead.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Text } from '@expo/ui'
import { Circle, HStack, Spacer, VStack, ZStack } from '@expo/ui/swift-ui'
import {
  accessibilityElement,
  accessibilityLabel,
  foregroundStyle,
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
interface Flags {
  plain?: boolean
  holder?: 'spacer' | 'zstack' | 'circle'
  a11y?: boolean
  num?: boolean
}

function Ring({
  segments,
  count,
  caption,
  label,
  size = 200,
  flags,
}: StatusRingProps & { flags: Flags }) {
  const colors = useColors()
  const thickness = size * RING_THICKNESS
  // The border is drawn inside the frame, so its centre line runs half a thickness in.
  const circumference = Math.PI * (size - thickness)
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = circumference / shown.length
  const gap = shown.length > 1 ? (circumference * GAP) / 360 : 0
  return (
    <ZStack
      // Remounted when the segments change: arcs added to a ring already on screen weren't drawn.
      key={shown.map((s) => s.key).join()}
      modifiers={[
        frame({ width: size, height: size }),
        ...(flags.a11y ? [accessibilityElement('ignore'), accessibilityLabel(label)] : []),
      ]}
    >
      {shown.map((s, i) => {
        const start = i * share + gap / 2
        const mods = [
          frame({ width: size, height: size }),
          ...(flags.holder === 'circle' ? [foregroundStyle(colors.clear)] : []),
          strokeBorder({
            content: colors[s.color],
            shape: 'circle',
            style: flags.plain
              ? { lineWidth: thickness }
              : {
                  lineWidth: thickness,
                  dash: [share - gap, circumference - (share - gap)],
                  dashPhase: (circumference - start) % circumference,
                },
          }),
          rotationEffect(-90),
        ]
        if (flags.holder === 'zstack')
          return (
            <ZStack key={s.key} modifiers={mods}>
              <Text> </Text>
            </ZStack>
          )
        if (flags.holder === 'circle') return <Circle key={s.key} modifiers={mods} />
        return <Spacer key={s.key} modifiers={mods} />
      })}
      {flags.num ? (
        <VStack spacing={0}>
          <Text
            textStyle={{ fontSize: 56, fontWeight: '700', color: colors.textPrimary }}
            modifiers={[monospacedDigit()]}
          >
            {String(count)}
          </Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
        </VStack>
      ) : null}
    </ZStack>
  )
}

// DEBUG: which way of drawing the ring shows on the simulator.
export function StatusRing(props: StatusRingProps) {
  const small = { ...props, size: 90 }
  return (
    <VStack spacing={4}>
      <HStack spacing={8}>
        <Ring {...small} flags={{ holder: 'spacer', plain: true }} />
        <Ring {...small} flags={{ holder: 'zstack', plain: true }} />
        <Ring {...small} flags={{ holder: 'circle', plain: true }} />
      </HStack>
      <Text>A spacer · B zstack · C circle (plain)</Text>
      <HStack spacing={8}>
        <Ring {...small} flags={{ holder: 'spacer' }} />
        <Ring {...small} flags={{ holder: 'zstack' }} />
        <Ring {...small} flags={{ holder: 'circle' }} />
      </HStack>
      <Text>D spacer · E zstack · F circle (dashed)</Text>
      <Ring {...props} flags={{ holder: 'zstack', a11y: true, num: true }} />
    </VStack>
  )
}
