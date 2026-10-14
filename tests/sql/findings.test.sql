-- The findings engine's counts: issues by ward and by week, rival mentions by
-- week, stipend spend and supporters by ward. Each counts the caller's own
-- campaign only, gives a field agent nothing, and returns no personal column.
-- Test rows use a ward and issue names of their own ("Zq …"), so the seeded
-- campaign records never change a count. Run with tests/sql/run.sh; each test
-- rolls back.

\ir fixtures.sql

-- A ward of Sakaja's for these tests alone.
create or replace function pg_temp.zq_ward()
returns uuid language plpgsql as $$
declare w uuid;
begin
  select id into w from public.wards where slug = 'zq-ward';
  if w is null then
    insert into public.wards (campaign_id, name, slug, constituency)
    values ('ca000000-0000-4000-8000-000000000002', 'Zq Ward', 'zq-ward', 'Zq')
    returning id into w;
  end if;
  return w;
end $$;

-- test: the schema is at version 25 or later
do $$ begin
  assert public.groundwork_schema_version() >= 25, 'schema 25';
end $$;

-- test: issues raised in a ward, by source and only in the window, for the caller's campaign alone
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
  p uuid;
begin
  insert into public.people (campaign_id, phone, full_name, ward_id)
  values (sak, '+254711900001', 'Door person', w) returning id into p;
  insert into public.person_events (campaign_id, person_id, kind, channel, detail, created_at) values
    (sak, p, 'door_spoke', 'door', 'Zq water', now() - interval '2 days'),
    (sak, p, 'door_spoke', 'door', 'Zq water', now() - interval '3 days'),
    (sak, p, 'door_spoke', 'door', 'Zq roads', now() - interval '40 days'),
    (sak, p, 'door_not_home', 'door', null, now() - interval '1 day');
  insert into public.conversations (campaign_id, person_id, channel, issue, last_message_at)
  values (sak, p, 'sms', 'Zq water', now() - interval '1 day');
  insert into public.listening_mentions (campaign_id, url, issue, ward, found_at) values
    (sak, 'https://news.example.test/zq1', 'Zq water', ' zq ward', now() - interval '1 day'),
    (sak, 'https://news.example.test/zq2', 'Zq water', 'Elsewhere', now() - interval '1 day');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare w uuid := (select id from public.wards where slug = 'zq-ward');
begin
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'door' and issue = 'Zq water') = 2,
    'two door issues in 30 days';
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'messages' and issue = 'Zq water') = 1;
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'news' and issue = 'Zq water') = 1,
    'a mention tagged with the ward by name, whatever its case and spaces';
  assert not exists (select 1 from public.ward_issues(30) where issue = 'Zq roads'), 'forty days ago is outside 30';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert not exists (select 1 from public.ward_issues(30) where issue like 'Zq%'), 'Mathira sees none of Sakaja''s issues';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_issues(30)), 'a field agent gets nothing';
end $$;
rollback;

-- test: issues by week: this week is week 0, last week week 1, nothing older than the weeks asked for
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  p uuid;
begin
  insert into public.people (campaign_id, phone, full_name)
  values (sak, '+254711900002', 'Someone') returning id into p;
  insert into public.person_events (campaign_id, person_id, kind, channel, detail, created_at) values
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '1 day'),
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '10 days'),
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '40 days');
  insert into public.listening_mentions (campaign_id, url, issue, found_at)
  values (sak, 'https://news.example.test/zq3', 'Zq floods', now() - interval '2 days');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select n from public.issue_weeks(5) where week = 0 and source = 'door' and issue = 'Zq floods') = 1;
  assert (select n from public.issue_weeks(5) where week = 1 and source = 'door' and issue = 'Zq floods') = 1,
    'ten days ago is last week';
  assert (select n from public.issue_weeks(5) where week = 0 and source = 'news' and issue = 'Zq floods') = 1;
  assert not exists (select 1 from public.issue_weeks(5) where week >= 5), 'nothing older than five weeks';
end $$;
rollback;

-- test: news about a rival counts for them through the team's keyword for them; their own posts don't
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  rv uuid;
  tp uuid;
begin
  insert into public.race_rivals (campaign_id, name, tone) values (sak, 'Zq Challenger', 'a') returning id into rv;
  insert into public.listening_topics (campaign_id, label, query, kind)
  values (sak, 'zq challenger', 'Zq Challenger Nairobi', 'rival') returning id into tp;
  insert into public.listening_mentions (campaign_id, url, topic_id, found_at) values
    (sak, 'https://news.example.test/zr1', tp, now() - interval '1 day'),
    (sak, 'https://news.example.test/zr2', tp, now() - interval '9 days');
  insert into public.listening_mentions (campaign_id, url, rival_id, source, found_at)
  values (sak, 'https://www.tiktok.com/@zq/video/1', rv, 'tiktok', now() - interval '1 day');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare rv uuid := (select id from public.race_rivals where name = 'Zq Challenger');
begin
  assert (select n from public.rival_mention_weeks(5) where week = 0 and rival_id = rv) = 1, 'this week''s news about them';
  assert (select n from public.rival_mention_weeks(5) where week = 1 and rival_id = rv) = 1, 'and last week''s';
  assert (select n from public.rival_mention_weeks(5) where week = 0 and rival_id is null)
       = (select count(*) from public.listening_mentions
           where rival_id is null and found_at > now() - interval '7 days'),
    'every news mention this week, their own posts aside';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.rival_mention_weeks(5)), 'a field agent gets nothing';
end $$;
rollback;

-- test: stipends by ward over 30 days, owed, approved and paid alike
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
begin
  insert into public.agent_stipends (campaign_id, agent_name, ward_id, amount_kes, status, created_at, paid_at) values
    (sak, 'Agent One', w, 1000, 'pending', now() - interval '2 days', null),
    (sak, 'Agent Two', w, 1500, 'paid', now() - interval '60 days', now() - interval '3 days'),
    (sak, 'Agent Three', w, 9999, 'paid', now() - interval '45 days', now() - interval '45 days');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select s.kes from public.ward_spend(30) s join public.wards w on w.id = s.ward_id where w.slug = 'zq-ward') = 2500,
    'paid three days ago counts, though entered sixty days ago; paid 45 days ago does not';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_spend(30)), 'a field agent gets nothing';
end $$;
rollback;

-- test: supporters by ward: agreed to SMS, not opted out, not samples
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
begin
  insert into public.people (campaign_id, phone, full_name, ward_id, consent_sms, opted_out, tags) values
    (sak, '+254711900011', 'Yes', w, true, false, '{}'),
    (sak, '+254711900012', 'No consent', w, false, false, '{}'),
    (sak, '+254711900013', 'Stopped', w, true, true, '{}'),
    (sak, '+254711900014', 'Sample', w, true, false, '{sample}');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select s.supporters from public.ward_supporters() s join public.wards w on w.id = s.ward_id
           where w.slug = 'zq-ward') = 1;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_supporters()), 'a field agent gets nothing';
end $$;
rollback;

-- test: the counts return no personal columns
do $$
declare bad text;
begin
  select string_agg(p.proname || '.' || a, ', ') into bad
    from pg_proc p, unnest(p.proargnames) a
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('ward_issues', 'issue_weeks', 'rival_mention_weeks', 'ward_spend', 'ward_supporters')
     and a ~ '(name|phone|person|email|actor)';
  assert bad is null, 'personal columns: ' || bad;
  assert (select count(distinct proname) from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('ward_issues', 'issue_weeks', 'rival_mention_weeks', 'ward_spend', 'ward_supporters')) = 5,
    'all five functions exist';
end $$;
