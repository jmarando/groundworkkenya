-- Schema 39: the road to election day, what wider news means here, and a longer memory.
--
-- 1. campaign_roadmaps: the campaign's plan from now to polling day, phase by phase, each
--    milestone under a workstream (registration, agents, field, rallies, coalition, message, money,
--    digital, rivals). A new draft is a new row, so earlier drafts stay on record. The office
--    reads it; the candidate, managers and Groundwork write it.
-- 2. roadmap_items: where each milestone stands (to do, under way, done, dropped) and who owns it,
--    keyed by the milestone's key so progress carries over to the next draft. The office writes it.
-- 3. roadmap_notes: the strategy session's notes, by workstream or for the whole plan, each signed
--    by the person who wrote it. The office writes them; a note is removed only by its writer.
-- 4. news_impacts: a national or county story read for this seat: what it means here, whether it
--    helps or hurts, and what to do. One reading per story per campaign.
-- 5. Listening posts are kept three years, not one, so the drafts can read the whole run-up.
-- Places, never people: nothing here records or guesses any person's community.

-- 1. ----------------------------------------------------------------- roadmaps

create table if not exists public.campaign_roadmaps (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  headline     text not null check (length(headline) between 1 and 300),
  summary      text not null default '' check (length(summary) <= 4000),
  phases       jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array'),
  gaps         jsonb not null default '[]'::jsonb check (jsonb_typeof(gaps) = 'array'),
  written_by   text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists campaign_roadmaps_latest_idx on public.campaign_roadmaps (campaign_id, created_at desc);

alter table public.campaign_roadmaps enable row level security;
revoke all on public.campaign_roadmaps from anon;
grant select, insert on public.campaign_roadmaps to authenticated;
grant all on public.campaign_roadmaps to service_role;

drop policy if exists "own campaign only" on public.campaign_roadmaps;
create policy "own campaign only" on public.campaign_roadmaps as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "roadmaps read by the office" on public.campaign_roadmaps;
create policy "roadmaps read by the office" on public.campaign_roadmaps for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "roadmaps written by principals" on public.campaign_roadmaps;
create policy "roadmaps written by principals" on public.campaign_roadmaps for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- 2. ----------------------------------------------------------------- progress

create table if not exists public.roadmap_items (
  campaign_id  uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  key          text not null check (key ~ '^[a-z0-9-]{1,80}$'),
  status       text not null default 'todo' check (status in ('todo', 'doing', 'done', 'dropped')),
  owner        text check (length(owner) <= 80),
  updated_by   uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (campaign_id, key)
);

alter table public.roadmap_items enable row level security;
revoke all on public.roadmap_items from anon;
grant select, insert, update on public.roadmap_items to authenticated;
grant all on public.roadmap_items to service_role;

drop policy if exists "own campaign only" on public.roadmap_items;
create policy "own campaign only" on public.roadmap_items as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "roadmap items for the office" on public.roadmap_items;
create policy "roadmap items for the office" on public.roadmap_items for all to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));

-- 3. ----------------------------------------------------------------- notes

create table if not exists public.roadmap_notes (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  workstream   text not null default 'general' check (workstream ~ '^[a-z]{1,20}$'),
  body         text not null check (length(body) between 1 and 2000),
  author       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name  text check (length(author_name) <= 120),
  created_at   timestamptz not null default now()
);
create index if not exists roadmap_notes_campaign_idx on public.roadmap_notes (campaign_id, created_at desc);

alter table public.roadmap_notes enable row level security;
revoke all on public.roadmap_notes from anon;
grant select, insert, delete on public.roadmap_notes to authenticated;
grant all on public.roadmap_notes to service_role;

drop policy if exists "own campaign only" on public.roadmap_notes;
create policy "own campaign only" on public.roadmap_notes as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "notes read by the office" on public.roadmap_notes;
create policy "notes read by the office" on public.roadmap_notes for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "notes written by the office" on public.roadmap_notes;
create policy "notes written by the office" on public.roadmap_notes for insert to authenticated
  with check (
    author = auth.uid()
    and coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser')
  );
drop policy if exists "notes removed by their writer" on public.roadmap_notes;
create policy "notes removed by their writer" on public.roadmap_notes for delete to authenticated
  using (author = auth.uid());

-- 4. ----------------------------------------------------------------- wider news

create table if not exists public.news_impacts (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  mention_id    uuid references public.listening_mentions(id) on delete set null,
  title         text not null check (length(title) between 1 and 300),
  url           text check (url ~ '^https://'),
  published_on  date,
  scope         text not null check (scope in ('national', 'county', 'local')),
  stance        text not null check (stance in ('strength', 'threat', 'opening', 'context')),
  reading       text not null check (length(reading) between 1 and 3000),
  moves         jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array'),
  sources       jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  written_by    text,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists news_impacts_story_idx on public.news_impacts (campaign_id, url) where url is not null;
create index if not exists news_impacts_recent_idx on public.news_impacts (campaign_id, created_at desc);
create index if not exists news_impacts_mention_idx on public.news_impacts (mention_id);

alter table public.news_impacts enable row level security;
revoke all on public.news_impacts from anon;
grant select, insert on public.news_impacts to authenticated;
grant all on public.news_impacts to service_role;

drop policy if exists "own campaign only" on public.news_impacts;
create policy "own campaign only" on public.news_impacts as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "impacts read by the office" on public.news_impacts;
create policy "impacts read by the office" on public.news_impacts for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "impacts written by principals" on public.news_impacts;
create policy "impacts written by principals" on public.news_impacts for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- 5. ----------------------------------------------------------------- retention

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

  -- Three years of listening: the whole run-up to a general election, read back by the drafts.
  delete from public.listening_mentions where found_at < now() - interval '3 years';
  get diagnostics _mentions = row_count;

  return jsonb_build_object('webhooks', _webhooks, 'alert_events', _alerts, 'mentions', _mentions);
end;
$$;

revoke all on function public.prune_old_records() from public, anon, authenticated;
grant execute on function public.prune_old_records() to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 39 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
