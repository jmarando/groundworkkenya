-- Places on the map: where each door visit happened and which building it was.
--
-- The field app sends the phone's GPS fix and the building the agent is at
-- (picked from the ward's building outlines). Both are optional and never
-- block a visit: a phone without signal or without location permission still
-- records the door. A person's home is the building of their latest visit;
-- a building the agent confirmed outranks a bare GPS point.

alter table public.person_events
  add column if not exists lat         double precision,
  add column if not exists lng         double precision,
  add column if not exists accuracy_m  real,
  add column if not exists building_id text;

alter table public.people
  add column if not exists building_id text,
  add column if not exists lat         double precision,
  add column if not exists lng         double precision,
  add column if not exists placed_at   timestamptz;

create index if not exists people_building_idx on public.people (building_id) where building_id is not null;
create index if not exists people_ward_placed_idx on public.people (ward_id) where lat is not null or building_id is not null;

-- The visit now carries its place. Same arguments as before plus _place, which
-- defaults to null, so a phone on the previous build still records visits.
drop function if exists public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz);

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
  if exists (select 1 from public.person_events where client_id = _client_id) then
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

-- Everyone pinned in a ward, for the map: where they live, how the doors went
-- and what they raised. Numbers are masked, as on the walk list. Runs as the
-- caller, so only admitted team members see anyone.
create or replace function public.ward_map(_ward_id uuid)
returns table (
  id                uuid,
  full_name         text,
  phone_masked      text,
  building_id       text,
  lat               double precision,
  lng               double precision,
  support_score     integer,
  segment           text,
  consent_sms       boolean,
  opted_out         boolean,
  last_contacted_at timestamptz,
  last_outcome      text,
  last_visit_at     timestamptz,
  last_issue        text
)
language sql
stable
security invoker
set search_path = public
as $$
  with placed as (
    select p.*
      from public.people p
     where p.ward_id = _ward_id
       and (p.building_id is not null or p.lat is not null)
     limit 50000
  ),
  last_visit as (
    select distinct on (e.person_id) e.person_id, e.kind, e.created_at
      from public.person_events e
     where e.kind in ('door_spoke', 'door_not_home', 'door_refused')
       and e.person_id in (select id from placed)
     order by e.person_id, e.created_at desc
  ),
  last_issue as (
    select distinct on (e.person_id) e.person_id, e.detail
      from public.person_events e
     where e.kind = 'door_spoke'
       and e.detail is not null
       and e.person_id in (select id from placed)
     order by e.person_id, e.created_at desc
  )
  select p.id,
         p.full_name,
         case when p.phone ~ '^\+254[0-9]{9}$'
              then '+254 ' || substr(p.phone, 5, 3) || ' ••• ' || right(p.phone, 3)
              else '—' end,
         p.building_id,
         p.lat,
         p.lng,
         p.support_score,
         p.segment,
         p.consent_sms,
         p.opted_out,
         p.last_contacted_at,
         case lv.kind when 'door_spoke' then 'spoke'
                      when 'door_not_home' then 'not_home'
                      when 'door_refused' then 'refused' end,
         lv.created_at,
         li.detail
    from placed p
    left join last_visit lv on lv.person_id = p.id
    left join last_issue li on li.person_id = p.id
$$;

revoke all on function public.ward_map(uuid) from public, anon;
grant execute on function public.ward_map(uuid) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 8 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
