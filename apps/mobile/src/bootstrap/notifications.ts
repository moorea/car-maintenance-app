import type { LocalNotification, NotificationPermission, Notifier } from '@car/core'
import * as Notifications from 'expo-notifications'
import { Linking, Platform } from 'react-native'

/** Every reminder id starts with this, so the app never touches notifications it did not plan. */
const PREFIX = 'reminder:'
const ANDROID_CHANNEL = 'reminders'

const toPermission = (s: Notifications.NotificationPermissionsStatus): NotificationPermission => {
  const ios = s.ios?.status
  // `status`, not `granted`: on Android 13 `granted` stays true when the owner has switched this
  // app's notifications off in Settings.
  if (
    s.status === 'granted' ||
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  )
    return 'granted'
  // Android 13 can ask again after a first refusal; only a final "no" needs the Settings app.
  return s.canAskAgain ? 'undetermined' : 'denied'
}

const fromRequest = (r: Notifications.NotificationRequest): LocalNotification[] => {
  const data = r.content.data as Partial<Record<'vehicleId' | 'date' | 'hour', unknown>> | null
  if (!r.identifier.startsWith(PREFIX) || !data) return []
  const { vehicleId, date, hour } = data
  if (typeof vehicleId !== 'string' || typeof date !== 'string' || typeof hour !== 'number')
    return []
  return [
    {
      id: r.identifier,
      date,
      hour,
      title: r.content.title ?? '',
      body: r.content.body ?? '',
      vehicleId,
    },
  ]
}

/** Local notifications through expo-notifications: scheduled on the phone, no push server. */
export const expoNotifier = (): Notifier => {
  // Shown as a banner even while the app is open, since the reminder may be about another car.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
  let channel: Promise<unknown> | undefined
  const ensureChannel = () =>
    Platform.OS === 'android'
      ? (channel ??= Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
          name: 'Service reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        }))
      : Promise.resolve()

  return {
    permission: async () => toPermission(await Notifications.getPermissionsAsync()),
    requestPermission: async () => {
      await ensureChannel()
      return toPermission(await Notifications.requestPermissionsAsync())
    },
    scheduled: async () =>
      (await Notifications.getAllScheduledNotificationsAsync()).flatMap(fromRequest),
    schedule: async (n) => {
      await ensureChannel()
      const [year = 0, month = 1, day = 1] = n.date.split('-').map(Number)
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: {
          title: n.title,
          body: n.body,
          data: { vehicleId: n.vehicleId, date: n.date, hour: n.hour },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          // The owner's local day and hour, wherever the phone is.
          date: new Date(year, month - 1, day, n.hour),
          channelId: ANDROID_CHANNEL,
        },
      })
    },
    cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
    openSettings: () => Linking.openSettings(),
    watchOpened: (onOpen) => {
      const open = (response: Notifications.NotificationResponse | null) => {
        // Cleared once used, so a screen started later does not reopen that car.
        if (response) Notifications.clearLastNotificationResponse()
        if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return
        const [reminder] = fromRequest(response.notification.request)
        if (reminder) onOpen(reminder.vehicleId)
      }
      // The tap that launched the app arrived before anyone was listening.
      open(Notifications.getLastNotificationResponse())
      const sub = Notifications.addNotificationResponseReceivedListener(open)
      return () => sub.remove()
    },
  }
}
