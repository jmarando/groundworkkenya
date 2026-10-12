-- The election atlas. Schema version 22.
--
-- Public facts shared by every campaign: areas from Kenya down to wards, the
-- elections of 2013, 2017 and 2022 (president, governor and MP), who stood and
-- in which bloc, results and turnout by area, registered voters by ward, and
-- population estimates, each figure with the document it came from. Every team
-- reads them; only migrations and the server write them, so they carry no
-- campaign_id. Each campaign keeps its own home area, the bloc it counts as its
-- side in each past election, and notes about places. Nothing here records
-- anything about a person.

create table public.atlas_sources (
  id        text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title     text not null check (length(btrim(title)) between 2 and 300),
  publisher text not null check (length(btrim(publisher)) between 2 and 120),
  url       text check (url is null or url ~ '^https?://'),
  note      text check (note is null or length(note) <= 1000)
);

create table public.atlas_areas (
  key       text primary key check (key ~ '^[a-z0-9-]+(/[a-z0-9-]+){0,2}$'),
  level     text not null check (level in ('country', 'county', 'constituency', 'ward')),
  name      text not null check (length(btrim(name)) between 2 and 80),
  parent    text references public.atlas_areas(key),
  iebc_code text check (iebc_code is null or iebc_code ~ '^[0-9]{1,6}$'),
  check ((level = 'country') = (parent is null))
);

create table public.atlas_elections (
  id      text primary key,
  year    integer not null check (year in (2013, 2017, 2022)),
  race    text not null check (race in ('president', 'governor', 'mp')),
  held_on date not null,
  note    text,
  check (id = year::text || '-' || race)
);

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-president', 2013, 'president', '2013-03-04', null),
  ('2013-governor', 2013, 'governor', '2013-03-04', null),
  ('2013-mp', 2013, 'mp', '2013-03-04', null),
  ('2017-president', 2017, 'president', '2017-08-08',
   'The 8 August vote, annulled by the Supreme Court. The 26 October re-run was boycotted in opposition areas, so it says little about lean and is not used.'),
  ('2017-governor', 2017, 'governor', '2017-08-08', null),
  ('2017-mp', 2017, 'mp', '2017-08-08', null),
  ('2022-president', 2022, 'president', '2022-08-09', null),
  ('2022-governor', 2022, 'governor', '2022-08-09', null),
  ('2022-mp', 2022, 'mp', '2022-08-09', null);

create table public.atlas_candidates (
  id          text primary key check (length(id) between 5 and 200),
  election_id text not null references public.atlas_elections(id),
  seat        text not null references public.atlas_areas(key),
  name        text not null check (length(btrim(name)) between 2 and 120),
  party       text check (party is null or length(btrim(party)) between 1 and 120),
  bloc        text not null check (length(btrim(bloc)) between 1 and 60),
  unique (election_id, seat, name)
);

create table public.atlas_results (
  candidate_id text not null references public.atlas_candidates(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  votes        integer not null check (votes >= 0),
  source_id    text not null references public.atlas_sources(id),
  primary key (candidate_id, area_key)
);

create table public.atlas_turnout (
  election_id text not null references public.atlas_elections(id),
  area_key    text not null references public.atlas_areas(key),
  registered  integer check (registered is null or registered >= 0),
  cast_votes  integer check (cast_votes is null or cast_votes >= 0),
  rejected    integer check (rejected is null or rejected >= 0),
  valid       integer check (valid is null or valid >= 0),
  source_id   text not null references public.atlas_sources(id),
  primary key (election_id, area_key),
  check (cast_votes is null or registered is null or cast_votes <= registered),
  check (valid is null or cast_votes is null or valid <= cast_votes)
);

create table public.atlas_register (
  year       integer not null check (year in (2013, 2017, 2022)),
  area_key   text not null references public.atlas_areas(key),
  registered integer not null check (registered >= 0),
  source_id  text not null references public.atlas_sources(id),
  primary key (year, area_key)
);

create table public.atlas_population (
  area_key     text not null references public.atlas_areas(key),
  year         integer not null check (year between 2000 and 2030),
  total        integer not null check (total >= 0),
  adults       integer not null check (adults >= 0 and adults <= total),
  young_adults integer not null check (young_adults >= 0 and young_adults <= adults),
  source_id    text not null references public.atlas_sources(id),
  primary key (area_key, year)
);

-- Every team reads the atlas; nobody signed in writes it.
do $$
declare t text;
begin
  foreach t in array array['atlas_sources', 'atlas_areas', 'atlas_elections', 'atlas_candidates',
                           'atlas_results', 'atlas_turnout', 'atlas_register', 'atlas_population'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy "atlas readable by any team" on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
  end loop;
end $$;

-- Each campaign's own: its home area, its side in each past election, and notes about places.
create table public.atlas_settings (
  campaign_id uuid primary key default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  home_area   text not null references public.atlas_areas(key),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table public.atlas_sides (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  election_id text not null references public.atlas_elections(id),
  bloc        text not null check (length(btrim(bloc)) between 1 and 60),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, election_id)
);

create table public.area_notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  area_key    text not null references public.atlas_areas(key),
  body        text not null check (length(btrim(body)) between 1 and 2000),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  constraint area_notes_area_key unique (campaign_id, area_key)
);

-- Who changed it, and when, whoever writes.
create or replace function public.atlas_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

revoke all on function public.atlas_stamp() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['atlas_settings', 'atlas_sides', 'area_notes'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.atlas_stamp()', t || '_stamp', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy "own campaign only" on public.%I as restrictive for all to authenticated using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign())', t);
    execute format('create policy "read by the team" on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
    execute format('create policy "written by the candidate or manager" on public.%I for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 22 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;