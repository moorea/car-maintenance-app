-- Owners can delete their own account from the app, as the App Store requires. Deleting the
-- auth user removes everything stored for them: vehicles, odometer readings, service records,
-- reminders and assistant conversations cascade from it, and so do their sessions and refresh
-- tokens. Shared reference data (configs, schedules, recalls) is not theirs and stays.

-- Deletes the calling owner's account and all their data. Runs as the function's owner because
-- owners cannot touch auth.users themselves; it only ever deletes the caller.
create function public.delete_account() returns void
  language plpgsql volatile security definer set search_path = ''
as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = owner;
end;
$$;

revoke all on function public.delete_account() from public, anon, authenticated, service_role;
grant execute on function public.delete_account() to authenticated;
