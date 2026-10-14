-- Area profiles and measured indicators. Schema version 24.
--
-- Each campaign's own profile of a place: its settlement type, the communities
-- that live there, the languages used, its institutions and influencers, and
-- its issues. Read and written by the candidate, the manager and organisers;
-- never by field agents. It is about places, never about people: nothing here
-- records anyone's tribe. And measured indicators of how each place lives (its
-- size and its buildings): public figures every team reads and only
-- migrations write.

create table public.atlas_indicators (
  area_key  text not null references public.atlas_areas(key),
  indicator text not null check (indicator in ('area_km2', 'buildings', 'buildings_per_km2',
                                               'median_building_m2', 'small_building_share',
                                               'large_building_share')),
  year      integer not null check (year between 2000 and 2030),
  value     numeric not null check (value >= 0),
  source_id text not null references public.atlas_sources(id),
  primary key (area_key, indicator, year),
  check (indicator not in ('small_building_share', 'large_building_share') or value <= 1)
);

alter table public.atlas_indicators enable row level security;
revoke all on public.atlas_indicators from anon, authenticated;
grant select on public.atlas_indicators to authenticated;
grant all on public.atlas_indicators to service_role;
create policy "atlas readable by any team" on public.atlas_indicators for select to authenticated
  using (public.is_team_member(auth.uid()));

create table public.area_profiles (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  settlement   text check (settlement in ('high-income', 'middle-income', 'low-income',
                                          'informal', 'mixed', 'peri-urban', 'commercial')),
  communities  text check (length(communities) <= 500),
  languages    text[] not null default '{}'
               check (languages <@ array['en', 'sw', 'sheng', 'kikuyu', 'luo', 'luhya', 'kamba',
                                          'kisii', 'somali', 'kalenjin', 'meru', 'other']),
  institutions text check (length(institutions) <= 1000),
  issues       text check (length(issues) <= 500),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  constraint area_profiles_area_key unique (campaign_id, area_key)
);

create trigger area_profiles_stamp before insert or update on public.area_profiles
  for each row execute function public.atlas_stamp();
alter table public.area_profiles enable row level security;
revoke all on public.area_profiles from anon, authenticated;
grant select, insert, update, delete on public.area_profiles to authenticated;
grant all on public.area_profiles to service_role;
create policy "own campaign only" on public.area_profiles as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "the team but field agents" on public.area_profiles for all to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'))
  with check (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 24 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
