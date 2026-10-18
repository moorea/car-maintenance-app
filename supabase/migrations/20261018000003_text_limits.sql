-- Caps the free text owners write, so one account cannot fill the database with megabyte notes.
-- The app's forms refuse longer text first (SHORT_TEXT_MAX and NOTES_MAX in packages/core), and
-- an import cuts it to fit. NOT VALID: rows already stored are left alone; new writes are checked.

alter table public.service_records
  add constraint service_records_shop_length check (length(shop) <= 200) not valid,
  add constraint service_records_notes_length check (length(notes) <= 10000) not valid,
  -- Unused since attachments replaced it, but still writable.
  add constraint service_records_receipt_path_length check (length(receipt_path) <= 200) not valid;

alter table public.warranties
  add constraint warranties_provider_length check (length(provider) <= 200) not valid,
  add constraint warranties_policy_number_length check (length(policy_number) <= 200) not valid,
  add constraint warranties_notes_length check (length(notes) <= 10000) not valid;

alter table public.fill_ups
  add constraint fill_ups_station_length check (length(station) <= 200) not valid,
  add constraint fill_ups_notes_length check (length(notes) <= 10000) not valid;
