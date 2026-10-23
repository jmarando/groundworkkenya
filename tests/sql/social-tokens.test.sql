-- Schema 37: Page tokens are set by Groundwork alone and read by nobody signed in.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 37 is in
do $$ begin assert public.groundwork_schema_version() >= 37; end $$;

-- test: the super admin sets a token; nobody signed in reads it; a manager can't set one
begin;
insert into public.social_accounts (id, campaign_id, platform, handle)
values ('00000000-0000-4000-8000-0000000000f1', 'ca000000-0000-4000-8000-000000000002', 'facebook', 'SakajaPage');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
set local role authenticated;
do $$ begin
  perform public.set_social_token('00000000-0000-4000-8000-0000000000f1', 'EAAG-test-token-0123456789');
  assert pg_temp.fails_with('select count(*) from public.social_account_tokens',
    'permission denied for table social_account_tokens');
end $$;
reset role;
do $$ begin
  assert (select page_token = 'EAAG-test-token-0123456789' and campaign_id = 'ca000000-0000-4000-8000-000000000002'
            from public.social_account_tokens where account_id = '00000000-0000-4000-8000-0000000000f1');
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with($q$select public.set_social_token('00000000-0000-4000-8000-0000000000f1', 'EAAG-another-token-0123456789')$q$,
    'Groundwork connects a campaign''s Page.');
end $$;
rollback;
