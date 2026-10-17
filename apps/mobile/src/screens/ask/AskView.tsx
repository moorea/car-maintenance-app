import { Column, Text } from '@expo/ui'
import { StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { Card } from '../../ui/surfaces'

/** Placeholder for the assistant, which needs its API key before it can be built. */
export function AskView({ carName }: { carName: string }) {
  const colors = useColors()
  return (
    <Host style={styles.fill}>
      <Column spacing={16} style={{ padding: 16, paddingTop: 68 }}>
        <Column spacing={2}>
          <Text textStyle={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
            {carName.toUpperCase()}
          </Text>
          <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>Ask</Text>
        </Column>
        <Card spacing={8}>
          <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>Coming soon</Text>
          <Text>
            Ask anything about your car, like which oil it takes or what a warning light means.
            Answers will come from its manual, schedule, recalls and your service history.
          </Text>
        </Card>
      </Column>
    </Host>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
