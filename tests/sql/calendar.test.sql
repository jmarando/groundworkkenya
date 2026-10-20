-- The diary's calendar feed (schema 32): the office gets a private link, an agent doesn't, the
-- feed shows only its campaign's diary, and a new link ends the old one.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: schema 32
do $$ begin assert public.groundwork_schema_version() >= 32; end $$;

-- test: a manager's link shows Sakaja's diary only; a new link ends the old; an agent gets none
begin;
insert into public.diary_entries (campaign_id, day, starts_at, title, kind)
  values ('ca000000-0000-4000-8000-000000000002', current_date + 1, '09:00', 'Sakaja rally', 'rally'),
         ('ca000000-0000-4000-8000-000000000003', current_date + 1, '10:00', 'Mathira market', 'market');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare t1 text; t2 text;
begin
  t1 := public.my_calendar_feed();
  assert t1 ~ '^[0-9a-f]{64}$', 'a long token';
  assert public.my_calendar_feed() = t1, 'the same link each time';
  assert pg_temp.state_of(format('select * from public.calendar_feed_entries(%L)', t1)) = '42501', 'the browser can''t read feeds';
  reset role;
  assert (select array_agg(title) from public.calendar_feed_entries(t1)) = array['Sakaja rally'], 'Sakaja''s diary only';
  set local role authenticated;
  t2 := public.my_calendar_feed(true);
  reset role;
  assert t2 <> t1, 'a new link';
  assert (select count(*) from public.calendar_feed_entries(t1)) = 0, 'the old one is dead';
  assert (select count(*) from public.calendar_feed_entries(t2)) = 1, 'the new one works';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert pg_temp.state_of('select public.my_calendar_feed()') = '42501', 'an agent gets no feed';
end $$;
rollback;

-- test: leaving the office ends the feed
begin;
insert into public.diary_entries (campaign_id, day, title) values ('ca000000-0000-4000-8000-000000000002', current_date, 'Today');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
create temporary table t as select public.my_calendar_feed() as token;
reset role;
update public.campaign_members set role = 'agent' where user_id = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select count(*) from public.calendar_feed_entries((select token from t))) = 0, 'no longer office, no diary';
end $$;
rollback;
