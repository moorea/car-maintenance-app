import type { ReminderOfferActions, ReminderOfferState } from '@car/core'
import { Button, Column, Row, ScrollView, Spacer, type UniversalStyle } from '@expo/ui'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { PillButton } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { Text } from '../../ui/Text'

type Props = ReminderOfferState &
  Pick<ReminderOfferActions, 'accept' | 'decline'> & {
    /** The car just added, as the owner named it. */
    carName: string
  }

/** Pure rendering of the offer to turn reminders on, shown once a car has been added. */
export function ReminderOfferView(props: Props) {
  const colors = useColors()
  if (props.status === 'loading' || props.status === 'done')
    return <ActivityIndicator style={styles.fill} />
  const saving = props.status === 'saving'

  return (
    <Host style={styles.fill}>
      <Column style={{ ...({ flex: 1 } as UniversalStyle), padding: 24, paddingTop: 16 }}>
        <ScrollView>
          <Column spacing={20} style={{ paddingTop: 116 }}>
            <Column
              alignment="center"
              style={{
                ...({ alignSelf: 'flex-start' } as UniversalStyle),
                padding: 22,
                borderRadius: 32,
                backgroundColor: colors.accentSubtle,
              }}
            >
              <Symbol name="bell" size={48} color={colors.accent} />
            </Column>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>
              {`${props.carName} is in your garage`}
            </Text>
            <Text textStyle={{ fontSize: 19, lineHeight: 26, color: colors.textSecondary }}>
              Want a heads-up before its next service, and before registration or insurance renewals
              come due? Reminders follow your mileage and are planned on this phone, so they work
              offline.
            </Text>
          </Column>
        </ScrollView>

        <Spacer flexible />
        <Column spacing={8}>
          <Row>
            <PillButton
              label={saving ? 'Turning on…' : 'Turn on reminders'}
              onPress={() => void props.accept()}
              fill="accent"
              text="onAccent"
            />
          </Row>
          <Row style={{ justifyContent: 'center' } as UniversalStyle}>
            <Button variant="text" label="Not now" disabled={saving} onPress={props.decline} />
          </Row>
        </Column>
      </Column>
    </Host>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
