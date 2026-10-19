# 0023 The Status tab reads the car page's own models and shows its state as a number over dots

Status: accepted, 2026-10-19

## Decision

The Status tab shows the selected car's health at a glance: a row of dots with one per schedule
item that has a known due point and per open recall, the number that needs the owner (overdue items
plus open recalls), one status word with a sentence saying why, three stats and a list of checks.

- **No new data.** `createStatusModel` builds the same car and safety models the Car screen uses
  and describes their state with the pure `describeStatus`, so the two screens never disagree. The
  car model exposes the raw numbers behind its wording (miles, miles a month, the last reading's
  date, each row's due date and miles) for this.
- **Dots, not a ring.** The mockup's segmented ring was tried with a Swift Charts donut on iOS and
  Compose progress indicators on Android. Neither drew reliably on the simulator and emulator, so
  the segments are the same plain dots the checks list uses, in a row under the number. Each
  platform wraps them so screen readers read one label for the whole thing.
- **No driving chart.** The mockup's miles-per-period chart is left out: the app only learns an
  average pace from odometer readings, not real mileage per week or month.

## Revisit when

The app records mileage per period (from trips or a connected car), so a driving chart would show
real data.
