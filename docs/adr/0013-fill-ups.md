# 0013 Fill-ups are editable, and their mileage is read as odometer readings

Status: accepted, 2026-10-17

## Decision

Owners log fill-ups at the pump and charging sessions in `fill_ups`: date, odometer, fuel or
charge, gallons or kWh, total paid (optional, for free charging), whether the tank was filled,
and whether the fill-up before it went unlogged.

- **Editable and deletable**, like warranties: PUT, PATCH and DELETE upload, and RLS lets owners
  update rows on their own cars only. Owners of Fuelly and Drivvo complain most about records they
  cannot fix and fill-ups they cannot insert late, so a late fill-up is placed by its mileage, not
  the order it was typed.
- **A fill-up's mileage is an odometer reading, read rather than copied.** `withFillUpReadings`
  in core wraps the `OdometerRepo` at the composition root, so every screen, the mileage estimate
  and the reminder planner see fill-ups among the readings, and fixing or deleting a fill-up fixes
  the reading. A copy in `odometer_readings` (which is append-only) would keep a typo forever. The
  assistant's server reads `fill_ups` the same way.
- **Economy is full-to-full**: the miles between two full fill-ups over everything put in since,
  partial fill-ups included. A fill-up marked as following a missed one starts again. A stretch
  outside 3 to 150 mpg (0.5 to 10 mi/kWh) is flagged for the owner to check and left out of the
  average. Fuel and charging are measured separately, so a plug-in hybrid's gas mpg includes its
  electric miles; that is a known limitation.
- **Running costs** add fill-ups and services with a price by month and by year. Cost per mile
  uses the miles the readings show over the period (never extrapolated past the last reading) and
  is left out under 100 miles.
- The app never asks the owner to log fuel; there are no reminders or prompts for it.

## Revisit when

Connected-car or OBD mileage arrives (readings would then come from a third source), or plug-in
hybrids need blended economy.
