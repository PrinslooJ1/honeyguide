-- Honeyguide Phase 1: private hive log. Every row belongs to one user.
-- Client generates UUIDs so records can be created offline.

create table public.profiles (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  province text,
  registration_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.apiaries (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  province text,
  lat double precision,
  lng double precision,
  location_precision text check (location_precision in ('off','approximate','precise')),
  landowner text,
  permission_notes text,
  forage_notes text,
  access_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.hives (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apiary_id uuid not null references public.apiaries(id) on delete cascade,
  name text not null,
  code text,
  hive_type text,
  subspecies text,
  queen_year int,
  queen_marked boolean,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.inspections (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hive_id uuid not null references public.hives(id) on delete cascade,
  inspected_at timestamptz not null,
  temperament text,
  queen_status text[],
  brood_frames int,
  brood_pattern text,
  honey_frames int,
  pollen_frames int,
  space text,
  pests text[],
  afb_suspect boolean not null default false,
  actions text[],
  notes text,
  score int,
  weather jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table public.photos (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hive_id uuid references public.hives(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  tag text,
  storage_path text,
  width int,
  height int,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index on public.profiles (owner_id, updated_at);
create index on public.apiaries (owner_id, updated_at);
create index on public.hives (owner_id, updated_at);
create index on public.hives (apiary_id);
create index on public.inspections (owner_id, updated_at);
create index on public.inspections (hive_id);
create index on public.photos (owner_id, updated_at);
create index on public.photos (hive_id);
create index on public.photos (inspection_id);

-- The server stamps updated_at, so pull cursors are trustworthy.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

do $$ declare t text; begin
  foreach t in array array['profiles','apiaries','hives','inspections','photos'] loop
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Private photo bucket: each user can only reach files under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Account deletion (Google Play requirement). The app removes the user's photo
-- files through the Storage API first, then calls this; table rows cascade.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
