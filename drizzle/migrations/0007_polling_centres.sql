-- Schema 27, part 1: polling centres
-- (docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md, section 1).
-- Safe to run again.
--
-- 1. polling_stations: IEBC's code, where the centre is and who said so, and one agent's
--    suggestion waiting. A position is written only through the functions below, so the
--    team's right to update a station stops short of it.
-- 2. wards: the box around each ward's outline, which the 300 m check uses.
-- 3. place_station: an organiser's pin. use_station_suggestion: an agent's position, taken.
-- 4. station_here: an agent at the centre.
-- 5. retire_sample_stations: Sakaja's 85 sample stations make way for the register's; one
--    with a filed result, a form photo or a real agent is kept as SAMPLE-0001 onwards.
-- The centres come in 20261015090100_polling_centres_data.sql, written by
-- scripts/stations/build-sql.ts, which also sets the schema version.

-- 1.
alter table public.polling_stations
  add column if not exists iebc_code text check (iebc_code ~ '^[0-9]{13}$'),
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180),
  add column if not exists placed_by text
    check (placed_by in ('osm', 'osm-close', 'organiser', 'agent')),
  add column if not exists placed_accuracy_m real,
  add column if not exists placed_at timestamptz,
  add column if not exists placed_actor uuid,
  add column if not exists suggested_lat double precision check (suggested_lat between -90 and 90),
  add column if not exists suggested_lng double precision
    check (suggested_lng between -180 and 180),
  add column if not exists suggested_accuracy_m real,
  add column if not exists suggested_at timestamptz,
  add column if not exists suggested_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'polling_stations_position_whole') then
    alter table public.polling_stations add constraint polling_stations_position_whole
      check ((lat is null) = (lng is null) and (lat is null) = (placed_by is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'polling_stations_suggestion_whole') then
    alter table public.polling_stations add constraint polling_stations_suggestion_whole
      check ((suggested_lat is null) = (suggested_lng is null));
  end if;
end $$;

create unique index if not exists polling_stations_iebc_idx
  on public.polling_stations (campaign_id, iebc_code) where iebc_code is not null;

-- The team keeps the right to update what it could before; the new columns are written by
-- the functions below only.
revoke update on public.polling_stations from authenticated;
grant update (id, campaign_id, code, name, ward_id, registered_voters, streams, agent_name,
              agent_phone, status, turnout_reported, results, reported_at, created_at)
  on public.polling_stations to authenticated;

-- 2.
alter table public.wards
  add column if not exists west double precision,
  add column if not exists south double precision,
  add column if not exists east double precision,
  add column if not exists north double precision;

-- 3. An organiser's pin: anywhere within 2 km of the centre's ward, when its box is known.
create or replace function public.place_station(_station_id uuid, _lat double precision,
                                                _lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wards;
  pad_lat double precision := 2000 / 111320.0;
  pad_lng double precision;
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager', 'organiser') then
    raise exception 'Only organisers and managers can place a centre.' using errcode = '42501';
  end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'That isn''t a place on the map.' using errcode = 'P0001';
  end if;
  select w2.* into w
    from public.polling_stations s join public.wards w2 on w2.id = s.ward_id
   where s.id = _station_id and s.campaign_id = public.my_campaign();
  pad_lng := 2000 / (111320.0 * cos(radians(_lat)));
  if w.west is not null and (_lat < w.south - pad_lat or _lat > w.north + pad_lat
                             or _lng < w.west - pad_lng or _lng > w.east + pad_lng) then
    raise exception 'That is more than 2 km from the centre''s ward.' using errcode = 'P0001';
  end if;
  update public.polling_stations
     set lat = _lat, lng = _lng, placed_by = 'organiser', placed_accuracy_m = null,
         placed_at = now(), placed_actor = auth.uid(),
         suggested_lat = null, suggested_lng = null, suggested_accuracy_m = null,
         suggested_at = null, suggested_by = null
   where id = _station_id and campaign_id = public.my_campaign();
  if not found then
    raise exception 'That centre is not on file.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.place_station(uuid, double precision, double precision) from public, anon;
grant execute on function public.place_station(uuid, double precision, double precision) to authenticated;

-- An agent's suggestion, taken by an organiser: the agent placed it.
create or replace function public.use_station_suggestion(_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager', 'organiser') then
    raise exception 'Only organisers and managers can place a centre.' using errcode = '42501';
  end if;
  update public.polling_stations
     set lat = suggested_lat, lng = suggested_lng, placed_by = 'agent',
         placed_accuracy_m = suggested_accuracy_m, placed_at = suggested_at,
         placed_actor = suggested_by,
         suggested_lat = null, suggested_lng = null, suggested_accuracy_m = null,
         suggested_at = null, suggested_by = null
   where id = _station_id and campaign_id = public.my_campaign() and suggested_lat is not null;
  if not found then
    raise exception 'There is no suggestion waiting for that centre.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.use_station_suggestion(uuid) from public, anon;
grant execute on function public.use_station_suggestion(uuid) to authenticated;

-- 4. An agent at the centre: the phone's position becomes the centre's when it is good to
-- 50 m and no more than 300 m outside the box around the centre's ward; otherwise it waits as
-- a suggestion. Returns {"moved": true}, or {"moved": false, "why": "accuracy" | "distance" |
-- "no-ward"}.
create or replace function public.station_here(_station_id uuid, _lat double precision,
                                               _lng double precision, _accuracy real)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st public.polling_stations;
  w public.wards;
  pad_lat double precision := 300 / 111320.0;
  pad_lng double precision;
  why text;
begin
  if coalesce(public.my_campaign_role(), '') not in
       ('super', 'candidate', 'manager', 'organiser', 'agent') then
    raise exception 'Only the campaign''s team can confirm a centre.' using errcode = '42501';
  end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then
    raise exception 'That isn''t a place on the map.' using errcode = 'P0001';
  end if;
  select * into st from public.polling_stations
   where id = _station_id and campaign_id = public.my_campaign()
     for update;
  if not found then
    raise exception 'That centre is not on file.' using errcode = 'P0001';
  end if;
  select * into w from public.wards where id = st.ward_id;
  pad_lng := 300 / (111320.0 * cos(radians(_lat)));
  if _accuracy is null or _accuracy > 50 then
    why := 'accuracy';
  elsif w.west is null then
    why := 'no-ward';
  elsif _lat < w.south - pad_lat or _lat > w.north + pad_lat
        or _lng < w.west - pad_lng or _lng > w.east + pad_lng then
    why := 'distance';
  end if;
  if why is null then
    update public.polling_stations
       set lat = _lat, lng = _lng, placed_by = 'agent', placed_accuracy_m = _accuracy,
           placed_at = now(), placed_actor = auth.uid(),
           suggested_lat = null, suggested_lng = null, suggested_accuracy_m = null,
           suggested_at = null, suggested_by = null
     where id = st.id;
    return jsonb_build_object('moved', true);
  end if;
  update public.polling_stations
     set suggested_lat = _lat, suggested_lng = _lng, suggested_accuracy_m = _accuracy,
         suggested_at = now(), suggested_by = auth.uid()
   where id = st.id;
  return jsonb_build_object('moved', false, 'why', why);
end;
$$;

revoke all on function public.station_here(uuid, double precision, double precision, real) from public, anon;
grant execute on function public.station_here(uuid, double precision, double precision, real) to authenticated;

-- 5. Sakaja's sample stations: PS-0001 to PS-0085, a "<ward> Primary School" in each ward,
-- seeded with "Agent <ward>" or no agent. One the team has used (a filed result, a form
-- photo, another agent) is kept, renamed SAMPLE-0001 onwards; the rest go. Returns how many
-- went and how many were kept. The database's owner runs it, once, below.
create or replace function public.retire_sample_stations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sakaja uuid := 'ca000000-0000-4000-8000-000000000002';
  gone integer;
  kept integer;
  taken integer := (select count(*) from public.polling_stations
                     where campaign_id = sakaja and code ~ '^SAMPLE-[0-9]{4}$');
begin
  with samples as (
    select s.id,
           exists (select 1 from public.stream_results r where r.station_id = s.id)
             or exists (select 1 from public.form_photos f where f.station_id = s.id)
             or (s.agent_name is not null and s.agent_name <> 'Agent ' || w.name) as used
      from public.polling_stations s
      join public.wards w on w.id = s.ward_id
     where s.campaign_id = sakaja
       and s.iebc_code is null
       and s.code ~ '^PS-[0-9]{4}$'
       and s.name = w.name || ' Primary School'
  ), deleted as (
    delete from public.polling_stations p using samples x
     where p.id = x.id and not x.used
    returning p.id
  )
  select count(*) into gone from deleted;
  -- What is left of the samples is what the team used.
  with left_over as (
    select s.id, row_number() over (order by s.code) as n
      from public.polling_stations s
      join public.wards w on w.id = s.ward_id
     where s.campaign_id = sakaja
       and s.iebc_code is null
       and s.code ~ '^PS-[0-9]{4}$'
       and s.name = w.name || ' Primary School'
  )
  update public.polling_stations p
     set code = 'SAMPLE-' || lpad((taken + k.n)::text, 4, '0')
    from left_over k
   where p.id = k.id;
  get diagnostics kept = row_count;
  return jsonb_build_object('gone', gone, 'kept', kept);
end;
$$;

revoke all on function public.retire_sample_stations() from public, anon, authenticated;

do $$
begin
  perform public.retire_sample_stations();
end $$;