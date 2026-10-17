-- The phone describes the owner's car (decoded from its VIN, or typed in) and the server matches
-- that description to the shared vehicle_configs row that carries its schedule and recalls. Users
-- cannot write vehicle_configs, so a trigger finds or creates the config on their behalf. This
-- keeps adding a car offline-first: the phone writes one vehicles row and the config_id arrives
-- with the next sync.

alter table public.vehicles
  add column year       int,
  add column make       text,
  add column model      text,
  add column trim       text,
  add column engine     text,
  add column drivetrain text;

update public.vehicles v
   set year = c.year, make = c.make, model = c.model,
       trim = c.trim, engine = c.engine, drivetrain = c.drivetrain
  from public.vehicle_configs c
 where c.id = v.config_id;

alter table public.vehicles
  alter column year set not null,
  alter column make set not null,
  alter column model set not null,
  -- Null only for a description the server could not match, which the trigger never leaves.
  alter column config_id drop not null,
  add constraint vehicles_year_check check (year between 1981 and 2100),
  add constraint vehicles_make_check check (length(make) between 1 and 60),
  add constraint vehicles_model_check check (length(model) between 1 and 60),
  add constraint vehicles_trim_check check (length(trim) between 1 and 60),
  add constraint vehicles_engine_check check (length(engine) between 1 and 60),
  add constraint vehicles_drivetrain_check check (length(drivetrain) between 1 and 60),
  add constraint vehicles_nickname_check check (length(nickname) between 1 and 40);

-- Sets config_id from the description, ignoring any config_id the client sent. Matches ignore
-- case, so "HONDA" and "Honda" share one config.
create function public.assign_vehicle_config() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.year is null or new.make is null or new.model is null then
    return new;  -- the not-null constraints reject the row
  end if;

  select c.id into new.config_id
    from public.vehicle_configs c
   where c.year = new.year
     and lower(c.make) = lower(new.make)
     and lower(c.model) = lower(new.model)
     and lower(c.trim) is not distinct from lower(new.trim)
     and lower(c.engine) is not distinct from lower(new.engine)
     and lower(c.drivetrain) is not distinct from lower(new.drivetrain)
   order by c.id
   limit 1;

  if new.config_id is null then
    insert into public.vehicle_configs (make, model, year, trim, engine, drivetrain)
    values (new.make, new.model, new.year, new.trim, new.engine, new.drivetrain)
    on conflict do nothing
    returning id into new.config_id;
  end if;

  if new.config_id is null then
    -- Another owner created the same config at the same moment.
    select c.id into new.config_id
      from public.vehicle_configs c
     where (c.make, c.model, c.year) = (new.make, new.model, new.year)
       and c.trim is not distinct from new.trim
       and c.engine is not distinct from new.engine
       and c.drivetrain is not distinct from new.drivetrain;
  end if;

  return new;
end
$$;

revoke all on function public.assign_vehicle_config() from public, anon, authenticated;

create trigger assign_config
  before insert or update of year, make, model, trim, engine, drivetrain, config_id
  on public.vehicles
  for each row execute function public.assign_vehicle_config();
