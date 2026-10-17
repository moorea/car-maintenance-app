# 0010 Schedules come from providers, with a general baseline until one is chosen

Status: accepted, 2026-10-17

## Decision

A configuration's maintenance schedule is the set of `maintenance_items` rows for it, and each
row says which provider wrote it (`source`) and what it is (`kind`, such as `engine-oil`, the
same key across providers). Providers write schedules only through
`set_config_schedule(config, source, items)`, which the service role may call and owners may not.
It replaces the config's whole schedule in one transaction: an item of a kind the config already
has is updated in place and keeps its id, so service records stay linked; kinds the new schedule
lacks are deleted and their service records kept without the link; unchanged rows are not
rewritten.

Until a commercial feed is chosen, the only provider is the baseline (`source = 'baseline'`). A
trigger gives every new config the baseline in the same transaction that creates it, so a new car
syncs back with a schedule, and the migration backfills existing configs. The intervals live in
`baseline_schedule`: general, conservative ones (at or ahead of what most manufacturers ask for
cars of that era) for oil, tires, brakes, filters, fluids, plugs, the timing belt (if equipped)
and the 12-volt battery, chosen by powertrain and, for coolant and plugs, model year. The
powertrain comes from the decoded engine ("Electric", "2.5L 4-cyl hybrid", "6.7L 6-cyl diesel")
or, for a car typed in without one, from makes and model names that are electric in every year;
anything unknown is gas, because calling a gas car electric would drop its engine maintenance. The
baseline never overwrites another provider's schedule.

The phone and the assistant treat `source = 'baseline'` as general guidance: the car page titles
it "General schedule" with a note that it is not the manufacturer's and that the owner's manual
has the exact intervals, and the assistant's schedule documents and instructions say the same.

## Plugging in a commercial feed

A feed (DataOne, MOTOR or similar) becomes another provider: a job with the feed's key in
Supabase secrets maps each config to the feed's vehicle, maps the feed's operations to kinds, and
calls `set_config_schedule(config, '<feed>', items)`. Configs the feed has no data for keep the
baseline. Nothing on the phone changes, and the "General schedule" label disappears for the cars
the feed covers. A feed that can only match by VIN will need configs split finer than a
description, which ADR 0005 already allows server jobs to do.

## Why

- Every car gets useful reminders now, rather than an empty schedule until a provider contract is
  signed, and it is honest about where the numbers come from.
- Keeping schedules as synced rows keeps reminders offline (ADR 0008), lets service records keep
  their foreign key to the item, and lets the assistant read the same data on the server.
- Like ADR 0006, the baseline ships with the migration and runs in the database, with nothing to
  deploy or schedule; a paid feed, which needs a key and heavier mapping, runs outside it and uses
  the same function.
- Stable kinds make replacing the baseline lossless for the owner's history.

## What we give up

- The baseline is not the car's real schedule; some owners will be reminded sooner than their
  manufacturer asks (synthetic oil, long-life plugs and coolant). The label says so.
- Powertrain detection from typed-in make and model is a short list; an unlisted electric car
  typed in by hand gets the gas schedule until it is described with its VIN.
- A provider dropping a kind unlinks old service records from it.

## Revisit if

A provider is chosen (add its job and decide whether it replaces the baseline everywhere or only
where it has data), or owners need to edit intervals for their own car (that is per-vehicle data,
not a provider).
