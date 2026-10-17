import { Row, Text, type UniversalStyle } from '@expo/ui'
import { useEffect, useRef, useState } from 'react'
import { useColors } from '../theme'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'

export interface MenuAction {
  label: string
  symbol: SymbolName
  onPress: () => void
  destructive?: boolean
}

/** Actions under one heading. With several groups, each becomes a submenu on iOS. */
export interface MenuGroup {
  title: string
  symbol: SymbolName
  actions: MenuAction[]
}

export interface ActionMenuProps {
  /** What the button says, or its accessibility label when it shows only `symbol`. */
  label: string
  symbol: SymbolName
  /** `icon` is a round glass button showing only the symbol; `text` shows the label too. */
  variant: 'icon' | 'text'
  groups: MenuGroup[]
}

const ITEM = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 14px',
  cursor: 'pointer',
}

/**
 * A button that opens a menu of actions. The web preview draws the menu as a card under the
 * button in a modal <dialog>, so it floats above everything, sheets included; iOS uses the native
 * menu.
 */
export function ActionMenu({ label, symbol, variant, groups }: ActionMenuProps) {
  const colors = useColors()
  const anchor = useRef<HTMLSpanElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  // Purely visual: where the open menu sits, or undefined when closed (ADR 0003 allows it here).
  const [at, setAt] = useState<{ top: number; right: number } | undefined>()
  useEffect(() => {
    if (at && !dialog.current?.open) dialog.current?.showModal()
    if (!at && dialog.current?.open) dialog.current.close()
  }, [at])
  const show = () => {
    const box = anchor.current?.getBoundingClientRect()
    if (box) setAt({ top: box.bottom + 6, right: Math.max(8, window.innerWidth - box.right) })
  }
  const choose = (action: MenuAction) => {
    setAt(undefined)
    action.onPress()
  }
  return (
    <span ref={anchor} aria-label={label} role="button" style={{ display: 'inline-flex' }}>
      <Row
        alignment="center"
        spacing={6}
        onPress={show}
        style={{
          ...({ cursor: 'pointer' } as UniversalStyle),
          ...(variant === 'icon'
            ? { width: 36, height: 36, borderRadius: 18, justifyContent: 'center' }
            : { paddingVertical: 6 }),
          backgroundColor: variant === 'icon' ? colors.neutralSubtle : colors.clear,
        }}
      >
        <Symbol name={symbol} size={18} color={colors.accent} />
        {variant === 'text' ? (
          <Text textStyle={{ fontSize: 16, fontWeight: '500', color: colors.accent }}>{label}</Text>
        ) : null}
      </Row>
      <dialog
        ref={dialog}
        onClose={() => setAt(undefined)}
        // A click outside the card lands on the dialog itself and closes it.
        onClick={(e) => e.target === dialog.current && setAt(undefined)}
        style={{
          position: 'fixed',
          inset: 'auto',
          top: at?.top ?? 0,
          right: at?.right ?? 0,
          margin: 0,
          border: 'none',
          minWidth: 220,
          padding: '6px 0',
          borderRadius: 14,
          background: colors.surface,
          boxShadow: `0 8px 28px ${colors.glassShadow}`,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {groups.map((g) => (
          <div key={g.title}>
            {groups.length > 1 ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.textSecondary,
                  padding: '6px 14px 0',
                }}
              >
                {g.title.toUpperCase()}
              </div>
            ) : null}
            {g.actions.map((a) => (
              <div
                key={a.label}
                role="menuitem"
                onClick={() => choose(a)}
                style={{ ...ITEM, color: a.destructive ? colors.danger : colors.textPrimary }}
              >
                <Symbol
                  name={a.symbol}
                  size={17}
                  color={a.destructive ? colors.danger : colors.textPrimary}
                />
                <span style={{ fontSize: 16 }}>{a.label}</span>
              </div>
            ))}
          </div>
        ))}
      </dialog>
    </span>
  )
}
