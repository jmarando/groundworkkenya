-- Schema 42: auto-calls in the candidate's voice, and every call followed to its end.
--
-- 1. campaign_voices: the candidate's cloned voice (ElevenLabs), one per campaign, kept with the
--    note of the candidate's consent. Read by the office; written by the candidate and managers.
-- 2. voice_blasts: an auto-call: the script, where its audio comes from (the cloned voice, an
--    uploaded recording, or a standard voice), the audio's address and whether it says it is a
--    recorded message. Read by the office; written by the candidate and managers.
-- 3. voice_calls: every call placed through Twilio: an auto-call to a person, a test call to the
--    sender, or an Inbox call that rings a team member and then the voter. Twilio's reports
--    (ringing, answered, by a person or a machine, how long, a key pressed, why it failed) are
--    written by the service role from the callbacks; the office reads its own.
-- 4. A public storage bucket for the audio Twilio plays, under unguessable names.

-- 1. -----------------------------------------------------------------
create table if not exists public.campaign_voices (
  campaign_id   uuid primary key default public.my_campaign() references public.campaigns(id) on delete cascade,
  provider      text not null default 'elevenlabs' check (provider in ('elevenlabs')),
  voice_id      text not null check (voice_id ~ '^[A-Za-z0-9]{8,64}$'),
  name          text not null check (length(name) between 1 and 120),
  consent_note  text not null check (length(consent_note) between 10 and 1000),
  consented_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.campaign_voices enable row level security;
revoke all on public.campaign_voices from anon;
grant select, insert, update, delete on public.campaign_voices to authenticated;
grant all on public.campaign_voices to service_role;
drop policy if exists "own campaign only" on public.campaign_voices;
create policy "own campaign only" on public.campaign_voices as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "voice read by the office" on public.campaign_voices;
create policy "voice read by the office" on public.campaign_voices for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "voice kept by principals" on public.campaign_voices;
create policy "voice kept by principals" on public.campaign_voices for all to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- 2. -----------------------------------------------------------------
create table if not exists public.voice_blasts (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  title       text not null check (length(title) between 1 and 120),
  script      text not null default '' check (length(script) <= 2500),
  language    text not null default 'en' check (language in ('en', 'sw')),
  source      text not null check (source in ('clone', 'upload', 'standard')),
  audio_url   text check (audio_url ~ '^https://'),
  disclose    boolean not null default true,
  status      text not null default 'draft' check (status in ('draft', 'calling', 'done')),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists voice_blasts_recent_idx on public.voice_blasts (campaign_id, created_at desc);
alter table public.voice_blasts enable row level security;
revoke all on public.voice_blasts from anon;
grant select, insert, update on public.voice_blasts to authenticated;
grant all on public.voice_blasts to service_role;
drop policy if exists "own campaign only" on public.voice_blasts;
create policy "own campaign only" on public.voice_blasts as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "blasts read by the office" on public.voice_blasts;
create policy "blasts read by the office" on public.voice_blasts for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "blasts written by principals" on public.voice_blasts;
create policy "blasts written by principals" on public.voice_blasts for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));
drop policy if exists "blasts updated by principals" on public.voice_blasts;
create policy "blasts updated by principals" on public.voice_blasts for update to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- 3. -----------------------------------------------------------------
create table if not exists public.voice_calls (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  kind            text not null check (kind in ('blast', 'test', 'bridge')),
  blast_id        uuid references public.voice_blasts(id) on delete cascade,
  person_id       uuid references public.people(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  to_phone        text not null check (to_phone ~ '^\d{9,15}$'),
  staff_phone     text check (staff_phone ~ '^\d{9,15}$'),
  sid             text unique,
  status          text not null default 'queued',
  voter_status    text,
  answered_by     text,
  duration        integer check (duration is null or duration >= 0),
  digits          text,
  error           text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists voice_calls_once_idx on public.voice_calls (blast_id, person_id)
  where kind = 'blast';
create index if not exists voice_calls_blast_idx on public.voice_calls (blast_id, status);
create index if not exists voice_calls_recent_idx on public.voice_calls (campaign_id, created_at desc);
alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from anon;
grant select, insert on public.voice_calls to authenticated;
grant all on public.voice_calls to service_role;
drop policy if exists "own campaign only" on public.voice_calls;
create policy "own campaign only" on public.voice_calls as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "calls read by the office" on public.voice_calls;
create policy "calls read by the office" on public.voice_calls for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "calls placed by the office" on public.voice_calls;
create policy "calls placed by the office" on public.voice_calls for insert to authenticated
  with check (
    coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser')
    and (kind = 'bridge' or coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  );

-- 4. -----------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $q$insert into storage.buckets (id, name, public)
             values ('voice-messages', 'voice-messages', true)
             on conflict (id) do nothing$q$;
  end if;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 42 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
