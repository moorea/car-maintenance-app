# 0011 Shop quotes are checked on the phone; only reading a photo uses the server

Status: accepted, 2026-10-17

## Decision

The quote checker takes a shop's list of recommended work, as a photo or typed, and gives each
line a verdict against the car's own data: due, not due yet, done already (from the log), due only
on the severe schedule, not on the schedule at all, a repair or wear part to be shown, a recall
(free), no record, or unknown.

- **Checking is core code on the phone.** `identifyService` maps a line's words to a schedule
  `kind` (ADR 0010) or to a job no general schedule lists (fuel induction service, differential
  fluid, engine flush), and `checkQuote` projects that kind's item with the same `dueItemsFor` the
  reminders use, once for the car's own schedule and once for the severe one. Anything due within
  45 days or 1,000 miles counts as due now, since the shop is asking today. It works offline and
  costs nothing, and the verdicts can never disagree with the car page.
- **Matching by keywords, not by a model.** A fixed, tested table decides what a line is, so the
  same line always gets the same verdict and every verdict can be explained. A line the table does
  not know is "can't check", with Ask one tap away for it.
- **Reading a photo goes through the assistant function** at `/functions/v1/assistant/read-quote`
  (`createQuoteHandler`). It sends the image to Claude with a structured-output schema and returns
  `{ lines }`. It shares the function's key, its fallbacks and its daily limit (a read counts as
  one question), so it needs no new secret, deploy or table. The read lines go back into the text
  box so the owner can correct them before checking.
- **The photo is not stored.** It is sent once, read, and discarded on the phone and the server.
  Keeping documents is the attachments feature's job; a quote the owner wants to keep can become
  one of those later.
- **Behind ports.** `QuoteReader` (the server's Claude adapter and the phone's `remoteQuoteReader`
  implement the same port) and `PhotoPicker` (expo-image-picker on the phone, a sample photo in
  the web preview). The demo reads every photo as a sample dealer quote.

## Why

- The value is a verdict the owner can trust at the service counter, from their own car's data.
  Deterministic checks give that; a model judging each line would be slower, cost per check and
  could contradict the schedule shown elsewhere.
- Transcribing a messy printed estimate is what a vision model is good at and keyword code is not.

## What we give up

- The keyword table misses unusual wording; those lines read "can't check" rather than guessing.
- Against the general baseline schedule (ADR 0010) some verdicts are conservative, and the result
  says it was checked against a general schedule.
- No prices: whether $229 is fair for a job needs a pricing source (a business decision).

## Revisit if

A manufacturer schedule provider lands (verdicts sharpen with no code change), owners want quotes
kept (store them as attachments), or "can't check" lines are common enough to justify asking the
model to classify them into kinds.
