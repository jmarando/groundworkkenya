-- The election atlas: who reads it, that nobody writes it through the API, the
-- shape of its keys and figures, and that a campaign's home area, sides and
-- notes stay inside the campaign. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- An organiser in Sakaja, beside the fixtures' candidate, manager and agent.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b7', 'organiser');

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: the nine elections and the country are there
do $$ begin
  assert (select count(*) from public.atlas_elections) = 9, 'nine elections';
  assert (select count(*) from public.atlas_elections where year in (2013, 2017, 2022)) = 9, 'in three years';
  assert (select held_on from public.atlas_elections where id = '2022-governor') = date '2022-08-09', 'the 2022 date';
  assert (select note from public.atlas_elections where id = '2017-president') like '%annulled%', 'the 2017 note';
  assert (select count(*) from public.atlas_areas where level = 'country') = 1, 'one country';
  assert (select key from public.atlas_areas where level = 'country') = 'kenya', 'and it is Kenya';
end $$;

-- test: every team reads the atlas; nobody outside a team does
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 2, 'an agent reads the atlas';
  assert (select count(*) from public.atlas_elections) = 9, 'an agent reads the elections';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 2, 'another campaign reads the same atlas';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_areas) = 0, 'a pending account reads the atlas';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.atlas_areas;
  assert false, 'anon reads the atlas';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: nobody writes the atlas through the API, not even a candidate
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare
  r record;
begin
  for r in select * from (values
    ('atlas_areas', 'name'), ('atlas_elections', 'note'), ('atlas_candidates', 'party'),
    ('atlas_results', 'votes'), ('atlas_turnout', 'source'), ('atlas_register', 'source'),
    ('atlas_population', 'method')) as v(t, c)
  loop
    assert pg_temp.state_of(format('insert into public.%I default values', r.t)) = '42501', 'a candidate adds to ' || r.t;
    assert pg_temp.state_of(format('update public.%I set %I = %I', r.t, r.c, r.c)) = '42501', 'a candidate edits ' || r.t;
    assert pg_temp.state_of(format('delete from public.%I', r.t)) = '42501', 'a candidate deletes from ' || r.t;
  end loop;
end $$;
rollback;

-- test: the atlas tables are closed to anonymous users and writable only by the service role
begin;
do $$
declare
  r record;
  p text;
begin
  -- fact is true for the seven public fact tables and false for a campaign's own three.
  for r in select * from (values
    ('atlas_areas', true), ('atlas_elections', true), ('atlas_candidates', true), ('atlas_results', true),
    ('atlas_turnout', true), ('atlas_register', true), ('atlas_population', true),
    ('atlas_settings', false), ('atlas_sides', false), ('area_notes', false)) as v(t, fact)
  loop
    foreach p in array array['select', 'insert', 'update', 'delete']
    loop
      assert not has_table_privilege('anon', 'public.' || r.t, p), 'anon has ' || p || ' on ' || r.t;
      assert has_table_privilege('service_role', 'public.' || r.t, p), 'the service role lacks ' || p || ' on ' || r.t;
      -- A signed-in user only reads a public fact table. A campaign's own table is open to them
      -- at the grant level, and row level security narrows it.
      if r.fact and p <> 'select' then
        assert not has_table_privilege('authenticated', 'public.' || r.t, p), 'authenticated has ' || p || ' on ' || r.t;
      else
        assert has_table_privilege('authenticated', 'public.' || r.t, p), 'authenticated lacks ' || p || ' on ' || r.t;
      end if;
    end loop;
  end loop;
end $$;
rollback;

-- test: an area's key reads as a place
begin;
insert into public.atlas_areas (key, level, name, parent) values ('testland', 'county', 'Testland', 'kenya');
do $$
declare
  head constant text := 'insert into public.atlas_areas (key, level, name, parent) values ';
begin
  assert pg_temp.state_of(head || $q$('Testland-2', 'county', 'Testland Two', 'kenya')$q$) = '23514', 'an upper-case key';
  assert pg_temp.state_of(head || $q$('test land', 'county', 'Test Land', 'kenya')$q$) = '23514', 'a key with a space';
  assert pg_temp.state_of(head || $q$('testland-2', 'county', 'Testland Two', null)$q$) = '23514', 'a county with no parent';
  assert pg_temp.state_of(head || $q$('testland-2', 'county', 'Testland Two', 'testland')$q$) = '23514', 'a county under a county';
  assert pg_temp.state_of(head || $q$('somewhere', 'country', 'Somewhere', null)$q$) = '23514', 'a second country';
  assert pg_temp.state_of(head || $q$('kenya/x-test', 'constituency', 'X Test', 'kenya')$q$) = '23514', 'a constituency straight under Kenya';
  assert pg_temp.state_of(head || $q$('testland/other-test', 'constituency', 'Other Test', 'testland/none')$q$) = '23514', 'a key not under its parent';
  assert pg_temp.state_of(head || $q$('testland/a-test/b-test', 'constituency', 'B Test', 'testland/a-test')$q$) = '23514', 'a constituency at ward depth';
  assert pg_temp.state_of(head || $q$('kenya/x-test/y-test', 'ward', 'Y Test', 'kenya')$q$) = '23514', 'a ward straight under Kenya';
  assert pg_temp.state_of(head || $q$('testland/x-test/y-test', 'ward', 'Y Test', 'testland')$q$) = '23514', 'a ward under a county, skipping its constituency';
  assert pg_temp.state_of(head || $q$('testland/north-test', 'constituency', 'North Test', null)$q$) = '23514', 'a constituency with no parent';
  assert pg_temp.state_of(head || $q$('testland/north-test/ward-one', 'ward', 'Ward One', null)$q$) = '23514', 'a ward with no parent';
  assert pg_temp.state_of(head || $q$('nowhere/some-test', 'constituency', 'Some Test', 'nowhere')$q$) = '23503', 'a parent that is not there';
  assert pg_temp.state_of(head || $q$('testland', 'county', 'Testland', 'kenya')$q$) = '23505', 'the same key twice';
  assert pg_temp.state_of(head || $q$('testland/north-test', 'constituency', 'North Test', 'testland')$q$) is null, 'a good constituency is refused';
  assert pg_temp.state_of(head || $q$('testland/north-test/ward-one', 'ward', 'Ward One', 'testland/north-test')$q$) is null, 'a good ward is refused';
end $$;
rollback;

-- test: results, turnout, registers and population must make sense
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
insert into public.atlas_candidates (id, election_id, seat, name, party, bloc)
values ('2022-governor/testland/a-test', '2022-governor', 'testland', 'A Test', 'Party A', 'Alpha');
do $$
declare
  turnout constant text := 'insert into public.atlas_turnout (election_id, area_key, registered, cast_votes, rejected_votes, valid_votes, source, source_url) values ';
begin
  -- candidates
  assert pg_temp.state_of($q$insert into public.atlas_candidates (id, election_id, seat, name, bloc)
    values ('2022-mp/testland/b-test', '2022-governor', 'testland', 'B Test', 'Beta')$q$) = '23514', 'a candidate id not built from its election and seat';
  assert pg_temp.state_of($q$insert into public.atlas_candidates (id, election_id, seat, name, bloc)
    values ('2022-governor/testland/a-test-2', '2022-governor', 'testland', 'A Test', 'Beta')$q$) = '23505', 'the same name twice in a seat';
  -- results
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', -1)$q$) = '23514', 'negative votes';
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/nobody', 'testland', 5)$q$) = '23503', 'votes for a candidate nobody lists';
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'nowhere', 5)$q$) = '23503', 'votes counted nowhere';
  insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', 100);
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', 100)$q$) = '23505', 'the same votes twice';
  -- turnout
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 101, null, null, 'IEBC, Test results', null)$q$) = '23514', 'more cast than registered';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 0, 91, 'IEBC, Test results', null)$q$) = '23514', 'more valid than cast';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, 'IEBC, Test results', 'http://example.test/a')$q$) = '23514', 'a plain http link';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, null, null)$q$) = '23502', 'a figure with no source';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', null, 90, null, null, 'IEBC, Test results', null)$q$) is null, 'missing figures are refused';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, 'IEBC, Test results', 'https://example.test/a')$q$) = '23505', 'turnout twice for one area';
  -- registers
  assert pg_temp.state_of($q$insert into public.atlas_register values (2022, 'testland', -5, 'IEBC, Test register', null)$q$) = '23514', 'a negative register';
  assert pg_temp.state_of($q$insert into public.atlas_register values (1800, 'testland', 5, 'IEBC, Test register', null)$q$) = '23514', 'a register from 1800';
  assert pg_temp.state_of($q$insert into public.atlas_register values (2022, 'testland', 5, 'IEBC, Test register', null)$q$) is null, 'a good register is refused';
  -- population
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 70, 'WorldPop, Test', 'Test method of estimating')$q$) = '23514', 'more young adults than adults';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 120, 70, 'WorldPop, Test', 'Test method of estimating')$q$) = '23514', 'more adults than people';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 30, 'WorldPop, Test', 'short')$q$) = '23514', 'a method too short to say anything';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 30, 'WorldPop, Test', 'Test method of estimating')$q$) is null, 'a good estimate is refused';
  -- elections
  assert pg_temp.state_of($q$insert into public.atlas_elections values ('2022-mp', 2022, 'governor', '2022-08-09', null)$q$) = '23514', 'an election id that is not its year and race';
  assert pg_temp.state_of($q$insert into public.atlas_elections values ('2022-senator', 2022, 'senator', '2022-08-09', null)$q$) = '23514', 'a race the atlas does not hold';
end $$;
rollback;

-- test: a campaign's notes, settings and sides stay inside the campaign
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.area_notes (area_key, note) values ('testland/north-test', 'Sakaja note');
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
do $$ begin
  assert (select campaign_id from public.area_notes) = 'ca000000-0000-4000-8000-000000000002', 'a note is filed under the candidate''s campaign';
  assert (select count(*) from public.atlas_settings) = 1, 'the candidate reads the settings';
  assert (select count(*) from public.atlas_sides) = 1, 'the candidate reads the sides';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'Mathira reads Sakaja''s notes';
  assert (select count(*) from public.atlas_settings) = 0, 'Mathira reads Sakaja''s settings';
  assert (select count(*) from public.atlas_sides) = 0, 'Mathira reads Sakaja''s sides';
  assert pg_temp.state_of($q$insert into public.area_notes (campaign_id, area_key, note)
    values ('ca000000-0000-4000-8000-000000000002', 'testland', 'cross')$q$) = '42501', 'Mathira writes into Sakaja''s notes';
  assert pg_temp.state_of($q$insert into public.atlas_settings (campaign_id, home_area)
    values ('ca000000-0000-4000-8000-000000000002', 'testland')$q$) = '42501', 'Mathira writes into Sakaja''s settings';
  update public.area_notes set note = 'changed';
end $$;
insert into public.area_notes (area_key, note) values ('testland/north-test', 'Mathira note');
do $$ begin
  assert (select note from public.area_notes) = 'Mathira note', 'Mathira reads only its own note on the same area';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$ begin
  assert (select note from public.area_notes) = 'Sakaja note', 'the super admin reads the campaign they are looking at';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'one note per campaign for the same area';
  assert (select note from public.area_notes where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 'Sakaja note',
    'someone outside the campaign changed its note';
end $$;
rollback;

-- test: the team reads; only the candidate or manager writes
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland'),
  ('testland/south-test', 'constituency', 'South Test', 'testland');
insert into public.area_notes (campaign_id, area_key, note)
values ('ca000000-0000-4000-8000-000000000002', 'testland/north-test', 'A note');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
insert into public.area_notes (area_key, note) values ('testland/south-test', 'Manager note');
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'the manager writes a note';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'an organiser reads the notes';
  assert (select count(*) from public.atlas_settings) = 1, 'an organiser reads the settings';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', 'Organiser note')$q$) = '42501', 'an organiser writes a note';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-governor', 'Beta')$q$) = '42501', 'an organiser sets a side';
  update public.area_notes set note = 'changed';
  delete from public.atlas_sides;
  update public.atlas_settings set home_area = 'testland/north-test';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'an agent reads the notes';
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('testland')$q$) = '42501', 'an agent sets the home area';
  update public.area_notes set note = 'changed';
  delete from public.area_notes;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'a pending account reads notes';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.area_notes where note = 'changed') = 0, 'a non-staff edit went through';
  assert (select count(*) from public.area_notes) = 2, 'a non-staff delete went through';
  assert (select count(*) from public.atlas_sides) = 1, 'an organiser deleted a side';
  assert (select home_area from public.atlas_settings) = 'testland', 'an organiser changed the home area';
end $$;
rollback;

-- test: one home area and one side per election, changed by upsert
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('nowhere')$q$) = '23503', 'a home area that is not in the atlas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2030-mp', 'Beta')$q$) = '23503', 'a side in an election that is not in the atlas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-mp', '   ')$q$) = '23514', 'a blank side';
end $$;
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('testland/north-test')$q$) = '23505', 'two home areas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Beta')$q$) = '23505', 'two sides for one election';
end $$;
insert into public.atlas_settings (home_area) values ('testland/north-test')
  on conflict (campaign_id) do update set home_area = excluded.home_area;
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Beta')
  on conflict (campaign_id, election_id) do update set bloc = excluded.bloc;
do $$ begin
  assert (select home_area from public.atlas_settings) = 'testland/north-test', 'the home area is changed';
  assert (select bloc from public.atlas_sides where election_id = '2022-governor') = 'Beta', 'the side is changed';
  assert (select count(*) from public.atlas_sides) = 1, 'and still one';
end $$;
rollback;

-- test: a note is a note, and it keeps who changed it and when
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', '')$q$) = '23514', 'an empty note';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', '   ')$q$) = '23514', 'a blank note';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', E'\n\t  ')$q$) = '23514', 'a note of newlines and tabs';
  assert pg_temp.state_of(format('insert into public.area_notes (area_key, note) values (%L, %L)', 'testland', repeat('x', 2001))) = '23514', 'a note over 2,000 characters';
  assert pg_temp.state_of(format('insert into public.area_notes (area_key, note) values (%L, %L)', 'testland', repeat('x', 2000))) is null, 'a note of exactly 2,000 characters is refused';
end $$;
insert into public.area_notes (area_key, note, updated_at, updated_by)
values ('testland/north-test', 'First', '2020-01-01', '00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select updated_by from public.area_notes where area_key = 'testland/north-test') = '00000000-0000-0000-0000-0000000000a1',
    'a note is signed by someone else';
  assert (select updated_at from public.area_notes where area_key = 'testland/north-test') = now(), 'a note is backdated';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
update public.area_notes set note = 'Second', updated_by = '00000000-0000-0000-0000-0000000000a1' where area_key = 'testland/north-test';
do $$ begin
  assert (select updated_by from public.area_notes where area_key = 'testland/north-test') = '00000000-0000-0000-0000-0000000000c3',
    'an edit keeps the previous editor''s name';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 22, 'schema version'; end $$;
