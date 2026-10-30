-- Schema 48: stories, posts about one thing followed from the first we found to how far it spread.
-- The office reads its own campaign's; the candidate and managers mark one handled (and its posts
-- actioned); only the server forms them. Each test rolls back.

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

-- test: schema 48 is in
do $$ begin assert public.groundwork_schema_version() >= 48; end $$;

-- test: a manager marks a story handled, and its posts are actioned with it
begin;
insert into public.listening_stories (id, campaign_id, title, first_seen_at, last_post_at, posts, voices)
values ('51000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Taps dry for nine days', now(), now(), 3, 3),
       ('51000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000002', 'Another story', now(), now(), 2, 2);
insert into public.listening_mentions (campaign_id, url, source, status, story_id, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/s1', 'x', 'new', '51000000-0000-4000-8000-000000000001', now()),
  ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/s2', 'x', 'ignored', '51000000-0000-4000-8000-000000000001', now()),
  ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/s3', 'x', 'new', '51000000-0000-4000-8000-000000000002', now());
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  perform public.set_story_handled('51000000-0000-4000-8000-000000000001');
  assert (select status from public.listening_stories where id = '51000000-0000-4000-8000-000000000001') = 'handled';
  assert (select handled_by from public.listening_stories where id = '51000000-0000-4000-8000-000000000001') = '00000000-0000-0000-0000-0000000000c3', 'who handled it';
  assert (select handled_at from public.listening_stories where id = '51000000-0000-4000-8000-000000000001') is not null;
  assert (select status from public.listening_mentions where url = 'https://x.com/zq/status/s1') = 'actioned', 'a new post is actioned';
  assert (select status from public.listening_mentions where url = 'https://x.com/zq/status/s2') = 'ignored', 'one already put aside stays so';
  assert (select status from public.listening_mentions where url = 'https://x.com/zq/status/s3') = 'new', 'another story''s post is untouched';
  assert (select status from public.listening_stories where id = '51000000-0000-4000-8000-000000000002') = 'new';
end $$;
rollback;

-- test: a field agent, another campaign's candidate and a stranger cannot mark it, or even see it
begin;
insert into public.listening_stories (id, campaign_id, title, first_seen_at, last_post_at)
values ('51000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Taps dry for nine days', now(), now());
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_stories) = 0, 'a field agent reads no story';
  assert pg_temp.state_of($q$select public.set_story_handled('51000000-0000-4000-8000-000000000001')$q$) = '42501', 'nor marks one';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_stories) = 0, 'Mathira reads none of Sakaja''s';
  assert pg_temp.state_of($q$select public.set_story_handled('51000000-0000-4000-8000-000000000001')$q$) = '42501', 'nor marks one';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_stories) = 0, 'a stranger reads none';
end $$;
reset role;
do $$ begin
  assert (select status from public.listening_stories) = 'new', 'and nothing changed';
end $$;
rollback;

-- test: the office reads; only the handled columns may be changed, and only the server writes a story
begin;
insert into public.listening_stories (id, campaign_id, title, first_seen_at, last_post_at)
values ('51000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Taps dry for nine days', now(), now());
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_stories) = 1, 'the manager reads it';
  assert pg_temp.state_of($q$update public.listening_stories set title = 'Renamed by hand'$q$) = '42501', 'the title is the server''s';
  assert pg_temp.state_of($q$update public.listening_stories set campaign_id = 'ca000000-0000-4000-8000-000000000003'$q$) = '42501', 'and so is the campaign';
  assert pg_temp.state_of($q$insert into public.listening_stories (campaign_id, title, first_seen_at, last_post_at) values ('ca000000-0000-4000-8000-000000000002', 'x', now(), now())$q$) = '42501', 'no one signed in forms a story';
  assert pg_temp.state_of($q$delete from public.listening_stories$q$) = '42501', 'or removes one';
end $$;
rollback;

-- test: removing a story leaves its posts and reactions, with the link cleared
begin;
insert into public.listening_stories (id, campaign_id, title, first_seen_at, last_post_at)
values ('51000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'Taps dry for nine days', now(), now());
insert into public.listening_mentions (campaign_id, url, source, story_id, found_at)
values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/d1', 'x', '51000000-0000-4000-8000-000000000001', now());
insert into public.rapid_responses (campaign_id, what_happened, story_id)
values ('ca000000-0000-4000-8000-000000000002', 'Taps dry', '51000000-0000-4000-8000-000000000001');
do $$ begin
  delete from public.listening_stories;
  assert (select story_id from public.listening_mentions where url = 'https://x.com/zq/status/d1') is null, 'the post keeps no link';
  assert (select story_id from public.rapid_responses) is null, 'nor does the reaction';
  assert (select count(*) from public.listening_mentions where url = 'https://x.com/zq/status/d1') = 1, 'the post is still there';
end $$;
rollback;

-- test: a post may name the post it answers, and only by a secure address
begin;
do $$ begin
  assert pg_temp.state_of($q$insert into public.listening_mentions (campaign_id, url, source, refers_to) values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/r1', 'x', 'https://x.com/i/status/99')$q$) is null;
  assert pg_temp.state_of($q$insert into public.listening_mentions (campaign_id, url, source, refers_to) values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/r2', 'x', 'javascript:alert(1)')$q$) = '23514';
end $$;
rollback;

-- test: a story with no posts goes after 30 days; one with posts stays
begin;
insert into public.listening_stories (id, campaign_id, title, first_seen_at, last_post_at, updated_at) values
  ('51000000-0000-4000-8000-0000000000a1', 'ca000000-0000-4000-8000-000000000002', 'Empty and old', now(), now(), now() - interval '31 days'),
  ('51000000-0000-4000-8000-0000000000a2', 'ca000000-0000-4000-8000-000000000002', 'Empty and young', now(), now(), now() - interval '29 days'),
  ('51000000-0000-4000-8000-0000000000a3', 'ca000000-0000-4000-8000-000000000002', 'Old with a post', now(), now(), now() - interval '90 days');
insert into public.listening_mentions (campaign_id, url, source, story_id, found_at)
values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/p1', 'x', '51000000-0000-4000-8000-0000000000a3', now());
do $$ begin
  perform public.prune_old_records();
  assert (select array_agg(title order by title) from public.listening_stories) = array['Empty and young', 'Old with a post'];
end $$;
rollback;
