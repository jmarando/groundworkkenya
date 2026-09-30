-- Listening, part 2: Google Alert feeds on keywords, rivals' posts and how
-- they landed, and the daily ScrapeCreators budget. Run with tests/sql/run.sh;
-- each test rolls back.

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

-- test: a keyword takes a Google Alert feed and nothing else
begin;
insert into public.listening_topics (campaign_id, label, query)
values ('ca000000-0000-4000-8000-000000000003', 'Water', 'Mathira water');
do $$ begin
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://www.google.com/alerts/feeds/01234567890123456789/12345678901234567890' where label = 'Water'$q$) is null,
    'a Google Alert feed is refused';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'http://www.google.com/alerts/feeds/0123/4567' where label = 'Water'$q$) = '23514', 'a plain http feed is accepted';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://evil.test/alerts/feeds/0123/4567' where label = 'Water'$q$) = '23514', 'another site is accepted';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://www.google.com/alerts/feeds/0123/4567?next=https://evil.test' where label = 'Water'$q$) = '23514',
    'a feed link with extras is accepted';
end $$;
rollback;

-- test: the daily budget stops at its limit, and each budget is its own
begin;
do $$ begin
  assert public.take_social_credits('rivals', 50, 60), 'the first 50 of 60';
  assert not public.take_social_credits('rivals', 11, 60), 'past the limit';
  assert public.take_social_credits('rivals', 10, 60), 'up to the limit';
  assert public.take_social_credits('keywords', 60, 60), 'keywords have their own budget';
  assert (select used from public.social_credits where budget = 'rivals') = 60, 'rivals used 60';
end $$;
rollback;

-- test: staff may spend from the budget, the rest of the team may not
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin assert public.take_social_credits('keywords', 3, 60), 'a manager''s sweep spends'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert not public.take_social_credits('keywords', 3, 60), 'an agent spends'; end $$;
reset role;
set local role anon;
do $$
begin
  perform public.take_social_credits('keywords', 1, 60);
  assert false, 'anon spends';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: a post keeps its rival until the rival is removed
begin;
insert into public.race_rivals (id, campaign_id, name, tone)
values ('71000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'Some Rival', 'a');
insert into public.listening_mentions
  (campaign_id, url, source, rival_id, comments_read, comments_positive, comments_negative, comments_issue)
values ('ca000000-0000-4000-8000-000000000003', 'https://www.tiktok.com/@x/video/1', 'tiktok',
        '71000000-0000-4000-8000-000000000001', 50, 12, 31, 'water');
delete from public.race_rivals where id = '71000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select rival_id from public.listening_mentions where url = 'https://www.tiktok.com/@x/video/1') is null,
    'the post still points at a removed rival';
end $$;
rollback;
