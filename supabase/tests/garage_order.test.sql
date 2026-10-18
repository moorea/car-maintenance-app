-- Run with `supabase test db`. Proves owners can arrange their own cars and nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.vehicles (id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', 2012, 'Honda', 'Accord', 'Accord');

update public.vehicles set garage_position = 1
  where id = '20000000-0000-0000-0000-00000000000a';
select is(
  (select garage_position from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  1,
  'an owner moves their car in the garage'
);

select throws_ok(
  $$ update public.vehicles set garage_position = -1
       where id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a position is never negative'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.vehicles set garage_position = 0
  where id = '20000000-0000-0000-0000-00000000000a';
reset role;
select is(
  (select garage_position from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  1,
  'another user cannot move someone else''s car'
);
select ok(
  has_column_privilege('authenticated', 'public.vehicles', 'garage_position', 'update'),
  'owners may update the position column'
);

select * from finish();
rollback;
