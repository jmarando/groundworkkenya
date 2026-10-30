-- Schema 47: follower counts of the public accounts Listening names. Public facts about public
-- accounts and nothing about any campaign, so every signed-in user may read them and only the
-- server writes. Each test rolls back.

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

-- test: schema 47 is in
do $$ begin assert public.groundwork_schema_version() >= 47; end $$;

-- test: any signed-in user reads the counts; none can write them; anonymous callers read nothing
begin;
insert into public.listening_accounts (voice_key, platform, name, followers, checked_at)
values ('x:@zq_account', 'x', '@zq_account', 31000, now());
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select followers from public.listening_accounts where voice_key = 'x:@zq_account') = 31000, 'a field agent reads it';
  assert pg_temp.state_of($q$insert into public.listening_accounts (voice_key, platform, name) values ('x:@evil', 'x', '@evil')$q$) = '42501', 'no one signed in writes';
  assert pg_temp.state_of($q$update public.listening_accounts set followers = 1$q$) = '42501', 'or changes';
  assert pg_temp.state_of($q$delete from public.listening_accounts$q$) = '42501', 'or removes';
end $$;
reset role;
set local role anon;
do $$ begin
  assert pg_temp.state_of($q$select * from public.listening_accounts$q$) = '42501', 'anonymous callers read nothing';
end $$;
rollback;

-- test: a count is a whole number of zero or more, and a key names a platform and an account
begin;
do $$ begin
  assert pg_temp.state_of($q$insert into public.listening_accounts (voice_key, platform, name, followers) values ('x:@neg', 'x', '@neg', -1)$q$) = '23514', 'a negative count';
  assert pg_temp.state_of($q$insert into public.listening_accounts (voice_key, platform, name, followers) values ('x', 'x', '@short', 5)$q$) = '23514', 'a key with no account';
  assert pg_temp.state_of($q$insert into public.listening_accounts (voice_key, platform, name, followers) values ('x:@ok', 'x', '@ok', null)$q$) is null, 'an unknown count is fine';
end $$;
rollback;

-- test: the profiles budget exists, with its own count
begin;
do $$ begin
  assert public.take_social_credits('profiles', 20, 20), 'twenty profile lookups';
  assert not public.take_social_credits('profiles', 1, 20), 'not a twenty-first';
  assert public.take_social_credits('x', 1, 300), 'the others still work';
end $$;
rollback;

-- test: counts are kept 180 days from the last look
begin;
insert into public.listening_accounts (voice_key, platform, name, followers, checked_at, failed_at) values
  ('x:@old', 'x', '@old', 10, now() - interval '181 days', null),
  ('x:@fresh', 'x', '@fresh', 10, now() - interval '179 days', null),
  ('x:@failed', 'x', '@failed', null, null, now() - interval '10 days'),
  ('x:@longfailed', 'x', '@longfailed', null, null, now() - interval '200 days');
do $$ begin
  perform public.prune_old_records();
  assert (select array_agg(voice_key order by voice_key) from public.listening_accounts) = array['x:@failed', 'x:@fresh'];
end $$;
rollback;
