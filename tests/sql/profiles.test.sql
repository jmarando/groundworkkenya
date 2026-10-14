-- Area profiles and measured indicators: each campaign's profiles stay inside
-- it, the candidate, manager and organisers read and write them, field agents
-- never see them; every team reads the indicators and nobody signed in writes
-- them. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

insert into public.atlas_sources (id, title, publisher) values ('test-source', 'A test document', 'IEBC')
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null)
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('nairobi', 'county', 'Nairobi', 'kenya')
  on conflict do nothing;
insert into public.atlas_indicators (area_key, indicator, year, value, source_id)
  values ('nairobi', 'buildings', 2023, 1000, 'test-source') on conflict do nothing;
-- An organiser on Sakaja's team, beside the shared accounts.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
  values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000a7', 'organiser');

-- test: the schema is at version 24 or later
do $$ begin
  assert public.groundwork_schema_version() >= 24, 'schema 24';
end $$;

-- test: an organiser writes a profile, the manager reads and changes it, and it says who wrote it
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a7';
insert into public.area_profiles (area_key, settlement, communities, languages, institutions, issues)
  values ('nairobi', 'mixed', 'Long-settled families and newer arrivals.', array['sw', 'sheng'],
          'Matatu saccos, two big churches.', 'Water and rents.');
do $$ begin
  assert (select campaign_id from public.area_profiles) = 'ca000000-0000-4000-8000-000000000002', 'the profile is Sakaja''s';
  assert (select updated_by from public.area_profiles) = '00000000-0000-0000-0000-0000000000a7', 'and says who wrote it';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
update public.area_profiles set issues = 'Water.';
do $$ begin
  assert (select settlement from public.area_profiles) = 'mixed', 'the manager reads it';
  assert (select issues from public.area_profiles) = 'Water.', 'and changes it';
end $$;
rollback;

-- test: a field agent neither reads nor writes profiles, and no other campaign sees them
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.area_profiles (area_key, settlement) values ('nairobi', 'informal');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'Sakaja''s agent reads none';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('kenya')$q$) = '42501', 'or writes one';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'Mathira reads none of Sakaja''s';
  assert pg_temp.state_of($q$insert into public.area_profiles (campaign_id, area_key) values ('ca000000-0000-4000-8000-000000000002', 'kenya')$q$) = '42501', 'and can''t write into Sakaja';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'a pending account reads none';
end $$;
rollback;

-- test: a profile keeps to its limits and its lists
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, communities) values ('nairobi', %L)$q$, repeat('a', 501))) = '23514', 'communities over 500';
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, institutions) values ('nairobi', %L)$q$, repeat('a', 1001))) = '23514', 'institutions over 1,000';
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, issues) values ('nairobi', %L)$q$, repeat('a', 501))) = '23514', 'issues over 500';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key, settlement) values ('nairobi', 'posh')$q$) = '23514', 'an unknown settlement type';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key, languages) values ('nairobi', array['klingon'])$q$) = '23514', 'an unknown language';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('atlantis')$q$) = '23503', 'a place not in the atlas';
end $$;
insert into public.area_profiles (area_key, communities) values ('nairobi', repeat('a', 500));
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('nairobi')$q$) = '23505', 'one profile per place';
end $$;
rollback;

-- test: every team reads the indicators, nobody signed in writes them, and shares stay within 0 to 1
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
do $$ begin
  assert (select count(*) from public.atlas_indicators where area_key = 'nairobi') >= 1, 'a Mathira agent reads them';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 2023, 1, 'test-source')$q$) = '42501', 'a team member can''t add one';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_indicators) = 0, 'a pending account reads none';
end $$;
rollback;
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'small_building_share', 2023, 1.5, 'test-source')$q$) = '23514', 'a share over 1';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 2023, -1, 'test-source')$q$) = '23514', 'a negative value';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'trees', 2023, 1, 'test-source')$q$) = '23514', 'an unknown indicator';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 1999, 1, 'test-source')$q$) = '23514', 'a year out of range';
end $$;
