import { Button, Column, Row, Text } from '@expo/ui'
import { Divider, ProgressView } from '@expo/ui/swift-ui'
import {
  background,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  frame,
  glassEffect,
  onTapGesture,
  padding as paddingModifier,
  shapes,
  tint as tintModifier,
} from '@expo/ui/swift-ui/modifiers'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { useColors, type ColorRole } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'

// Liquid Glass arrived in iOS 26. Before that, glass modifiers do nothing, so fall back to the
// system material and a bordered button.
const hasGlass = Number.parseInt(String(Platform.Version), 10) >= 26

// Universal `onPress` adds its tap gesture inside the custom modifiers, so only the bare content
// would respond. Appending it after the fill makes the whole padded shape tappable.
const tappable = (onPress: (() => void) | undefined) =>
  onPress ? [contentShape(shapes.rectangle()), onTapGesture(onPress)] : []

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
      // The frame stretches the card before the fill is painted, so the fill spans the width.
      modifiers={[
        paddingModifier({ all: padding }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        background(colors[fill], shapes.roundedRectangle({ cornerRadius: 24 })),
        ...tappable(onPress),
      ]}
    >
      {children}
    </Column>
  )
}

/** A floating capsule of native Liquid Glass holding a row of controls, such as the tab bar. */
export function GlassBar({ children }: { children: ReactNode }) {
  return (
    <Row
      alignment="center"
      modifiers={[
        paddingModifier({ all: 4 }),
        hasGlass
          ? glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' })
          : background({ type: 'material', material: 'regular' }, shapes.capsule()),
      ]}
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
      onPress={onPress}
      modifiers={[buttonStyle(hasGlass ? 'glass' : 'bordered'), buttonBorderShape('circle')]}
    >
      {/* The label sets the button's size; the glass style adds its own margin around it. */}
      <Column alignment="center" modifiers={[frame({ width: size - 16, height: size - 16 })]}>
        <Symbol name={symbol} size={size * 0.46} color={colors[tint]} />
      </Column>
    </Button>
  )
}

/** A thin bar showing how far along something is, from 0 to 1. */
export function ProgressBar({ value, fill }: { value: number; fill: ColorRole; track: ColorRole }) {
  const colors = useColors()
  return (
    <ProgressView
      value={Math.min(1, Math.max(0, value))}
      modifiers={[tintModifier(colors[fill])]}
    />
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
      modifiers={[
        paddingModifier({ vertical: 6, horizontal: 4 }),
        frame({ maxWidth: Infinity }),
        ...(selected ? [background(colors.selectedFill, shapes.capsule())] : []),
        ...tappable(onPress),
      ]}
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
      modifiers={[
        frame({ height: 44 }),
        frame({ maxWidth: Infinity }),
        background(colors[fill], shapes.capsule()),
        ...tappable(onPress),
      ]}
    >
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors[text] }}>{label}</Text>
    </Row>
  )
}

/** A hairline between rows in a card, inset from the leading edge. */
export function Separator({ inset = 16 }: { inset?: number }) {
  return <Divider modifiers={[paddingModifier({ leading: inset })]} />
}

/** A column that takes the row's leftover width, so long text wraps instead of overflowing. */
export function FillColumn({ children, spacing }: { children: ReactNode; spacing?: number }) {
  return (
    <Column
      spacing={spacing ?? 0}
      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
    >
      {children}
    </Column>
  )
}

/** A small filled circle, such as a status dot beside a row. */
export function Dot({ color, size = 10 }: { color: ColorRole; size?: number }) {
  const colors = useColors()
  return (
    <Row
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[color] }}
    />
  )
}
