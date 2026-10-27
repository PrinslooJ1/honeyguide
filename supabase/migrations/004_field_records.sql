-- Honeyguide release 1.1: swarm traps, colony autopsy, weight and lift log.
alter table public.hives add column if not exists loss_cause text;
alter table public.hives add column if not exists lost_at timestamptz;

create table public.traps (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  apiary_id uuid references public.apiaries(id) on delete set null,
  location_note text,
  lat double precision,
  lng double precision,
  lure text,
  placed_at timestamptz not null,
  check_every_days int not null default 7 check (check_every_days between 1 and 60),
  last_checked_at timestamptz,
  status text not null default 'set' check (status in ('set','occupied','collected','removed')),
  caught_at timestamptz,
  hive_id uuid references public.hives(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index on public.traps (owner_id, updated_at);

create table public.weights (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hive_id uuid not null references public.hives(id) on delete cascade,
  weighed_at timestamptz not null,
  kg numeric(6,2) check (kg is null or kg between 0 and 500),
  lift text check (lift is null or lift in ('light','medium','heavy')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  check (kg is not null or lift is not null)
);
create index on public.weights (owner_id, updated_at);
create index on public.weights (hive_id);

do $$ declare t text; begin
  foreach t in array array['traps','weights'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create trigger keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Traps are private to their owner (like exact apiary pins).
create policy "own traps select" on public.traps for select to authenticated using (owner_id = (select auth.uid()));
create policy "own traps insert" on public.traps for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own traps update" on public.traps for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own traps delete" on public.traps for delete to authenticated using (owner_id = (select auth.uid()));

-- Weights follow the hive: group members see them, helpers and up can add them.
create policy "weights visible to group" on public.weights for select to authenticated
  using (public.can_access_apiary(public.hive_apiary(hive_id), 'viewer'));
create policy "weights added by helpers and up" on public.weights for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_access_apiary(public.hive_apiary(hive_id), 'helper'));
create policy "own weights update" on public.weights for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own weights delete" on public.weights for delete to authenticated using (owner_id = (select auth.uid()));
