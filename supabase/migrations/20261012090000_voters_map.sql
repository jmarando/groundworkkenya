-- Schema 23: the Voters map, part 1 (docs/superpowers/specs/2026-10-12-voters-map-design.md).
--
-- 1. Each campaign's map area: the atlas key of the area its Voters map covers.
--    Only areas with a house file in public/tiles work (src/lib/map-areas.ts).
-- 2. Kalonzo's workspace takes Nairobi's 85 wards, the map area chosen for it.
-- 3. house_visits: every door knocked, counted against the house (its plus
--    code from the house file), written by record_door.
-- 4. house_doors() and ward_houses(): the doors per ward and per house, for
--    the map's colours.
-- 5. Door visits already on record with a house are copied in once.

-- 1. The map area lives on the campaign: only Groundwork sets it, because it
-- needs a house file, and atlas_settings has no row until someone picks a home.
alter table public.campaigns
  add column if not exists map_area text
  check (map_area is null or map_area ~ '^[a-z0-9-]+(/[a-z0-9-]+)*$');

update public.campaigns set map_area = 'nairobi'
 where id in ('ca000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002');
update public.campaigns set map_area = 'nyeri/mathira'
 where id = 'ca000000-0000-4000-8000-000000000003';

-- 2. Kalonzo's wards: names and constituencies from Sakaja's rows, registered
-- voters from the 2022 register (data/atlas/nairobi/register.csv; 2,415,310 in
-- all), no targets and no supporters yet.
insert into public.wards (campaign_id, slug, name, constituency, registered_voters, target_votes, supporters)
select 'ca000000-0000-4000-8000-000000000001', w.slug, w.name, w.constituency, r.registered, 0, 0
  from public.wards w
  join (values
    ('gatina', 34831), ('kabiro', 29090), ('kawangware', 28468), ('kileleshwa', 26343),
    ('kilimani', 38927), ('mutu-ini', 13484), ('ngando', 24892), ('riruta', 37766),
    ('uthiru-ruthimitu', 19657), ('waithaka', 19131), ('kayole-central', 26855),
    ('kayole-north', 25563), ('kayole-south', 41154), ('komarock', 33127),
    ('matopeni-spring-valley', 19193), ('embakasi', 46291), ('lower-savannah', 30104),
    ('mihango', 23569), ('upper-savannah', 28928), ('utawala', 25707), ('dandora-area-i', 20543),
    ('dandora-area-ii', 19761), ('dandora-area-iii', 21247), ('dandora-area-iv', 27293),
    ('kariobangi-north', 24500), ('imara-daima', 38096), ('kwa-njenga', 28554),
    ('kwa-reuben', 33591), ('kware', 29812), ('pipeline', 37900), ('kariobangi-south', 38339),
    ('mowlem', 23423), ('umoja-i', 40554), ('umoja-ii', 39562), ('airbase', 16352),
    ('california', 17492), ('eastleigh-north', 27523), ('eastleigh-south', 28019),
    ('pumwani', 39130), ('clay-city', 34387), ('kasarani', 27525), ('mwiki', 27837),
    ('njiru', 28140), ('ruai', 37361), ('laini-saba', 19378), ('lindi', 19082),
    ('makina', 28408), ('sarangombe', 32442), ('woodley-kenyatta-golf-course', 28972),
    ('karen', 34450), ('mugumo-ini', 37864), ('nairobi-west', 18386), ('nyayo-highrise', 21800),
    ('south-c', 33149), ('harambee', 36498), ('makongeni', 28658), ('maringo-hamza', 39821),
    ('viwandani', 24650), ('hospital', 12512), ('huruma', 23018), ('kiamaiko', 19193),
    ('mabatini', 20976), ('mlango-kubwa', 22765), ('ngei', 24699), ('githurai', 35899),
    ('kahawa', 17428), ('kahawa-west', 38586), ('roysambu', 31158), ('zimmerman', 30701),
    ('baba-dogo', 29419), ('korogocho', 17440), ('lucky-summer', 20690),
    ('mathare-north', 29334), ('utalii', 27599), ('landimawe', 20436),
    ('nairobi-central', 52186), ('nairobi-south', 33853), ('ngara', 27816), ('pangani', 18494),
    ('ziwani-kariokor', 16790), ('kangemi', 32551), ('karura', 29548), ('kitisuru', 29237),
    ('mountain-view', 32259), ('parklands-highridge', 37144)
  ) as r(slug, registered) on r.slug = w.slug
 where w.campaign_id = 'ca000000-0000-4000-8000-000000000002'
on conflict (campaign_id, slug) do nothing;

-- 3. Every door knocked at a house.
create table public.house_visits (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  -- Made on the phone, so a visit synced twice is counted once.
  client_id   uuid not null,
  -- The house's plus code, as the house file names it.
  pc          text not null check (pc ~ '^[0-9A-Z+]{4,24}$'),
  ward_id     uuid references public.wards(id) on delete set null,
  person_id   uuid references public.people(id) on delete set null,
  outcome     text not null check (outcome in ('spoke', 'not_home', 'refused')),
  support     smallint check (support between 1 and 5),
  issue       text check (char_length(issue) <= 120),
  actor       uuid default auth.uid(),
  visited_at  timestamptz not null,
  lat         double precision,
  lng         double precision,
  accuracy_m  real,
  created_at  timestamptz not null default now(),
  unique (campaign_id, client_id)
);
create index house_visits_ward_idx on public.house_visits (campaign_id, ward_id, visited_at desc);
create index house_visits_pc_idx on public.house_visits (campaign_id, pc, visited_at desc);
create trigger stamp_campaign before insert on public.house_visits
  for each row execute function public.stamp_campaign('people', 'person_id', 'wards', 'ward_id');

alter table public.house_visits enable row level security;
revoke all on public.house_visits from anon, authenticated;
grant select, insert on public.house_visits to authenticated;
grant all on public.house_visits to service_role;
create policy "own campaign only" on public.house_visits as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
-- The office reads every door; an agent the doors they knocked (part 3 adds
-- the houses on their walk lists).
create policy "read by the office" on public.house_visits for select to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'));
create policy "agents read their own" on public.house_visits for select to authenticated
  using (actor = auth.uid());
create policy "team records their visits" on public.house_visits for insert to authenticated
  with check (public.is_team_member(auth.uid()) and actor = auth.uid());

-- record_door, as 20260924160000_map_places.sql left it, plus two changes: a
-- repeat is also a visit already on a house, and a visit with a house is
-- counted against it.
create or replace function public.record_door(
  _client_id      uuid,
  _person_id      uuid,
  _new            jsonb,
  _outcome        text,
  _support        integer,
  _issue          text,
  _consent        jsonb,
  _consent_source text,
  _visited_at     timestamptz,
  _place          jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _pid      uuid := _person_id;
  _at       timestamptz;
  _phone    text;
  _created  boolean := false;
  _kind     text;
  _opted    boolean;
  _sms      boolean := coalesce((_consent ->> 'sms')::boolean, false);
  _wa       boolean := coalesce((_consent ->> 'whatsapp')::boolean, false);
  _call     boolean := coalesce((_consent ->> 'call')::boolean, false);
  _channels text;
  _lat      double precision;
  _lng      double precision;
  _acc      real;
  _bld      text;
begin
  if _client_id is null then
    raise exception 'Each visit needs its own id.' using errcode = 'P0001';
  end if;
  -- Two syncs of the same visit at once (open tabs share the phone's queue):
  -- the second waits here for the first, then finds the visit on record.
  perform pg_advisory_xact_lock(hashtextextended(_client_id::text, 0));
  -- A retried sync: the visit is already on record.
  if exists (select 1 from public.person_events where client_id = _client_id)
     or exists (select 1 from public.house_visits where client_id = _client_id) then
    return jsonb_build_object('repeat', true);
  end if;

  if _outcome is null or _outcome not in ('spoke', 'not_home', 'refused') then
    raise exception 'Unknown outcome.' using errcode = 'P0001';
  end if;
  if _support is not null and _support not between 1 and 5 then
    raise exception 'Support is 1 to 5.' using errcode = 'P0001';
  end if;
  if (_sms or _wa or _call) and coalesce(btrim(_consent_source), '') = '' then
    raise exception 'Say how they agreed to be contacted.' using errcode = 'P0001';
  end if;

  -- The time the door was knocked, kept honest: not in the future, and not
  -- older than a week (a phone that was offline that long should say so).
  _at := least(now(), greatest(coalesce(_visited_at, now()), now() - interval '7 days'));

  -- Where the door was. A bad or vague fix is dropped, never an error.
  if jsonb_typeof(_place) = 'object' then
    if jsonb_typeof(_place -> 'lat') = 'number' and jsonb_typeof(_place -> 'lng') = 'number' then
      _lat := (_place ->> 'lat')::double precision;
      _lng := (_place ->> 'lng')::double precision;
      -- Outside Kenya is a broken fix, not a place.
      if _lat not between -5 and 5.5 or _lng not between 33.5 and 42.5 then
        _lat := null;
        _lng := null;
      end if;
    end if;
    if jsonb_typeof(_place -> 'accuracy') = 'number' then
      _acc := least(greatest((_place ->> 'accuracy')::real, 0), 100000);
      -- Wider than a few streets: too vague to pin anyone's home.
      if _acc > 250 then
        _lat := null;
        _lng := null;
      end if;
    end if;
    _bld := nullif(btrim(_place ->> 'buildingId'), '');
    if _bld is not null and _bld !~ '^[0-9A-Z+]{4,24}$' then
      _bld := null;
    end if;
  end if;

  if _pid is null then
    -- Someone met at the door. A number already on file means we know them:
    -- the visit goes on their record and only blanks are filled.
    _phone := _new ->> 'phone';
    if _phone is null or _phone !~ '^\+254[17][0-9]{8}$' then
      raise exception 'Use a Kenyan mobile number like 0712 345 678.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(_new ->> 'name'), '') = '' then
      raise exception 'Add their name.' using errcode = 'P0001';
    end if;
    if _outcome <> 'spoke' then
      raise exception 'A new person is someone you spoke to.' using errcode = 'P0001';
    end if;

    select id into _pid from public.people where phone = _phone;
    if found then
      update public.people
         set full_name = coalesce(full_name, btrim(_new ->> 'name')),
             ward_id   = coalesce(ward_id, nullif(_new ->> 'ward_id', '')::uuid),
             segment   = coalesce(segment, nullif(btrim(_new ->> 'segment'), ''))
       where id = _pid;
    else
      insert into public.people (phone, full_name, ward_id, segment, language, source)
      values (_phone, btrim(_new ->> 'name'), nullif(_new ->> 'ward_id', '')::uuid,
              nullif(btrim(_new ->> 'segment'), ''), coalesce(nullif(_new ->> 'language', ''), 'sw'), 'door')
      returning id into _pid;
      _created := true;
      insert into public.person_events (person_id, kind, channel, detail, actor, created_at)
      values (_pid, 'added', 'door', 'Signed up at the door', auth.uid(), _at);
    end if;
  end if;

  select opted_out into _opted from public.people where id = _pid;
  if not found then
    raise exception 'That person is not on file, or you cannot see them.' using errcode = 'P0001';
  end if;

  _kind := case _outcome when 'spoke' then 'door_spoke'
                         when 'not_home' then 'door_not_home'
                         else 'door_refused' end;

  insert into public.person_events
    (person_id, kind, channel, detail, actor, created_at, client_id, lat, lng, accuracy_m, building_id)
  values (_pid, _kind, 'door',
          case when _outcome = 'spoke' then nullif(left(btrim(_issue), 120), '') end,
          auth.uid(), _at, _client_id, _lat, _lng, _acc, _bld);

  -- The house, too: every door knocked at a house is counted against it, with
  -- the ward of the person who answered (part 3 adds doors with no person).
  if _bld is not null then
    insert into public.house_visits
      (client_id, pc, ward_id, person_id, outcome, support, issue, actor, visited_at, lat, lng, accuracy_m)
    select _client_id, _bld, p.ward_id, _pid, _outcome,
           case when _outcome = 'spoke' then _support end,
           case when _outcome = 'spoke' then nullif(left(btrim(_issue), 120), '') end,
           auth.uid(), _at, _lat, _lng, _acc
      from public.people p
     where p.id = _pid
    on conflict (campaign_id, client_id) do nothing;
  end if;

  -- Pin the household: the door is their home. A later visit moves the pin;
  -- an earlier one synced late does not. A bare GPS point never replaces a
  -- building someone confirmed.
  if _bld is not null or _lat is not null then
    update public.people
       set building_id = coalesce(_bld, building_id),
           lat         = coalesce(_lat, lat),
           lng         = coalesce(_lng, lng),
           placed_at   = _at
     where id = _pid
       and (placed_at is null or placed_at <= _at)
       and (_bld is not null or building_id is null);
  end if;

  -- Speaking to someone, or being turned away, is contact; an empty house is not.
  if _outcome in ('spoke', 'refused') then
    update public.people
       set last_contacted_at = greatest(coalesce(last_contacted_at, _at), _at),
           -- The 1-5 door scale as a 0-100 score. Mirrors SUPPORT_SCORE in
           -- src/lib/people.ts: change both together.
           support_score = case when _outcome = 'spoke' and _support is not null
                                then (array[10, 30, 50, 75, 95])[_support]
                                else support_score end
     where id = _pid;
  end if;

  -- Consent given at the door, never over the top of a STOP.
  if (_sms or _wa or _call) and not coalesce(_opted, false) and _outcome = 'spoke' then
    update public.people
       set consent_sms      = consent_sms or _sms,
           consent_whatsapp = consent_whatsapp or _wa,
           consent_call     = consent_call or _call
     where id = _pid;
    _channels := concat_ws(', ',
      case when _sms then 'SMS' end, case when _wa then 'WhatsApp' end, case when _call then 'calls' end);
    insert into public.person_events (person_id, kind, channel, detail, actor, created_at)
    values (_pid, 'consent_given', 'door',
            left(format('Agreed to %s: %s', _channels, btrim(_consent_source)), 500), auth.uid(), _at);
  end if;

  return jsonb_build_object('repeat', false, 'person_id', _pid, 'created', _created,
                            'consent_blocked', (_sms or _wa or _call) and coalesce(_opted, false));
end;
$$;

revoke all on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb) from public, anon;
grant execute on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb) to authenticated;

-- 4. Doors per ward, from each house's latest visit in 30 days, and the visits
-- of the last seven days. Runs as the caller, so an agent counts their own.
create or replace function public.house_doors()
returns table (
  ward_id      uuid,
  knocked      integer,
  rated        integer,
  supporters   integer,
  doors_week   integer,
  agents_today uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select distinct on (v.pc) v.pc, v.ward_id, v.outcome, v.support
      from public.house_visits v
     where v.visited_at > now() - interval '30 days'
     order by v.pc, v.visited_at desc
  ),
  per_ward as (
    select l.ward_id,
           count(*)::integer as knocked,
           (count(*) filter (where l.outcome = 'spoke' and l.support is not null))::integer as rated,
           (count(*) filter (where l.outcome = 'spoke' and l.support >= 4))::integer as supporters
      from latest l
     group by l.ward_id
  ),
  week as (
    select v.ward_id,
           count(*)::integer as doors_week,
           coalesce(array_agg(distinct v.actor) filter (
             where v.actor is not null
               and v.visited_at >= date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'
           ), '{}') as agents_today
      from public.house_visits v
     where v.visited_at > now() - interval '7 days'
     group by v.ward_id
  )
  select coalesce(p.ward_id, w.ward_id),
         coalesce(p.knocked, 0), coalesce(p.rated, 0), coalesce(p.supporters, 0),
         coalesce(w.doors_week, 0), coalesce(w.agents_today, '{}')
    from per_ward p
    full join week w on w.ward_id = p.ward_id
$$;

-- Each house in a ward with a visit in 30 days: its latest, ordered by plus
-- code so a long list pages.
create or replace function public.ward_houses(_ward_id uuid)
returns table (pc text, visited_at timestamptz, outcome text, support smallint)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (v.pc) v.pc, v.visited_at, v.outcome, v.support
    from public.house_visits v
   where v.ward_id = _ward_id
     and v.visited_at > now() - interval '30 days'
   order by v.pc, v.visited_at desc
$$;

revoke all on function public.house_doors() from public, anon;
grant execute on function public.house_doors() to authenticated;
revoke all on function public.ward_houses(uuid) from public, anon;
grant execute on function public.ward_houses(uuid) to authenticated;

-- 5. Door visits already on record with a house, copied in once. Only a
-- person's latest conversation at the door takes their score (the "last
-- score" a house shows); older visits keep none.
insert into public.house_visits
  (campaign_id, client_id, pc, ward_id, person_id, outcome, support, issue, actor,
   visited_at, lat, lng, accuracy_m)
select e.campaign_id,
       coalesce(e.client_id, e.id),
       e.building_id,
       p.ward_id,
       p.id,
       case e.kind when 'door_spoke' then 'spoke' when 'door_not_home' then 'not_home' else 'refused' end,
       case
         when e.kind = 'door_spoke'
          and e.id = (select l.id from public.person_events l
                       where l.person_id = e.person_id and l.kind = 'door_spoke'
                       order by l.created_at desc, l.id desc limit 1)
         then case when p.support_score >= 85 then 5
                   when p.support_score >= 62 then 4
                   when p.support_score >= 40 then 3
                   when p.support_score >= 20 then 2
                   when p.support_score > 0 then 1 end
       end,
       case when e.kind = 'door_spoke' then nullif(left(btrim(e.detail), 120), '') end,
       e.actor,
       e.created_at,
       e.lat,
       e.lng,
       e.accuracy_m
  from public.person_events e
  join public.people p on p.id = e.person_id
 where e.kind in ('door_spoke', 'door_not_home', 'door_refused')
   and e.building_id ~ '^[0-9A-Z+]{4,24}$'
on conflict (campaign_id, client_id) do nothing;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 23 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
