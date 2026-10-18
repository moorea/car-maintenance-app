import type { OnboardingActions, OnboardingState } from '@car/core'
import { Column, Row, ScrollView, Spacer, type UniversalStyle } from '@expo/ui'
import { StyleSheet } from 'react-native'
import { useColors } from '../../theme'
import { Host } from '../../ui/Host'
import { PillButton } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { Text } from '../../ui/Text'
import { Button } from '../../ui/Button'

type Props = OnboardingState & Pick<OnboardingActions, 'next' | 'back' | 'skip'>

/** Pure rendering of the first-run introduction: one page at a time, with its place shown. */
export function OnboardingView(props: Props) {
  const colors = useColors()
  const { pages, page, isLast } = props
  const current = pages[page]
  if (!current) return null

  return (
    <Host style={styles.fill}>
      <Column style={{ ...({ flex: 1 } as UniversalStyle), padding: 24, paddingTop: 16 }}>
        <Row alignment="center" style={{ height: 44 }}>
          {page > 0 ? <Button variant="text" label="Back" onPress={props.back} /> : null}
          <Spacer flexible />
          {isLast ? null : <Button variant="text" label="Skip" onPress={props.skip} />}
        </Row>

        <ScrollView>
          <Column spacing={20} style={{ paddingTop: 72 }}>
            <Column
              alignment="center"
              style={{
                ...({ alignSelf: 'flex-start' } as UniversalStyle),
                padding: 22,
                borderRadius: 32,
                backgroundColor: colors.accentSubtle,
              }}
            >
              <Symbol name={current.symbol} size={48} color={colors.accent} />
            </Column>
            <Text textStyle={{ fontSize: 34, fontWeight: '700' }}>{current.title}</Text>
            <Text textStyle={{ fontSize: 19, lineHeight: 26, color: colors.textSecondary }}>
              {current.body}
            </Text>
          </Column>
        </ScrollView>

        <Spacer flexible />
        <Column spacing={24}>
          <Row
            spacing={8}
            alignment="center"
            style={{ justifyContent: 'center' } as UniversalStyle}
          >
            {pages.map((p, i) => (
              <Row
                key={p.title}
                style={{
                  width: i === page ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === page ? colors.accent : colors.textSecondary,
                  opacity: i === page ? 1 : 0.35,
                }}
              />
            ))}
          </Row>
          <Row>
            <PillButton
              label={isLast ? 'Get started' : 'Continue'}
              onPress={props.next}
              fill="accent"
              text="onAccent"
            />
          </Row>
        </Column>
      </Column>
    </Host>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
