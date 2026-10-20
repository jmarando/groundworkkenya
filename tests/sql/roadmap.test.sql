-- Schema 39: the road to election day, its progress and notes, and wider news read for the seat.
-- The office reads; principals write roadmaps and readings; the office marks progress and writes
-- notes; agents and other campaigns see nothing. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 39 is in
do $$ begin assert public.groundwork_schema_version() >= 39; end $$;

-- test: a manager writes a roadmap; the agent and Mathira can't read it; the agent can't write one
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
insert into public.campaign_roadmaps (headline, phases) values ('Register, recruit, then win', '[]');
do $$ begin
  assert (select campaign_id from public.campaign_roadmaps) = 'ca000000-0000-4000-8000-000000000002';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.campaign_roadmaps) = 0;
  assert pg_temp.fails_with($q$insert into public.campaign_roadmaps (headline) values ('mine')$q$,
    'new row violates row-level security policy for table "campaign_roadmaps"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin assert (select count(*) from public.campaign_roadmaps) = 0; end $$;
rollback;

-- test: the office marks a milestone and writes notes; only the writer removes a note
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
insert into public.roadmap_items (key, status, owner) values ('agents-recruit', 'doing', 'Wanjiru');
insert into public.roadmap_items (key, status) values ('agents-recruit', 'done')
  on conflict (campaign_id, key) do update set status = excluded.status;
insert into public.roadmap_notes (workstream, body, author_name) values ('agents', 'Churches first', 'C3');
do $$ begin
  assert (select status from public.roadmap_items where key = 'agents-recruit') = 'done';
  assert pg_temp.fails_with($q$insert into public.roadmap_items (key) values ('Bad Key!')$q$,
    'new row for relation "roadmap_items" violates check constraint "roadmap_items_key_check"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
delete from public.roadmap_notes;
do $$ begin assert (select count(*) from public.roadmap_notes) = 1; end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.roadmap_items) = 0;
  assert (select count(*) from public.roadmap_notes) = 0;
  assert pg_temp.fails_with($q$insert into public.roadmap_notes (body) values ('x')$q$,
    'new row violates row-level security policy for table "roadmap_notes"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
delete from public.roadmap_notes;
do $$ begin assert (select count(*) from public.roadmap_notes) = 0; end $$;
rollback;

-- test: a reading of a national story is one per link, https only, and kept in its campaign
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
insert into public.news_impacts (title, url, scope, stance, reading)
values ('Housing launch in Eldoret', 'https://example.com/a', 'national', 'threat', 'Lifts the rival party here.');
do $$ begin
  assert pg_temp.fails_with($q$insert into public.news_impacts (title, url, scope, stance, reading) values ('again', 'https://example.com/a', 'national', 'threat', 'x')$q$,
    'duplicate key value violates unique constraint "news_impacts_story_idx"');
  assert pg_temp.fails_with($q$insert into public.news_impacts (title, url, scope, stance, reading) values ('plain', 'http://example.com/b', 'county', 'context', 'x')$q$,
    'new row for relation "news_impacts" violates check constraint "news_impacts_url_check"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin assert (select count(*) from public.news_impacts) = 0; end $$;
rollback;
