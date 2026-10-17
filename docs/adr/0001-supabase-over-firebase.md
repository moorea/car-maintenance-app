# 0001 Supabase over Firebase

Status: accepted, 2026-10-17

## Decision

Use Supabase (Postgres, auth, storage, edge functions) as the backend, with PowerSync for
offline sync to SQLite on the phone.

## Why

- The data is relational. One `vehicle_configs` row (make, model, year, trim) carries the
  maintenance schedule, recalls and known issues for every owner of that configuration. Postgres
  joins this; Firestore would mean duplicating it into every car or doing multi-read joins.
- The assistant needs vector search filtered to the owner's exact configuration. pgvector does
  the filter and the similarity sort in one SQL query, next to the relational data.
- Cross-cutting jobs ("every VIN with a new recall whose owner has alerts on") are one SQL join.
- Cost scales with compute and storage, not per document read, so chatty screens stay cheap.
- Row-level security policies are SQL and are tested with pgTAP (`supabase/tests`).
- Standard Postgres keeps us portable (RDS, Neon, self-hosted).

## What we give up

- Firestore's built-in offline sync. Covered by PowerSync.
- Bundled Crashlytics and Analytics. Covered by Sentry and PostHog.

## Revisit if

Firebase-only tooling becomes essential, or Firebase Data Connect matures enough to offer the
same relational and vector capabilities.
