// Tab labels stay a fixed size, as in a native tab bar: grown with Dynamic Type they would overflow
// the capsule and the space screens leave for it (TAB_BAR_CLEARANCE).
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Row, Text } from '@expo/ui'
import { StyleSheet, View } from 'react-native'
import { useColors } from '../theme'
import { Host } from './Host'
import { GlassBar, GlassIconButton, Segment } from './surfaces'
import { Symbol } from './Symbol'
import type { SymbolName } from './symbols'

export interface TabBarItem<K extends string> {
  key: K
  label: string
  symbol: SymbolName
}

interface Props<K extends string> {
  tabs: TabBarItem<K>[]
  selected: K
  onSelect: (key: K) => void
  /** A separate round button beside the bar, as iOS 26 places search or compose. */
  action?: { symbol: SymbolName; label: string; onPress: () => void; selected: boolean }
}

/**
 * The floating Liquid Glass tab bar from the mockups, drawn over the bottom of the screen. Content
 * underneath needs bottom padding of `TAB_BAR_CLEARANCE` so its last row can scroll clear of it.
 */
export function TabBar<K extends string>({ tabs, selected, onSelect, action }: Props<K>) {
  const colors = useColors()
  return (
    <View style={styles.dock} pointerEvents="box-none">
      {/* The bar floats over the bottom of the screen on iOS; its own layout ignores the home
          indicator's inset, which would push its content up inside it. */}
      <Host matchContents={{ vertical: true }} ignoreSafeArea="all" style={styles.host}>
        <Row alignment="center" spacing={10}>
          <GlassBar>
            {tabs.map((tab) => {
              const isSelected = tab.key === selected
              const tint = isSelected ? colors.accent : colors.textPrimary
              return (
                <Segment
                  key={tab.key}
                  label={tab.label}
                  selected={isSelected}
                  onPress={() => onSelect(tab.key)}
                >
                  <Symbol name={tab.symbol} size={24} color={tint} />
                  <Text
                    textStyle={{
                      fontSize: 10,
                      fontWeight: isSelected ? '600' : '500',
                      color: tint,
                    }}
                  >
                    {tab.label}
                  </Text>
                </Segment>
              )
            })}
          </GlassBar>
          {action ? (
            <GlassIconButton
              symbol={action.symbol}
              label={action.label}
              onPress={action.onPress}
              tint={action.selected ? 'accent' : 'textPrimary'}
              size={62}
            />
          ) : null}
        </Row>
      </Host>
    </View>
  )
}

/** Bottom padding for scrolling content so the last row clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 110

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 20, right: 20, bottom: 24 },
  host: { width: '100%' },
})
