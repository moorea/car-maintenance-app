-- Run with `supabase test db`. The sweep only ever deletes files that no attachment row points
-- at, never a file that is still in use or one whose row may still be uploading.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicles (id, owner_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'A car'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 2019, 'Honda', 'Civic', 'A second car'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.attachments
  (id, owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values
  ('40000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-00000000000a', 'receipt', 'Kept.pdf', 'application/pdf', 1000, '2026-01-01'),
  ('40000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a',
   '20000000-0000-0000-0000-0000000000a2', 'receipt', 'Civic.pdf', 'application/pdf', 1000, '2026-01-01'),
  ('40000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
   '20000000-0000-0000-0000-00000000000b', 'insurance', 'B card.pdf', 'application/pdf', 1000, '2026-01-01');
insert into storage.objects (bucket_id, name, created_at) values
  ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-00000000000a', now() - interval '30 days'),
  ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a2', now() - interval '30 days'),
  -- Uploaded an hour ago; its row has not arrived yet.
  ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a3', now() - interval '1 hour'),
  -- Uploaded long ago; its row never arrived.
  ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a4', now() - interval '3 days'),
  -- Its id is someone else's attachment, but it is in the wrong owner's folder.
  ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-00000000000b', now() - interval '3 days'),
  ('attachments', '00000000-0000-0000-0000-00000000000b/40000000-0000-0000-0000-00000000000b', now() - interval '1 hour');

select ok(
  not has_function_privilege('authenticated', 'public.orphaned_files(int)', 'execute'),
  'owners cannot list files'
);
select ok(
  not has_function_privilege('anon', 'public.orphaned_files(int)', 'execute'),
  'signed-out visitors cannot list files'
);
select ok(
  has_function_privilege('service_role', 'public.orphaned_files(int)', 'execute'),
  'the sweep can list files'
);

select is(
  array(select public.orphaned_files()),
  array[
    '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a4',
    '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-00000000000b'
  ],
  'lists only day-old files with no row of their owner''s, oldest first'
);

-- Deleting a car cascades to its attachment rows; its files are then orphans.
delete from public.vehicles where id = '20000000-0000-0000-0000-0000000000a2';
select ok(
  '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a2'
    = any(array(select public.orphaned_files())),
  'lists the files of a deleted car'
);
select ok(
  not '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-00000000000a'
    = any(array(select public.orphaned_files())),
  'keeps the files of the owner''s other car'
);

-- Deleting an account cascades to everything; its files go at once, however new.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select ok(
  '00000000-0000-0000-0000-00000000000b/40000000-0000-0000-0000-00000000000b'
    = any(array(select public.orphaned_files())),
  'lists a deleted owner''s files without waiting a day'
);
select ok(
  not '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-0000000000a3'
    = any(array(select public.orphaned_files())),
  'still waits a day for a living owner''s new file'
);

select is(
  (select count(*)::int from public.orphaned_files(2)), 2,
  'returns at most max_files names'
);

insert into storage.buckets (id, name) values ('other', 'other');
insert into storage.objects (bucket_id, name, created_at)
  values ('other', 'anything', now() - interval '30 days');
select ok(
  not 'anything' = any(array(select public.orphaned_files())),
  'ignores other buckets'
);

select * from finish();
rollback;
