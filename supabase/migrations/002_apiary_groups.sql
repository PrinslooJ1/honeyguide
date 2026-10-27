-- Honeyguide Phase 2: Apiary Groups. Share chosen apiaries with a partner beekeeper.
-- Roles: owner > partner > helper > viewer. Cover mode = a membership with an expiry date.
-- Exact GPS moves to its own table so it can be hidden from members who should only
-- see the approximate (about 1 km) point kept on the apiary row.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('partner','helper','viewer')),
  exact_location boolean not null default false,
  see_finances boolean not null default false,
  expires_at timestamptz,               -- set for Cover mode
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_apiaries (
  group_id uuid not null references public.groups(id) on delete cascade,
  apiary_id uuid not null references public.apiaries(id) on delete cascade,
  primary key (group_id, apiary_id)
);

create table public.group_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  group_id uuid not null references public.groups(id) on delete cascade,
  role text not null check (role in ('partner','helper','viewer')),
  exact_location boolean not null default false,
  cover_days int check (cover_days between 1 and 90),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 1 check (max_uses between 1 and 20),
  uses int not null default 0
);

create table public.apiary_locations (
  apiary_id uuid primary key references public.apiaries(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

create index on public.group_members (user_id);
create index on public.group_apiaries (apiary_id);
create index on public.group_invites (group_id);

-- ---------- access helpers ----------
create or replace function public.role_rank(r text) returns int
language sql immutable set search_path = '' as $$
  select case r when 'owner' then 4 when 'partner' then 3 when 'helper' then 2 when 'viewer' then 1 else 0 end
$$;

-- True when the signed-in user owns the apiary, or is a current member of a group it is shared with at min_role or above.
create or replace function public.can_access_apiary(p_apiary uuid, min_role text default 'viewer') returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.apiaries a where a.id = p_apiary and a.owner_id = auth.uid())
      or exists (
        select 1 from public.group_apiaries ga
        join public.group_members m on m.group_id = ga.group_id
        where ga.apiary_id = p_apiary and m.user_id = auth.uid()
          and (m.expires_at is null or m.expires_at > now())
          and public.role_rank(m.role) >= public.role_rank(min_role)
      )
$$;

create or replace function public.can_see_exact_location(p_apiary uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.apiaries a where a.id = p_apiary and a.owner_id = auth.uid())
      or exists (
        select 1 from public.group_apiaries ga
        join public.group_members m on m.group_id = ga.group_id
        where ga.apiary_id = p_apiary and m.user_id = auth.uid() and m.exact_location
          and (m.expires_at is null or m.expires_at > now())
      )
$$;

create or replace function public.hive_apiary(p_hive uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select apiary_id from public.hives where id = p_hive
$$;

create or replace function public.is_group_owner(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups g where g.id = p_group and g.owner_id = auth.uid())
$$;

create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid())
$$;

-- ---------- join by code (QR, WhatsApp link or the 6 characters read out) ----------
create or replace function public.join_group(p_code text, p_display_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.group_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from public.group_invites where code = upper(p_code) for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'This invite code is not valid or has expired';
  end if;
  if exists (select 1 from public.groups where id = inv.group_id and owner_id = auth.uid()) then
    return inv.group_id;
  end if;
  insert into public.group_members (group_id, user_id, display_name, role, exact_location, expires_at)
  values (inv.group_id, auth.uid(), p_display_name, inv.role, inv.exact_location,
          case when inv.cover_days is null then null else now() + make_interval(days => inv.cover_days) end)
  on conflict (group_id, user_id) do update
    set role = excluded.role, exact_location = excluded.exact_location, expires_at = excluded.expires_at;
  update public.group_invites set uses = uses + 1 where code = inv.code;
  return inv.group_id;
end; $$;
revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.join_group(text, text) to authenticated;

-- ---------- row-level security ----------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_apiaries enable row level security;
alter table public.group_invites enable row level security;
alter table public.apiary_locations enable row level security;

create policy "groups visible to owner and members" on public.groups for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));
create policy "groups created by owner" on public.groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "groups changed by owner" on public.groups for update to authenticated using (owner_id = (select auth.uid()));
create policy "groups deleted by owner" on public.groups for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members visible within group" on public.group_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id) or public.is_group_member(group_id));
create policy "owner changes members" on public.group_members for update to authenticated using (public.is_group_owner(group_id));
create policy "owner removes members, members leave" on public.group_members for delete to authenticated
  using (public.is_group_owner(group_id) or user_id = (select auth.uid()));
-- Members are added only through join_group().

create policy "shared apiaries visible within group" on public.group_apiaries for select to authenticated
  using (public.is_group_owner(group_id) or public.is_group_member(group_id));
create policy "owner shares own apiaries" on public.group_apiaries for insert to authenticated
  with check (public.is_group_owner(group_id) and exists (select 1 from public.apiaries a where a.id = apiary_id and a.owner_id = (select auth.uid())));
create policy "owner unshares" on public.group_apiaries for delete to authenticated using (public.is_group_owner(group_id));

create policy "owner manages invites" on public.group_invites for all to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));

create policy "exact location for owner and trusted members" on public.apiary_locations for select to authenticated
  using (public.can_see_exact_location(apiary_id));
create policy "owner writes exact location" on public.apiary_locations for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.apiaries a where a.id = apiary_id and a.owner_id = (select auth.uid())));

-- Replace the Phase 1 own-rows policies with group-aware ones.
drop policy "own rows select" on public.apiaries;
drop policy "own rows update" on public.apiaries;
create policy "apiaries visible to owner and group" on public.apiaries for select to authenticated using (public.can_access_apiary(id, 'viewer'));
create policy "apiaries edited by owner and partners" on public.apiaries for update to authenticated
  using (public.can_access_apiary(id, 'partner')) with check (public.can_access_apiary(id, 'partner'));

drop policy "own rows select" on public.hives;
drop policy "own rows insert" on public.hives;
drop policy "own rows update" on public.hives;
create policy "hives visible to group" on public.hives for select to authenticated using (public.can_access_apiary(apiary_id, 'viewer'));
create policy "hives added by owner and partners" on public.hives for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_access_apiary(apiary_id, 'partner'));
create policy "hives edited by owner and partners" on public.hives for update to authenticated
  using (public.can_access_apiary(apiary_id, 'partner')) with check (public.can_access_apiary(apiary_id, 'partner'));

drop policy "own rows select" on public.inspections;
drop policy "own rows insert" on public.inspections;
create policy "inspections visible to group" on public.inspections for select to authenticated
  using (public.can_access_apiary(public.hive_apiary(hive_id), 'viewer'));
create policy "inspections logged by helpers and up" on public.inspections for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_access_apiary(public.hive_apiary(hive_id), 'helper'));

drop policy "own rows select" on public.photos;
drop policy "own rows insert" on public.photos;
create policy "photos visible to group" on public.photos for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_access_apiary(public.hive_apiary(hive_id), 'viewer'));
create policy "photos added by helpers and up" on public.photos for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_access_apiary(public.hive_apiary(hive_id), 'helper'));

-- Photo files: group members may read files whose photo row they can see.
create policy "group photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p where p.storage_path = name and public.can_access_apiary(public.hive_apiary(p.hive_id), 'viewer')
  ));

do $$ declare t text; begin
  foreach t in array array['groups','apiary_locations'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Nobody can hand a record to someone else, or take one over, by rewriting owner_id.
create or replace function public.keep_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception 'owner_id cannot be changed'; end if;
  return new;
end; $$;
do $$ declare t text; begin
  foreach t in array array['profiles','apiaries','hives','inspections','photos','groups','apiary_locations'] loop
    execute format('create trigger keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
  end loop;
end $$;

-- Live updates for the activity feed.
alter publication supabase_realtime add table public.inspections, public.hives, public.photos;
