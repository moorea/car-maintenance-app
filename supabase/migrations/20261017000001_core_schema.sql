-- Core schema. Shared knowledge is keyed by vehicle_configs and readable by any signed-in user;
-- owner data is keyed by vehicles and readable only by the owner (row-level security).

create table public.vehicle_configs (
  id         uuid primary key default gen_random_uuid(),
  make       text not null,
  model      text not null,
  year       int  not null check (year between 1981 and 2100),
  trim       text,
  engine     text,
  drivetrain text,
  unique nulls not distinct (make, model, year, trim, engine, drivetrain)
);

create table public.maintenance_items (
  id              uuid primary key default gen_random_uuid(),
  config_id       uuid not null references public.vehicle_configs on delete cascade,
  task            text not null,
  interval_miles  int check (interval_miles > 0),
  interval_months int check (interval_months > 0),
  severe_miles    int check (severe_miles > 0),
  severe_months   int check (severe_months > 0),
  source          text not null
);
create index on public.maintenance_items (config_id);

create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  config_id   uuid not null references public.vehicle_configs,
  vin         text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  nickname    text not null,
  severe_duty boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (owner_id, vin)
);
create index on public.vehicles (owner_id);

create table public.odometer_readings (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles on delete cascade,
  read_on    date not null,
  miles      int  not null check (miles >= 0),
  source     text not null default 'manual' check (source in ('manual', 'photo', 'connected'))
);
create index on public.odometer_readings (vehicle_id, read_on);

-- Append-only from the app: no update policy, so two devices never overwrite history.
create table public.service_records (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicles on delete cascade,
  item_id        uuid references public.maintenance_items,
  performed_on   date not null,
  odometer_miles int check (odometer_miles >= 0),
  cost_cents     int check (cost_cents >= 0),
  shop           text,
  notes          text,
  receipt_path   text,
  created_at     timestamptz not null default now()
);
create index on public.service_records (vehicle_id, performed_on desc);

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles on delete cascade,
  item_id     uuid not null references public.maintenance_items on delete cascade,
  due_on      date not null,
  due_miles   int,
  status      text not null check (status in ('upcoming', 'due-soon', 'overdue', 'snoozed', 'done')),
  updated_at  timestamptz not null default now(),
  unique (vehicle_id, item_id)
);

create table public.recalls (
  id            uuid primary key default gen_random_uuid(),
  config_id     uuid not null references public.vehicle_configs on delete cascade,
  campaign      text not null,
  component     text,
  summary       text not null,
  remedy        text,
  reported_on   date,
  unique (config_id, campaign)
);

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         jsonb not null,
  created_at      timestamptz not null default now()
);
create index on public.messages (conversation_id, id);

-- Row-level security ---------------------------------------------------------------------------

create function public.owns_vehicle(v uuid) returns boolean
  language sql stable security invoker
  as $$ select exists (select 1 from public.vehicles where id = v and owner_id = auth.uid()) $$;

alter table public.vehicle_configs   enable row level security;
alter table public.maintenance_items enable row level security;
alter table public.recalls           enable row level security;
alter table public.vehicles          enable row level security;
alter table public.odometer_readings enable row level security;
alter table public.service_records   enable row level security;
alter table public.reminders         enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;

-- Shared knowledge: read-only for signed-in users; written by ingestion jobs with the service role.
create policy read_shared on public.vehicle_configs   for select to authenticated using (true);
create policy read_shared on public.maintenance_items for select to authenticated using (true);
create policy read_shared on public.recalls           for select to authenticated using (true);

create policy owner_all on public.vehicles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy owner_read on public.odometer_readings for select to authenticated
  using (public.owns_vehicle(vehicle_id));
create policy owner_insert on public.odometer_readings for insert to authenticated
  with check (public.owns_vehicle(vehicle_id));

create policy owner_read on public.service_records for select to authenticated
  using (public.owns_vehicle(vehicle_id));
create policy owner_insert on public.service_records for insert to authenticated
  with check (public.owns_vehicle(vehicle_id));
create policy owner_delete on public.service_records for delete to authenticated
  using (public.owns_vehicle(vehicle_id));

-- Reminders are computed server-side; owners only read them (and snooze via an edge function).
create policy owner_read on public.reminders for select to authenticated
  using (public.owns_vehicle(vehicle_id));

create policy owner_all on public.conversations for all to authenticated
  using (public.owns_vehicle(vehicle_id)) with check (public.owns_vehicle(vehicle_id));

-- Messages are written by the assistant edge function with the service role, so owners only read.
create policy owner_read on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c
          where c.id = conversation_id and public.owns_vehicle(c.vehicle_id))
);
