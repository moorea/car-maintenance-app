# 0018 A big quote is weighed against what the owner says the car is worth

Status: accepted, 2026-10-18

## Context

Owners deciding whether to keep fixing an older car reach for rules of thumb: think about replacing
it when one repair costs more than 25 to 30% of its value, or when big repairs keep coming. The
quote checker (ADR 0011) already knows what a shop wants to charge, and the service log knows what
repairs have cost, but nothing knew what the car is worth. Pricing services that value used cars
need a licence, as fair repair prices do.

## Decision

- **The owner types the car's value**, with no pricing source. It is stored on `vehicles` as
  `value_cents` with `valued_on`, both or neither, and is editable like the severe-duty switch:
  owners may update only those two new columns alongside the ones they already could. It syncs,
  exports and imports with the car, and Ask is told it.
- **Only big quotes are weighed**: $1,000 or more, or a quarter of the car's value or more. Smaller
  quotes are not worth the question.
- **Facts, not a verdict.** The card says what share of the value the quote is, mentions the common
  quarter-of-the-value rule when it applies, adds up the repairs logged in the last 12 months
  (services with a cost and no schedule item) with the quote, and lists scheduled work due in the
  next 12 months that the quote does not already cover. It never tells the owner to replace the
  car: it cannot see the car's condition, and the owner may value it for other reasons.
- A value older than a year is flagged as probably out of date, since cars lose value every year.

## Revisit when

A used-car pricing source is licensed, so the value can be suggested from the VIN and mileage; or
fair price ranges arrive, so the next year's due work can carry a cost.
