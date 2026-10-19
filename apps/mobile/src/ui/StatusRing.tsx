import { Column, Row, type UniversalStyle } from '@expo/ui'
import { useColors, type ColorRole } from '../theme'
import { Text } from './Text'

export interface StatusRingProps {
  /** One per thing the ring stands for, in order clockwise from the top. */
  segments: { key: string; color: ColorRole }[]
  /** The big number in the centre. */
  count: number
  /** Under the number, such as "need you". */
  caption: string
  /** What VoiceOver and TalkBack read for the whole ring: the count and what it means. */
  label: string
  /** Width and height, in points. */
  size?: number
}

/** The ring's thickness as a share of its size. */
export const RING_THICKNESS = 0.08

/**
 * A ring of coloured segments around a number. The web preview has no native drawing, so it shows
 * the number in a plain circle with the segments as a bar underneath; iOS draws the ring with
 * Swift Charts and Android with Compose.
 */
export function StatusRing({ segments, count, caption, size = 200 }: StatusRingProps) {
  const colors = useColors()
  return (
    <Column alignment="center" spacing={8}>
      <Column
        alignment="center"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: size * RING_THICKNESS,
          borderColor: colors[segments[0]?.color ?? 'separator'],
          ...({ justifyContent: 'center' } as UniversalStyle),
        }}
      >
        <Text textStyle={{ fontSize: 56, fontWeight: '700' }}>{String(count)}</Text>
        <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{caption}</Text>
      </Column>
      <Row spacing={2} style={{ width: size }}>
        {segments.map((s) => (
          <Row
            key={s.key}
            style={{
              ...({ flex: 1 } as UniversalStyle),
              height: 4,
              borderRadius: 2,
              backgroundColor: colors[s.color],
            }}
          />
        ))}
      </Row>
    </Column>
  )
}
