import { Row } from '@expo/ui'
import {
  DropdownMenu,
  DropdownMenuItem,
  Text as ComposeText,
  TextButton,
} from '@expo/ui/jetpack-compose'
import { useState } from 'react'
import { useColors } from '../theme'
import type { ActionMenuProps, MenuAction, MenuGroup } from './ActionMenu'
import { GlassIconButton } from './surfaces'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'
import { Text } from './Text'

/**
 * A button that opens Material's dropdown menu. With several groups the menu first lists the
 * groups, and choosing one shows its actions in the same menu, as iOS opens a submenu.
 */
export function ActionMenu({ label, symbol, variant, groups }: ActionMenuProps) {
  const colors = useColors()
  // Purely visual: whether the menu is open and which group it shows (ADR 0003 allows it here).
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<MenuGroup | undefined>()
  const close = () => {
    setOpen(false)
    setGroup(undefined)
  }
  const shown = group ?? (groups.length === 1 ? groups[0] : undefined)
  const item = (key: string, text: string, icon: SymbolName, onClick: () => void, tint: string) => (
    <DropdownMenuItem
      key={key}
      onClick={onClick}
      elementColors={{ textColor: tint, leadingIconColor: tint, trailingIconColor: tint }}
    >
      <DropdownMenuItem.LeadingIcon>
        <Symbol name={icon} size={20} color={tint} />
      </DropdownMenuItem.LeadingIcon>
      <DropdownMenuItem.Text>
        <ComposeText color={tint}>{text}</ComposeText>
      </DropdownMenuItem.Text>
      {shown ? null : (
        <DropdownMenuItem.TrailingIcon>
          <Symbol name="chevron" size={20} color={colors.textSecondary} />
        </DropdownMenuItem.TrailingIcon>
      )}
    </DropdownMenuItem>
  )
  const action = (a: MenuAction) =>
    item(
      a.label,
      a.label,
      a.symbol,
      () => {
        close()
        a.onPress()
      },
      a.destructive ? colors.danger : colors.textPrimary,
    )
  return (
    <DropdownMenu expanded={open} onDismissRequest={close} color={colors.surface} cornerRadius={16}>
      <DropdownMenu.Trigger>
        {variant === 'icon' ? (
          <GlassIconButton
            symbol={symbol}
            label={label}
            tint="accent"
            size={40}
            onPress={() => setOpen(true)}
          />
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
        {shown
          ? shown.actions.map(action)
          : groups.map((g) =>
              item(g.title, g.title, g.symbol, () => setGroup(g), colors.textPrimary),
            )}
      </DropdownMenu.Items>
    </DropdownMenu>
  )
}
