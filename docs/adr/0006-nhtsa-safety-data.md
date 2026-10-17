# 0006 The database fetches NHTSA recalls and complaints itself

Status: accepted, 2026-10-17

## Decision

Recalls and owner complaints come from NHTSA's free APIs (`api.nhtsa.gov`, no key) and are
stored in Postgres per `vehicle_configs` row. The database fetches them: a `pg_cron` job runs
`nhtsa_sync()` every minute, which stores the answers `pg_net` received for earlier requests and
then requests recalls and complaints for up to ten model years: first those a new car is waiting
on, then the stalest of those last checked over a day ago. Only model years someone owns, up to
next year's, are fetched; the trims of one model year share one request.

- `recalls` and `complaint_summaries` (counts, crashes, fires, injuries and the three newest
  complaints per component) sync to the phone. Raw `complaints` stay on the server for the
  assistant. `vehicle_configs.recalls_checked_at` and `complaints_checked_at` let the phone tell
  "no recalls" from "not checked yet".
- Only a 200 with a `results` array counts as checked. Anything else (a block, a moved endpoint,
  an outage, a rate limit, a timeout, an answer that is not JSON) keeps the stored data and is
  retried after 10 minutes, doubling up to a day, so the phone never says "no recalls" because a
  request failed. An answer that cannot be stored is logged and counted as a failure without
  stopping the job.
- Unchanged rows are not rewritten, so the daily refresh does not make phones download them again.
  The refresh time lives in `nhtsa_fetches`; a config's check times are set once.

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
