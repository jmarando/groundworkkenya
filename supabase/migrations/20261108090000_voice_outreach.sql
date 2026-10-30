-- Schema 49: a record of the voices the campaign has approached to brief, so Big voices can say
-- "Approached 3 Nov" and Replay can count the voices briefed.
--
-- voice_outreach: one row per campaign and voice (the voice key Listening already uses, such as
-- "x:@name"), what the invitation said, how it went out (copied for WhatsApp or a direct message, or
-- sent through Daraja Pulse), and where it stands. The office reads; the candidate and managers record
-- an approach and move its status by hand until Pulse reports it. No one deletes one. A voice is only
-- what it published: nothing here records or guesses anyone's community.

create table if not exists public.voice_outreach (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  voice_key         text not null check (length(voice_key) between 3 and 300),
  platform          text not null check (length(platform) between 1 and 40),
  name              text not null check (length(name) between 1 and 200),
  url               text check (url is null or url ~ '^https://'),
  invitation        text not null check (length(invitation) between 1 and 2000),
  channel           text not null check (channel in ('copied', 'pulse')),
  status            text not null default 'approached' check (status in ('approached', 'invited', 'on_roster', 'declined')),
  pulse_prospect_id text check (pulse_prospect_id is null or length(pulse_prospect_id) <= 100),
  created_by        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (campaign_id, voice_key)
);
create index if not exists voice_outreach_recent_idx on public.voice_outreach (campaign_id, created_at desc);

drop trigger if exists voice_outreach_touch on public.voice_outreach;
create trigger voice_outreach_touch before update on public.voice_outreach
  for each row execute function public.touch_updated_at();

-- Access ---------------------------------------------------------------
alter table public.voice_outreach enable row level security;
revoke all on public.voice_outreach from anon;
revoke all on public.voice_outreach from authenticated;
grant select on public.voice_outreach to authenticated;
-- The campaign is the caller's own (the default), never named; the voice is fixed once recorded.
grant insert (voice_key, platform, name, url, invitation, channel, status, pulse_prospect_id)
  on public.voice_outreach to authenticated;
grant update (platform, name, url, invitation, channel, status, pulse_prospect_id)
  on public.voice_outreach to authenticated;
grant all on public.voice_outreach to service_role;

drop policy if exists "own campaign only" on public.voice_outreach;
create policy "own campaign only" on public.voice_outreach as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "approaches read by the office" on public.voice_outreach;
create policy "approaches read by the office" on public.voice_outreach for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "approaches recorded by principals" on public.voice_outreach;
create policy "approaches recorded by principals" on public.voice_outreach for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));
drop policy if exists "approaches changed by principals" on public.voice_outreach;
create policy "approaches changed by principals" on public.voice_outreach for update to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- Retention ------------------------------------------------------------
-- The latest prune_old_records (schema 48) plus: an approach goes after three years, as the posts do.
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
  _readings integer;
begin
  delete from public.whatsapp_webhook_events
   where processed_at is not null and processed_at < now() - interval '30 days';
  get diagnostics _webhooks = row_count;

  delete from public.listening_alert_events where created_at < now() - interval '90 days';
  get diagnostics _alerts = row_count;

  -- Three years of listening: the whole run-up to a general election, read back by the drafts.
  delete from public.listening_mentions where found_at < now() - interval '3 years';
  get diagnostics _mentions = row_count;

  delete from public.listening_readings where at < now() - interval '180 days';
  get diagnostics _readings = row_count;

  delete from public.listening_days where day < (now() - interval '3 years')::date;

  delete from public.listening_accounts
   where greatest(checked_at, failed_at) < now() - interval '180 days';

  delete from public.listening_stories s
   where s.updated_at < now() - interval '30 days'
     and not exists (select 1 from public.listening_mentions m where m.story_id = s.id);

  delete from public.voice_outreach where created_at < now() - interval '3 years';

  return jsonb_build_object('webhooks', _webhooks, 'alert_events', _alerts, 'mentions', _mentions,
                            'readings', _readings);
end;
$$;

revoke all on function public.prune_old_records() from public, anon, authenticated;
grant execute on function public.prune_old_records() to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 49 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
