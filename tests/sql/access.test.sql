-- Who can see and change what. A signup is only a 'viewer' until an admin
-- admits them, and a viewer must see nothing: the voter file is names and
-- phone numbers. Run with tests/sql/run.sh; each test rolls back.

\set QUIET on
\set ON_ERROR_STOP on

-- Four accounts, signing up one after another. The first becomes admin;
-- the rest start as viewers.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b2', 'agent@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'manager@example.test');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d4', 'stranger@example.test');
update public.user_roles set role = 'agent' where user_id = '00000000-0000-0000-0000-0000000000b2';
update public.user_roles set role = 'manager' where user_id = '00000000-0000-0000-0000-0000000000c3';

insert into public.people (phone, full_name, consent_sms) values ('+254711000001', 'Wanjiku', true);
insert into public.messages (phone, body, status) values ('+254711000001', 'hello', 'staged');

-- test: signups start as viewers, and only the very first becomes admin
do $$
begin
  assert (select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000a1') = 'admin';
  assert (select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000d4') = 'viewer';
  assert not public.is_team_member('00000000-0000-0000-0000-0000000000d4'), 'a viewer is not on the team';
  assert public.is_team_member('00000000-0000-0000-0000-0000000000b2');
  assert public.is_staff('00000000-0000-0000-0000-0000000000c3') and not public.is_staff('00000000-0000-0000-0000-0000000000b2');
end $$;

-- test: a viewer awaiting approval sees nothing and can add nothing
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
do $$
declare
  t text;
  n integer;
begin
  foreach t in array array['people', 'messages', 'conversations', 'person_events', 'poll_responses',
                           'polls', 'wards', 'incidents', 'broadcasts', 'listening_mentions'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('viewer can read %s', t);
  end loop;
  begin
    insert into public.people (phone, full_name) values ('+254711000002', 'Kamau');
    assert false, 'viewer inserted a person';
  exception when insufficient_privilege then null;
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
  begin
    insert into public.people (phone, full_name) values ('+254711000003', 'Otieno');
    assert false, 'anon inserted a person';
  exception when insufficient_privilege then null;
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
  -- The migrations seed demo people, so there are more than the one added above.
  select count(*) into n from public.people;
  assert n > 1, 'agent reads people';
  insert into public.people (phone, full_name) values ('+254711000004', 'Achieng');
  delete from public.people where phone = '+254711000001';
  get diagnostics n = row_count;
  assert n = 0, 'agent deleted a person';
  begin
    perform public.queue_broadcast(gen_random_uuid(), '{}'::jsonb, 'Rally at noon. STOP kujiondoa');
    assert false, 'agent queued a broadcast';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- test: only an admin changes roles, and never removes the last admin
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
begin
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000d4', 'agent');
    assert false, 'a manager changed a role';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$
begin
  perform public.set_member_role('00000000-0000-0000-0000-0000000000d4', 'agent');
  assert public.is_team_member('00000000-0000-0000-0000-0000000000d4'), 'admitted';
  begin
    perform public.set_member_role('00000000-0000-0000-0000-0000000000a1', 'manager');
    assert false, 'the only admin demoted themselves';
  exception when raise_exception then null;
  end;
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
