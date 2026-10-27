-- Honeyguide Phase 3: forage tags per apiary and Bloom Watch sightings.
alter table public.apiaries add column if not exists forage_plants text[];

create table public.blooms (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plant_id text not null,
  apiary_id uuid references public.apiaries(id) on delete set null,
  province text,
  seen_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index on public.blooms (owner_id, updated_at);
create index on public.blooms (province, plant_id, seen_at);

create trigger touch before insert or update on public.blooms for each row execute function public.touch_updated_at();
create trigger keep_owner before update on public.blooms for each row execute function public.keep_owner();
alter table public.blooms enable row level security;
create policy "own blooms select" on public.blooms for select to authenticated using (owner_id = (select auth.uid()));
create policy "own blooms insert" on public.blooms for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "own blooms update" on public.blooms for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "own blooms delete" on public.blooms for delete to authenticated using (owner_id = (select auth.uid()));

-- Regional bloom map: counts per province, plant and ISO week. No names, no apiaries, no locations.
-- Only provinces with at least 3 sightings in a week appear, so a single beekeeper cannot be picked out.
create or replace function public.regional_blooms(p_province text, p_weeks int default 4)
returns table (plant_id text, week date, sightings bigint)
language sql stable security definer set search_path = '' as $$
  select b.plant_id, date_trunc('week', b.seen_at)::date as week, count(*) as sightings
  from public.blooms b
  where b.province = p_province and not b.deleted and b.seen_at > now() - make_interval(weeks => least(p_weeks, 12))
  group by 1, 2
  having count(*) >= 3
  order by 2 desc, 3 desc
$$;
revoke all on function public.regional_blooms(text, int) from public, anon;
grant execute on function public.regional_blooms(text, int) to authenticated;
