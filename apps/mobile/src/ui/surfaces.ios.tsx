import { Button, Column, Row, Text } from '@expo/ui'
import { Divider, ProgressView } from '@expo/ui/swift-ui'
import {
  background,
  buttonBorderShape,
  buttonStyle,
  frame,
  glassEffect,
  padding as paddingModifier,
  shapes,
  tint as tintModifier,
} from '@expo/ui/swift-ui/modifiers'
import type { ReactNode } from 'react'
import { useColors, type ColorRole } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'

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
      // The frame stretches the card before the fill is painted, so the fill spans the width.
      modifiers={[
        paddingModifier({ all: padding }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
        background(colors[fill], shapes.roundedRectangle({ cornerRadius: 24 })),
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
        glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
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
    <Button onPress={onPress} modifiers={[buttonStyle('glass'), buttonBorderShape('circle')]}>
      <Symbol name={symbol} size={size * 0.46} color={colors[tint]} />
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
      onPress={onPress}
      modifiers={[
        paddingModifier({ vertical: 6, horizontal: 4 }),
        frame({ maxWidth: Infinity }),
        ...(selected ? [background(colors.selectedFill, shapes.capsule())] : []),
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
      onPress={onPress}
      modifiers={[
        frame({ height: 44 }),
        frame({ maxWidth: Infinity }),
        background(colors[fill], shapes.capsule()),
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
