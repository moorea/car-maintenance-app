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

-- One config per description, ignoring case, so "HONDA" and "Honda" can never both be created,
-- even by two owners at the same moment. Also the index for the trigger's lookup.
create unique index vehicle_configs_description on public.vehicle_configs
  (year, lower(make), lower(model), lower(trim), lower(engine), lower(drivetrain)) nulls not distinct;

-- Sets config_id from the description, ignoring any config_id the client sent on insert.
create function public.assign_vehicle_config() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.year is null or new.make is null or new.model is null then
    return new;  -- the not-null constraints reject the row
  end if;

  -- Twice at most: the second time finds the config another owner created at the same moment.
  for attempt in 1..2 loop
    select c.id into new.config_id
      from public.vehicle_configs c
     where c.year = new.year
       and lower(c.make) = lower(new.make)
       and lower(c.model) = lower(new.model)
       and lower(c.trim) is not distinct from lower(new.trim)
       and lower(c.engine) is not distinct from lower(new.engine)
       and lower(c.drivetrain) is not distinct from lower(new.drivetrain);
    exit when new.config_id is not null;

    insert into public.vehicle_configs (make, model, year, trim, engine, drivetrain)
    values (new.make, new.model, new.year, new.trim, new.engine, new.drivetrain)
    on conflict (year, lower(make), lower(model), lower(trim), lower(engine), lower(drivetrain))
      do nothing
    returning id into new.config_id;
    exit when new.config_id is not null;
  end loop;

  return new;
end
$$;

revoke all on function public.assign_vehicle_config() from public, anon, authenticated;

-- Re-matches when the description changes. Server jobs may point a car at another config by
-- setting config_id alone; owners cannot, as they have no update privilege on that column.
create trigger assign_config
  before insert or update of year, make, model, trim, engine, drivetrain
  on public.vehicles
  for each row execute function public.assign_vehicle_config();

revoke update on public.vehicles from authenticated;
grant update (id, owner_id, vin, year, make, model, trim, engine, drivetrain, nickname,
              severe_duty, updated_at)
  on public.vehicles to authenticated;
