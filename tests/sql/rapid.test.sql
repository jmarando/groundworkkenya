-- Schema 40: a reaction to a post is the office's to read and the principals' to write; agents and
-- other campaigns see nothing. An alert's minimum reach is positive or none. Each test rolls back.

\ir fixtures.sql

-- test: schema 40 is in
do $$ begin assert public.groundwork_schema_version() >= 40; end $$;

-- test: a manager drafts a reaction and marks it briefed; the agent and Mathira see nothing
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
insert into public.rapid_responses (post_url, platform, what_happened, angle)
values ('https://www.tiktok.com/@x/video/1', 'tiktok', 'A clip saying the market was not built', 'Show the market');
update public.rapid_responses set status = 'briefed';
do $$ begin
  assert (select status from public.rapid_responses) = 'briefed';
  assert (select campaign_id from public.rapid_responses) = 'ca000000-0000-4000-8000-000000000002';
  assert pg_temp.fails_with($q$insert into public.rapid_responses (post_url, what_happened) values ('http://x', 'y')$q$,
    'new row for relation "rapid_responses" violates check constraint "rapid_responses_post_url_check"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.rapid_responses) = 0;
  assert pg_temp.fails_with($q$insert into public.rapid_responses (what_happened) values ('mine')$q$,
    'new row violates row-level security policy for table "rapid_responses"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin assert (select count(*) from public.rapid_responses) = 0; end $$;
rollback;

-- test: an alert's minimum reach is positive or none
begin;
do $$ begin
  assert pg_temp.fails_with($q$insert into public.listening_alerts (campaign_id, name, destination, min_reach) values ('ca000000-0000-4000-8000-000000000002', 'x', 'a@example.com', 0)$q$,
    'new row for relation "listening_alerts" violates check constraint "listening_alerts_min_reach_check"');
end $$;
insert into public.listening_alerts (campaign_id, name, destination, min_reach) values ('ca000000-0000-4000-8000-000000000002', 'Spreading', 'a@example.com', 5000);
rollback;
