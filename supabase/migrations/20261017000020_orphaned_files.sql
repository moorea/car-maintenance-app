-- Files left behind in the attachments bucket. Deleting a car or an account cascades to its
-- attachment rows, but Storage objects are not rows Postgres can cascade to, and Supabase only lets
-- the Storage API delete them (it removes the file as well as the row). So a scheduled job
-- (.github/workflows/sweep-files.yml) asks this function which files have no row and deletes
-- them through the Storage API.

-- A file is orphaned when no attachment row has its owner folder and id. The phone uploads a file
-- just before its row, so a file whose owner still exists is only orphaned once it is a day old:
-- a row still waiting to upload re-uploads its file anyway. A deleted owner's files go at once.
create function public.orphaned_files(max_files int default 1000) returns setof text
  language sql stable security definer set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and not exists (
      select 1 from public.attachments a
      where a.owner_id::text = (storage.foldername(o.name))[1]
        and a.id::text = storage.filename(o.name)
    )
    and (
      o.created_at < now() - interval '1 day'
      or not exists (
        select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1]
      )
    )
  order by o.created_at, o.name
  limit max_files
$$;

-- Only the sweep, which runs with the service role key, may list other people's files.
revoke all on function public.orphaned_files(int) from public, anon, authenticated, service_role;
grant execute on function public.orphaned_files(int) to service_role;
