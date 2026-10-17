# 0013 Service bulletins and complaint mileages come from NHTSA's bulk files

Status: accepted, 2026-10-17

## Decision

The car's Known issues tab shows the manufacturer's service bulletins and warranty extensions, and
a "coming up at your mileage" card counting what owners of the same model year reported around the
car's odometer. Both feed Ask and the quote checker.

- **Source: NHTSA's free bulk files.** Manufacturer communications (`TSBS_RECEIVED_*.zip`, the tab-separated flat file;
  `MFR_COMMS_RECEIVED_*.zip` is only a comma-separated summary)
  and complaints (`COMPLAINTS_RECEIVED_*.zip`) from `static.nhtsa.gov/odi/ffdd`. NHTSA's API has
  neither the bulletins' text nor a complaint's mileage, and no paid account is needed.
- **A Node importer in GitHub Actions** (`packages/importer`, `import-nhtsa.yml`), not pg_net
  (ADR 0006): the zips are hundreds of megabytes. Every three hours it compares the files' ETags
  with `nhtsa_imports`, and only downloads when a file changed or a newly owned model year is
  waiting. It streams the files, keeps the lines for owned model years and calls the migration's
  functions (`nhtsa_store_bulletins`, `nhtsa_store_complaint_miles`,
  `nhtsa_refresh_complaint_mileage`) over the pooler as the database owner.
- **Read everything, then store.** A failed download, an empty file, or more than 5% malformed
  lines (a layout change) stops the run before anything is written, so bad input never replaces
  good bulletins. `nhtsa-files.yml` dry-runs the real files on importer changes and weekly.
- **Tables.** `bulletins` (one row per communication per config, synced to the phone),
  `vehicle_configs.bulletins_checked_at`, `complaint_miles` (by ODI number, server only) and
  `complaint_summaries.by_mileage`, counts in 10,000-mile bands that sync with the summaries.
  `nhtsa_handle_response` refreshes the bands whenever complaints arrive, so either source can
  land first.
- **Matching in core.** `issuesNearMileage` counts the car's band and the next one, keeps parts
  with at least two complaints, and marks parts a warranty extension or campaign may cover.
  Bulletins are matched to parts by the first word of NHTSA's component name.
- **Plain language without a model.** Summaries are NHTSA's text, sentence-cased, with the first
  sentence as the title. Ask can explain a bulletin in more depth on request.

## Why

- Bulletins and warranty extensions are what turns "my car does X" into "this is a known problem,
  and the repair may be free". Mileage is what makes complaint data useful before it happens.
- Keeping only owned model years keeps the tables small and the phone's sync cheap.

## What we give up

- Data is as fresh as NHTSA's files, plus up to three hours.
- NHTSA's summaries, not the full bulletins: the documents themselves are behind the
  manufacturers' paid service sites.
- Complaint mileages are self-reported and many complaints have none.

## Revisit if

NHTSA offers bulletins or mileage through its API (drop the importer, keep the tables), the
importer needs more than an Actions job (move it to a worker), or summaries need rewriting for
readability (generate them once per bulletin on import, not per view).
