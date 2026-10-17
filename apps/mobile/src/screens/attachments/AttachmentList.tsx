import type {
  AttachmentItem,
  AttachmentsActions,
  AttachmentsState,
  AttachTarget,
  FileSource,
} from '@car/core'
import { Column, Row } from '@expo/ui'
import { Fragment } from 'react'
import { ActivityIndicator } from 'react-native'
import { useColors } from '../../theme'
import { ActionMenu, type MenuAction, type MenuGroup } from '../../ui/ActionMenu'
import { ErrorText, Note } from '../../ui/Note'
import { Card, FillColumn, FillRow, PillButton, Separator } from '../../ui/surfaces'
import { Symbol } from '../../ui/Symbol'
import { Text } from '../../ui/Text'

export type AttachmentsProps = AttachmentsState &
  Pick<AttachmentsActions, 'attach' | 'open' | 'askRemove' | 'cancelRemove' | 'remove'>

/** The three places a file can come from, as menu actions. */
export const sourceActions = (onPick: (source: FileSource) => void): MenuAction[] => [
  { label: 'Take Photo', symbol: 'camera', onPress: () => onPick('camera') },
  { label: 'Choose Photo', symbol: 'photo', onPress: () => onPick('photos') },
  { label: 'Choose File', symbol: 'folder', onPress: () => onPick('files') },
]

/** A menu that attaches a photo or file to `target`. */
export function AttachMenu({
  attach,
  target,
  label,
  variant,
}: Pick<AttachmentsProps, 'attach'> & {
  target: AttachTarget
  label: string
  variant: 'icon' | 'text'
}) {
  const groups: MenuGroup[] = [
    {
      title: label,
      symbol: 'paperclip',
      actions: sourceActions((source) => void attach(target, source)),
    },
  ]
  return <ActionMenu label={label} symbol="paperclip" variant={variant} groups={groups} />
}

/** Rows of attachments in a card; tapping one shows it full screen. */
export function AttachmentRows(props: AttachmentsProps & { items: AttachmentItem[] }) {
  return (
    <Card padding={0}>
      {props.items.map((item, i) => (
        <Fragment key={item.id}>
          {i > 0 ? <Separator inset={60} /> : null}
          <AttachmentRow {...props} item={item} />
        </Fragment>
      ))}
    </Card>
  )
}

function AttachmentRow(props: AttachmentsProps & { item: AttachmentItem }) {
  const { item, opening } = props
  const colors = useColors()
  if (props.confirmingRemove === item.id) {
    return (
      <Column spacing={8} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{`Delete ${item.title}?`}</Text>
        <Note>It is removed from this car on all your devices.</Note>
        <Row spacing={8}>
          <PillButton
            label="Delete"
            fill="danger"
            text="onAccent"
            onPress={() => void props.remove()}
          />
          <PillButton
            label="Cancel"
            fill="neutralSubtle"
            text="textPrimary"
            onPress={props.cancelRemove}
          />
        </Row>
      </Column>
    )
  }
  const thisOpening = opening?.id === item.id ? opening : undefined
  return (
    <Row alignment="center" spacing={12} style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
      <FillRow spacing={12} onPress={() => void props.open(item.id)}>
        <Column
          alignment="center"
          style={{
            width: 32,
            paddingVertical: 7,
            borderRadius: 9,
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Symbol name={item.pdf ? 'document' : 'photo'} size={17} color={colors.accent} />
        </Column>
        <FillColumn spacing={1}>
          <Text textStyle={{ fontSize: 16, fontWeight: '500' }}>{item.title}</Text>
          {thisOpening?.error ? (
            <Text textStyle={{ fontSize: 13, color: colors.danger }}>{thisOpening.error}</Text>
          ) : (
            <Text textStyle={{ fontSize: 13, color: colors.textSecondary }}>{item.detail}</Text>
          )}
        </FillColumn>
        {thisOpening && !thisOpening.error ? <ActivityIndicator /> : null}
      </FillRow>
      <ActionMenu
        label={`More for ${item.title}`}
        symbol="ellipsis"
        variant="icon"
        groups={[
          {
            title: item.title,
            symbol: 'ellipsis',
            actions: [
              {
                label: 'Delete',
                symbol: 'trash',
                destructive: true,
                onPress: () => props.askRemove(item.id),
              },
            ],
          },
        ]}
      />
    </Row>
  )
}

/** "Adding…" while a picked file saves, and why the last attach or delete failed. */
export function AttachStatus({ adding, error }: Pick<AttachmentsProps, 'adding' | 'error'>) {
  if (adding) return <Note>Adding…</Note>
  if (error) return <ErrorText>{error}</ErrorText>
  return null
}
