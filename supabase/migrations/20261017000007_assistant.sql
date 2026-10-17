-- The assistant edge function stores each answered question and its answer in conversations and
-- messages (created in the core schema), and caps how many questions one owner can ask a day.
-- See ADR 0009.

create index on public.conversations (vehicle_id);

-- One row per question sent to the model, answered or not, so stopped or failed answers count
-- too. Separate from messages, which owners can delete with their conversations: deleting a
-- conversation must not reset the limit. Only the edge function (service role) reads or writes it.
create table public.assistant_questions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  asked_at timestamptz not null default now()
);
create index on public.assistant_questions (owner_id, asked_at);
alter table public.assistant_questions enable row level security;
revoke all on table public.assistant_questions from public, anon, authenticated;

-- Records a question for the owner if they have asked fewer than p_limit in the last day, and
-- says whether it did. The lock makes concurrent questions from one owner take turns, so
-- parallel requests cannot all pass the check before any is recorded.
create function public.assistant_claim_question(p_owner uuid, p_limit int) returns boolean
  language plpgsql volatile set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  if (
    select pg_catalog.count(*)
      from public.assistant_questions
     where owner_id = p_owner
       and asked_at > pg_catalog.now() - interval '1 day'
  ) >= p_limit then
    return false;
  end if;
  insert into public.assistant_questions (owner_id) values (p_owner);
  return true;
end;
$$;

-- Only the server may claim, so owners can neither skip the limit nor probe others' activity.
revoke all on function public.assistant_claim_question(uuid, int)
  from public, anon, authenticated;
grant execute on function public.assistant_claim_question(uuid, int) to service_role;
