-- Who can see and change what, across campaigns. Each account belongs to one
-- campaign and sees only its records; someone signed up but not admitted sees
-- nothing; the voter file is names and phone numbers. Run with
-- tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: roles mean what they say
do $$
begin
  assert public.is_team_member('00000000-0000-0000-0000-0000000000b2'), 'an agent is on the team';
  assert not public.is_team_member('00000000-0000-0000-0000-0000000000d4'), 'pending is not';
  assert public.is_staff('00000000-0000-0000-0000-0000000000a1'), 'the candidate is staff';
  assert public.is_staff('00000000-0000-0000-0000-0000000000c3'), 'the manager is staff';
  assert not public.is_staff('00000000-0000-0000-0000-0000000000b2'), 'an agent is not';
  assert public.is_super_admin('00000000-0000-0000-0000-000000000099');
  assert not public.is_super_admin('00000000-0000-0000-0000-0000000000a1'), 'a candidate is not super admin';
end $$;

-- test: someone waiting to be admitted sees nothing and can add nothing
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$
declare
  t text;
  n integer;
begin
  foreach t in array array['people', 'messages', 'conversations', 'person_events', 'poll_responses',
                           'polls', 'wards', 'incidents', 'broadcasts', 'listening_mentions',
                           'contributions', 'polling_stations', 'stream_results'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('pending account can read %s', t);
  end loop;
  begin
    insert into public.people (phone, full_name) values ('+254711000002', 'Kamau');
    assert false, 'pending account inserted a person';
  exception when insufficient_privilege or not_null_violation then null;
  end;
end $$;
rollback;

-- test: nobody signed out can read or write anything but a demo request
begin;
set local role anon;
do $$
declare
  n integer;
begin
  select count(*) into n from public.people;
  assert n = 0, 'anon can read people';
  select count(*) into n from public.campaigns;
  assert n = 0, 'anon can list campaigns';
  begin
    insert into public.people (phone, full_name) values ('+254711000003', 'Otieno');
    assert false, 'anon inserted a person';
  exception when insufficient_privilege or not_null_violation then null;
  end;
end $$;
rollback;

-- test: an agent works the voter file but cannot delete it or broadcast
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
declare
  n integer;
begin
  -- The migrations seed demo people into Sakaja.
  select count(*) into n from public.people;
  assert n > 1, 'agent reads their campaign''s people';
  insert into public.people (phone, full_name) values ('+254711000004', 'Achieng');
  delete from public.people where phone = '+254711000004';
  get diagnostics n = row_count;
  assert n = 0, 'agent deleted a person';
  begin
    perform public.queue_broadcast(gen_random_uuid(), '{}'::jsonb, 'Rally at noon. STOP kujiondoa');
    assert false, 'agent queued a broadcast';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- test: a campaign sees only its own records
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
declare
  n integer;
  t text;
begin
  foreach t in array array['people', 'messages', 'conversations', 'polling_stations', 'polls',
                           'broadcasts', 'contributions', 'listening_mentions', 'person_events'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('Mathira sees Sakaja''s %s', t);
  end loop;
  select count(*) into n from public.wards;
  assert n = 6, 'Mathira sees its own six wards and nobody else''s: ' || n;
  assert (select count(*) from public.campaigns) = 1, 'Mathira sees one campaign, its own';

  -- A new record lands in the caller's campaign.
  insert into public.people (phone, full_name) values ('+254722555001', 'Wairimu');
  assert (select campaign_id from public.people where phone = '+254722555001')
         = 'ca000000-0000-4000-8000-000000000003';

  -- Sakaja's people cannot be changed from Mathira.
  update public.people set full_name = 'Changed' where campaign_id = 'ca000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'Mathira changed Sakaja''s people';

  -- Nor can a record be written into Sakaja by naming it.
  begin
    insert into public.people (campaign_id, phone, full_name)
    values ('ca000000-0000-4000-8000-000000000002', '+254722555002', 'Planted');
    assert false, 'Mathira wrote a person into Sakaja';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.people where phone = '+254722555001'),
    'Sakaja sees Mathira''s new person';
end $$;
rollback;

-- test: the same number can be on two campaigns' lists
begin;
create temp table sakaja_phone on commit drop as
  select phone from public.people where campaign_id = 'ca000000-0000-4000-8000-000000000002' limit 1;
grant select on sakaja_phone to authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
set local role authenticated;
do $$
declare
  p text := (select phone from sakaja_phone);
begin
  insert into public.people (phone, full_name) values (p, 'Same number, other campaign');
  assert (select count(*) from public.people where phone = p) = 1, 'Mathira sees its own copy only';
end $$;
rollback;

-- test: the super admin sees the campaign in focus, and can switch
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
set local role authenticated;
do $$
declare
  n integer;
begin
  select count(*) into n from public.wards;
  assert n > 6, 'super admin sees Sakaja''s wards while looking at Sakaja';
  perform public.focus_campaign('ca000000-0000-4000-8000-000000000003');
  select count(*) into n from public.wards;
  assert n = 6, 'after switching, Mathira''s six: ' || n;
  assert (select count(*) from public.campaigns) = 3, 'the super admin sees every campaign';
end $$;
rollback;

-- test: only the candidate or manager of that campaign changes roles
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    $q$select public.set_member_role('00000000-0000-0000-0000-0000000000d4', 'agent')$q$,
    'Only the candidate or campaign manager can change roles.');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
begin
  assert pg_temp.fails_with(
    $q$select public.set_member_role('00000000-0000-0000-0000-0000000000d4', 'agent')$q$,
    'Only the candidate or campaign manager can change roles.'),
    'another campaign''s candidate cannot admit Sakaja''s people';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
begin
  perform public.set_member_role('00000000-0000-0000-0000-0000000000d4', 'agent');
  assert public.is_team_member('00000000-0000-0000-0000-0000000000d4'), 'admitted';
  assert pg_temp.fails_with(
    $q$select public.set_member_role('00000000-0000-0000-0000-0000000000a1', 'manager')$q$,
    'That is the only candidate. Make someone else candidate first.');
end $$;
rollback;

-- test: what belongs to another campaign, or to Groundwork, stays out of reach
begin;
insert into public.demo_leads (name, phone) values ('A prospect', '0712000000');
insert into public.whatsapp_webhook_events (delivery_id, event, payload)
values ('d-1', 'whatsapp.message', '{"from": "254700000001", "text": "private"}');
insert into public.listening_jobs (key, status) values ('listening_scan', 'idle') on conflict (key) do nothing;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$
declare
  n integer;
begin
  select count(*) into n from public.profiles;
  assert n = 2, 'Mathira''s candidate should see two profiles, their own team''s, not ' || n;
  select count(*) into n from public.segments;
  assert n = 0, 'Mathira sees Sakaja''s voter groups';
  select count(*) into n from public.demo_leads;
  assert n = 0, 'a campaign reads Groundwork''s sales leads';
  select count(*) into n from public.whatsapp_webhook_events;
  assert n = 0, 'a campaign reads the raw WhatsApp log';
  update public.listening_jobs set paused_reason = 'paused from Mathira';
  get diagnostics n = row_count;
  assert n = 0, 'a campaign paused the listening sweep for everyone';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.profiles) = 4,
    'Sakaja''s candidate sees their team, including the signup waiting to be admitted';
  assert (select count(*) from public.segments) > 0, 'Sakaja keeps its voter groups';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'someone not yet admitted sees only themselves';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.demo_leads) = 1, 'Groundwork reads its own leads';
  assert (select count(*) from public.whatsapp_webhook_events) = 1, 'and the WhatsApp log';
  assert (select count(*) from public.profiles) = 7, 'and everyone''s profile';
end $$;
rollback;

-- test: every table in public has row level security on
do $$
declare
  t text;
begin
  select string_agg(c.relname, ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  assert t is null, 'tables without row level security: ' || t;
end $$;

-- test: every campaign table keeps to its own campaign
-- (The membership tables and campaign_channels are scoped by their own
-- policies instead: the super admin sees every campaign's, and the next test
-- checks nobody else does.)
do $$
declare
  t text;
begin
  select string_agg(c.table_name, ', ') into t
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'campaign_id'
     and c.table_name not in ('campaign_members', 'campaign_invites', 'admin_focus', 'campaign_channels')
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.table_name
          and p.permissive = 'RESTRICTIVE' and p.qual like '%my_campaign()%');
  assert t is null, 'campaign tables without the own-campaign policy: ' || t;
end $$;

-- test: a campaign's channels are its own; the super admin sees them all
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$
begin
  assert (select count(*) from public.campaign_channels
           where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 0,
    'Mathira reads Sakaja''s channels';
  assert (select count(*) from public.campaign_channels) > 0, 'Mathira reads its own';
  update public.campaign_channels set note = 'x' where campaign_id = 'ca000000-0000-4000-8000-000000000002';
  begin
    insert into public.campaign_channels (campaign_id, kind, identifier)
    values ('ca000000-0000-4000-8000-000000000002', 'sms', '99999');
    assert false, 'Mathira added a channel to Sakaja';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  begin
    update public.campaign_channels set note = 'x';
    assert not found, 'an agent changed a channel';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$
begin
  assert (select count(distinct campaign_id) from public.campaign_channels) = 3,
    'the super admin sees every campaign''s channels';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.campaign_channels where note = 'x') = 0,
    'someone outside the campaign changed its channels';
end $$;
rollback;

-- test: tables with no campaign are the platform's own, and known
do $$
declare
  t text;
begin
  select string_agg(c.relname, ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from information_schema.columns k
                      where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'campaign_id')
     and c.relname not in ('campaigns', 'profiles', 'user_roles', 'demo_leads', 'rate_limits',
                           'whatsapp_webhook_events', 'listening_jobs',
                           -- ScrapeCreators credits: one key, so one count for every campaign
                           'social_credits');
  assert t is null, 'new tables with no campaign: decide whether they belong to one: ' || t;
end $$;

-- test: no view in public, which would read past row level security
do $$
declare
  t text;
begin
  select string_agg(c.relname, ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and not coalesce('security_invoker=true' = any(c.reloptions), false);
  assert t is null, 'views that bypass row level security: ' || t;
end $$;

-- test: nothing in public can be run by someone signed out
do $$
declare
  t text;
begin
  select string_agg(p.proname, ', ') into t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute');
  assert t is null, 'functions open to anon: ' || t;
end $$;

-- test: functions that run with their owner's rights pin their search path
do $$
declare
  t text;
begin
  select string_agg(p.proname, ', ') into t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  assert t is null, 'security definer functions without a search path: ' || t;
end $$;
