-- Run with `supabase test db`. Proves an owner's attachments and their files stay their own, and
-- that a receipt outlives the service it was attached to.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicles (id, owner_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'A car'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 2019, 'Honda', 'Civic', 'A second car'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.service_records (id, vehicle_id, performed_on) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '2026-01-01'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '2026-01-01');
insert into public.attachments
  (owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on) values
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'insurance',
   'B card.pdf', 'application/pdf', 1000, '2026-01-01');
insert into storage.objects (bucket_id, name)
  values ('attachments', '00000000-0000-0000-0000-00000000000b/b-file');

select is(
  (select public from storage.buckets where id = 'attachments'), false,
  'the attachments bucket is private'
);
select table_privs_are('public', 'attachments', 'authenticated',
  array['SELECT', 'INSERT', 'DELETE'], 'attachments are append-only for owners');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select lives_ok(
  $$ insert into public.attachments
       (id, vehicle_id, service_record_id, kind, name, content_type, size_bytes, added_on)
     values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a',
             '30000000-0000-0000-0000-00000000000a', 'receipt', 'Oil change.jpg', 'image/jpeg',
             2000, '2026-01-01') $$,
  'owner can attach a receipt to a service of their own car'
);
select lives_ok(
  $$ insert into public.attachments
       (id, vehicle_id, kind, name, content_type, size_bytes, added_on)
     values ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a',
             'registration', 'Registration.pdf', 'application/pdf', 3000, '2026-01-02') $$,
  'owner can attach a document to their own car'
);
select throws_ok(
  $$ insert into public.attachments (vehicle_id, kind, name, content_type, size_bytes, added_on)
     values ('20000000-0000-0000-0000-00000000000b', 'other', 'x.jpg', 'image/jpeg', 1,
             '2026-01-01') $$,
  '42501', null, 'owner cannot attach to someone else''s car'
);
select throws_ok(
  $$ insert into public.attachments
       (owner_id, vehicle_id, kind, name, content_type, size_bytes, added_on)
     values ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000a',
             'other', 'x.jpg', 'image/jpeg', 1, '2026-01-01') $$,
  '42501', null, 'owner cannot file an attachment under someone else''s name'
);
select throws_ok(
  $$ insert into public.attachments
       (vehicle_id, service_record_id, kind, name, content_type, size_bytes, added_on)
     values ('20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-00000000000a',
             'receipt', 'x.jpg', 'image/jpeg', 1, '2026-01-01') $$,
  '42501', null, 'a receipt cannot point at a service of another of the owner''s cars'
);
select throws_ok(
  $$ insert into public.attachments
       (vehicle_id, service_record_id, kind, name, content_type, size_bytes, added_on)
     values ('20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b',
             'receipt', 'x.jpg', 'image/jpeg', 1, '2026-01-01') $$,
  '42501', null, 'a receipt cannot point at someone else''s service'
);
select throws_ok(
  $$ insert into public.attachments (vehicle_id, kind, name, content_type, size_bytes, added_on)
     values ('20000000-0000-0000-0000-00000000000a', 'other', 'x.gif', 'image/gif', 1,
             '2026-01-01') $$,
  '23514', null, 'only photos and PDFs can be attached'
);
select throws_ok(
  $$ insert into public.attachments (vehicle_id, kind, name, content_type, size_bytes, added_on)
     values ('20000000-0000-0000-0000-00000000000a', 'other', 'x.pdf', 'application/pdf',
             26214401, '2026-01-01') $$,
  '23514', null, 'files over 25 MiB cannot be attached'
);

select is((select count(*) from public.attachments)::int, 2,
  'owner cannot read another owner''s attachments');
select throws_ok(
  $$ update public.attachments set name = 'edited' $$,
  '42501', null, 'attachments are append-only'
);
select lives_ok(
  $$ delete from public.service_records where id = '30000000-0000-0000-0000-00000000000a' $$,
  'owner can delete a service with a receipt'
);
select is(
  (select service_record_id from public.attachments
    where id = '40000000-0000-0000-0000-000000000001'),
  null,
  'a receipt stays with the car after its service is deleted'
);
delete from public.attachments where id = '40000000-0000-0000-0000-000000000002';
select is((select count(*) from public.attachments)::int, 1, 'owner can delete their attachment');

-- Files in Storage.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', '00000000-0000-0000-0000-00000000000a/40000000-0000-0000-0000-000000000001') $$,
  'owner can upload a file into their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', '00000000-0000-0000-0000-00000000000b/planted') $$,
  '42501', null, 'owner cannot upload into someone else''s folder'
);
select is((select count(*) from storage.objects where bucket_id = 'attachments')::int, 1,
  'owner cannot see someone else''s files');

select * from finish();
rollback;
