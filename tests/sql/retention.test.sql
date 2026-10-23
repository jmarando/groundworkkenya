-- Schema 34: prune_old_records deletes only what is past its keeping time, and only the service
-- role may run it. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 34 is in
do $$ begin assert public.groundwork_schema_version() >= 34; end $$;

-- test: old processed webhooks, old alert events and posts over three years old go; the rest stay
begin;
insert into public.whatsapp_webhook_events (delivery_id, event, payload, processed_at) values
  ('old-done', 'message', '{}', now() - interval '31 days'),
  ('old-unprocessed', 'message', '{}', null),
  ('recent-done', 'message', '{}', now() - interval '2 days');
insert into public.listening_mentions (campaign_id, source, url, found_at) values
  ('ca000000-0000-4000-8000-000000000002', 'web', 'https://example.com/old', now() - interval '1100 days'),
  ('ca000000-0000-4000-8000-000000000002', 'web', 'https://example.com/year', now() - interval '400 days'),
  ('ca000000-0000-4000-8000-000000000002', 'web', 'https://example.com/new', now() - interval '10 days');
insert into public.listening_alert_events (campaign_id, channel, destination, created_at) values
  ('ca000000-0000-4000-8000-000000000002', 'email', 'a@example.com', now() - interval '91 days'),
  ('ca000000-0000-4000-8000-000000000002', 'email', 'a@example.com', now() - interval '1 day');
do $$
declare r jsonb;
begin
  r := public.prune_old_records();
  assert (r ->> 'webhooks')::int = 1 and (r ->> 'alert_events')::int = 1 and (r ->> 'mentions')::int = 1, r::text;
  assert (select array_agg(delivery_id order by delivery_id) from public.whatsapp_webhook_events)
         = array['old-unprocessed', 'recent-done'];
  assert (select count(*) from public.listening_mentions where url like 'https://example.com/%') = 2;
end $$;
rollback;

-- test: nobody signed in may prune
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
set local role authenticated;
do $$ begin
  assert pg_temp.fails_with('select public.prune_old_records()', 'permission denied for function prune_old_records');
end $$;
rollback;
