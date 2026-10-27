\set ON_ERROR_STOP 0
\set QUIET 1
insert into auth.users values
 ('aaaaaaaa-0000-0000-0000-000000000001','owner@x'),('bbbbbbbb-0000-0000-0000-000000000002','partner@x'),
 ('cccccccc-0000-0000-0000-000000000003','helper@x'),('dddddddd-0000-0000-0000-000000000004','stranger@x');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
set role authenticated;

-- Owner A: two apiaries, hives, an inspection, an exact location, a group sharing only apiary X.
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into apiaries (id,name,lat,lng) values ('11111111-0000-0000-0000-00000000000a','X farm',-33.93,18.86),('11111111-0000-0000-0000-00000000000b','Y private',-33.9,18.8);
insert into apiary_locations (apiary_id,lat,lng) values ('11111111-0000-0000-0000-00000000000a',-33.93412,18.86021);
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-00000000000a','11111111-0000-0000-0000-00000000000a','Hive 1'),('22222222-0000-0000-0000-00000000000b','11111111-0000-0000-0000-00000000000b','Secret hive');
insert into inspections (id,hive_id,inspected_at,score) values ('33333333-0000-0000-0000-00000000000a','22222222-0000-0000-0000-00000000000a',now(),90);
insert into groups (id,name) values ('44444444-0000-0000-0000-000000000001','Pieter and me');
insert into group_apiaries values ('44444444-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000a');
insert into group_invites (code,group_id,role) values ('PARTN2','44444444-0000-0000-0000-000000000001','partner');
insert into group_invites (code,group_id,role,cover_days) values ('HELPR3','44444444-0000-0000-0000-000000000001','helper',7);
\echo '-- T1 owner can try to share an apiary they do not own (should fail)'
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
insert into apiaries (id,name) values ('11111111-0000-0000-0000-00000000000d','D own');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
insert into group_apiaries values ('44444444-0000-0000-0000-000000000001','11111111-0000-0000-0000-00000000000d');

\echo '-- T2 stranger D sees: (expect only own D apiary, 0 hives of A)'
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select 'D apiaries', count(*) from apiaries; select 'D hives', count(*) from hives; select 'D groups', count(*) from groups;
select 'D join bad code'; select join_group('ZZZZZZ');

\echo '-- T3 partner B joins and sees X only, no exact location'
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select 'B before join', count(*) from apiaries;
select join_group('PARTN2','Pieter') is not null as joined;
select 'B apiaries', string_agg(name, ',') from apiaries;
select 'B hives', string_agg(name, ',') from hives;
select 'B inspections', count(*) from inspections;
select 'B exact locations', count(*) from apiary_locations;
update hives set notes='Partner edit' where id='22222222-0000-0000-0000-00000000000a';
select 'B edited hive notes', notes from hives where id='22222222-0000-0000-0000-00000000000a';
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-0000000000b1','11111111-0000-0000-0000-00000000000a','Partner hive');
select 'B added hive in X', count(*) from hives where id='22222222-0000-0000-0000-0000000000b1';
\echo '   B adding a hive in private Y (expect RLS error):'
insert into hives (id,apiary_id,name) values ('22222222-0000-0000-0000-0000000000b2','11111111-0000-0000-0000-00000000000b','Sneaky');
\echo '   B taking ownership of apiary X (expect owner_id error):'
update apiaries set owner_id='bbbbbbbb-0000-0000-0000-000000000002' where id='11111111-0000-0000-0000-00000000000a';
update inspections set score=10 where id='33333333-0000-0000-0000-00000000000a';
select 'B changed owner''s inspection (expect 90)', score from inspections where id='33333333-0000-0000-0000-00000000000a';
\echo '   B second use of single-use code by helper below'

\echo '-- T4 helper C (cover 7 days) logs an inspection but cannot edit hives'
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select join_group('HELPR3') is not null as joined;
select 'C apiaries', string_agg(name, ','), 'cover ends in days', (select round(extract(epoch from expires_at - now())/86400) from group_members where user_id=auth.uid()) from apiaries;
insert into inspections (id,hive_id,inspected_at,score) values ('33333333-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-00000000000a',now(),80);
select 'C inspection saved', count(*) from inspections where id='33333333-0000-0000-0000-0000000000c1';
update hives set name='Renamed by helper' where id='22222222-0000-0000-0000-00000000000a';
select 'C hive name (expect Hive 1)', name from hives where id='22222222-0000-0000-0000-00000000000a';
\echo '   C reusing partner code (expect invalid):'
select join_group('PARTN2');

\echo '-- T5 owner sees everything incl. partner and helper rows; ends cover mode'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select 'A hives', count(*) from hives; select 'A inspections', count(*) from inspections; select 'A members', string_agg(role, ',' order by role) from group_members;
update group_members set expires_at = now() - interval '1 minute' where user_id='cccccccc-0000-0000-0000-000000000003';
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select 'C after cover ended, apiaries', count(*) from apiaries;

\echo '-- T6 owner grants exact location to B'
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update group_members set exact_location = true where user_id='bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select 'B exact locations now', count(*) from apiary_locations;
\echo '-- T7 B leaves the group'
delete from group_members where user_id = auth.uid();
select 'B apiaries after leaving', count(*) from apiaries;
