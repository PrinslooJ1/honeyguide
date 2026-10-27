-- Honeyguide: hardening after the first database security and performance check.
-- 1. The access-check helpers used inside row-level security move to a private schema,
--    so they can no longer be called through the public API. Policies keep working
--    because they refer to the functions themselves, not to their names.
-- 2. Indexes for foreign keys that had none.
-- 3. One policy per action where two overlapped (photos insert, exact locations).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.can_access_apiary(uuid, text) set schema private;
alter function public.can_see_exact_location(uuid) set schema private;
alter function public.hive_apiary(uuid) set schema private;
alter function public.is_group_owner(uuid) set schema private;
alter function public.is_group_member(uuid) set schema private;

revoke all on function private.can_access_apiary(uuid, text) from public, anon;
revoke all on function private.can_see_exact_location(uuid) from public, anon;
revoke all on function private.hive_apiary(uuid) from public, anon;
revoke all on function private.is_group_owner(uuid) from public, anon;
revoke all on function private.is_group_member(uuid) from public, anon;
grant execute on function private.can_access_apiary(uuid, text) to authenticated, service_role;
grant execute on function private.can_see_exact_location(uuid) to authenticated, service_role;
grant execute on function private.hive_apiary(uuid) to authenticated, service_role;
grant execute on function private.is_group_owner(uuid) to authenticated, service_role;
grant execute on function private.is_group_member(uuid) to authenticated, service_role;

-- role_rank is a plain lookup (owner 4 ... viewer 1) and stays in public; keep it off the anon role.
revoke all on function public.role_rank(text) from public, anon;
grant execute on function public.role_rank(text) to authenticated, service_role;

-- Foreign keys without a covering index.
create index if not exists apiary_locations_owner_id_idx on public.apiary_locations (owner_id);
create index if not exists blooms_apiary_id_idx on public.blooms (apiary_id);
create index if not exists contracts_apiary_id_idx on public.contracts (apiary_id);
create index if not exists group_invites_created_by_idx on public.group_invites (created_by);
create index if not exists groups_owner_id_idx on public.groups (owner_id);
create index if not exists incidents_apiary_id_idx on public.incidents (apiary_id);
create index if not exists jobs_hive_id_idx on public.jobs (hive_id);
create index if not exists moves_from_apiary_id_idx on public.moves (from_apiary_id);
create index if not exists moves_to_apiary_id_idx on public.moves (to_apiary_id);
create index if not exists traps_apiary_id_idx on public.traps (apiary_id);
create index if not exists traps_hive_id_idx on public.traps (hive_id);

-- Exact locations: the owner's write policy was FOR ALL, which overlapped the read policy.
drop policy "owner writes exact location" on public.apiary_locations;
create policy "owner adds exact location" on public.apiary_locations for insert to authenticated
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.apiaries a where a.id = apiary_id and a.owner_id = (select auth.uid())));
create policy "owner changes exact location" on public.apiary_locations for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.apiaries a where a.id = apiary_id and a.owner_id = (select auth.uid())));
create policy "owner removes exact location" on public.apiary_locations for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Photos: one insert policy. A hive photo needs helper access or better to that hive's apiary;
-- a photo with no hive (bee-removal job, incident) must belong to the user's own job or incident.
drop policy "photos added by helpers and up" on public.photos;
drop policy "own unlinked photos insert" on public.photos;
create policy "photos added by owner, helpers and up" on public.photos for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and (
      (hive_id is not null and private.can_access_apiary(private.hive_apiary(hive_id), 'helper'))
      or (hive_id is null
          and (job_id is null or exists (select 1 from public.jobs j where j.id = job_id and j.owner_id = (select auth.uid())))
          and (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and i.owner_id = (select auth.uid()))))
    )
  );
