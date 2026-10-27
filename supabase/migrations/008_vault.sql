-- Honeyguide release 1.4: the Vault (optional end-to-end encryption).
-- The phone encrypts exact pins, landowner details and money fields with a key only the beekeeper
-- holds. The server stores the ciphertext in `enc` and placeholders in the plain columns.
-- profiles.vault holds the data key wrapped by the beekeeper's passphrase, so another phone can
-- unlock it with the passphrase. The server never sees the passphrase or the key.

alter table public.profiles add column if not exists vault jsonb
  check (vault is null or (jsonb_typeof(vault) = 'object' and pg_column_size(vault) < 4000));
alter table public.profiles add column if not exists enc text check (enc is null or length(enc) < 20000);

do $$ declare t text; begin
  foreach t in array array['agreements', 'site_events', 'contracts', 'jobs', 'moves', 'traps', 'apiary_locations'] loop
    execute format('alter table public.%I add column if not exists enc text check (enc is null or length(enc) < 20000)', t);
  end loop;
end $$;

-- An encrypted exact pin keeps no coordinates in the clear.
alter table public.apiary_locations alter column lat drop not null;
alter table public.apiary_locations alter column lng drop not null;
alter table public.apiary_locations add constraint apiary_locations_point_or_enc
  check ((lat is not null and lng is not null) or enc is not null);
