# 0004 Offline data layer: PowerSync adapters in packages/data

Status: accepted, 2026-10-17

## Decision

The core ports are implemented over PowerSync's on-device SQLite database in `packages/data`.
Screens read and write SQLite only; PowerSync syncs it with Supabase Postgres in the background.

- **Reads** come down through the Sync Streams in `powersync/sync-rules.yaml`. Row-level security
  does not apply to sync, so every query is scoped by `auth.user_id()`; a test enforces it.
- **Writes** go up through PostgREST as the signed-in user (`SupabaseConnector`), so the RLS
  policies in `supabase/migrations` are the write boundary.
- **Rejected uploads**: a change that fails with bad data (SQLSTATE class 22), a constraint
  violation (class 23), an RLS refusal for a signed-in user (42501) or any other 4xx is dropped
  and logged, because retrying it would block every later change. 401, 408, 429, 5xx and network
  failures are retried, and nothing uploads while signed out. Service records and odometer
  readings are append-only: the device refuses to upload an update to them, inserts are
  `ON CONFLICT DO NOTHING` so a retry is harmless, and a correction is a delete plus an insert.
- **Backlogs upload in batches.** The connector reads up to 100 queued changes at a time, and a
  run of consecutive inserts into one table with the same columns goes in one request, so a
  phone that was offline for weeks (or an import of years of history) catches up in a few
  requests rather than one per row. A batch the server refuses for good is resent row by row, so
  only the bad row is dropped and each keeps its own fallback. When a run fails for now, the
  changes before it are marked uploaded first, so a retry never replays them over another phone's
  newer edit.
- **Every upload request has a deadline**: 30 seconds plus 10 a megabyte sent, for rows and files
  alike. PowerSync waits for one upload pass before starting the next, so a request stuck on a
  dead connection would otherwise hold every later change until the app restarts. A request past
  its deadline is a network failure and is retried; each failed pass in a row doubles the
  deadlines, up to 16 times, so a slow connection still gets a large file through.
- **Sign-in and sign-out** go through one serialized sync session (`createSyncSession`). Signing
  out deletes the local copy only once everything has uploaded; otherwise it is kept for the same
  user's next sign-in. Signing in as a different user deletes the previous user's copy first.
- **Table access** is granted per table and operation in migrations; new tables are not exposed
  to the Data API by default, and anonymous users get nothing. Migrations deploy to the hosted
  project from `.github/workflows/deploy-db.yml` after they merge. PowerSync replicates the
  tables in the `powersync` publication, which must match the sync rules. The sync rules are
  checked against the hosted instance on pull requests (`.github/workflows/sync-rules.yml`) and
  deploy to it after the migrations, from the same `deploy-db.yml` run.
- **Ids** are UUIDs generated on the device, so rows created offline never collide.
- `packages/data` takes the database as a parameter and imports only `@powersync/common`. The app
  passes the React Native database; tests pass `@powersync/node` with a temporary file.
- **End-to-end sync tests** (`packages/data/e2e`) run the same adapters as several phones against
  a local Supabase and a self-hosted PowerSync in Docker (`scripts/start-local-sync.sh`), serving
  this repo's migrations and sync rules. They cover two phones of one owner, offline queues, other
  owners' data and deletes of a car or account. Every table the phone uploads needs a case there.

## Why

- The owner logs a service at the shop or in a parking garage, often with poor signal. Writing
  locally first makes that instant and reliable.
- Keeping the adapters out of the app means they are tested on Node against real SQLite, the same
  way core is, with no device.

## Revisit if

- Dropped uploads show up in practice; then they need a visible "couldn't save" state instead of
  a log line.
- PowerSync's pricing or hosting stops fitting; the adapters are the only code that knows it.
