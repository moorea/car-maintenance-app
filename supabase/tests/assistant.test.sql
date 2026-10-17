-- Run with `supabase test db`. The assistant's daily question limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.assistant_questions (owner_id, asked_at) values
  ('00000000-0000-0000-0000-00000000000a', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000b', now() - interval '1 hour');

select ok(
  public.assistant_claim_question('00000000-0000-0000-0000-00000000000a', 2),
  'lets an owner under the limit ask, ignoring questions older than a day'
);
select is(
  (select count(*)::int from public.assistant_questions
    where owner_id = '00000000-0000-0000-0000-00000000000a' and asked_at > now() - interval '1 day'),
  2,
  'records the question it allowed'
);
select ok(
  not public.assistant_claim_question('00000000-0000-0000-0000-00000000000a', 2),
  'refuses an owner at the limit'
);
select is(
  (select count(*)::int from public.assistant_questions
    where owner_id = '00000000-0000-0000-0000-00000000000a'),
  3,
  'records nothing it refused'
);
select ok(
  public.assistant_claim_question('00000000-0000-0000-0000-00000000000b', 2),
  'counts each owner separately'
);
select ok(
  not has_function_privilege('authenticated', 'public.assistant_claim_question(uuid, int)', 'execute'),
  'owners cannot claim questions themselves'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_questions', 'delete'),
  'owners cannot delete their question history to reset the limit'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_claim_question(uuid, int)', 'execute'),
  'the edge function can claim questions'
);

select * from finish();
rollback;
