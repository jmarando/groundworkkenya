-- Schema 46: Listening keeps history. A reading of a post's views and shares per sweep, and a
-- record of each Kenyan day's gathering. The office reads; only the server writes. Each test
-- rolls back.

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

-- test: schema 46 is in
do $$ begin assert public.groundwork_schema_version() >= 46; end $$;

-- test: a post takes its first count, keeps the highest, and a reading is saved only when it says something
begin;
insert into public.listening_mentions (campaign_id, url, source, found_at)
values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/1', 'x', now());
do $$
declare
  c   uuid := 'ca000000-0000-4000-8000-000000000002';
  mid uuid;
  put jsonb;
begin
  select id into mid from public.listening_mentions where url = 'https://x.com/zq/status/1';
  put := jsonb_build_array(jsonb_build_object('campaign_id', c, 'url', 'https://x.com/zq/status/1', 'reach', 100, 'shares', null));
  assert public.record_post_counts(put) = 1, 'the first count saves a reading';
  assert (select reach from public.listening_mentions where id = mid) = 100, 'a post with no count takes its first';
  assert public.record_post_counts(put) = 0, 'the same counts within 6 hours save nothing';

  update public.listening_readings set at = at - interval '7 hours' where mention_id = mid;
  assert public.record_post_counts(put) = 1, 'the same counts 7 hours on save a reading';

  put := jsonb_build_array(jsonb_build_object('campaign_id', c, 'url', 'https://x.com/zq/status/1', 'reach', 150, 'shares', 4));
  assert public.record_post_counts(put) = 1, 'new counts save a reading';
  assert (select reach from public.listening_mentions where id = mid) = 150, 'the post rises to 150';
  assert (select shares from public.listening_mentions where id = mid) = 4, 'shares rise with it';

  put := jsonb_build_array(jsonb_build_object('campaign_id', c, 'url', 'https://x.com/zq/status/1', 'reach', 120, 'shares', 4));
  assert public.record_post_counts(put) = 1, 'a lower count is still a reading';
  assert (select reach from public.listening_mentions where id = mid) = 150, 'the post keeps the highest seen';

  put := jsonb_build_array(jsonb_build_object('campaign_id', c, 'url', 'https://x.com/zq/status/1', 'reach', null, 'shares', 9));
  assert public.record_post_counts(put) = 1, 'shares alone are a reading';
  assert (select shares from public.listening_mentions where id = mid) = 9, 'shares rise on their own';
  assert (select reach from public.listening_mentions where id = mid) = 150, 'reach is left alone';

  put := jsonb_build_array(
    jsonb_build_object('campaign_id', c, 'url', 'https://x.com/zq/status/1', 'reach', null, 'shares', null),
    jsonb_build_object('campaign_id', c, 'url', 'https://x.com/nobody/status/2', 'reach', 5, 'shares', 1));
  assert public.record_post_counts(put) = 0, 'no counts, or a post we do not hold, save nothing';
  assert public.record_post_counts(null) = 0 and public.record_post_counts('{}'::jsonb) = 0, 'not a list saves nothing';
  assert (select count(*) from public.listening_readings where mention_id = mid) = 5, 'five readings in all';
end $$;
rollback;

-- test: the same url in two campaigns keeps two posts and two histories
begin;
insert into public.listening_mentions (campaign_id, url, source, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/7', 'x', now()),
  ('ca000000-0000-4000-8000-000000000003', 'https://x.com/zq/status/7', 'x', now());
do $$ begin
  assert public.record_post_counts(jsonb_build_array(
    jsonb_build_object('campaign_id', 'ca000000-0000-4000-8000-000000000002', 'url', 'https://x.com/zq/status/7', 'reach', 40))) = 1;
  assert (select reach from public.listening_mentions where campaign_id = 'ca000000-0000-4000-8000-000000000003' and url = 'https://x.com/zq/status/7') is null,
    'the other campaign''s copy is untouched';
end $$;
rollback;

-- test: the day record counts by the Kenyan day and leaves out rivals' own posts and off-topic posts
begin;
insert into public.race_rivals (id, campaign_id, name, tone)
values ('71000000-0000-4000-8000-0000000000aa', 'ca000000-0000-4000-8000-000000000002', 'Test Rival', 'a');
insert into public.listening_mentions (campaign_id, url, source, sentiment, issue, rival_id, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/d1', 'news', 'negative', 'water', null, '2026-10-28 20:59:00+00'),
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/d2', 'news', 'positive', 'water', null, '2026-10-28 21:30:00+00'),
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/d3', 'news', null,       'roads', null, '2026-10-29 10:00:00+00'),
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/d4', 'news', 'neutral',  'off-topic', null, '2026-10-29 10:00:00+00'),
  ('ca000000-0000-4000-8000-000000000002', 'https://www.tiktok.com/@zq/video/9', 'tiktok', 'positive', null, '71000000-0000-4000-8000-0000000000aa', '2026-10-29 10:00:00+00');
do $$
declare c uuid := 'ca000000-0000-4000-8000-000000000002';
begin
  perform public.refresh_listening_days(c, '2026-10-28', '2026-10-29');
  assert (select posts from public.listening_days where campaign_id = c and day = '2026-10-28') = 1, '23:59 Nairobi stays on the 28th';
  assert (select angry from public.listening_days where campaign_id = c and day = '2026-10-28') = 1;
  assert (select posts from public.listening_days where campaign_id = c and day = '2026-10-29') = 2, '00:30 Nairobi is the 29th; off-topic and rival posts are out';
  assert (select warm from public.listening_days where campaign_id = c and day = '2026-10-29') = 1;
  assert (select unread from public.listening_days where campaign_id = c and day = '2026-10-29') = 1;
  assert (select sweeps from public.listening_days where campaign_id = c and day = '2026-10-29') is null, 'recounting is not a sweep';

  -- a post re-read as off-topic leaves the count
  update public.listening_mentions set issue = 'off-topic' where url = 'https://news.example.test/d3';
  perform public.refresh_listening_days(c, '2026-10-29', '2026-10-29');
  assert (select posts from public.listening_days where campaign_id = c and day = '2026-10-29') = 1;
  update public.listening_mentions set issue = 'off-topic' where url = 'https://news.example.test/d2';
  perform public.refresh_listening_days(c, '2026-10-29', '2026-10-29');
  assert (select posts from public.listening_days where campaign_id = c and day = '2026-10-29') = 0, 'a day that loses all its posts reads zero, not stale';
end $$;
rollback;

-- test: a sweep records its day; a campaign with no active keyword is left alone
begin;
delete from public.listening_topics;
insert into public.listening_topics (campaign_id, label, query, active) values
  ('ca000000-0000-4000-8000-000000000002', 'Zq water', 'Zq water', true),
  ('ca000000-0000-4000-8000-000000000003', 'Zq paused', 'Zq paused', false);
do $$
declare today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  assert public.record_sweep_days() = 1, 'one campaign swept';
  assert (select sweeps from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002' and day = today) = 1;
  assert (select last_sweep_at from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002' and day = today) is not null;
  assert public.record_sweep_days() = 1;
  assert (select sweeps from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002' and day = today) = 2, 'each run adds one';
  assert not exists (select 1 from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000003'), 'no active keyword, no record';
end $$;
rollback;

-- test: a sweep after a backfill turns that day into a real record
begin;
delete from public.listening_topics;
insert into public.listening_topics (campaign_id, label, query) values ('ca000000-0000-4000-8000-000000000002', 'Zq', 'Zq');
insert into public.listening_mentions (campaign_id, url, source, sentiment, found_at)
values ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/b0', 'news', 'positive', now());
do $$
declare today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  perform public.backfill_listening_days();
  assert (select backfilled from public.listening_days where day = today limit 1) is true;
  perform public.record_sweep_days();
  assert (select backfilled from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002' and day = today) is false;
  assert (select sweeps from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002' and day = today) = 1;
end $$;
rollback;

-- test: the backfill writes one row per campaign-day with posts, marked, and does nothing twice
begin;
insert into public.listening_mentions (campaign_id, url, source, sentiment, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/f1', 'news', 'positive', '2026-10-20 08:00:00+00'),
  ('ca000000-0000-4000-8000-000000000002', 'https://news.example.test/f2', 'news', 'negative', '2026-10-21 08:00:00+00'),
  ('ca000000-0000-4000-8000-000000000003', 'https://news.example.test/f3', 'news', null,       '2026-10-21 08:00:00+00');
do $$ begin
  assert public.backfill_listening_days() = 3, 'three campaign-days';
  assert (select count(*) from public.listening_days where backfilled and sweeps is null) = 3;
  assert public.backfill_listening_days() = 0, 'nothing the second time';
end $$;
rollback;

-- test: the office reads its own campaign's history; agents and other campaigns read nothing
begin;
insert into public.listening_mentions (campaign_id, url, source, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/11', 'x', now()),
  ('ca000000-0000-4000-8000-000000000003', 'https://x.com/zq/status/12', 'x', now());
select public.record_post_counts(jsonb_build_array(
  jsonb_build_object('campaign_id', 'ca000000-0000-4000-8000-000000000002', 'url', 'https://x.com/zq/status/11', 'reach', 10),
  jsonb_build_object('campaign_id', 'ca000000-0000-4000-8000-000000000003', 'url', 'https://x.com/zq/status/12', 'reach', 20)));
insert into public.listening_days (campaign_id, day, posts) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-20', 1),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-20', 1);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_readings) = 1, 'the manager reads Sakaja''s reading';
  assert (select campaign_id from public.listening_readings) = 'ca000000-0000-4000-8000-000000000002';
  assert (select count(*) from public.listening_days) = 1, 'and Sakaja''s day';
  assert pg_temp.state_of($q$insert into public.listening_days (campaign_id, day) values ('ca000000-0000-4000-8000-000000000002', '2026-10-21')$q$) = '42501',
    'the office cannot write a day';
  assert pg_temp.state_of($q$insert into public.listening_readings (campaign_id, mention_id) select campaign_id, id from public.listening_mentions limit 1$q$) = '42501',
    'or a reading';
  assert pg_temp.state_of($q$select public.record_post_counts('[]'::jsonb)$q$) = '42501', 'or call the recorder';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.listening_readings) = 0, 'a field agent reads no readings';
  assert (select count(*) from public.listening_days) = 0, 'and no days';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin
  assert (select campaign_id from public.listening_readings) = 'ca000000-0000-4000-8000-000000000003', 'Mathira reads only its own';
  assert (select count(*) from public.listening_days where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 0;
end $$;
rollback;

-- test: only the server may run the history functions
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.record_post_counts(jsonb)',
    'public.refresh_listening_days(uuid, date, date)',
    'public.record_sweep_days()',
    'public.backfill_listening_days()'
  ] loop
    assert not has_function_privilege('authenticated', fn, 'execute'), fn;
    assert not has_function_privilege('anon', fn, 'execute'), fn;
    assert has_function_privilege('service_role', fn, 'execute'), fn;
  end loop;
end $$;

-- test: readings are kept 180 days and the daily record three years
begin;
insert into public.listening_mentions (campaign_id, url, source, found_at)
values ('ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/21', 'x', now());
insert into public.listening_readings (campaign_id, mention_id, reach, at)
select campaign_id, id, 1, now() - interval '181 days' from public.listening_mentions where url = 'https://x.com/zq/status/21';
insert into public.listening_readings (campaign_id, mention_id, reach, at)
select campaign_id, id, 2, now() - interval '179 days' from public.listening_mentions where url = 'https://x.com/zq/status/21';
insert into public.listening_days (campaign_id, day, posts) values
  ('ca000000-0000-4000-8000-000000000002', (current_date - 1100), 1),
  ('ca000000-0000-4000-8000-000000000002', (current_date - 1000), 1);
do $$
declare out jsonb;
begin
  out := public.prune_old_records();
  assert (select count(*) from public.listening_readings) = 1, 'the 181-day reading is gone';
  assert (select reach from public.listening_readings) = 2, 'the 179-day reading stays';
  assert (select count(*) from public.listening_days) = 1, 'the day over three years old is gone';
  assert (out->>'readings')::int = 1, 'prune says how many readings';
end $$;
rollback;
