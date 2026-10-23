-- Schema 34: indexes for the reads the app makes, and records that are deleted once they have
-- served their purpose.
--
-- 1. Indexes: a person's conversations and the inbox's newest first, a campaign's newest mentions,
--    alert events by alert and mention, a campaign's events by kind, a person's door knocks by
--    day (stipends), and the foreign keys that are set to null on delete.
-- 2. prune_old_records (service role, run by the hourly sweep): processed WhatsApp webhook
--    deliveries after 30 days (they hold numbers and message text), alert events after 90 days,
--    and posts found by listening after a year. Rate-limit rows past their window.
-- 3. The schema version.

-- 1. ----------------------------------------------------------------- indexes

create index if not exists conversations_person_idx on public.conversations (person_id);
create index if not exists conversations_campaign_recent_idx
  on public.conversations (campaign_id, last_message_at desc);
create index if not exists listening_mentions_campaign_found_idx
  on public.listening_mentions (campaign_id, found_at desc);
create index if not exists listening_alert_events_alert_idx on public.listening_alert_events (alert_id);
create index if not exists listening_alert_events_mention_idx on public.listening_alert_events (mention_id);
create index if not exists person_events_campaign_kind_idx
  on public.person_events (campaign_id, kind, created_at desc);
create index if not exists house_visits_actor_idx on public.house_visits (campaign_id, actor, visited_at);
create index if not exists walk_lists_ward_idx on public.walk_lists (ward_id);
create index if not exists walk_lists_centre_idx on public.walk_lists (centre_id);
create index if not exists media_buys_expense_idx on public.media_buys (expense_id);
create index if not exists agent_stipends_expense_idx on public.agent_stipends (expense_id);
create index if not exists whatsapp_webhook_events_processed_idx
  on public.whatsapp_webhook_events (processed_at) where processed_at is not null;

-- 2. ----------------------------------------------------------------- retention

create or replace function public.prune_old_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _webhooks integer;
  _alerts   integer;
  _mentions integer;
begin
  delete from public.whatsapp_webhook_events
   where processed_at is not null and processed_at < now() - interval '30 days';
  get diagnostics _webhooks = row_count;

  delete from public.listening_alert_events where created_at < now() - interval '90 days';
  get diagnostics _alerts = row_count;

  -- A year of listening is kept for the weekly comparisons; older posts are gone from the web's
  -- front page anyway. Alert events pointing at them were removed above or are set to null.
  delete from public.listening_mentions where found_at < now() - interval '365 days';
  get diagnostics _mentions = row_count;

  return jsonb_build_object('webhooks', _webhooks, 'alert_events', _alerts, 'mentions', _mentions);
end;
$$;
revoke all on function public.prune_old_records() from public, anon, authenticated;
grant execute on function public.prune_old_records() to service_role;

-- 3. ----------------------------------------------------------------- version

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 34 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
