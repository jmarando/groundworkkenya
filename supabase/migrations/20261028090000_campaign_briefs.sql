-- Schema 38: the campaign's brief for the next two weeks.
--
-- campaign_briefs holds the political read and the plan written for a campaign for a fortnight:
-- a headline, the read (sections, each with its sources), the moves (by days, with where, how and
-- what to measure) and what to watch. The office reads it; the candidate, managers and Groundwork
-- write it. A new brief is a new row, so the last one stays on record. Places, never people: a brief
-- speaks of wards, counties and regions, and nothing records or guesses any person's community.

create table if not exists public.campaign_briefs (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  starts_on    date not null,
  ends_on      date not null,
  headline     text not null check (length(headline) between 1 and 300),
  the_read     jsonb not null default '[]'::jsonb check (jsonb_typeof(the_read) = 'array'),
  moves        jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array'),
  watch        jsonb not null default '[]'::jsonb check (jsonb_typeof(watch) = 'array'),
  written_by   text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 31)
);
create index if not exists campaign_briefs_latest_idx on public.campaign_briefs (campaign_id, starts_on desc, created_at desc);

alter table public.campaign_briefs enable row level security;
revoke all on public.campaign_briefs from anon;
grant select, insert on public.campaign_briefs to authenticated;
grant all on public.campaign_briefs to service_role;

drop policy if exists "own campaign only" on public.campaign_briefs;
create policy "own campaign only" on public.campaign_briefs as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "briefs read by the office" on public.campaign_briefs;
create policy "briefs read by the office" on public.campaign_briefs for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "briefs written by principals" on public.campaign_briefs;
create policy "briefs written by principals" on public.campaign_briefs for insert to authenticated
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 38 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
