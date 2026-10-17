-- Run with `supabase test db`. The assistant's daily question count.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.vehicles (id, owner_id, year, make, model, nickname) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 2021, 'Toyota', 'RAV4', 'A one'),
  ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 2019, 'Honda', 'CR-V', 'A two'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 2021, 'Toyota', 'RAV4', 'B car');
insert into public.conversations (id, vehicle_id) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b');
insert into public.messages (conversation_id, role, content, created_at) values
  ('30000000-0000-0000-0000-00000000000a', 'user', '{"text": "Q1"}', now() - interval '1 hour'),
  ('30000000-0000-0000-0000-00000000000a', 'assistant', '{"text": "A1"}', now() - interval '1 hour'),
  ('30000000-0000-0000-0000-0000000000a2', 'user', '{"text": "Q2"}', now() - interval '2 hours'),
  ('30000000-0000-0000-0000-00000000000a', 'user', '{"text": "Old"}', now() - interval '2 days'),
  ('30000000-0000-0000-0000-00000000000b', 'user', '{"text": "B"}', now() - interval '1 hour');

select is(
  public.assistant_questions_since('00000000-0000-0000-0000-00000000000a', now() - interval '1 day'),
  2,
  'counts an owner''s questions across their cars since the given moment, not answers'
);
select is(
  public.assistant_questions_since('00000000-0000-0000-0000-00000000000b', now() - interval '1 day'),
  1,
  'does not count other owners'' questions'
);
select ok(
  not has_function_privilege('authenticated', 'public.assistant_questions_since(uuid, timestamptz)', 'execute'),
  'owners cannot call the count'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_questions_since(uuid, timestamptz)', 'execute'),
  'the edge function can call the count'
);

select * from finish();
rollback;
