# 0017 The odometer can be read from a photo, and the owner confirms the miles

Status: accepted, 2026-10-18

## Decision

Typing the mileage is the chore that makes reminders late, so the car page's odometer editor can
fill in the miles from a photo of the dashboard, taken there or chosen from the library. It is the
first step towards an automatic odometer; connected-car readings can come later.

- **Read on the server, like a quote photo.** `/functions/v1/assistant/read-odometer`
  (`createOdometerHandler`) sends the image to Claude with a structured-output schema and returns
  `{ miles }`, null when no odometer could be read. It shares the function, its key, its fallbacks
  and its daily limit with Ask and quotes (ADR 0011), so it needs no new secret, deploy or table.
  The quote and odometer endpoints share `createPhotoHandler` and `readPhotoWithClaude`, and the
  phone's readers share `postPhoto`.
- **Odometer only.** The prompt tells Claude to ignore trip meters, range, speed, the clock and
  oil-life countdowns, to drop decimals, and to return null rather than guess. An odometer that
  reads kilometres is converted to miles on the server.
- **The owner confirms.** The miles go into the field with "check it matches the dashboard" and
  nothing is saved until the owner taps Save. A read below the last reading, or impossibly far
  past it, shows the same reason a typo would. The reading is dated today, as a typed one is.
- **Asked first.** `OdometerReader` sits behind `guardAiSharing` with the other readers. The car
  page asks inline before the first photo (App Store guideline 5.1.2(i)), saying what is sent and
  that allowing it is the same choice Ask and the quote checker use.
- **The photo is not stored** on the phone or the server.

## What we give up

- A photo costs a use of the daily assistant limit, like a question.
- Reading needs a connection; offline, the owner types the miles.

## Revisit if

A connected-car aggregator lands (readings would come from a third source, see ADR 0014), or
reading on the phone (on-device text recognition) becomes good enough to drop the server round
trip.
