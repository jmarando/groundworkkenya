-- The election atlas: every team reads the public figures and nobody signed in
-- writes them; each campaign's home area, sides and notes stay inside it, and
-- only the candidate or manager changes them. Run with tests/sql/run.sh; each
-- test rolls back.

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

-- A few public figures to read, written as a migration would (kept if the
-- first counties' figures already put them there).
insert into public.atlas_sources (id, title, publisher) values ('test-source', 'A test document', 'IEBC')
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null)
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('nairobi', 'county', 'Nairobi', 'kenya')
  on conflict do nothing;

-- test: the schema is at version 22 or later
do $$ begin
  assert public.groundwork_schema_version() >= 22, 'schema 22';
end $$;

-- test: every team reads the atlas, nobody signed in writes it, and a pending account reads nothing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
do $$ begin
  assert (select count(*) from public.atlas_areas where key = 'nairobi') = 1, 'a Mathira agent reads Nairobi';
  assert (select count(*) from public.atlas_elections) = 9, 'and the nine elections';
  assert pg_temp.state_of($q$insert into public.atlas_areas (key, level, name, parent) values ('nyeri', 'county', 'Nyeri', 'kenya')$q$) = '42501', 'a team member can''t add an area';
  assert pg_temp.state_of($q$update public.atlas_elections set note = 'x'$q$) = '42501', 'or change an election';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$delete from public.atlas_sources$q$) = '42501', 'not even a candidate deletes a source';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_areas) = 0, 'a pending account reads no areas';
end $$;
rollback;

-- test: notes, sides and the home area stay inside their campaign, written by the candidate or manager
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.area_notes (area_key, body) values ('nairobi', 'Matatu saccos meet on Fridays.');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Kenya Kwanza');
insert into public.atlas_settings (home_area) values ('nairobi');
do $$ begin
  assert (select campaign_id from public.area_notes) = 'ca000000-0000-4000-8000-000000000002', 'the note is Sakaja''s';
  assert (select updated_by from public.area_notes) = '00000000-0000-0000-0000-0000000000c3', 'and says who wrote it';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_notes) = 1, 'Sakaja''s agent reads the note';
  perform pg_temp.state_of($q$update public.area_notes set body = 'x'$q$);
  assert (select body from public.area_notes) = 'Matatu saccos meet on Fridays.', 'but can''t change it';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, body) values ('kenya', 'x')$q$) = '42501', 'or add one';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-governor', 'Jubilee')$q$) = '42501', 'or pick a side';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'Mathira reads none of Sakaja''s notes';
  assert (select count(*) from public.atlas_sides) = 0, 'nor its sides';
  assert (select count(*) from public.atlas_settings) = 0, 'nor its home area';
  assert pg_temp.state_of($q$insert into public.area_notes (campaign_id, area_key, body) values ('ca000000-0000-4000-8000-000000000002', 'nairobi', 'x')$q$) = '42501', 'and can''t write into Sakaja';
end $$;
rollback;

-- test: a note can't be empty or longer than 2,000 characters, and a side needs a real election
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, body) values ('nairobi', '   ')$q$) = '23514', 'an empty note';
  assert pg_temp.state_of(format($q$insert into public.area_notes (area_key, body) values ('nairobi', %L)$q$, repeat('a', 2001))) = '23514', 'a long note';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2019-governor', 'X')$q$) = '23503', 'an election that never was';
end $$;
rollback;

-- test: the first counties' figures are loaded
do $$ begin
  assert (select count(*) from public.atlas_areas where level = 'constituency' and parent in ('nairobi', 'nyeri')) = 23,
    'Nairobi''s 17 and Nyeri''s 6 constituencies';
  assert (select count(*) from public.atlas_areas where level = 'ward' and parent like 'nairobi/%') = 85, 'Nairobi''s 85 wards';
  assert exists (select 1 from public.atlas_results), 'and some results';
end $$;
