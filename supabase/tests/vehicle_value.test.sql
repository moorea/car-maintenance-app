-- Run with `supabase test db`. Proves owners can set their own car's value and nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.vehicles (id, year, make, model, nickname, value_cents, valued_on) values
  ('20000000-0000-0000-0000-00000000000a', 2012, 'Honda', 'Accord', 'Accord', 650000, '2026-10-01');

update public.vehicles set value_cents = 600000, valued_on = '2026-10-17'
  where id = '20000000-0000-0000-0000-00000000000a';
select is(
  (select row(value_cents, valued_on)::text from public.vehicles
    where id = '20000000-0000-0000-0000-00000000000a'),
  row(600000, '2026-10-17'::date)::text,
  'an owner updates their car''s value'
);

update public.vehicles set value_cents = null, valued_on = null
  where id = '20000000-0000-0000-0000-00000000000a';
select is(
  (select value_cents from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  null::int,
  'an owner can forget the value'
);

select throws_ok(
  $$ update public.vehicles set value_cents = 500000
       where id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a value needs the date it was given'
);
select throws_ok(
  $$ update public.vehicles set value_cents = 0, valued_on = '2026-10-17'
       where id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a value must be above zero'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.vehicles set value_cents = 1, valued_on = '2026-10-17'
  where id = '20000000-0000-0000-0000-00000000000a';
reset role;
select is(
  (select value_cents from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  null::int,
  'another user cannot set someone else''s car''s value'
);
select ok(
  has_column_privilege('authenticated', 'public.vehicles', 'value_cents', 'update')
    and has_column_privilege('authenticated', 'public.vehicles', 'valued_on', 'update'),
  'owners may update the value columns'
);

select * from finish();
rollback;
