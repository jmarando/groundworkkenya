-- Schema 40: who is talking, how far it spreads, and the campaign's reaction.
--
-- 1. listening_mentions.shares: how often a post was shared, where the platform says (TikTok).
--    Views go in reach, as before. Who posted it goes in author.
-- 2. listening_alerts.min_reach: an alert that fires only for posts seen at least this many times,
--    so the office hears when something spreads, not every time it is said.
-- 3. rapid_responses: the campaign's reaction to a post: what happened, whether to react, the
--    angle, the reply in its own voice and the brief for creators, and whether Daraja Pulse took it.
--    The office reads; the candidate and managers write.
-- Places, never people: a voice is a public account or an outlet, read from what it published;
-- nothing records or guesses anyone's community.

-- 1. -----------------------------------------------------------------
alter table public.listening_mentions
  add column if not exists shares integer check (shares is null or shares >= 0);

-- 2. -----------------------------------------------------------------
alter table public.listening_alerts
  add column if not exists min_reach integer check (min_reach is null or min_reach > 0);

-- 3. -----------------------------------------------------------------
create table if not exists public.rapid_responses (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  mention_id     uuid references public.listening_mentions(id) on delete set null,
  post_url       text check (post_url ~ '^https://'),
  platform       text,
  what_happened  text not null check (length(what_happened) between 1 and 2000),
  react          boolean not null default true,
  angle          text not null default '' check (length(angle) <= 2000),
  reply          text not null default '' check (length(reply) <= 2000),
  creator_brief  text not null default '' check (length(creator_brief) <= 4000),
  dos            jsonb not null default '[]'::jsonb check (jsonb_typeof(dos) = 'array'),
  donts          jsonb not null default '[]'::jsonb check (jsonb_typeof(donts) = 'array'),
  respond_by     timestamptz,
  status         text not null default 'drafted' check (status in ('drafted', 'briefed', 'done', 'dropped')),
  pulse_status   text check (pulse_status in ('sent', 'not_connected', 'not_supported', 'failed')),
  pulse_detail   text,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists rapid_responses_recent_idx on public.rapid_responses (campaign_id, created_at desc);
create index if not exists rapid_responses_mention_idx on public.rapid_responses (mention_id);

alter table public.rapid_responses enable row level security;
revoke all on public.rapid_responses from anon;
grant select, insert, update on public.rapid_responses to authenticated;
grant all on public.rapid_responses to service_role;

drop policy if exists "own campaign only" on public.rapid_responses;
create policy "own campaign only" on public.rapid_responses as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "reactions read by the office" on public.rapid_responses;
create policy "reactions read by the office" on public.rapid_responses for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "reactions written by principals" on public.rapid_responses;
create policy "reactions written by principals" on public.rapid_responses for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));
drop policy if exists "reactions updated by principals" on public.rapid_responses;
create policy "reactions updated by principals" on public.rapid_responses for update to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 40 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
