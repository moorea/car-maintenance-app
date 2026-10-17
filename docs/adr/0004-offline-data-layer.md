# 0004 Offline data layer: PowerSync adapters in packages/data

Status: accepted, 2026-10-17

## Decision

The core ports are implemented over PowerSync's on-device SQLite database in `packages/data`.
Screens read and write SQLite only; PowerSync syncs it with Supabase Postgres in the background.

- **Reads** come down through the sync rules in `powersync/sync-rules.yaml`. Row-level security
  does not apply to sync, so every bucket is scoped by `request.user_id()`; a test enforces it.
- **Writes** go up through PostgREST as the signed-in user (`SupabaseConnector`), so the RLS
  policies in `supabase/migrations` are the write boundary.
- **Rejected uploads**: a change that fails with bad data (SQLSTATE class 22), a constraint
  violation (class 23) or an RLS refusal (42501) is dropped and logged, because retrying it would
  block every later change. Any other failure is retried. Service records are append-only on the
  server, so a correction is a delete plus an insert, never an update.
- **Ids** are UUIDs generated on the device, so rows created offline never collide.
- `packages/data` takes the database as a parameter and imports only `@powersync/common`. The app
  passes the React Native database; tests pass `@powersync/node` with a temporary file.

## Why

- The owner logs a service at the shop or in a parking garage, often with poor signal. Writing
  locally first makes that instant and reliable.
- Keeping the adapters out of the app means they are tested on Node against real SQLite, the same
  way core is, with no device.

## Revisit if

- Dropped uploads show up in practice; then they need a visible "couldn't save" state instead of
  a log line.
- PowerSync's pricing or hosting stops fitting; the adapters are the only code that knows it.
