-- Real mornings, part 1. Schema version 20.
--
-- The campaign's diary, planned a week at a time, and one story a morning
-- written from the news Listening found. The team reads both; the candidate or
-- campaign manager writes the diary and edits the story, as the team's; the
-- 06:00 step writes the story with the server's key.

-- A diary entry's ward must be one of the campaign's own wards.
alter table public.wards add constraint wards_id_campaign_key unique (id, campaign_id);

create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  starts_at   time,
  title       text not null check (length(btrim(title)) between 2 and 120),
  kind        text not null default 'visit'
              check (kind in ('visit', 'market', 'church', 'funeral', 'meeting', 'media', 'rally', 'watch')),
  ward_id     uuid,
  note        text check (note is null or length(note) <= 300),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint diary_entries_ward_fkey foreign key (ward_id, campaign_id)
    references public.wards (id, campaign_id) on delete set null (ward_id)
);
create index diary_entries_day_idx on public.diary_entries (campaign_id, day, starts_at);
create trigger diary_entries_touch before update on public.diary_entries
  for each row execute function public.touch_updated_at();

create table public.morning_stories (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  story       jsonb not null
              check (jsonb_typeof(story) = 'object' and octet_length(story::text) <= 40000),
  written_by  text not null default 'team' check (written_by in ('groundwork', 'team')),
  edited_by   uuid default auth.uid() references auth.users(id) on delete set null,
  edited_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint morning_stories_day_key unique (campaign_id, day)
);
create trigger morning_stories_touch before update on public.morning_stories
  for each row execute function public.touch_updated_at();

alter table public.diary_entries enable row level security;
alter table public.morning_stories enable row level security;

revoke all on public.diary_entries, public.morning_stories from anon, authenticated;
grant select, insert, update, delete on public.diary_entries to authenticated;
grant select, insert, update on public.morning_stories to authenticated;
grant all on public.diary_entries, public.morning_stories to service_role;

create policy "own campaign only" on public.diary_entries as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "diary readable by team" on public.diary_entries for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "diary written by staff" on public.diary_entries for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.morning_stories as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "stories readable by team" on public.morning_stories for select to authenticated
  using (public.is_team_member(auth.uid()));
-- Staff write and edit the day's story as the team's; only the server writes Groundwork's.
create policy "stories written by staff" on public.morning_stories for insert to authenticated
  with check (public.is_staff(auth.uid()) and written_by = 'team');
create policy "stories edited by staff" on public.morning_stories for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()) and written_by = 'team');

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 20 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
