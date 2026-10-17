import { Button, Menu } from '@expo/ui/swift-ui'
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers'
import { Column } from '@expo/ui'
import { Platform } from 'react-native'
import { useColors } from '../theme'
import type { ActionMenuProps, MenuAction } from './ActionMenu'
import { Symbol } from './Symbol'
import { SYMBOLS } from './symbols'

const hasGlass = Number.parseInt(String(Platform.Version), 10) >= 26

function Action({ action }: { action: MenuAction }) {
  return (
    <Button
      label={action.label}
      systemImage={SYMBOLS[action.symbol].ios}
      onPress={action.onPress}
      {...(action.destructive ? { role: 'destructive' as const } : {})}
    />
  )
}

/** The native iOS menu. Several groups become submenus, one group a flat list. */
export function ActionMenu({ label, symbol, variant, groups }: ActionMenuProps) {
  const colors = useColors()
  const items =
    groups.length === 1
      ? groups[0]?.actions.map((a) => <Action key={a.label} action={a} />)
      : groups.map((g) => (
          <Menu key={g.title} label={g.title} systemImage={SYMBOLS[g.symbol].ios}>
            {g.actions.map((a) => (
              <Action key={a.label} action={a} />
            ))}
          </Menu>
        ))
  if (variant === 'text') {
    return (
      <Menu label={label} systemImage={SYMBOLS[symbol].ios}>
        {items}
      </Menu>
    )
  }
  return (
    <Menu
      label={
        <Column alignment="center" modifiers={[frame({ width: 20, height: 20 })]}>
          <Symbol name={symbol} size={17} color={colors.accent} />
        </Column>
      }
      modifiers={[
        buttonStyle(hasGlass ? 'glass' : 'bordered'),
        buttonBorderShape('circle'),
        accessibilityLabel(label),
      ]}
    >
      {items}
    </Menu>
  )
}
