set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
insert into incidents (id,kind,occurred_at) values ('66666666-0000-0000-0000-00000000000a','theft',now());
insert into jobs (id,client_name,requested_at) values ('77777777-0000-0000-0000-00000000000a','Client',now());
insert into photos (id,incident_id,tag) values (gen_random_uuid(),'66666666-0000-0000-0000-00000000000a','Site');
insert into photos (id,job_id,tag) values (gen_random_uuid(),'77777777-0000-0000-0000-00000000000a','Before');
insert into photos (id,hive_id,tag) values (gen_random_uuid(),'22222222-0000-0000-0000-00000000000a','Brood');
select 'owner photos saved (expect 3)', count(*) from photos;
update apiary_locations set lat=-33.935 where apiary_id='11111111-0000-0000-0000-00000000000a';
select 'owner moved exact pin (expect -33.935)', lat from apiary_locations;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000004',false);
\echo 'stranger photo on owner incident (expect RLS error):'
insert into photos (id,incident_id,tag) values (gen_random_uuid(),'66666666-0000-0000-0000-00000000000a','x');
\echo 'stranger photo on owner hive (expect RLS error):'
insert into photos (id,hive_id,tag) values (gen_random_uuid(),'22222222-0000-0000-0000-00000000000a','x');
select 'stranger sees photos, locations (expect 0 0)', (select count(*) from photos), (select count(*) from apiary_locations);
\echo 'stranger calls a private helper directly in SQL (works; the API does not expose the private schema):'
select private.hive_apiary('22222222-0000-0000-0000-00000000000a');
\echo 'authenticated calls via old public name (expect does not exist):'
select public.can_access_apiary('11111111-0000-0000-0000-00000000000a','viewer');
reset role;
set role anon;
\echo 'anon calls a private helper (expect permission error):'
select private.can_access_apiary('11111111-0000-0000-0000-00000000000a','viewer');
