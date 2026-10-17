# 0008 Maintenance reminders are local notifications planned on the phone

Status: accepted, 2026-10-17

## Decision

The phone plans and schedules its own reminders as local notifications. No push server, push
token or Apple/Google push credentials are involved.

- `planNotifications` (core) turns each item's projected due date into a notification two weeks
  ahead (when it turns "due soon") and one on the day, at 9am local time. Items due the same day
  for the same car share one notification. Only dates after today are scheduled, so planning again
  never repeats a reminder; at most 60 are kept, under iOS's limit of 64 per app.
- `createReminderScheduler` (core) re-plans when the owner signs in or out, a car is added, a
  service is logged or the setting changes, and when the app returns to the foreground. It
  schedules or cancels only what changed, through the `Notifier` port. Signed out, switched off or
  without permission, it cancels everything. It acts only once the setting, the signed-in user and
  their cars have each loaded, so a cold start never cancels and re-adds every reminder, and it
  leaves a reminder due later today alone so opening the app at 8am does not cancel the 9am one.
- "Today" is the phone's local calendar date, not the UTC date, which is already tomorrow on a
  US evening.
- The on/off setting belongs to the device (`storedReminderSettings` over AsyncStorage) and is off
  until the owner turns it on, which is when the system permission prompt appears.
- The app adapter is `expo-notifications`; the web preview uses the in-memory notifier.

## Why

- The due dates already come from data on the phone (ADR 0004), so the phone can plan reminders
  offline and with no backend work, and they stay right after a service logged with no signal.
- Local notifications need no APNs key or Expo push account, so nothing waits on accounts.
- Asking for permission when the owner turns reminders on, rather than at launch, is what Apple
  recommends and gets more yeses.

## Known gaps

- The schedule and odometer have no live query, so a car's schedule arriving after the car itself
  is picked up on the next return to the foreground rather than at once.
- A reminder keeps the moment it was scheduled for, so after flying across time zones it arrives
  at 9am home time until something re-plans it with a different date.

## Revisit if

- A reminder must reach a phone whose app has not been opened for months (projections drift as
  the 60 scheduled reminders run out), or reminders must reach several devices or email: then add
  a server job that sends push through Expo with the same `planNotifications`.
- New recalls should alert the owner: that starts on the server (ADR 0006), so it needs push.
