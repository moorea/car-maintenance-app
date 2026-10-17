import { Button, Host, Row } from '@expo/ui'
import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

interface Tab {
  label: string
  render: () => ReactNode
}

/** A row of buttons that switches between views. Which tab is open is purely visual state. */
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [selected, setSelected] = useState(0)
  const tab = tabs[selected] ?? tabs[0]
  return (
    <View style={styles.fill}>
      <Host matchContents={{ vertical: true }}>
        <Row spacing={8} style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {tabs.map((t, i) => (
            <Button
              key={t.label}
              label={t.label}
              variant={i === selected ? 'filled' : 'outlined'}
              onPress={() => setSelected(i)}
            />
          ))}
        </Row>
      </Host>
      <View style={styles.fill}>{tab?.render()}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
