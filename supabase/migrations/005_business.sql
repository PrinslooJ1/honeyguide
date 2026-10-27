-- Honeyguide releases 1.2 and 1.3: moves, pollination contracts, harvests, honey batches
-- with a public passport, bee-removal jobs and incidents. Business records are private to
-- their owner; harvests follow the hive like weights. The passport exposes only what the
-- owner switches on, and never a location.

alter table public.profiles add column if not exists invoice_details text;
alter table public.profiles add column if not exists public_contact text;
alter table public.photos add column if not exists job_id uuid;
alter table public.photos add column if not exists incident_id uuid;

create table public.moves (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_apiary_id uuid not null references public.apiaries(id) on delete cascade,
  to_apiary_id uuid not null references public.apiaries(id) on delete cascade,
  hive_ids uuid[] not null default '{}',
  planned_for date not null,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  moved_at timestamptz,
  distance_km numeric(8,1),
  cost_per_km numeric(8,2),
  other_costs numeric(10,2),
  checklist text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.contracts (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grower text not null,
  farm text,
  contact text,
  crop text not null,
  hives int not null check (hives between 0 and 10000),
  fee_per_hive numeric(10,2) not null default 0,
  starts_on date,
  ends_on date,
  apiary_id uuid references public.apiaries(id) on delete set null,
  spray_agreed boolean not null default false,
  spray_notes text,
  status text not null default 'draft' check (status in ('draft','agreed','placed','completed','invoiced','paid')),
  invoice_no text,
  invoiced_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.batches (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^HB-[A-Z0-9]{4,8}$'),
  name text not null,
  forage text,
  province text,
  harvest_month date,
  jars int,
  jar_size_g int,
  public boolean not null default false,
  show_reg boolean not null default false,
  show_contact boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.harvests (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hive_id uuid not null references public.hives(id) on delete cascade,
  harvested_at timestamptz not null,
  kg numeric(7,2) not null check (kg >= 0 and kg <= 1000),
  frames int,
  forage text,
  moisture numeric(4,1) check (moisture is null or moisture between 0 and 40),
  batch_id uuid references public.batches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.jobs (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_name text not null,
  client_phone text,
  area text,
  requested_at timestamptz not null,
  done_at timestamptz,
  outcome text check (outcome is null or outcome in ('removed_live','relocated','not_bees','no_access','referred','other')),
  fee numeric(10,2),
  paid boolean not null default false,
  invoice_no text,
  hive_id uuid references public.hives(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.incidents (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('theft','vandalism','fire','flood','honey_badger','other')),
  occurred_at timestamptz not null,
  apiary_id uuid references public.apiaries(id) on delete set null,
  hive_ids uuid[] not null default '{}',
  description text,
  saps_case_no text,
  reported_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

alter table public.photos add constraint photos_job_fk foreign key (job_id) references public.jobs(id) on delete cascade;
alter table public.photos add constraint photos_incident_fk foreign key (incident_id) references public.incidents(id) on delete cascade;

create index on public.moves (owner_id, updated_at);
create index on public.contracts (owner_id, updated_at);
create index on public.batches (owner_id, updated_at);
create index on public.harvests (owner_id, updated_at);
create index on public.harvests (hive_id);
create index on public.harvests (batch_id);
create index on public.jobs (owner_id, updated_at);
create index on public.incidents (owner_id, updated_at);
create index on public.photos (job_id);
create index on public.photos (incident_id);

do $$ declare t text; begin
  foreach t in array array['moves','contracts','batches','harvests','jobs','incidents'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create trigger keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Owner-only: plans, money, clients, incidents and batches.
  foreach t in array array['moves','contracts','batches','jobs','incidents'] loop
    execute format('create policy "own rows select" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Photos for jobs and incidents have no hive: the owner may add those for themselves.
create policy "own unlinked photos insert" on public.photos for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and hive_id is null
    and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = (select auth.uid())))
    and (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and i.owner_id = (select auth.uid())))
  );

-- Harvests follow the hive: group members see them, helpers and up can log them.
create policy "harvests visible to group" on public.harvests for select to authenticated
  using (public.can_access_apiary(public.hive_apiary(hive_id), 'viewer'));
create policy "harvests logged by helpers and up" on public.harvests for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_access_apiary(public.hive_apiary(hive_id), 'helper'));
create policy "own harvests update" on public.harvests for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own harvests delete" on public.harvests for delete to authenticated using (owner_id = (select auth.uid()));

-- Public honey passport: anyone with the jar's code may read these fields, and only when
-- the owner has made the batch public. No location, no names beyond what the owner chose.
create or replace function public.get_passport(p_code text)
returns table (name text, forage text, province text, harvest_month date, jar_size_g int, total_kg numeric, registration_number text, contact text)
language sql stable security definer set search_path = '' as $$
  select b.name, b.forage, b.province, b.harvest_month, b.jar_size_g,
         (select round(sum(h.kg), 1) from public.harvests h where h.batch_id = b.id and not h.deleted),
         case when b.show_reg then (select p.registration_number from public.profiles p where p.owner_id = b.owner_id and not p.deleted order by p.updated_at desc limit 1) end,
         case when b.show_contact then (select p.public_contact from public.profiles p where p.owner_id = b.owner_id and not p.deleted order by p.updated_at desc limit 1) end
  from public.batches b
  where b.code = upper(p_code) and b.public and not b.deleted
$$;
revoke all on function public.get_passport(text) from public;
grant execute on function public.get_passport(text) to anon, authenticated;
