-- Race data: who reads and changes a campaign's rivals and polls, and the
-- checks a poll must pass. Run with tests/sql/run.sh; each test rolls back.

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

-- test: the team reads its own race and nobody else does
begin;
insert into public.race_rivals (campaign_id, name, tone) values
  ('ca000000-0000-4000-8000-000000000002', 'Test Rival S', 'a'),
  ('ca000000-0000-4000-8000-000000000003', 'Test Rival M', 'a');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.race_rivals where name like 'Test Rival %') = 1, 'Sakaja''s agent reads one test rival';
  assert (select name from public.race_rivals where name like 'Test Rival %') = 'Test Rival S', 'and it is Sakaja''s';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.race_rivals where name = 'Test Rival S') = 0, 'Mathira reads Sakaja''s race';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.race_rivals) = 0, 'a pending account reads a race';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.race_rivals;
  assert false, 'anon reads a race';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: only the candidate or manager changes the race, and only their own
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.race_rivals (name, tone) values ('Manager Added', 'b');
do $$ begin
  assert (select campaign_id from public.race_rivals where name = 'Manager Added')
         = 'ca000000-0000-4000-8000-000000000002', 'filed under the manager''s campaign';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin
  assert pg_temp.state_of($q$insert into public.race_rivals (name, tone) values ('Organiser Added', 'b')$q$) = '42501',
    'an organiser adds a rival';
  update public.race_rivals set party = 'Changed' where name = 'Manager Added';
  assert (select party from public.race_rivals where name = 'Manager Added') is null, 'an organiser edits a rival';
  delete from public.race_rivals where name = 'Manager Added';
  assert (select count(*) from public.race_rivals where name = 'Manager Added') = 1, 'an organiser removes a rival';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert pg_temp.state_of($q$insert into public.race_polls (pollster, published_on, source_url, shares)
    values ('Agent Poll', '2026-09-01', 'https://example.test/p', '[{"name": "A Name", "share": 10}]')$q$) = '42501',
    'an agent adds a poll';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert pg_temp.state_of($q$insert into public.race_rivals (campaign_id, name, tone)
    values ('ca000000-0000-4000-8000-000000000002', 'Cross Campaign', 'a')$q$) = '42501',
    'Mathira writes into Sakaja''s race';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.race_polls (pollster, published_on, source_url, shares, undecided)
values ('Candidate Poll', '2026-09-01', 'https://example.test/p',
        '[{"name": "Johnson Sakaja", "share": 40}, {"name": "A Rival", "share": 35}]', 20);
do $$ begin
  assert (select count(*) from public.race_polls where pollster = 'Candidate Poll') = 1, 'the candidate adds a poll';
end $$;
rollback;

-- test: a poll must be well formed
begin;
do $$
declare
  head constant text := $h$insert into public.race_polls (campaign_id, pollster, published_on, fieldwork_to, source_url, shares, undecided)
    values ('ca000000-0000-4000-8000-000000000003', 'Pollster', '2026-09-10', $h$;
begin
  assert pg_temp.state_of(head || $q$null, 'http://example.test/p', '[{"name": "A Name", "share": 10}]', null)$q$) = '23514',
    'a plain http link is accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[{"name": "A Name", "share": 101}]', null)$q$) = '23514',
    'a share over 100 is accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[{"name": "A Name", "share": 60}, {"name": "B Name", "share": 45}]', null)$q$) = '23514',
    'shares over 100 in all are accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[{"name": "A Name", "share": 60}]', 45)$q$) = '23514',
    'shares and undecided over 100 are accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[]', null)$q$) = '23514',
    'a poll with no shares is accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[{"name": "A Name", "share": "ten"}]', null)$q$) = '23514',
    'a share that is not a number is accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '[{"share": 10}]', null)$q$) = '23514',
    'a share with no name is accepted';
  assert pg_temp.state_of(head || $q$null, 'https://example.test/p', '{"name": "A Name", "share": 10}', null)$q$) = '23514',
    'shares that are not a list are accepted';
  assert pg_temp.state_of(head || $q$'2026-09-20', 'https://example.test/p', '[{"name": "A Name", "share": 10}]', null)$q$) = '23514',
    'fieldwork after publication is accepted';
  assert pg_temp.state_of(head || $q$'2026-09-01', 'https://example.test/p', '[{"name": "A Name", "share": 10, "rival_id": "ca000000-0000-4000-8000-000000000003"}]', 5)$q$) is null,
    'a good poll is refused';
end $$;
rollback;

-- test: one candidate is ours, and names are not repeated
begin;
insert into public.race_rivals (campaign_id, name, is_us, tone)
values ('ca000000-0000-4000-8000-000000000003', 'Ours One', true, 'us');
do $$ begin
  assert pg_temp.state_of($q$insert into public.race_rivals (campaign_id, name, is_us, tone)
    values ('ca000000-0000-4000-8000-000000000003', 'Ours Two', true, 'us')$q$) = '23505', 'two candidates are ours';
  assert pg_temp.state_of($q$insert into public.race_rivals (campaign_id, name, is_us, tone)
    values ('ca000000-0000-4000-8000-000000000003', 'Not Ours', false, 'us')$q$) = '23514', 'a rival wears our colour';
  assert pg_temp.state_of($q$insert into public.race_rivals (campaign_id, name, tone)
    values ('ca000000-0000-4000-8000-000000000003', ' ours one ', 'a')$q$) = '23505', 'the same name twice';
  assert pg_temp.state_of($q$insert into public.race_rivals (campaign_id, name, tone, x)
    values ('ca000000-0000-4000-8000-000000000003', 'Bad Handle', 'a', 'not a handle')$q$) = '23514', 'a bad X handle';
end $$;
rollback;
