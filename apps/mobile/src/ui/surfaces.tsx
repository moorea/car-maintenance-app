import { Button, Column, Row, Text, type UniversalStyle } from '@expo/ui'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { useColors, type ColorRole } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'

// The web preview has no native Liquid Glass, so glass is a blurred translucent fill. These CSS
// properties are not in the universal style type but react-native-web passes them through.
const webGlass = (shadow: string) =>
  ({
    backdropFilter: 'blur(14px) saturate(190%)',
    boxShadow: `0 8px 28px ${shadow}`,
  }) as UniversalStyle

interface CardProps {
  children: ReactNode
  /** The card's fill. Defaults to `surface`. */
  fill?: ColorRole
  padding?: number
  spacing?: number
  onPress?: () => void
}

/** A rounded card that fills the width of its column. */
export function Card({ children, fill = 'surface', padding = 16, spacing, onPress }: CardProps) {
  const colors = useColors()
  return (
    <Column
      spacing={spacing ?? 0}
      {...(onPress ? { onPress } : {})}
      style={{ backgroundColor: colors[fill], borderRadius: 24, padding }}
    >
      {children}
    </Column>
  )
}

/** A floating capsule of Liquid Glass holding a row of controls, such as the tab bar. */
export function GlassBar({ children }: { children: ReactNode }) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      style={{
        ...({ flex: 1 } as UniversalStyle),
        padding: 4,
        borderRadius: 31,
        backgroundColor: colors.glass,
        borderWidth: 0.5,
        borderColor: colors.glassEdge,
        ...webGlass(colors.glassShadow),
      }}
    >
      {children}
    </Row>
  )
}

interface GlassButtonProps {
  symbol: SymbolName
  onPress: () => void
  /** Icon colour. Defaults to `textPrimary`. */
  tint?: ColorRole
  size?: number
}

/** A round Liquid Glass button showing one icon, for toolbars over content. */
export function GlassIconButton({
  symbol,
  onPress,
  tint = 'textPrimary',
  size = 44,
}: GlassButtonProps) {
  const colors = useColors()
  return (
    <Button
      variant="text"
      onPress={onPress}
      style={{
        width: size,
        height: size,
        padding: 0,
        borderRadius: size / 2,
        backgroundColor: colors.glass,
        borderWidth: 0.5,
        borderColor: colors.glassEdge,
        ...webGlass(colors.glassShadow),
      }}
    >
      <Symbol name={symbol} size={size * 0.46} color={colors[tint]} />
    </Button>
  )
}

/**
 * A thin bar showing how far along something is, from 0 to 1. Android is not built yet: Compose
 * cannot take a percentage width, so it draws nothing there for now.
 */
export function ProgressBar({
  value,
  fill,
  track,
}: {
  value: number
  fill: ColorRole
  track: ColorRole
}) {
  const colors = useColors()
  const clamped = Math.min(1, Math.max(0, value))
  if (Platform.OS === 'android') return null
  return (
    <Row style={{ height: 6, borderRadius: 3, backgroundColor: colors[track] }}>
      <Row
        style={{
          height: 6,
          borderRadius: 3,
          width: `${clamped * 100}%` as UniversalStyle['width'],
          backgroundColor: colors[fill],
        }}
      />
    </Row>
  )
}

interface SegmentProps {
  children: ReactNode
  selected: boolean
  onPress: () => void
}

/** One of several equal-width choices in a row, such as a tab. The selected one is filled. */
export function Segment({ children, selected, onPress }: SegmentProps) {
  const colors = useColors()
  return (
    <Column
      alignment="center"
      spacing={1}
      onPress={onPress}
      style={{
        ...({ flex: 1, cursor: 'pointer' } as UniversalStyle),
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderRadius: 999,
        ...(selected ? { backgroundColor: colors.selectedFill } : {}),
      }}
    >
      {children}
    </Column>
  )
}

interface PillButtonProps {
  label: string
  onPress: () => void
  fill: ColorRole
  text: ColorRole
}

/** A capsule button that shares its row's width equally with its siblings. */
export function PillButton({ label, onPress, fill, text }: PillButtonProps) {
  const colors = useColors()
  return (
    <Row
      alignment="center"
      onPress={onPress}
      style={{
        ...({ flex: 1, justifyContent: 'center', cursor: 'pointer' } as UniversalStyle),
        height: 44,
        borderRadius: 22,
        backgroundColor: colors[fill],
      }}
    >
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors[text] }}>{label}</Text>
    </Row>
  )
}

/** A hairline between rows in a card, inset from the leading edge. */
export function Separator({ inset = 16 }: { inset?: number }) {
  const colors = useColors()
  return (
    <Row style={{ paddingLeft: inset }}>
      <Row
        style={{
          ...({ flex: 1 } as UniversalStyle),
          height: 0.5,
          backgroundColor: colors.separator,
        }}
      />
    </Row>
  )
}

/** A column that takes the row's leftover width, so long text wraps instead of overflowing. */
export function FillColumn({ children, spacing }: { children: ReactNode; spacing?: number }) {
  return (
    <Column spacing={spacing ?? 0} style={{ flex: 1, minWidth: 0 } as UniversalStyle}>
      {children}
    </Column>
  )
}

interface FillRowProps {
  children: ReactNode
  spacing?: number
  onPress?: () => void
}

/** A row that takes its parent row's leftover width, tappable across all of it. */
export function FillRow({ children, spacing, onPress }: FillRowProps) {
  return (
    <Row
      alignment="center"
      spacing={spacing ?? 0}
      {...(onPress ? { onPress } : {})}
      style={{ flex: 1, minWidth: 0, ...(onPress ? { cursor: 'pointer' } : {}) } as UniversalStyle}
    >
      {children}
    </Row>
  )
}

/** A small filled circle, such as a status dot beside a row. */
export function Dot({ color, size = 10 }: { color: ColorRole; size?: number }) {
  const colors = useColors()
  return (
    <Row
      style={{
        ...({ alignSelf: 'center', flexShrink: 0 } as UniversalStyle),
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[color],
      }}
    />
  )
}

/** A chat bubble that hugs its text. Place it in a row with a spacer to push it to one side. */
export function Bubble({ children, fill }: { children: ReactNode; fill: ColorRole }) {
  const colors = useColors()
  return (
    <Column
      spacing={10}
      alignment="start"
      style={{
        ...({ maxWidth: '86%' } as UniversalStyle),
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: colors[fill],
      }}
    >
      {children}
    </Column>
  )
}

/** A small label in a capsule, such as a source an answer cites. */
export function Chip({ label, symbol }: { label: string; symbol: SymbolName }) {
  const colors = useColors()
  return (
    <Row
      spacing={4}
      alignment="center"
      style={{
        ...({ flexShrink: 0 } as UniversalStyle),
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: colors.neutralSubtle,
      }}
    >
      <Symbol name={symbol} size={12} color={colors.textSecondary} />
      <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
    </Row>
  )
}

/** A Liquid Glass capsule button with a short label, such as a suggested question. */
export function GlassPill({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors()
  return (
    <Button
      variant="text"
      onPress={onPress}
      style={{
        ...({ flexShrink: 0 } as UniversalStyle),
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: colors.glass,
        borderWidth: 0.5,
        borderColor: colors.glassEdge,
        ...webGlass(colors.glassShadow),
      }}
    >
      <Text textStyle={{ fontSize: 14, color: colors.textPrimary }}>{label}</Text>
    </Button>
  )
}

interface FilledIconButtonProps {
  symbol: SymbolName
  onPress: () => void
  disabled?: boolean
  size?: number
}

/** A round button filled with the accent, for the one main action, such as sending. */
export function FilledIconButton({ symbol, onPress, disabled, size = 44 }: FilledIconButtonProps) {
  const colors = useColors()
  return (
    <Button
      variant="text"
      onPress={onPress}
      disabled={disabled ?? false}
      style={{
        ...({ flexShrink: 0 } as UniversalStyle),
        width: size,
        height: size,
        padding: 0,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Symbol name={symbol} size={size * 0.42} color={colors.onAccent} />
    </Button>
  )
}

/** A padded row inside a card that responds to a tap across its whole width. */
export function TappableRow({
  children,
  onPress,
  spacing,
}: {
  children: ReactNode
  onPress: () => void
  spacing?: number
}) {
  return (
    <Column
      spacing={spacing ?? 0}
      onPress={onPress}
      style={{
        ...({ cursor: 'pointer' } as UniversalStyle),
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      {children}
    </Column>
  )
}
