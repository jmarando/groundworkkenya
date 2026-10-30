-- Schema 49: a record of the voices the campaign has approached. The office reads its own campaign's;
-- the candidate and managers record an approach and move its status; no one deletes one. Each test
-- rolls back.

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

-- test: schema 49 is in
do $$ begin assert public.groundwork_schema_version() >= 49; end $$;

-- test: a manager records an approach in their own campaign, then moves its status
begin;
-- One recorded a day ago, to see a change dated (now() holds still inside a transaction).
insert into public.voice_outreach (campaign_id, voice_key, platform, name, invitation, channel, created_at, updated_at)
values ('ca000000-0000-4000-8000-000000000002', 'x:@old_friend', 'x', '@old_friend', 'Hello.', 'copied', now() - interval '1 day', now() - interval '1 day');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  insert into public.voice_outreach (voice_key, platform, name, url, invitation, channel)
  values ('tiktok:@mtaani_reels', 'tiktok', '@mtaani_reels', 'https://www.tiktok.com/@mtaani_reels', 'Hello, we are the campaign team.', 'copied');
  assert (select campaign_id from public.voice_outreach where voice_key = 'tiktok:@mtaani_reels') = 'ca000000-0000-4000-8000-000000000002', 'the campaign is the manager''s own';
  assert (select created_by from public.voice_outreach where voice_key = 'tiktok:@mtaani_reels') = '00000000-0000-0000-0000-0000000000c3', 'who approached';
  assert (select status from public.voice_outreach where voice_key = 'tiktok:@mtaani_reels') = 'approached', 'it starts as approached';
  update public.voice_outreach set status = 'invited' where voice_key = 'tiktok:@mtaani_reels';
  assert (select status from public.voice_outreach where voice_key = 'tiktok:@mtaani_reels') = 'invited';
  update public.voice_outreach set invitation = 'Edited.', status = 'on_roster', pulse_prospect_id = 'p-1' where voice_key = 'tiktok:@mtaani_reels';
  assert (select invitation || status || pulse_prospect_id from public.voice_outreach where voice_key = 'tiktok:@mtaani_reels') = 'Edited.on_rosterp-1';
  assert (select updated_at from public.voice_outreach where voice_key = 'x:@old_friend') < now() - interval '1 hour', 'an untouched one keeps its date';
  update public.voice_outreach set status = 'declined' where voice_key = 'x:@old_friend';
  assert (select updated_at from public.voice_outreach where voice_key = 'x:@old_friend') > now() - interval '1 hour', 'a change is dated';
end $$;
rollback;

-- test: the candidate does the same; an organiser reads but may not record or change
begin;
insert into public.voice_outreach (campaign_id, voice_key, platform, name, invitation, channel)
values ('ca000000-0000-4000-8000-000000000002', 'x:@thika_road_diaries', 'x', '@thika_road_diaries', 'Hello.', 'copied');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$ begin
  insert into public.voice_outreach (voice_key, platform, name, invitation, channel)
  values ('x:@another', 'x', '@another', 'Hello.', 'copied');
  assert (select count(*) from public.voice_outreach) = 2, 'the candidate records one';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.voice_outreach) = 2, 'an organiser reads both';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@third', 'x', '@third', 'Hello.', 'copied')$q$) = '42501', 'but may not record one';
  update public.voice_outreach set status = 'declined';
  assert (select count(*) from public.voice_outreach where status = 'declined') = 0, 'nor change one';
end $$;
rollback;

-- test: a field agent, another campaign's candidate and a stranger read none; Mathira's own are its own
begin;
insert into public.voice_outreach (campaign_id, voice_key, platform, name, invitation, channel)
values ('ca000000-0000-4000-8000-000000000002', 'x:@thika_road_diaries', 'x', '@thika_road_diaries', 'Hello.', 'copied');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.voice_outreach) = 0, 'a field agent reads none';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@sneaky', 'x', '@sneaky', 'Hello.', 'copied')$q$) = '42501', 'nor records one';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.voice_outreach) = 0, 'a stranger reads none';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.voice_outreach) = 0, 'Mathira reads none of Sakaja''s';
  insert into public.voice_outreach (voice_key, platform, name, invitation, channel)
  values ('x:@thika_road_diaries', 'x', '@thika_road_diaries', 'Hello.', 'copied');
  assert (select campaign_id from public.voice_outreach) = 'ca000000-0000-4000-8000-000000000003', 'the same voice, approached by Mathira, is Mathira''s';
  update public.voice_outreach set status = 'declined';
end $$;
reset role;
do $$ begin
  assert (select status from public.voice_outreach where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 'approached', 'and Sakaja''s is untouched';
end $$;
rollback;

-- test: one approach to a voice in a campaign, not two; and no one files it under another campaign
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  insert into public.voice_outreach (voice_key, platform, name, invitation, channel)
  values ('x:@thika_road_diaries', 'x', '@thika_road_diaries', 'Hello.', 'copied');
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@thika_road_diaries', 'x', '@thika_road_diaries', 'Again.', 'copied')$q$) = '23505', 'a second approach conflicts';
  assert pg_temp.state_of($q$insert into public.voice_outreach (campaign_id, voice_key, platform, name, invitation, channel) values ('ca000000-0000-4000-8000-000000000003', 'x:@other', 'x', '@other', 'Hello.', 'copied')$q$) = '42501', 'the campaign is not the caller''s to choose';
  assert pg_temp.state_of($q$update public.voice_outreach set voice_key = 'x:@renamed'$q$) = '42501', 'the voice is fixed once recorded';
  assert pg_temp.state_of($q$update public.voice_outreach set campaign_id = 'ca000000-0000-4000-8000-000000000003'$q$) = '42501', 'and so is the campaign';
  assert pg_temp.state_of($q$delete from public.voice_outreach$q$) = '42501', 'no one removes an approach';
end $$;
rollback;

-- test: the invitation, the channel, the status and the address are held to what they may be
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@a', 'x', '@a', repeat('x', 2001), 'copied')$q$) = '23514', 'an invitation over 2,000 characters';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@b', 'x', '@b', 'Hello.', 'sms')$q$) = '23514', 'a channel that is neither copied nor pulse';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel, status) values ('x:@c', 'x', '@c', 'Hello.', 'copied', 'hired')$q$) = '23514', 'a status that is not one of the four';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, url, invitation, channel) values ('x:@d', 'x', '@d', 'javascript:alert(1)', 'Hello.', 'copied')$q$) = '23514', 'an address that is not secure';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel) values ('x:@e', 'x', '@e', '', 'copied')$q$) = '23514', 'an empty invitation';
  assert pg_temp.state_of($q$insert into public.voice_outreach (voice_key, platform, name, invitation, channel, status) values ('x:@f', 'x', '@f', 'Hello.', 'pulse', 'declined')$q$) is null, 'a good one passes';
end $$;
rollback;

-- test: approaches older than three years go; younger ones stay
begin;
insert into public.voice_outreach (campaign_id, voice_key, platform, name, invitation, channel, created_at) values
  ('ca000000-0000-4000-8000-000000000002', 'x:@old', 'x', '@old', 'Hello.', 'copied', now() - interval '3 years 1 day'),
  ('ca000000-0000-4000-8000-000000000002', 'x:@young', 'x', '@young', 'Hello.', 'copied', now() - interval '2 years 364 days');
do $$ begin
  perform public.prune_old_records();
  assert (select array_agg(voice_key) from public.voice_outreach) = array['x:@young'];
end $$;
rollback;

-- test: the earlier retention still runs (a reading 181 days old goes, one 179 days old stays)
begin;
insert into public.listening_mentions (id, campaign_id, url, source, found_at)
values ('52000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'https://x.com/zq/status/o1', 'x', now());
insert into public.listening_readings (campaign_id, mention_id, at, reach) values
  ('ca000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', now() - interval '181 days', 1),
  ('ca000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', now() - interval '179 days', 2);
do $$ begin
  assert (public.prune_old_records() ->> 'readings')::integer = 1, 'one reading pruned';
  assert (select count(*) from public.listening_readings) = 1;
end $$;
rollback;
