-- Schema 35: comms_to_ledger posts each campaign's reported SMS charges for a past day as one
-- pending comms expense, once, and leaves today, unsent and uncharged messages alone.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 35 is in, and messages on file before it are already posted
do $$ begin
  assert public.groundwork_schema_version() >= 35;
  assert not exists (select 1 from public.messages where not on_ledger);
end $$;

-- test: yesterday's charged sends become one expense; today's, failed and free ones don't
begin;
insert into public.messages (campaign_id, phone, channel, direction, body, status, cost_kes, sent_at) values
  ('ca000000-0000-4000-8000-000000000002', '+254700000001', 'sms', 'out', 'a', 'delivered', 0.8, now() - interval '1 day'),
  ('ca000000-0000-4000-8000-000000000002', '+254700000002', 'sms', 'out', 'b', 'sent', 1.6, now() - interval '1 day'),
  ('ca000000-0000-4000-8000-000000000002', '+254700000003', 'sms', 'out', 'c', 'failed', 0.8, now() - interval '1 day'),
  ('ca000000-0000-4000-8000-000000000002', '+254700000004', 'sms', 'out', 'd', 'sent', 0, now() - interval '1 day'),
  ('ca000000-0000-4000-8000-000000000002', '+254700000005', 'sms', 'out', 'e', 'sent', 0.8, now() + interval '1 hour'),
  ('ca000000-0000-4000-8000-000000000003', '+254700000006', 'sms', 'out', 'f', 'sent', 0.8, now() - interval '2 days');
do $$
declare n integer;
begin
  n := public.comms_to_ledger();
  assert n = 2, n::text;
  assert (select amount_kes = 2.4 and category = 'comms' and status = 'pending' and reference like 'COMMS-%'
            from public.expenses where campaign_id = 'ca000000-0000-4000-8000-000000000002' and category = 'comms'
             and reference like 'COMMS-%');
  assert (select count(*) from public.expenses where reference like 'COMMS-%') = 2;
  -- Run again: nothing more.
  assert public.comms_to_ledger() = 0;
  assert (select count(*) from public.messages where not on_ledger and body in ('c', 'd', 'e')) = 3;
end $$;
rollback;

-- test: nobody signed in may post comms
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with('select public.comms_to_ledger()', 'permission denied for function comms_to_ledger');
end $$;
rollback;
