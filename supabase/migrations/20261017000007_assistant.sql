-- The assistant edge function stores each answered question and its answer in conversations and
-- messages (created in the core schema), and caps how many questions one owner can ask a day.
-- See ADR 0009.

create index on public.conversations (vehicle_id);
create index on public.messages (created_at) where role = 'user';

-- Questions an owner has had answered since a moment, across all their cars. The edge function
-- calls it with the service role before asking the model, to enforce the daily limit.
create function public.assistant_questions_since(p_owner uuid, p_since timestamptz) returns int
  language sql stable set search_path = ''
as $$
  select pg_catalog.count(*)::int
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.vehicles v on v.id = c.vehicle_id
   where v.owner_id = p_owner
     and m.role = 'user'
     and m.created_at >= p_since
$$;

-- Only the server may count, so owners cannot probe other owners' activity.
revoke all on function public.assistant_questions_since(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.assistant_questions_since(uuid, timestamptz) to service_role;
