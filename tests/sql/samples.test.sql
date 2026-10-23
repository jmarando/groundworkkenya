-- Schema 43: sample contacts are counted in an audience but never queued for an SMS broadcast.
-- Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 43 is in
do $$ begin assert public.groundwork_schema_version() >= 43; end $$;

-- test: a broadcast queues to the real contact and not to the sample one
begin;
insert into public.people (campaign_id, phone, consent_sms, tags) values
  ('ca000000-0000-4000-8000-000000000002', '+254700000101', true, '{}'),
  ('ca000000-0000-4000-8000-000000000002', '+254700000102', true, '{sample}');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
set local role authenticated;
do $$
declare r jsonb; e jsonb;
begin
  e := public.broadcast_estimate('{}'::jsonb);
  assert (e ->> 'reachable')::int = (select count(*) from public.people where consent_sms and not opted_out and not ('sample' = any(tags))), e::text;
  r := public.queue_broadcast(gen_random_uuid(), '{}'::jsonb, 'Hello. STOP to opt out.');
  assert not exists (
    select 1 from public.messages m join public.people p on p.id = m.person_id
     where m.broadcast_id = (r ->> 'id')::uuid and 'sample' = any(p.tags)
  );
  assert exists (
    select 1 from public.messages m where m.broadcast_id = (r ->> 'id')::uuid and m.phone = '+254700000101'
  );
end $$;
rollback;
