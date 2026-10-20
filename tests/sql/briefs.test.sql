-- Schema 38: the office reads its campaign's brief; principals write one; agents and other
-- campaigns see nothing. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 38 is in
do $$ begin assert public.groundwork_schema_version() >= 38; end $$;

-- test: a manager writes a brief, the agent and Mathira can't read it, the agent can't write one
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
insert into public.campaign_briefs (starts_on, ends_on, headline, the_read, moves)
values (current_date, current_date + 13, 'Hold the east, win back the youth', '[{"title": "x", "body": "y"}]', '[]');
do $$ begin
  assert (select campaign_id from public.campaign_briefs) = 'ca000000-0000-4000-8000-000000000002';
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.campaign_briefs) = 0;
  assert pg_temp.fails_with($q$insert into public.campaign_briefs (starts_on, ends_on, headline) values (current_date, current_date, 'mine')$q$,
    'new row violates row-level security policy for table "campaign_briefs"');
end $$;
reset role;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
set local role authenticated;
do $$ begin assert (select count(*) from public.campaign_briefs) = 0; end $$;
rollback;

-- test: a brief longer than a month, or the read not a list, is refused
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with($q$insert into public.campaign_briefs (starts_on, ends_on, headline) values (current_date, current_date + 40, 'too long')$q$,
    'new row for relation "campaign_briefs" violates check constraint "campaign_briefs_check"');
  assert pg_temp.fails_with($q$insert into public.campaign_briefs (starts_on, ends_on, headline, the_read) values (current_date, current_date, 'x', '{}')$q$,
    'new row for relation "campaign_briefs" violates check constraint "campaign_briefs_the_read_check"');
end $$;
rollback;
