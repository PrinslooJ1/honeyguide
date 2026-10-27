-- Honeyguide release 1.4: mentor mode (hive shares and comments), landowner log,
-- equipment and cleaning log, and the opt-in anonymous loss survey.

-- ---------- groups: a name members can see, and what kind of share it is ----------
alter table public.groups add column if not exists owner_name text;
alter table public.groups add column if not exists kind text not null default 'apiaries';
alter table public.groups add constraint groups_kind_check check (kind in ('apiaries', 'mentor'));

-- ---------- hive-level shares (mentor mode: one hive, viewer, time-limited) ----------
create table public.group_hives (
  group_id uuid not null references public.groups(id) on delete cascade,
  hive_id uuid not null references public.hives(id) on delete cascade,
  primary key (group_id, hive_id)
);
create index group_hives_hive_id_idx on public.group_hives (hive_id);
alter table public.group_hives enable row level security;
create policy "shared hives visible within group" on public.group_hives for select to authenticated
  using (private.is_group_owner(group_id) or private.is_group_member(group_id));
create policy "apiary owner shares a hive" on public.group_hives for insert to authenticated
  with check (private.is_group_owner(group_id) and exists (
    select 1 from public.hives h join public.apiaries a on a.id = h.apiary_id
    where h.id = hive_id and a.owner_id = (select auth.uid())));
create policy "owner unshares a hive" on public.group_hives for delete to authenticated using (private.is_group_owner(group_id));

-- Access to a hive: through its apiary, or through a direct hive share that has not expired.
create or replace function private.can_access_hive(p_hive uuid, min_role text default 'viewer') returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_access_apiary(private.hive_apiary(p_hive), min_role)
      or exists (
        select 1 from public.group_hives gh
        join public.group_members m on m.group_id = gh.group_id
        where gh.hive_id = p_hive and m.user_id = auth.uid()
          and (m.expires_at is null or m.expires_at > now())
          and public.role_rank(m.role) >= public.role_rank(min_role)
      )
$$;
revoke all on function private.can_access_hive(uuid, text) from public, anon;
grant execute on function private.can_access_hive(uuid, text) to authenticated, service_role;

-- Read rules must also pass for a row being inserted, because the API returns it
-- (INSERT ... RETURNING checks the SELECT policy against the new row). A helper that looks
-- the row up by id cannot see it yet, so each rule first checks the row's own columns.
drop policy "apiaries visible to owner and group" on public.apiaries;
create policy "apiaries visible to owner and group" on public.apiaries for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_access_apiary(id, 'viewer'));

-- Hive-level records now follow can_access_hive, so a mentor sees the shared hive and nothing else.
drop policy "hives visible to group" on public.hives;
create policy "hives visible to group" on public.hives for select to authenticated
  using (private.can_access_apiary(apiary_id, 'viewer') or private.can_access_hive(id, 'viewer'));
drop policy "hives edited by owner and partners" on public.hives;
create policy "hives edited by owner and partners" on public.hives for update to authenticated
  using (private.can_access_hive(id, 'partner'))
  with check (private.can_access_apiary(apiary_id, 'partner') or (apiary_id = private.hive_apiary(id) and private.can_access_hive(id, 'partner')));

drop policy "inspections visible to group" on public.inspections;
create policy "inspections visible to group" on public.inspections for select to authenticated using (private.can_access_hive(hive_id, 'viewer'));
drop policy "inspections logged by helpers and up" on public.inspections;
create policy "inspections logged by helpers and up" on public.inspections for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_access_hive(hive_id, 'helper'));

drop policy "photos visible to group" on public.photos;
create policy "photos visible to group" on public.photos for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_access_hive(hive_id, 'viewer'));
drop policy "photos added by owner, helpers and up" on public.photos;
create policy "photos added by owner, helpers and up" on public.photos for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and (
      (hive_id is not null and private.can_access_hive(hive_id, 'helper'))
      or (hive_id is null
          and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = (select auth.uid())))
          and (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and i.owner_id = (select auth.uid()))))
    )
  );

drop policy "weights visible to group" on public.weights;
create policy "weights visible to group" on public.weights for select to authenticated using (private.can_access_hive(hive_id, 'viewer'));
drop policy "weights added by helpers and up" on public.weights;
create policy "weights added by helpers and up" on public.weights for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_access_hive(hive_id, 'helper'));

drop policy "harvests visible to group" on public.harvests;
create policy "harvests visible to group" on public.harvests for select to authenticated using (private.can_access_hive(hive_id, 'viewer'));
drop policy "harvests logged by helpers and up" on public.harvests;
create policy "harvests logged by helpers and up" on public.harvests for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_access_hive(hive_id, 'helper'));

drop policy "group photos read" on storage.objects;
create policy "group photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p where p.storage_path = name and private.can_access_hive(p.hive_id, 'viewer')
  ));

-- ---------- only owners delete ----------
-- Records are soft-deleted (deleted = true), which is an update. Partners may edit, not delete.
create or replace function public.apiary_owner_deletes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.deleted and not old.deleted and old.owner_id <> auth.uid() then
    raise exception 'Only the owner can delete this apiary';
  end if;
  return new;
end; $$;
create trigger owner_deletes before update on public.apiaries for each row execute function public.apiary_owner_deletes();

create or replace function public.hive_owner_deletes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.deleted and not old.deleted and old.owner_id <> auth.uid()
     and not exists (select 1 from public.apiaries a where a.id = old.apiary_id and a.owner_id = auth.uid()) then
    raise exception 'Only the owner can delete this hive';
  end if;
  return new;
end; $$;
revoke all on function public.hive_owner_deletes() from public, anon, authenticated;
create trigger owner_deletes before update on public.hives for each row execute function public.hive_owner_deletes();

-- ---------- comments: a mentor's or partner's note on a hive or inspection ----------
create table public.comments (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hive_id uuid not null references public.hives(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  author_name text check (author_name is null or length(author_name) <= 80),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index comments_owner_id_updated_at_idx on public.comments (owner_id, updated_at);
create index comments_hive_id_idx on public.comments (hive_id);
create index comments_inspection_id_idx on public.comments (inspection_id);

-- ---------- landowner log: agreements and what happened at the site. Private to the owner. ----------
create table public.agreements (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apiary_id uuid references public.apiaries(id) on delete set null,
  landowner text not null,
  phone text,
  email text,
  kind text not null default 'verbal' check (kind in ('verbal', 'written', 'lease', 'pollination', 'other')),
  starts_on date,
  expires_on date,
  remind_days int not null default 30 check (remind_days between 0 and 365),
  terms text,
  notes text,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index agreements_owner_id_updated_at_idx on public.agreements (owner_id, updated_at);
create index agreements_apiary_id_idx on public.agreements (apiary_id);

create table public.site_events (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agreement_id uuid references public.agreements(id) on delete cascade,
  apiary_id uuid references public.apiaries(id) on delete set null,
  happened_at timestamptz not null,
  kind text not null check (kind in ('complaint', 'visit', 'payment', 'renewal', 'note')),
  person text,
  body text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index site_events_owner_id_updated_at_idx on public.site_events (owner_id, updated_at);
create index site_events_agreement_id_idx on public.site_events (agreement_id);
create index site_events_apiary_id_idx on public.site_events (apiary_id);

-- ---------- equipment and cleaning log. Private to the owner. ----------
create table public.equipment (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('brood_box', 'super', 'frames', 'floor', 'lid', 'excluder', 'feeder', 'nuc_box', 'smoker', 'hive_tool', 'suit', 'extractor', 'other')),
  qty int not null default 1 check (qty between 0 and 100000),
  status text not null default 'stored' check (status in ('in_use', 'stored', 'quarantine', 'retired')),
  hive_id uuid references public.hives(id) on delete set null,
  source_hive_id uuid references public.hives(id) on delete set null,
  last_cleaned_at timestamptz,
  clean_method text,
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array' and pg_column_size(history) < 20000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index equipment_owner_id_updated_at_idx on public.equipment (owner_id, updated_at);
create index equipment_hive_id_idx on public.equipment (hive_id);
create index equipment_source_hive_id_idx on public.equipment (source_hive_id);

do $$ declare t text; begin
  foreach t in array array['comments', 'agreements', 'site_events', 'equipment'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create trigger keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['agreements', 'site_events', 'equipment'] loop
    execute format('create policy "own rows select" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

create policy "comments visible to everyone on the hive" on public.comments for select to authenticated
  using (private.can_access_hive(hive_id, 'viewer'));
create policy "comments added by anyone on the hive" on public.comments for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_access_hive(hive_id, 'viewer'));
create policy "authors edit own comments" on public.comments for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "authors delete own comments" on public.comments for delete to authenticated
  using (owner_id = (select auth.uid()));

alter publication supabase_realtime add table public.comments;

-- ---------- opt-in anonymous end-of-season loss survey ----------
-- No user id, no apiary, no location below province, and only the date it was sent.
-- Answers arrive only through submit_loss_survey(); nobody can read them through the API
-- (researchers get an export). The table has row-level security and no policies at all.
create table public.loss_survey (
  id uuid primary key default gen_random_uuid(),
  season text not null check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  province text check (province is null or length(province) <= 40),
  operation text not null check (operation in ('stationary', 'migratory', 'both')),
  years_keeping text check (years_keeping is null or years_keeping in ('0-2', '3-5', '6-10', '10+')),
  colonies_start int not null check (colonies_start between 0 and 100000),
  colonies_end int check (colonies_end is null or colonies_end between 0 and 100000),
  colonies_lost int not null check (colonies_lost between 0 and 100000),
  swarms_caught int check (swarms_caught is null or swarms_caught between 0 and 100000),
  causes jsonb not null default '{}'::jsonb check (jsonb_typeof(causes) = 'object' and pg_column_size(causes) < 4000),
  app_version text check (app_version is null or length(app_version) <= 20),
  submitted_on date not null default current_date
);
alter table public.loss_survey enable row level security;

create or replace function public.submit_loss_survey(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.loss_survey (season, province, operation, years_keeping, colonies_start, colonies_end, colonies_lost, swarms_caught, causes, app_version)
  values (p->>'season', nullif(p->>'province', ''), p->>'operation', nullif(p->>'years_keeping', ''),
          (p->>'colonies_start')::int, (p->>'colonies_end')::int, (p->>'colonies_lost')::int, (p->>'swarms_caught')::int,
          coalesce(p->'causes', '{}'::jsonb), left(p->>'app_version', 20));
end; $$;
revoke all on function public.submit_loss_survey(jsonb) from public;
grant execute on function public.submit_loss_survey(jsonb) to anon, authenticated;
