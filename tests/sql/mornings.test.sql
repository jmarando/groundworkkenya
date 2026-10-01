-- The diary and this morning's story: who reads and changes them, and the
-- checks they must pass. Run with tests/sql/run.sh; each test rolls back.

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

-- test: the team reads its own diary and nobody else does
begin;
insert into public.diary_entries (campaign_id, day, title, kind) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Kayole water point', 'visit'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-05', 'Karatina market', 'market');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.diary_entries) = 1, 'Sakaja''s agent reads one entry';
  assert (select title from public.diary_entries) = 'Kayole water point', 'and it is Sakaja''s';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.diary_entries) = 0, 'a pending account reads the diary';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.diary_entries;
  assert false, 'anon reads a diary';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: only the candidate or manager changes the diary, and only their own
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.diary_entries (day, starts_at, title, kind) values ('2026-10-05', '10:30', 'Manager added', 'visit');
do $$ begin
  assert (select campaign_id from public.diary_entries where title = 'Manager added')
         = 'ca000000-0000-4000-8000-000000000002', 'filed under the manager''s campaign';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin
  assert pg_temp.state_of($q$insert into public.diary_entries (day, title) values ('2026-10-05', 'Organiser added')$q$) = '42501',
    'an organiser adds to the diary';
  update public.diary_entries set note = 'Changed' where title = 'Manager added';
  assert (select note from public.diary_entries where title = 'Manager added') is null, 'an organiser edits the diary';
  delete from public.diary_entries where title = 'Manager added';
  assert (select count(*) from public.diary_entries where title = 'Manager added') = 1, 'an organiser removes an entry';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert pg_temp.state_of($q$insert into public.diary_entries (campaign_id, day, title)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Cross campaign')$q$) = '42501',
    'Mathira writes into Sakaja''s diary';
end $$;
rollback;

-- test: an entry is well formed, and its ward is the campaign's own
begin;
do $$
declare
  mathira_ward uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000003' limit 1);
  sakaja_ward uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' limit 1);
  head constant text := $h$insert into public.diary_entries (campaign_id, day, title, kind, note, ward_id)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', $h$;
begin
  assert pg_temp.state_of(head || $q$'K', 'visit', null, null)$q$) = '23514', 'a one-letter title is accepted';
  assert pg_temp.state_of(head || $q$'Kayole', 'picnic', null, null)$q$) = '23514', 'an unknown kind is accepted';
  assert pg_temp.state_of(head || format('%L, %L, %L, null)', 'Kayole', 'visit', repeat('x', 301))) = '23514',
    'a long note is accepted';
  assert pg_temp.state_of(head || format('%L, %L, null, %L)', 'Kayole', 'visit', mathira_ward)) = '23503',
    'another campaign''s ward is accepted';
  assert pg_temp.state_of(head || format('%L, %L, null, %L)', 'Kayole', 'watch', sakaja_ward)) is null,
    'a good entry is refused';
end $$;
rollback;

-- test: removing a ward keeps its entries, without the ward
begin;
insert into public.wards (id, campaign_id, slug, name, constituency)
values ('77000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'diary-test-ward', 'Diary Test', 'Test');
insert into public.diary_entries (campaign_id, day, title, ward_id)
values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Ward visit', '77000000-0000-4000-8000-000000000001');
delete from public.wards where id = '77000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select ward_id from public.diary_entries where title = 'Ward visit') is null, 'the entry keeps the ward';
  assert (select campaign_id from public.diary_entries where title = 'Ward visit')
         = 'ca000000-0000-4000-8000-000000000002', 'the entry loses its campaign';
end $$;
rollback;

-- test: one story a morning, read by the team, changed by the candidate or manager as the team's
begin;
insert into public.morning_stories (campaign_id, day, story, written_by) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '{"kind": "written", "headline": "Water"}', 'groundwork'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-05', '{"kind": "headlines"}', 'groundwork');
do $$ begin
  assert pg_temp.state_of($q$insert into public.morning_stories (campaign_id, day, story)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '{}')$q$) = '23505', 'two stories one morning';
  assert pg_temp.state_of($q$insert into public.morning_stories (campaign_id, day, story)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-06', '[]')$q$) = '23514', 'a story that is not an object';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.morning_stories) = 1, 'the agent reads Sakaja''s story only';
  update public.morning_stories set story = '{"kind": "written", "headline": "Changed"}';
  assert (select story->>'headline' from public.morning_stories) = 'Water', 'an agent edits the story';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  update public.morning_stories set story = '{"kind": "written", "headline": "Ours"}', written_by = 'team';
  assert (select story->>'headline' from public.morning_stories) = 'Ours', 'the manager can''t edit the story';
  assert pg_temp.state_of($q$update public.morning_stories set written_by = 'groundwork'$q$) = '42501',
    'the team passes its story off as Groundwork''s';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 20, 'schema version'; end $$;
