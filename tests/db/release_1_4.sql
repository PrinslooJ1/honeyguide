\set ON_ERROR_STOP 0
\set QUIET 1
insert into auth.users values
 ('aaaaaaaa-0000-0000-0000-000000000001','owner@x'),('bbbbbbbb-0000-0000-0000-000000000002','partner@x'),
 ('eeeeeeee-0000-0000-0000-000000000005','mentor@x');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
set role authenticated;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into apiaries (id,name) values ('11111111-0000-0000-0000-00000000000a','X farm'),('11111111-0000-0000-0000-00000000000b','Y private');
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000a','H1'),
 ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-00000000000a','H2'),('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-00000000000b','H3');
insert into inspections (id,hive_id,inspected_at,score) values ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001',now(),80),
 ('33333333-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000002',now(),70);
insert into photos (id,hive_id,tag,storage_path) values ('55555555-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','Brood','aaaaaaaa-0000-0000-0000-000000000001/p1.jpg');
insert into storage.objects (bucket_id,name) values ('photos','aaaaaaaa-0000-0000-0000-000000000001/p1.jpg');
insert into agreements (id,apiary_id,landowner,expires_on) values ('88888888-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000a','Oom Piet','2027-03-01');
insert into equipment (id,name,kind) values ('99999999-0000-0000-0000-000000000001','Brood boxes','brood_box');
-- mentor group shares only H1; apiary group shares X with the partner
insert into groups (id,name,kind,owner_name) values ('44444444-0000-0000-0000-0000000000a1','Mentor: H1','mentor','Lucille'),('44444444-0000-0000-0000-0000000000b1','Farm team','apiaries','Lucille');
insert into group_hives values ('44444444-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000001');
insert into group_apiaries values ('44444444-0000-0000-0000-0000000000b1','11111111-0000-0000-0000-00000000000a');
insert into group_invites (code,group_id,role,cover_days) values ('MENT45','44444444-0000-0000-0000-0000000000a1','viewer',7);
insert into group_invites (code,group_id,role) values ('PART67','44444444-0000-0000-0000-0000000000b1','partner');

\echo '-- M1 mentor joins and sees only H1'
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select join_group('MENT45','Mentor Sipho') is not null as joined;
select 'mentor hives (expect H1)', string_agg(name, ',') from hives;
select 'mentor apiaries (expect 0)', count(*) from apiaries;
select 'mentor inspections (expect 1)', count(*) from inspections;
select 'mentor photos (expect 1)', count(*) from photos;
select 'mentor photo files (expect 1)', count(*) from storage.objects;
select 'mentor group name and owner', name, owner_name, kind from groups;
insert into comments (id,hive_id,body,author_name) values ('77777777-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','Brood looks good, check for cells next week','Sipho');
select 'mentor comment saved (expect 1)', count(*) from comments;
\echo '   mentor comments on H2 (expect RLS error):'
insert into comments (id,hive_id,body) values (gen_random_uuid(),'22222222-0000-0000-0000-000000000002','x');
\echo '   mentor logs an inspection (expect RLS error):'
insert into inspections (id,hive_id,inspected_at,score) values (gen_random_uuid(),'22222222-0000-0000-0000-000000000001',now(),50);
update hives set notes='mentor edit' where id='22222222-0000-0000-0000-000000000001';
select 'mentor hive edit ignored (expect null)', notes from hives where id='22222222-0000-0000-0000-000000000001';
\echo '   mentor shares H1 into a group of their own (expect RLS error):'
insert into groups (id,name) values ('44444444-0000-0000-0000-0000000000e1','Mine');
insert into group_hives values ('44444444-0000-0000-0000-0000000000e1','22222222-0000-0000-0000-000000000001');

\echo '-- M2 owner sees the mentor comment and cannot edit it'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select 'owner sees comments (expect 1)', count(*) from comments;
update comments set body='changed' where id='77777777-0000-0000-0000-000000000001';
select 'comment unchanged', left(body, 10) from comments;

\echo '-- M3 mentor access ends'
update group_members set expires_at = now() - interval '1 minute' where user_id='eeeeeeee-0000-0000-0000-000000000005';
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select 'mentor after expiry: hives, comments, inspections (expect 0 0 0)', (select count(*) from hives), (select count(*) from comments), (select count(*) from inspections);

\echo '-- P1 partner edits but cannot delete'
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select join_group('PART67','Pieter') is not null as joined;
select 'partner hives (expect H1,H2)', string_agg(name, ',' order by name) from hives;
update hives set notes='Partner note' where id='22222222-0000-0000-0000-000000000002';
select 'partner edit saved', notes from hives where id='22222222-0000-0000-0000-000000000002';
\echo '   partner deletes H2 (expect owner error):'
update hives set deleted=true where id='22222222-0000-0000-0000-000000000002';
\echo '   partner deletes apiary X (expect owner error):'
update apiaries set deleted=true where id='11111111-0000-0000-0000-00000000000a';
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-00000000000a','H4 partner');
select 'partner sees agreements and equipment (expect 0 0)', (select count(*) from agreements), (select count(*) from equipment);
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update hives set deleted=true where id='22222222-0000-0000-0000-000000000004';
select 'owner deleted the partner hive in own apiary', deleted from hives where id='22222222-0000-0000-0000-000000000004';
insert into group_hives values ('44444444-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000002');
select 'owner shared second hive into mentor group (expect 2)', count(*) from group_hives where group_id='44444444-0000-0000-0000-0000000000a1';

\echo '-- S1 loss survey: anyone can send through the function, nobody can read or insert directly'
reset role; set role anon;
select public.submit_loss_survey('{"season":"2025-26","province":"Gauteng","operation":"stationary","colonies_start":10,"colonies_end":8,"colonies_lost":2,"swarms_caught":0,"causes":{"small_hive_beetle":1,"absconding":1}}');
select 'anon reads answers (expect 0)', count(*) from loss_survey;
\echo '   anon inserts directly (expect RLS error):'
insert into loss_survey (season,operation,colonies_start,colonies_lost) values ('2025-26','stationary',1,0);
\echo '   impossible numbers (expect check error):'
select public.submit_loss_survey('{"season":"2025-26","operation":"stationary","colonies_start":-5,"colonies_lost":0}');
\echo '   bad season label (expect check error):'
select public.submit_loss_survey('{"season":"last year","operation":"stationary","colonies_start":1,"colonies_lost":0}');
reset role; set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select public.submit_loss_survey('{"season":"2025-26","operation":"migratory","colonies_start":40,"colonies_lost":9}');
select 'signed-in reads answers (expect 0)', count(*) from loss_survey;
reset role;
select 'answers stored (expect 2), none linked to a user', count(*) from loss_survey;

\echo '-- R1 inserts that return the new row, as the API does'
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into apiaries (id,name) values ('11111111-0000-0000-0000-0000000000c1','Returned apiary') returning name;
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-0000000000c1','11111111-0000-0000-0000-0000000000c1','Returned hive') returning name;
insert into inspections (id,hive_id,inspected_at,score) values ('33333333-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-0000000000c1',now(),75) returning score;
insert into apiaries (id,name) values ('11111111-0000-0000-0000-0000000000c1','Upserted name') on conflict (id) do update set name = excluded.name returning name;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-0000000000c2','11111111-0000-0000-0000-00000000000a','Partner returned hive') returning name;
insert into hives (id,apiary_id,name,notes) values ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-00000000000a','H2','partner upsert') on conflict (id) do update set notes = excluded.notes returning notes;
