-- Search interest: who reads it, one read a day for each kind, the names
-- candidates are searched by, and SerpApi's own budget. Run with
-- tests/sql/run.sh; each test rolls back.

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

-- test: the team reads its own search interest, and only the server writes it
begin;
insert into public.search_interest (campaign_id, day, kind, geo, series) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-01', 'candidates', 'KE-110', '[]'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-01', 'candidates', 'KE', '[]');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.search_interest) = 1, 'Sakaja''s agent reads one read';
  assert (select geo from public.search_interest) = 'KE-110', 'and it is Sakaja''s';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of($q$insert into public.search_interest (day, kind, geo, series)
    values ('2026-10-02', 'issues', 'KE', '[]')$q$) = '42501', 'the manager writes search interest';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.search_interest;
  assert false, 'anon reads search interest';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: one read a day of each kind, from Nairobi or Kenya
begin;
do $$
declare
  head constant text := $h$insert into public.search_interest (campaign_id, day, kind, geo, series)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-01', $h$;
begin
  assert pg_temp.state_of(head || $q$'candidates', 'KE-110', '[]')$q$) is null, 'a good read is refused';
  assert pg_temp.state_of(head || $q$'candidates', 'KE', '[]')$q$) = '23505', 'two reads of a kind in a day';
  assert pg_temp.state_of(head || $q$'issues', 'US', '[]')$q$) = '23514', 'a read from elsewhere';
  assert pg_temp.state_of(head || $q$'weather', 'KE', '[]')$q$) = '23514', 'an unknown kind';
  assert pg_temp.state_of(head || $q$'issues', 'KE', '{}')$q$) = '23514', 'a series that is not a list';
end $$;
rollback;

-- test: candidates are searched as the names people use
do $$ begin
  assert (select search_as from public.race_rivals where name = 'Johnson Sakaja') = 'Sakaja', 'Sakaja';
  assert (select search_as from public.race_rivals where name = 'Agnes Kagure') = 'Kagure', 'Kagure';
  assert (select search_as from public.race_rivals where name = 'James Gakuya') = 'Gakuya', 'Gakuya';
  assert (select search_as from public.race_rivals where name = 'Ronald Karauri') = 'Karauri', 'Karauri';
  assert (select search_as from public.race_rivals where name = 'Babu Owino') is null, 'Babu Owino by his full name';
  assert pg_temp.state_of($q$update public.race_rivals set search_as = 'B' where name = 'Babu Owino'$q$) = '23514',
    'a one-letter search';
end $$;

-- test: SerpApi searches have a budget of their own
begin;
set local role service_role;
do $$ begin
  assert public.take_social_credits('trends', 8, 8), 'the day''s eight searches';
  assert not public.take_social_credits('trends', 1, 8), 'a ninth';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 21, 'schema version'; end $$;
