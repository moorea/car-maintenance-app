# 0012 Attachments: files in Supabase Storage, details synced by PowerSync

Status: accepted, 2026-10-17

## Decision

Owners attach photos and PDFs (receipts, registration, insurance) to a car or to a logged
service. Each attachment is a row in `attachments` plus one file in the private `attachments`
Storage bucket at `<owner_id>/<attachment_id>`.

- **The row syncs like any other** (PowerSync, scoped by the owner's vehicles). It is
  append-only: insert and delete, no update.
- **The file uploads with its row.** The upload connector stores the file before inserting the
  row, so a row never reaches Postgres without its file, a failed upload retries with PowerSync's
  queue, and signing out waits for files just as it waits for rows. A file Storage refuses for good
  (wrong type, over 25 MB) drops the row, as any permanent upload error does (ADR 0004).
- **Files are downloaded on demand.** The phone that attached a file keeps its copy; another phone
  downloads it, through a short-lived signed URL, the first time it is opened, and keeps it for
  offline use. Local copies whose rows are gone (deleted elsewhere, or cleared at sign-out) are
  removed.
- **Access** is enforced twice: RLS on the table, and Storage policies that only let a user read,
  write or delete objects under their own id. The bucket only accepts JPEG, PNG, HEIC/HEIF and PDF
  up to 25 MB.
- **Viewing** uses the system viewer (Quick Look on iOS, via expo-file-system), which brings zoom,
  share, print and markup for free. Photos come from expo-image-picker (re-encoded as JPEG) and
  files from the system file picker.

## Why

- Receipts are worth most when the owner is at a shop or a counter, often offline, so attaching
  must work offline and the file must never be silently lost.
- Downloading everything to every phone would cost storage and data for files rarely opened on a
  second device.

## Revisit if

- Owners expect every document on every phone without opening it first: prefetch small files.
- Storage holds files whose car or account was deleted: rows cascade, files do not. A scheduled
  job should remove objects with no row.
