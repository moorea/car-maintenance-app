# 0016 Registration, inspection and insurance dates are owner-typed and reminded on the phone

Status: accepted, 2026-10-18

## Decision

Owners keep the car's paperwork deadlines in `renewals`: what it is (registration, safety
inspection, emissions test, insurance, or their own named one), the date it expires or is due, how
often it repeats, and notes such as the plate or policy number.

- **Typed, not looked up.** Every state has its own registration cycle, inspection rules and fees,
  and no free API says when a given car's registration expires. The owner copies the date from the
  card or sticker once; the usual repeat (a year for registration, six months for insurance, two
  years for emissions) is only the form's starting choice.
- **Editable**, like warranties and fill-ups: PUT, PATCH and DELETE upload, and RLS lets owners
  write rows on their own cars only.
- **"Renewed" moves the date on** by one period from the old date, keeping its anniversary as
  registrations do, and steps past today if renewed late. One that doesn't repeat asks for the next
  date instead.
- **Reminders are the phone's own** (ADR 0008): a heads-up a month and a week ahead, and one on the
  day, at 9am. The id names the renewal and the lead, not the date, so renewing moves the
  notifications rather than adding more.
- **Paperwork is an attachment of the matching kind** (ADR 0012). `inspection` joins the car's
  document kinds for inspection and emissions reports; the renewals page lists and attaches each
  kind beside its date.
- A driver's license is left out: it belongs to the person, not the car, and every table here hangs
  off a car.

## Revisit when

State rules can fill the dates in (a DMV integration, or a table of inspection cycles by state), or
an owner with several drivers needs license reminders.
