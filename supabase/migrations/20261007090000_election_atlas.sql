-- Election atlas. Schema version 22.
--
-- The last three general elections down to the constituency, who lives where, and
-- where votes can move. Public facts (areas, results, turnout, registers and
-- population estimates) are held once, in tables every team reads and nobody
-- writes through the API: only migrations and the server do. That is a deliberate
-- exception to "every campaign table has a campaign_id". Each campaign keeps its
-- own home area, sides and notes about places; the team reads them and the
-- candidate or campaign manager writes them.
--
-- Nothing here records a person's ethnicity. Communities appear only in the
-- team's notes about places.

-- ============ the shared atlas ============

-- A place, keyed by a path of slugs that reads as the place and joins the ward
-- maps: kenya, nairobi, nairobi/dagoretti-north, nairobi/dagoretti-north/kileleshwa.
create table public.atlas_areas (
  key       text primary key
            check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,2}$'),
  level     text not null check (level in ('country', 'county', 'constituency', 'ward')),
  name      text not null check (length(btrim(name)) between 2 and 80),
  parent    text references public.atlas_areas(key),
  iebc_code text check (iebc_code is null or iebc_code ~ '^[0-9]{1,4}$'),
  -- A county sits under Kenya; below that a key is its parent's key and one more
  -- part, so a ward's parent is its constituency and a constituency's its county.
  -- A null parent makes the comparisons null, and a check lets null through, so
  -- the whole answer must be true.
  constraint atlas_areas_shape check ((case level
    when 'country' then key = 'kenya' and parent is null
    when 'county' then parent = 'kenya' and key !~ '/'
    when 'constituency' then parent <> 'kenya' and key ~ '^[^/]+/[^/]+$'
                         and parent = regexp_replace(key, '/[^/]+$', '')
    when 'ward' then key ~ '^[^/]+/[^/]+/[^/]+$' and parent = regexp_replace(key, '/[^/]+$', '')
    else false
  end) is true)
);
create index atlas_areas_parent_idx on public.atlas_areas (parent);

insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null);

-- One race in one general election. The id says which: 2022-president.
create table public.atlas_elections (
  id      text primary key,
  year    integer not null check (year between 1992 and 2100),
  race    text not null check (race in ('president', 'governor', 'mp')),
  held_on date not null,
  note    text check (note is null or length(note) <= 500),
  constraint atlas_elections_id check (id = year::text || '-' || race)
);

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-president', 2013, 'president', '2013-03-04', null),
  ('2013-governor', 2013, 'governor', '2013-03-04', null),
  ('2013-mp', 2013, 'mp', '2013-03-04', null),
  ('2017-president', 2017, 'president', '2017-08-08',
   'The 8 August 2017 vote, annulled by the Supreme Court. The 26 October re-run was boycotted in opposition areas, so it says little about lean and is not loaded.'),
  ('2017-governor', 2017, 'governor', '2017-08-08', null),
  ('2017-mp', 2017, 'mp', '2017-08-08', null),
  ('2022-president', 2022, 'president', '2022-08-09', null),
  ('2022-governor', 2022, 'governor', '2022-08-09', null),
  ('2022-mp', 2022, 'mp', '2022-08-09', null);

-- A candidate for a seat: the area contested (kenya, a county or a constituency).
-- The id is election/seat/name-slug; bloc is the coalition, or the party where
-- there was none (Jubilee and CORD in 2013, Jubilee and NASA in 2017, Kenya
-- Kwanza and Azimio in 2022).
create table public.atlas_candidates (
  id          text primary key,
  election_id text not null references public.atlas_elections(id),
  seat        text not null references public.atlas_areas(key),
  name        text not null check (length(btrim(name)) between 2 and 120),
  party       text check (party is null or length(btrim(party)) between 1 and 120),
  bloc        text not null check (length(btrim(bloc)) between 1 and 80),
  constraint atlas_candidates_id_shape check (id like election_id || '/' || seat || '/%'),
  constraint atlas_candidates_name_key unique (election_id, seat, name)
);

-- Votes where they were counted: a county or a constituency now, wards and
-- polling stations later.
create table public.atlas_results (
  candidate_id text not null references public.atlas_candidates(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  votes        integer not null check (votes >= 0),
  primary key (candidate_id, area_key)
);
create index atlas_results_area_idx on public.atlas_results (area_key);

-- What the document says about turnout; each figure may be missing. source reads
-- "Publisher, document title", so the screens can tag a figure with its publisher.
create table public.atlas_turnout (
  election_id    text not null references public.atlas_elections(id),
  area_key       text not null references public.atlas_areas(key),
  registered     integer check (registered is null or registered >= 0),
  cast_votes     integer check (cast_votes is null or cast_votes >= 0),
  rejected_votes integer check (rejected_votes is null or rejected_votes >= 0),
  valid_votes    integer check (valid_votes is null or valid_votes >= 0),
  source         text not null check (length(btrim(source)) between 3 and 200),
  source_url     text check (source_url is null
                          or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 500)),
  primary key (election_id, area_key),
  constraint atlas_turnout_cast check (cast_votes is null or registered is null or cast_votes <= registered),
  constraint atlas_turnout_valid check (valid_votes is null or cast_votes is null or valid_votes <= cast_votes)
);
create index atlas_turnout_area_idx on public.atlas_turnout (area_key);

-- Registered voters by area for each election year, where IEBC published them.
create table public.atlas_register (
  year       integer not null check (year between 1992 and 2100),
  area_key   text not null references public.atlas_areas(key),
  registered integer not null check (registered >= 0),
  source     text not null check (length(btrim(source)) between 3 and 200),
  source_url text check (source_url is null
                      or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 500)),
  primary key (year, area_key)
);
create index atlas_register_area_idx on public.atlas_register (area_key);

-- Population estimates, never presented as counts: adults are 18 and over, young
-- adults 18 to 34. method says how they were worked out.
create table public.atlas_population (
  area_key     text not null references public.atlas_areas(key),
  year         integer not null check (year between 1990 and 2100),
  total        integer not null check (total >= 0),
  adults       integer not null check (adults >= 0),
  young_adults integer not null check (young_adults >= 0),
  source       text not null check (length(btrim(source)) between 3 and 200),
  method       text not null check (length(btrim(method)) between 10 and 500),
  primary key (area_key, year),
  constraint atlas_population_parts check (young_adults <= adults and adults <= total)
);

alter table public.atlas_areas enable row level security;
alter table public.atlas_elections enable row level security;
alter table public.atlas_candidates enable row level security;
alter table public.atlas_results enable row level security;
alter table public.atlas_turnout enable row level security;
alter table public.atlas_register enable row level security;
alter table public.atlas_population enable row level security;

revoke all on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
              public.atlas_turnout, public.atlas_register, public.atlas_population from anon, authenticated;
grant select on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
                public.atlas_turnout, public.atlas_register, public.atlas_population to authenticated;
grant all on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
             public.atlas_turnout, public.atlas_register, public.atlas_population to service_role;

create policy "atlas readable by team" on public.atlas_areas for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_elections for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_candidates for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_results for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_turnout for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_register for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_population for select to authenticated
  using (public.is_team_member(auth.uid()));

-- ============ each campaign's own ============

-- Who changed a row, and when, whatever the caller says.
create or replace function public.atlas_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

revoke all on function public.atlas_stamp() from public, anon, authenticated;

-- The campaign's home area: a constituency for an MP, a county for a governor,
-- kenya for a presidential campaign.
create table public.atlas_settings (
  campaign_id uuid primary key default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  home_area   text not null references public.atlas_areas(key),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null
);

-- For each past election, the bloc the campaign counts as "our side".
create table public.atlas_sides (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  election_id text not null references public.atlas_elections(id),
  bloc        text not null check (length(btrim(bloc)) between 1 and 80),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (campaign_id, election_id)
);

-- One note per area per campaign: about the place (its communities, the
-- languages used, churches, associations, local leaders), never about a person.
create table public.area_notes (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  area_key    text not null references public.atlas_areas(key),
  note        text not null check (note ~ '[^[:space:]]' and length(note) <= 2000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (campaign_id, area_key)
);

create trigger atlas_settings_stamp before insert or update on public.atlas_settings
  for each row execute function public.atlas_stamp();
create trigger atlas_sides_stamp before insert or update on public.atlas_sides
  for each row execute function public.atlas_stamp();
create trigger area_notes_stamp before insert or update on public.area_notes
  for each row execute function public.atlas_stamp();

alter table public.atlas_settings enable row level security;
alter table public.atlas_sides enable row level security;
alter table public.area_notes enable row level security;

revoke all on public.atlas_settings, public.atlas_sides, public.area_notes from anon, authenticated;
grant select, insert, update, delete on public.atlas_settings, public.atlas_sides, public.area_notes to authenticated;
grant all on public.atlas_settings, public.atlas_sides, public.area_notes to service_role;

create policy "own campaign only" on public.atlas_settings as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "settings readable by team" on public.atlas_settings for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "settings written by staff" on public.atlas_settings for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.atlas_sides as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "sides readable by team" on public.atlas_sides for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "sides written by staff" on public.atlas_sides for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.area_notes as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "notes readable by team" on public.area_notes for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "notes written by staff" on public.area_notes for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 22 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
