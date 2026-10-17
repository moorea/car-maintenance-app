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
  violation (class 23), an RLS refusal for a signed-in user (42501) or any other 4xx is dropped
  and logged, because retrying it would block every later change. 401, 408, 429, 5xx and network
  failures are retried, and nothing uploads while signed out. Service records and odometer
  readings are append-only: the device refuses to upload an update to them, inserts are
  `ON CONFLICT DO NOTHING` so a retry is harmless, and a correction is a delete plus an insert.
- **Sign-in and sign-out** go through one serialized sync session (`createSyncSession`). Signing
  out deletes the local copy only once everything has uploaded; otherwise it is kept for the same
  user's next sign-in. Signing in as a different user deletes the previous user's copy first.
- **Table access** is granted per table and operation in migrations; new tables are not exposed
  to the Data API by default, and anonymous users get nothing. Migrations deploy to the hosted
  project from `.github/workflows/deploy-db.yml` after they merge. PowerSync replicates the
  tables in the `powersync` publication, which must match the sync rules.
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
