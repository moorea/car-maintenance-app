-- Receipts, registration, insurance cards and other photos or PDFs an owner attaches to a car or
-- to a service in its log. The details are a row that syncs like any other; the file itself is an
-- object in the private `attachments` Storage bucket at `<owner_id>/<attachment_id>`. The phone
-- uploads the file before the row, so a row never exists here without its file.

create table public.attachments (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users on delete cascade,
  vehicle_id        uuid not null references public.vehicles on delete cascade,
  -- A receipt outlives its service: if the service is deleted it stays among the car's documents.
  service_record_id uuid references public.service_records on delete set null,
  kind              text not null
                    check (kind in ('receipt', 'registration', 'insurance', 'other')),
  name              text not null check (length(name) between 1 and 255),
  content_type      text not null check (content_type in
                      ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf')),
  -- 25 MiB, the bucket's limit.
  size_bytes        int  not null check (size_bytes > 0 and size_bytes <= 26214400),
  added_on          date not null,
  created_at        timestamptz not null default now()
);
create index on public.attachments (vehicle_id);

-- Append-only from the app, like service records: no update policy or grant, so a correction is
-- a delete plus an insert and two phones never overwrite each other.
alter table public.attachments enable row level security;

create policy owner_read on public.attachments for select to authenticated
  using (public.owns_vehicle(vehicle_id));
-- owner_id names the Storage folder the file lives in, so it must be the uploader's own. A
-- receipt may only point at a service of the same car.
create policy owner_insert on public.attachments for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.owns_vehicle(vehicle_id)
    and (
      service_record_id is null
      or exists (
        select 1 from public.service_records s
        where s.id = attachments.service_record_id and s.vehicle_id = attachments.vehicle_id
      )
    )
  );
create policy owner_delete on public.attachments for delete to authenticated
  using (public.owns_vehicle(vehicle_id));

grant select, insert, delete on public.attachments to authenticated;
grant select, insert, update, delete on public.attachments to service_role;

alter publication powersync add table public.attachments;

-- Storage ------------------------------------------------------------------------------------------

-- Private: files are read through short-lived signed URLs. Storage itself enforces the size and
-- type limits, matching the table's checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 26214400,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

-- Each owner reads, adds and deletes files only in their own folder. No update: a file is never
-- replaced in place, so a retried upload cannot overwrite what another phone sent.
create policy attachments_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy attachments_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
