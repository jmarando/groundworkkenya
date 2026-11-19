-- Crowd events (schema 50): the office reads its own campaign's events and no one else's, staff
-- add one to the diary or set it aside, an agent does neither, the browser never writes an event,
-- and the same event found twice is kept once.
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

-- test: schema 50
do $$ begin assert public.groundwork_schema_version() >= 50; end $$;

-- test: the office reads its own campaign's events; an agent and another campaign read none
begin;
insert into public.crowd_events (id, campaign_id, kind, title, starts_on, source_url, dedupe) values
  ('ce000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'funeral',
   'Burial in Kasarani', current_date + 2, 'https://example.test/a', 'burial-in-kasarani|x'),
  ('ce000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000003', 'sports',
   'Mathira football final', current_date + 3, 'https://example.test/b', 'mathira-football-final|x');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select array_agg(title) from public.crowd_events) = array['Burial in Kasarani'], 'the manager sees Sakaja''s only';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.crowd_events) = 1, 'the candidate sees it too';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.crowd_events) = 0, 'an agent sees none';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select array_agg(title) from public.crowd_events) = array['Mathira football final'], 'Mathira sees its own';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$ begin
  assert (select array_agg(title) from public.crowd_events) = array['Burial in Kasarani'], 'the super admin sees the campaign in focus';
end $$;
rollback;

-- test: staff add an event to the diary once, as the right kind, in its ward, with where it was found
begin;
insert into public.wards (id, campaign_id, slug, name, constituency)
values ('77000000-0000-4000-8000-000000000050', 'ca000000-0000-4000-8000-000000000002', 'crowd-ward', 'Crowd Ward', 'Test');
insert into public.crowd_events (id, campaign_id, kind, title, starts_on, starts_at, place, ward_id,
                                 source_url, source_name, dedupe) values
  ('ce000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000002', 'funeral',
   'Burial of the late Example', current_date + 4, '10:00', 'Mwiki grounds',
   '77000000-0000-4000-8000-000000000050', 'https://example.test/c', 'The Star', 'burial-of-the-late-example|x'),
  ('ce000000-0000-4000-8000-000000000004', 'ca000000-0000-4000-8000-000000000002', 'sports',
   'Ward football tournament', current_date + 5, null, null, null,
   'https://example.test/d', null, 'ward-football-tournament|x');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
create temporary table added as
  select public.add_crowd_event('ce000000-0000-4000-8000-000000000003') as entry,
         public.add_crowd_event('ce000000-0000-4000-8000-000000000004') as other;
do $$
declare d public.diary_entries;
begin
  select * into d from public.diary_entries where id = (select entry from added);
  assert d.kind = 'funeral', 'a funeral stays a funeral';
  assert d.title = 'Burial of the late Example', 'its title';
  assert d.day = current_date + 4 and d.starts_at = '10:00', 'its day and time';
  assert d.ward_id = '77000000-0000-4000-8000-000000000050', 'its ward';
  assert d.note = 'Mwiki grounds · Found in The Star · https://example.test/c', 'where it was found';
  assert (select kind from public.diary_entries where id = (select other from added)) = 'visit', 'a tournament is a visit';
  assert (select note from public.diary_entries where id = (select other from added))
         = 'Found in the news · https://example.test/d', 'no place, no outlet';
  assert (select status from public.crowd_events where id = 'ce000000-0000-4000-8000-000000000003') = 'added', 'marked added';
  assert (select decided_by from public.crowd_events where id = 'ce000000-0000-4000-8000-000000000003')
         = '00000000-0000-0000-0000-0000000000c3', 'by the manager';
  assert public.add_crowd_event('ce000000-0000-4000-8000-000000000003') = (select entry from added), 'adding twice gives back the same entry';
  assert (select count(*) from public.diary_entries) = 2, 'and writes no second entry';
end $$;
-- An event added before is put back when its diary entry was deleted.
delete from public.diary_entries where id = (select entry from added);
do $$ begin
  assert (select diary_entry_id from public.crowd_events where id = 'ce000000-0000-4000-8000-000000000003') is null, 'the link is cleared';
  assert public.add_crowd_event('ce000000-0000-4000-8000-000000000003') is not null, 'added again';
  assert (select count(*) from public.diary_entries) = 2, 'one entry for it again';
end $$;
rollback;

-- test: staff set an event aside once; an agent and another campaign can do neither
begin;
insert into public.crowd_events (id, campaign_id, kind, title, starts_on, source_url, dedupe) values
  ('ce000000-0000-4000-8000-000000000005', 'ca000000-0000-4000-8000-000000000002', 'church',
   'Church harambee', current_date + 1, 'https://example.test/e', 'church-harambee|x'),
  ('ce000000-0000-4000-8000-000000000006', 'ca000000-0000-4000-8000-000000000002', 'school',
   'Prize giving', current_date + 1, 'https://example.test/f', 'prize-giving|x');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert pg_temp.state_of($q$select public.add_crowd_event('ce000000-0000-4000-8000-000000000005')$q$) = '42501', 'an agent cannot add';
  assert pg_temp.state_of($q$select public.dismiss_crowd_event('ce000000-0000-4000-8000-000000000005')$q$) = '42501', 'an agent cannot set aside';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert pg_temp.state_of($q$select public.add_crowd_event('ce000000-0000-4000-8000-000000000005')$q$) = '42501', 'Mathira cannot add Sakaja''s';
  assert pg_temp.state_of($q$select public.dismiss_crowd_event('ce000000-0000-4000-8000-000000000005')$q$) = '42501', 'nor set it aside';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  perform public.dismiss_crowd_event('ce000000-0000-4000-8000-000000000005');
  assert (select status from public.crowd_events where id = 'ce000000-0000-4000-8000-000000000005') = 'dismissed', 'set aside';
  assert pg_temp.state_of($q$select public.dismiss_crowd_event('ce000000-0000-4000-8000-000000000005')$q$) = '42501', 'only once';
  perform public.add_crowd_event('ce000000-0000-4000-8000-000000000006');
  assert pg_temp.state_of($q$select public.dismiss_crowd_event('ce000000-0000-4000-8000-000000000006')$q$) = '42501', 'an added event is not set aside';
end $$;
reset role;
do $$ begin
  assert (select status from public.crowd_events where id = 'ce000000-0000-4000-8000-000000000005') = 'dismissed', 'still set aside';
  assert (select count(*) from public.diary_entries where title = 'Church harambee') = 0, 'and not in the diary';
end $$;
rollback;

-- test: the browser never writes an event, changes its title or deletes it
begin;
insert into public.crowd_events (id, campaign_id, kind, title, starts_on, source_url, dedupe) values
  ('ce000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000002', 'market',
   'Market fair', current_date + 1, 'https://example.test/g', 'market-fair|x');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of($q$insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe)
    values ('ca000000-0000-4000-8000-000000000002', 'other', 'Made up', current_date, 'https://example.test/h', 'made-up|x')$q$) = '42501', 'no insert';
  assert pg_temp.state_of($q$update public.crowd_events set title = 'Changed'$q$) = '42501', 'no title change';
  assert pg_temp.state_of($q$delete from public.crowd_events$q$) = '42501', 'no delete';
end $$;
rollback;

-- test: the same event found twice is kept once; a link must be https; a ward must be the campaign's
begin;
insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe) values
  ('ca000000-0000-4000-8000-000000000002', 'funeral', 'Burial', current_date + 1, 'https://example.test/i', 'burial|d');
do $$ begin
  assert pg_temp.state_of($q$insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe)
    values ('ca000000-0000-4000-8000-000000000002', 'funeral', 'Burial', current_date + 1, 'https://example.test/j', 'burial|d')$q$) = '23505', 'kept once';
  assert pg_temp.state_of($q$insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe)
    values ('ca000000-0000-4000-8000-000000000003', 'funeral', 'Burial', current_date + 1, 'https://example.test/j', 'burial|d')$q$) is null, 'another campaign keeps its own';
  assert pg_temp.state_of($q$insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe)
    values ('ca000000-0000-4000-8000-000000000002', 'funeral', 'Plain link', current_date + 1, 'http://example.test/k', 'plain-link|d')$q$) = '23514', 'https only';
  assert pg_temp.state_of($q$insert into public.crowd_events (campaign_id, kind, title, starts_on, source_url, dedupe, ward_id)
    values ('ca000000-0000-4000-8000-000000000002', 'funeral', 'Wrong ward', current_date + 1, 'https://example.test/l', 'wrong-ward|d',
            (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000003' limit 1))$q$) = '23503', 'not another campaign''s ward';
end $$;
rollback;
