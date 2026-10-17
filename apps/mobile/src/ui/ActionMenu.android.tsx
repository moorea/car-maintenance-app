import { Row, Text } from '@expo/ui'
import {
  DropdownMenu,
  DropdownMenuItem,
  HorizontalDivider,
  Text as ComposeText,
  TextButton,
} from '@expo/ui/jetpack-compose'
import { Fragment, useState } from 'react'
import { useColors } from '../theme'
import type { ActionMenuProps } from './ActionMenu'
import { GlassIconButton } from './surfaces'
import { Symbol } from './Symbol'

/**
 * A button that opens Material's dropdown menu. Groups are listed one after another with a divider
 * between them, as Material menus have no submenus.
 */
export function ActionMenu({ label, symbol, variant, groups }: ActionMenuProps) {
  const colors = useColors()
  // Purely visual: whether the menu is open (ADR 0003 allows it here).
  const [open, setOpen] = useState(false)
  const choose = (onPress: () => void) => () => {
    setOpen(false)
    onPress()
  }
  return (
    <DropdownMenu
      expanded={open}
      onDismissRequest={() => setOpen(false)}
      color={colors.surface}
      cornerRadius={16}
    >
      <DropdownMenu.Trigger>
        {variant === 'icon' ? (
          <GlassIconButton symbol={symbol} tint="accent" size={40} onPress={() => setOpen(true)} />
        ) : (
          <TextButton onClick={() => setOpen(true)}>
            <Row spacing={6} alignment="center">
              <Symbol name={symbol} size={18} color={colors.accent} />
              <Text textStyle={{ fontSize: 15, color: colors.accent }}>{label}</Text>
            </Row>
          </TextButton>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {groups.map((group, i) => (
          <Fragment key={group.title}>
            {i > 0 ? <HorizontalDivider color={colors.separator} /> : null}
            {group.actions.map((action) => {
              const tint = action.destructive ? colors.danger : colors.textPrimary
              return (
                <DropdownMenuItem
                  key={action.label}
                  onClick={choose(action.onPress)}
                  elementColors={{ textColor: tint, leadingIconColor: tint }}
                >
                  <DropdownMenuItem.LeadingIcon>
                    <Symbol name={action.symbol} size={20} color={tint} />
                  </DropdownMenuItem.LeadingIcon>
                  <DropdownMenuItem.Text>
                    <ComposeText color={tint}>{action.label}</ComposeText>
                  </DropdownMenuItem.Text>
                </DropdownMenuItem>
              )
            })}
          </Fragment>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  )
}
