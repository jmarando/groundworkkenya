-- Schema 33: what a field agent may read (the people at their own doors and the people they have
-- met, none of the inbox), a knock at a known number landing on that person, channel addresses
-- set by Groundwork alone, and invitations taken up only by a confirmed email.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

create or replace function pg_temp.doors(_from integer, _to integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('pc', 'AGNT0000+' || lpad(i::text, 2, '0'), 'lat', -1.28 - i * 0.00005, 'lng', 36.78,
    'outline', jsonb_build_array(jsonb_build_array(jsonb_build_array(36.78, -1.28), jsonb_build_array(36.78002, -1.28),
                                                   jsonb_build_array(36.78002, -1.28002), jsonb_build_array(36.78, -1.28))),
    'ward_id', null) order by i) from generate_series(_from, _to) i $$;

-- Three people in Sakaja: one at a door on the agent's list, one at a door off it, one with no door.
create or replace function pg_temp.setup() returns void language plpgsql as $$
begin
  insert into public.people (campaign_id, phone, full_name, building_id) values
    ('ca000000-0000-4000-8000-000000000002', '+254700000101', 'At the door', 'AGNT0000+01'),
    ('ca000000-0000-4000-8000-000000000002', '+254700000102', 'Down the road', 'ELSE0000+01'),
    ('ca000000-0000-4000-8000-000000000002', '+254700000103', null, null);
  insert into public.conversations (campaign_id, person_id, channel)
  select campaign_id, id, 'sms' from public.people where phone = '+254700000101';
end $$;

-- test: schema 33 is in
do $$ begin assert public.groundwork_schema_version() >= 33; end $$;

-- test: an agent with no list sees nobody; the manager sees everyone
begin;
do $$ begin perform pg_temp.setup(); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.people where phone like '+2547000001%') = 0;
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.people where phone like '+2547000001%') = 3;
  assert (select count(*) from public.conversations c join public.people p on p.id = c.person_id
           where p.phone = '+254700000101') = 1;
end $$;
rollback;

-- test: an agent sees the people at the doors of their open list, and nothing of the inbox
begin;
do $$ begin perform pg_temp.setup(); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin perform public.create_walk_list('Agent doors', null,
  (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' and slug = 'kileleshwa'), pg_temp.doors(1, 3), '00000000-0000-0000-0000-0000000000b2'); end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select array_agg(full_name) from public.people where phone like '+2547000001%') = array['At the door'];
  assert (select count(*) from public.conversations) = 0;
  assert (select count(*) from public.messages) = 0;
  assert pg_temp.fails_with($q$insert into public.conversations (person_id, channel)
    select id, 'sms' from public.people where phone = '+254700000101'$q$,
    'new row violates row-level security policy for table "conversations"');
  -- An update of someone out of sight changes nothing.
  update public.people set full_name = 'Renamed' where phone = '+254700000102';
end $$;
reset role;
do $$ begin
  assert (select full_name from public.people where phone = '+254700000102') = 'Down the road';
end $$;
rollback;

-- test: an agent meeting a number already on file lands the visit on that person and then sees them
begin;
do $$ begin perform pg_temp.setup(); end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare r jsonb;
begin
  r := public.record_door('00000000-0000-4000-8000-0000000000e1', null,
    '{"phone": "+254700000103", "name": "Wanjiru"}', 'spoke', 4, 'water', '{"sms": true}', 'Said yes at the door', now(), null);
  assert (r ->> 'created') = 'false', r::text;
  assert (select full_name from public.people where phone = '+254700000103') = 'Wanjiru';
  assert (select consent_sms from public.people where phone = '+254700000103');
  -- The rest of the campaign is still out of sight.
  assert (select count(*) from public.people where phone like '+2547000001%') = 1;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.people where phone = '+254700000103') = 1;
  assert (select support_score from public.people where phone = '+254700000103') = 75;
end $$;
rollback;

-- test: an agent signing up someone new at the door can read them back
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare r jsonb;
begin
  r := public.record_door('00000000-0000-4000-8000-0000000000e2', null,
    '{"phone": "+254700000199", "name": "New Neighbour"}', 'spoke', null, '', '{}', '', now(), null);
  assert (r ->> 'created') = 'true', r::text;
  assert (select full_name from public.people where id = (r ->> 'person_id')::uuid) = 'New Neighbour';
  -- Their own entries in the history, and nobody else's.
  assert (select count(*) from public.person_events where person_id = (r ->> 'person_id')::uuid) = 2;
  assert (select count(*) from public.person_events where actor is distinct from auth.uid()) = 0;
end $$;
rollback;

-- test: a campaign manager labels a channel but cannot set its address or status; the super admin can
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with($q$insert into public.campaign_channels (kind, identifier, status)
    values ('sms', '22555', 'live')$q$, 'Groundwork sets up a channel''s address. Ask us to connect it.');
  insert into public.campaign_channels (kind, display) values ('sms', 'Our SMS line');
  update public.campaign_channels set note = 'Asked for a short code' where kind = 'sms';
  assert pg_temp.fails_with($q$update public.campaign_channels set identifier = '22555' where kind = 'sms'$q$,
    'Groundwork sets up a channel''s address. Ask us to connect it.');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
set local role authenticated;
do $$ begin
  update public.campaign_channels set identifier = '22555', status = 'live'
   where kind = 'sms' and campaign_id = 'ca000000-0000-4000-8000-000000000002';
  assert (select identifier = '22555' and status = 'live' and display = 'Our SMS line'
            from public.campaign_channels where kind = 'sms' and campaign_id = 'ca000000-0000-4000-8000-000000000002');
end $$;
rollback;

-- test: an invitation waiting in one campaign can't be taken by another
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin perform public.invite_member('ca000000-0000-4000-8000-000000000002', 'newcomer@example.com', 'agent'); end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with($q$select public.invite_member('ca000000-0000-4000-8000-000000000003', 'Newcomer@example.com', 'manager')$q$,
    'That email already has an invitation waiting.');
end $$;
reset role;
do $$ begin
  assert (select campaign_id = 'ca000000-0000-4000-8000-000000000002' and role = 'agent'
            from public.campaign_invites where email = 'newcomer@example.com');
end $$;
rollback;

-- test: an invitation is taken up only once the email is confirmed
begin;
insert into public.campaign_invites (campaign_id, email, role)
values ('ca000000-0000-4000-8000-000000000002', 'later@example.com', 'organiser');
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000000aa', 'later@example.com', null);
do $$ begin
  assert not exists (select 1 from public.campaign_members where user_id = '00000000-0000-0000-0000-0000000000aa');
  assert exists (select 1 from public.profiles where user_id = '00000000-0000-0000-0000-0000000000aa');
end $$;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000aa';
do $$ begin
  assert (select role = 'organiser' from public.campaign_members where user_id = '00000000-0000-0000-0000-0000000000aa');
  assert not exists (select 1 from public.campaign_invites where email = 'later@example.com');
end $$;
rollback;

-- test: nobody becomes super admin on an unconfirmed address
begin;
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000000ab', 'justin@glab.africa', null);
do $$ begin
  assert not exists (select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000ab');
end $$;
rollback;
