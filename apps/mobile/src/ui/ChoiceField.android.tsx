import { Row, Spacer } from '@expo/ui'
import { DropdownMenu, DropdownMenuItem, Text as ComposeText } from '@expo/ui/jetpack-compose'
import {
  background,
  clickable,
  clip,
  fillMaxWidth,
  padding,
  Shapes,
} from '@expo/ui/jetpack-compose/modifiers'
import { useState } from 'react'
import { useColors } from '../theme'
import type { ChoiceFieldProps } from './ChoiceField'
import { Symbol } from './Symbol'
import { Text } from './Text'

/**
 * A field that picks one of a few options, drawn like the app's text fields with Material's
 * dropdown menu, since Material's own exposed dropdown takes none of the app's colours or width.
 */
export function ChoiceField({ value, options, onChange }: ChoiceFieldProps) {
  const colors = useColors()
  // Purely visual: whether the menu is open (ADR 0003 allows it here).
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)?.label ?? ''
  return (
    <DropdownMenu
      expanded={open}
      onDismissRequest={() => setOpen(false)}
      color={colors.surface}
      cornerRadius={16}
      modifiers={[fillMaxWidth()]}
    >
      <DropdownMenu.Trigger>
        <Row
          alignment="center"
          modifiers={[
            fillMaxWidth(),
            clip(Shapes.RoundedCorner(12)),
            background(colors.neutralSubtle),
            clickable(() => setOpen(true)),
            padding(14, 11, 10, 11),
          ]}
        >
          <Text textStyle={{ fontSize: 16, color: colors.textPrimary }}>{selected}</Text>
          <Spacer flexible />
          <Symbol name="dropdown" size={24} color={colors.textSecondary} />
        </Row>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => {
              setOpen(false)
              onChange(o.value)
            }}
            elementColors={{ textColor: colors.textPrimary }}
          >
            <DropdownMenuItem.Text>
              <ComposeText color={colors.textPrimary}>{o.label}</ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  )
}
