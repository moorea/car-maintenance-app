import {
  bulletinBody,
  bulletinKindLabel,
  bulletinTitle,
  componentLabel,
  formatMonth,
  type Bulletin,
  type BulletinGroup,
  type SafetyActions,
  type SafetyState,
} from '@car/core'
import { Collapsible, Column, Row, Text } from '@expo/ui'
import { Fragment } from 'react'
import { useColors } from '../../theme'
import { Note } from '../../ui/Note'
import { Card, FillColumn, Separator } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { ComplaintsSection } from './SafetySections'

type Props = SafetyState & Pick<SafetyActions, 'toggle'>

const OVERLINE = { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 } as const

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

/**
 * The car's known issues: what owners reported around its mileage, warranty extensions, the
 * manufacturer's service bulletins, then every owner complaint by part of the car.
 */
export function KnownIssuesSection(props: Props) {
  if (props.status === 'unmatched') {
    return <Note>Known issues appear once your car has synced.</Note>
  }
  return (
    <Column spacing={14}>
      <NearbyCard {...props} />
      {props.extensions.map((b) => (
        <ExtensionCard key={b.id} bulletin={b} make={props.make} />
      ))}
      <Bulletins {...props} />
      <Heading>OWNER COMPLAINTS</Heading>
      <ComplaintsSection {...props} />
    </Column>
  )
}

function Heading({ children }: { children: string }) {
  const colors = useColors()
  return (
    <Text textStyle={{ ...OVERLINE, fontSize: 13, color: colors.textSecondary }}>{children}</Text>
  )
}

/** "Coming up for your car": the parts owners reported most around this car's mileage. */
function NearbyCard({ nearby, modelYear, complaintsChecked }: Props) {
  const colors = useColors()
  if (nearby.status === 'no-data') {
    return complaintsChecked ? (
      <Note>{`The mileages of ${modelYear} complaints aren't in yet. They arrive with NHTSA's next file.`}</Note>
    ) : null
  }
  if (nearby.status === 'no-odometer') {
    return <Note>Update the odometer to see what owners reported around your mileage.</Note>
  }
  return (
    <Card spacing={10}>
      <Row alignment="center" spacing={8}>
        <Symbol name="gauge" size={18} color={colors.accent} />
        <Text textStyle={{ ...OVERLINE, color: colors.accent }}>COMING UP AT YOUR MILEAGE</Text>
      </Row>
      <Text textStyle={{ fontSize: 17, fontWeight: '600' }}>
        {nearby.issues.length > 0
          ? `What ${modelYear} owners reported at ${nearby.window}`
          : `Owners reported few problems at ${nearby.window}`}
      </Text>
      {nearby.issues.map((issue, i) => (
        <Fragment key={issue.component}>
          {i > 0 ? <Separator /> : null}
          <Row alignment="center" spacing={12}>
            <FillColumn spacing={1}>
              <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>
                {componentLabel(issue.component)}
              </Text>
              {issue.covered ? (
                <Text textStyle={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                  A warranty extension may cover it
                </Text>
              ) : issue.bulletins > 0 ? (
                <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>
                  {`${plural(issue.bulletins, 'service bulletin')} about it`}
                </Text>
              ) : null}
            </FillColumn>
            <Text textStyle={{ fontSize: 15, color: colors.textSecondary }}>
              {plural(issue.complaints, 'complaint')}
            </Text>
          </Row>
        </Fragment>
      ))}
      <Note>
        Unverified reports to NHTSA from other owners of your model year, by the mileage they gave.
      </Note>
    </Card>
  )
}

/** A warranty extension or service campaign, which may make a repair free. */
function ExtensionCard({ bulletin, make }: { bulletin: Bulletin; make: string }) {
  const colors = useColors()
  const meta = [
    bulletinKindLabel(bulletin.kind).toUpperCase(),
    bulletin.documentId,
    bulletin.issuedOn ? formatMonth(bulletin.issuedOn) : undefined,
  ].filter(Boolean)
  return (
    <Card fill="accentSubtle" spacing={8}>
      <Row alignment="center" spacing={8}>
        <Symbol name="shield" size={18} color={colors.accent} />
        <Text textStyle={{ ...OVERLINE, color: colors.accent }}>{meta.join(' · ')}</Text>
      </Row>
      <Text textStyle={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
        {bulletinTitle(bulletin)}
      </Text>
      {bulletinBody(bulletin) ? (
        <Text textStyle={{ fontSize: 15, color: colors.textPrimary }}>
          {bulletinBody(bulletin)}
        </Text>
      ) : null}
      <Text textStyle={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
        {bulletin.kind === 'warranty'
          ? `If this part fails, the repair may be free. Ask a ${make} dealer, quoting ${bulletin.documentId ?? 'this extension'}.`
          : `${make} offers dealers this fix. Ask a dealer whether your car needs it, quoting ${bulletin.documentId ?? 'this campaign'}.`}
      </Text>
    </Card>
  )
}

/** The manufacturer's other bulletins, grouped by part of the car. */
function Bulletins(props: Props) {
  const { bulletinsChecked, bulletinGroups, extensions, make, modelYear } = props
  if (!bulletinsChecked) {
    return (
      <>
        <Heading>SERVICE BULLETINS</Heading>
        <Note>Checking NHTSA for the manufacturer's service bulletins…</Note>
      </>
    )
  }
  if (bulletinGroups.length === 0) {
    return (
      <>
        <Heading>SERVICE BULLETINS</Heading>
        <Note>
          {extensions.length > 0
            ? `${make} has filed no other service bulletins for the ${modelYear}.`
            : `${make} has filed no service bulletins for the ${modelYear} with NHTSA.`}
        </Note>
      </>
    )
  }
  return (
    <>
      <Heading>SERVICE BULLETINS</Heading>
      <Note>
        {`How ${make} told dealers to fix known problems. A bulletin isn't a recall: its repair is free only under warranty.`}
      </Note>
      <Card padding={0}>
        {bulletinGroups.map((group, i) => (
          <Fragment key={group.component}>
            {i > 0 ? <Separator /> : null}
            <Column style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <BulletinGroupItem
                group={group}
                open={props.expanded.includes(`bulletins-${group.component}`)}
                onToggle={() => props.toggle(`bulletins-${group.component}`)}
              />
            </Column>
          </Fragment>
        ))}
      </Card>
    </>
  )
}

function BulletinGroupItem(props: { group: BulletinGroup; open: boolean; onToggle: () => void }) {
  const colors = useColors()
  const { group } = props
  return (
    <Collapsible
      isOpen={props.open}
      onOpenChange={props.onToggle}
      label={`${componentLabel(group.component)} · ${plural(group.bulletins.length, 'bulletin')}`}
      labelStyle={{ fontSize: 16, fontWeight: '600' }}
    >
      <Column spacing={12}>
        {group.bulletins.map((b) => (
          <Column key={b.id} spacing={3}>
            <Text textStyle={{ ...OVERLINE, color: colors.textSecondary }}>
              {[
                bulletinKindLabel(b.kind).toUpperCase(),
                b.documentId,
                b.issuedOn ? formatMonth(b.issuedOn) : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text textStyle={{ fontSize: 15, fontWeight: '600' }}>{bulletinTitle(b)}</Text>
            {bulletinBody(b) ? <Text textStyle={{ fontSize: 15 }}>{bulletinBody(b)}</Text> : null}
          </Column>
        ))}
      </Column>
    </Collapsible>
  )
}
