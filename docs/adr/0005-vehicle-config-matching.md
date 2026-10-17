# 0005 The server matches a car to its shared config

Status: accepted, 2026-10-17

## Decision

A car is added on the phone as one `vehicles` row that describes it: year, make, model and, when
known, trim, engine and drivetrain, plus the VIN when the owner gave one. The phone never picks a
`vehicle_configs` row. A trigger on `vehicles` (`assign_vehicle_config`, security definer) finds
the config with the same description, ignoring case, or creates it, and sets `config_id`. A
unique index on the lower-cased description keeps one config per description. Owners cannot
update `config_id`; server jobs can, to fold a car onto a better config. The
config and its schedule then reach the phone through the usual sync.

VINs are decoded on the phone through the `VinDecoder` port. The real adapter calls NHTSA's free
vPIC API (no key, US vehicles); the owner can also type year, make and model instead.

## Why

- Adding a car stays offline-first: the phone writes SQLite and the upload connector does the
  rest, like every other write (ADR 0004). An RPC to pick the config first would need a connection.
- Users cannot write shared reference data, and should not: the trigger is the one narrow path by
  which a user's car creates a config, with the description's length and year checked.
- Matching lives in one SQL function, so better matching later (a trim alias table, folding a
  decoded description onto an ingested config) changes no client code. Changing a car's
  description re-runs it.

## What we give up

- A car added offline has no `config_id`, so no schedule, until it has uploaded and synced back.
- The same VIN added on two devices before either has synced uploads twice; the second hits
  `unique (owner_id, vin)` and is dropped (ADR 0004), so that car disappears from the second
  device. Rare enough to accept until dropped uploads get a visible state.
- Any signed-in user can create a config row by describing a car. They are deduplicated, small and
  carry no data until ingestion fills them, so this is tolerable for now.

## Revisit if

Configs fragment (the same car under several descriptions) or junk configs pile up: then match
against a vetted catalog and leave `config_id` null for anything unknown.
