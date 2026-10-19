// The number sits inside a ring of fixed size, so it stays a fixed size too, as on iOS.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Column, Row, Text } from '@expo/ui'
import { Box, CircularProgressIndicator } from '@expo/ui/jetpack-compose'
import { rotate, semantics, size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers'
import { useColors } from '../theme'
import { RING_THICKNESS, type StatusRingProps } from './StatusRing'

// The gap between segments, in degrees.
const GAP = 4

interface Flags {
  idx?: boolean
  alt?: boolean
  fixed?: boolean
  sem?: boolean
  num?: boolean
  spacing?: boolean
  big?: boolean
}

/**
 * A ring of coloured segments around a number. Compose has no chart, so each segment is a
 * determinate circular progress indicator covering its share of the ring, turned to its place.
 */
function Ring({
  segments,
  count,
  caption,
  label,
  size = 200,
  flags,
}: StatusRingProps & { flags: Flags }) {
  const colors = useColors()
  const thickness = Math.round(size * RING_THICKNESS)
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = 360 / shown.length
  const gap = shown.length > 1 ? GAP : 0
  return (
    <Box
      contentAlignment="center"
      modifiers={[
        sizeModifier(size, size),
        ...(flags.sem ? [semantics({ contentDescription: label })] : []),
      ]}
    >
      {shown.map((s, i) => (
        <CircularProgressIndicator
          key={flags.idx ? i : s.key}
          progress={flags.fixed ? (360 / 13 - 4) / 360 : (share - gap) / 360}
          color={flags.alt ? (i % 2 ? colors.warning : colors.accent) : colors[s.color]}
          trackColor={colors.clear}
          strokeWidth={thickness}
          strokeCap="butt"
          gapSize={0}
          modifiers={[sizeModifier(size, size), rotate(i * share + gap / 2)]}
        />
      ))}
      {flags.num ? (
        <Column alignment="center" {...(flags.spacing ? { spacing: 0 } : {})}>
          <Text
            textStyle={
              flags.big ? { fontSize: 56, fontWeight: '700', color: colors.textPrimary } : {}
            }
          >
            {String(count)}
          </Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
        </Column>
      ) : null}
    </Box>
  )
}

// DEBUG: which part of the ring stops it showing on the emulator.
export function StatusRing(props: StatusRingProps) {
  const colors = useColors()
  const { segments, count, caption, label } = props
  const shown = segments.length > 0 ? segments : [{ key: 'empty', color: 'separator' as const }]
  const share = 360 / shown.length
  const gap = shown.length > 1 ? GAP : 0
  // Called as a function, not rendered as a component, so it stays part of this one.
  const ring = (size: number, flags: Flags) => (
    <Box
      contentAlignment="center"
      modifiers={[
        sizeModifier(size, size),
        ...(flags.sem ? [semantics({ contentDescription: label })] : []),
      ]}
    >
      {shown.map((s, i) => (
        <CircularProgressIndicator
          key={s.key}
          progress={(share - gap) / 360}
          color={colors[s.color]}
          trackColor={colors.clear}
          strokeWidth={Math.round(size * RING_THICKNESS)}
          strokeCap="butt"
          gapSize={0}
          modifiers={[sizeModifier(size, size), rotate(i * share + gap / 2)]}
        />
      ))}
      {flags.num ? (
        <Column alignment="center" spacing={0}>
          <Text
            textStyle={
              flags.big ? { fontSize: 56, fontWeight: '700', color: colors.textPrimary } : {}
            }
          >
            {String(count)}
          </Text>
          <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
        </Column>
      ) : null}
    </Box>
  )
  const cell = (name: string, child: React.ReactNode) => (
    <Column alignment="center">
      {child}
      <Text>{name}</Text>
    </Column>
  )
  return (
    <Column alignment="center" spacing={4}>
      <Row spacing={8}>
        {cell('F1 all', ring(120, { sem: true, num: true, big: true }))}
        {cell('F2 no sem', ring(120, { num: true, big: true }))}
        {cell('F3 small num', ring(120, { sem: true, num: true }))}
      </Row>
      <Row spacing={8}>
        {cell('F4 sem only', ring(120, { sem: true }))}
        {cell('F5 bare', ring(120, {}))}
        {cell('F6 component', <Ring {...props} size={120} flags={{}} />)}
      </Row>
      {cell('F7 full size', ring(200, { sem: true, num: true, big: true }))}
    </Column>
  )
}
