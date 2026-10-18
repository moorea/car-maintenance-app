# 0020 Fair prices are AI estimates from labor times, parts and local rates

Status: accepted, 2026-10-18

## Decision

The quote checker says whether each line is needed (ADR 0011); owners also want to know whether
the price is fair. A checked quote can now show each line's usual cost near the owner, estimated
by Claude, beside the shop's price. We chose this over licensing a labor-guide or repair-cost
database, which would add a vendor and a contract before launch.

- **Claude estimates the inputs; the phone does the arithmetic.** `/functions/v1/assistant/estimate-prices`
  (`createPriceHandler`) sends the car (year, make, model, trim, engine), the ZIP code and the
  lines' text to Claude with a structured-output schema. It asks for each line's labor-guide
  hours and parts cost as low–high ranges (aftermarket to dealer parts) and for the local hourly
  labor rate (independent shops to dealers). Core's `comparePrices` turns those into each job's
  range (fewest hours at the lowest rate plus the cheapest parts, up to the most at the highest),
  rounded out to $5, and compares the shop's price: below, within, a little above, or well above
  (more than 25% over the top).
- **The shop's prices are never sent**, so they cannot anchor the estimate. Recall lines are not
  priced, since their fix is free.
- **Labeled as an estimate wherever it shows.** The card is titled "Fair prices" with an "AI
  estimate" tag, every line's breakdown starts "AI estimate:", and the note says it is not a
  quote and only a shop that has seen the car can say for sure. Lines Claude cannot identify, or
  whose cost depends on a diagnosis, are left without a range rather than guessed.
- **Checked twice.** The server drops a line with implausible hours or parts (`MAX_LABOR_HOURS`,
  `MAX_PARTS_CENTS`) and refuses an implausible labor rate; the phone parses the answer with the
  same schema.
- **Same function, key, fallbacks, consent and daily limit** as Ask and the photo readers
  (ADR 0009, 0011, 0017). `PriceEstimator` sits behind `guardAiSharing`. The photo endpoints'
  handler is generalised into `createJsonHandler` so all three share auth, validation, the limit
  and error mapping.
- **The ZIP code stays on the phone** in device preferences, offered next time. It is declared as
  coarse location in the privacy labels and policy, since it is sent to Anthropic with the
  request.

## What we give up

- The ranges are a model's recall of labor guides and prices, not data from them, and may be off
  for unusual cars or jobs. The wording ("usual range", "AI estimate") is chosen for that.
- Each estimate costs a use of the daily assistant limit, and needs a connection.

## Revisit if

Owners act on the ranges often enough that accuracy matters more than having no vendor: then
license a labor-time and parts-price source and keep `comparePrices` and the screen as they are,
swapping only the `PriceEstimator` adapter.
