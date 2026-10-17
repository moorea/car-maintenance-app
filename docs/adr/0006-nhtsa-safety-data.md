# 0006 The database fetches NHTSA recalls and complaints itself

Status: accepted, 2026-10-17

## Decision

Recalls and owner complaints come from NHTSA's free APIs (`api.nhtsa.gov`, no key) and are
stored in Postgres per `vehicle_configs` row. The database fetches them: a `pg_cron` job runs
`nhtsa_sync()` every minute, which stores the answers `pg_net` received for earlier requests and
then requests recalls and complaints for up to ten model years whose data is missing or a day old.
Only model years someone owns are fetched; the trims of one model year share one request.

- `recalls` and `complaint_summaries` (counts, crashes, fires, injuries and the three newest
  complaints per component) sync to the phone. Raw `complaints` stay on the server for the
  assistant. `vehicle_configs.recalls_checked_at` and `complaints_checked_at` let the phone tell
  "no recalls" from "not checked yet".
- A failed request (outage, rate limit, timeout, an answer that is not JSON) keeps the stored
  data and is retried after 10 minutes, doubling up to a day. A 4xx other than 429 means NHTSA
  has nothing for that model year: it counts as checked and stored data is kept.
- Unchanged rows are not rewritten, so the daily refresh does not make phones download them again.

## Why

- Nothing to run or configure outside the database: no edge function deploy, no scheduler, no
  secrets. It ships with the migration and is tested with pgTAP like the rest of the schema.
- A new car gets its data within about two minutes of uploading, and every owner of a model year
  shares one copy, which is what "every VIN with a new recall" alerts will join against.
- NHTSA's recall data is by model year, not by VIN. The app says so and links to NHTSA's VIN
  lookup, which is the only public source for whether a recall applies to one car and was fixed.

## What we give up

- Parsing lives in PL/pgSQL rather than TypeScript. It is small and covered by
  `supabase/tests/nhtsa.test.sql`.
- pg_net keeps responses for a few hours and sends requests only after the job's transaction
  commits, so answers are handled one run later.

## Revisit if

Ingestion grows beyond NHTSA (TSBs, manuals, a paid data provider) or needs heavier processing
such as embeddings for the assistant: then move it to an edge function or worker, keeping the
same tables.
