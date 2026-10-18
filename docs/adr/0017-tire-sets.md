# 0017 Tire age comes from the DOT code, and each set keeps its own miles

Status: accepted, 2026-10-18

## Decision

Owners keep the car's tires in `tire_sets`: the set on the car, and any stored for another season.
Each has a name, brand and size, the week and year it was made, the miles on it and its last
measured tread depth.

- **Age from the DOT code.** The last four digits on the sidewall are the week and year the tires
  were made (`2321` is week 23 of 2021). The owner types them, or the whole code; we store the week
  and year and date the tires from that ISO week's Monday. A week still in the future is refused.
- **Advice follows carmakers and tire makers**, not a mileage guess: a yearly inspection from five
  years, replace by six (most carmakers) and never past ten, and tread at 4/32″ is worn for rain
  and snow, 2/32″ the legal limit in most states. The more urgent reason wins.
- **Miles per set, not per car.** A set records the odometer when it went on and the miles from
  earlier seasons. Taking it off adds the miles since it went on, so a winter set picks up where it
  left off. Only one set is on the car: a swap saves both sets in one write, and import keeps the
  first one marked as on the car.
- **Editable**, like warranties and fill-ups: PUT, PATCH and DELETE upload, and RLS lets owners
  write rows on their own cars only.
- **Reminders are the phone's own** (ADR 0008): a heads-up a month before a set turns six and ten.
  The id names the set and the birthday, so editing the DOT code moves them.
- Two phones swapping offline at once can both leave a set on the car until one is corrected; the
  page still lists every set, so nothing is hidden.

## Revisit when

We read the DOT code from a photo of the sidewall, or track rotations and pressure per set.
