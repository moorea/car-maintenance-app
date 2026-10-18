-- Run with `supabase test db`. Proves owners can set how their own car looks and nobody else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.vehicles (id, year, make, model, nickname, body_style) values
  ('20000000-0000-0000-0000-00000000000a', 2019, 'Ford', 'F-150', 'Truck', 'pickup');

update public.vehicles set body_style = 'suv', paint = 'blue'
  where id = '20000000-0000-0000-0000-00000000000a';
select is(
  (select row(body_style, paint)::text from public.vehicles
    where id = '20000000-0000-0000-0000-00000000000a'),
  row('suv', 'blue')::text,
  'an owner sets their car''s body style and paint'
);

select throws_ok(
  $$ update public.vehicles set body_style = 'hovercraft'
       where id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a body style must be one the app draws'
);
select throws_ok(
  $$ update public.vehicles set paint = 'chartreuse'
       where id = '20000000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a paint must be one the app offers'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
update public.vehicles set paint = 'red'
  where id = '20000000-0000-0000-0000-00000000000a';
reset role;
select is(
  (select paint from public.vehicles where id = '20000000-0000-0000-0000-00000000000a'),
  'blue',
  'another user cannot repaint someone else''s car'
);
select ok(
  has_column_privilege('authenticated', 'public.vehicles', 'body_style', 'update')
    and has_column_privilege('authenticated', 'public.vehicles', 'paint', 'update'),
  'owners may update the appearance columns'
);

select * from finish();
rollback;
