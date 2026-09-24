-- The field app: walk lists and door visits.
--
-- Agents work where the network drops out, so a visit is often recorded on
-- the phone and sent later. Each visit carries an id made on the phone: a
-- retried sync finds the visit already there and records nothing twice. The
-- time kept is when the door was knocked, not when the phone found signal.
--
-- Door visits land exactly where the Canvassing screen already reads them:
-- person_events of kind door_spoke / door_not_home / door_refused, with the
-- issue raised as the detail on a door_spoke.

alter table public.person_events
  add column if not exists client_id uuid;

create unique index if not exists person_events_client_id_key
  on public.person_events (client_id) where client_id is not null;

-- Who to knock on in a ward: people not reached yet first, then the longest
-- since last contact. Anyone who refused in the last 30 days is left off, so
-- nobody is sent straight back to a door that was just closed. Numbers are
-- masked: an agent at the door has no need to dial them.
create or replace function public.walk_list(_ward_id uuid, _limit integer default 200)
returns table (
  id uuid,
  full_name text,
  phone_masked text,
  segment text,
  support_score integer,
  last_contacted_at timestamptz,
  last_outcome text,
  last_visit_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with last_visit as (
    select distinct on (e.person_id) e.person_id, e.kind, e.created_at
      from public.person_events e
     where e.kind in ('door_spoke', 'door_not_home', 'door_refused')
       and e.person_id in (select p.id from public.people p where p.ward_id = _ward_id)
     order by e.person_id, e.created_at desc
  )
  select p.id,
         p.full_name,
         case when p.phone ~ '^\+254[0-9]{9}$'
              then '+254 ' || substr(p.phone, 5, 3) || ' ••• ' || right(p.phone, 3)
              else '—' end,
         p.segment,
         p.support_score,
         p.last_contacted_at,
         case lv.kind when 'door_spoke' then 'spoke'
                      when 'door_not_home' then 'not_home'
                      when 'door_refused' then 'refused' end,
         lv.created_at
    from public.people p
    left join last_visit lv on lv.person_id = p.id
   where p.ward_id = _ward_id
     -- coalesce: for someone never visited the comparison is NULL, and
     -- "not NULL" would drop exactly the people most in need of a knock.
     and not coalesce(lv.kind = 'door_refused' and lv.created_at > now() - interval '30 days', false)
   order by p.last_contacted_at asc nulls first, p.full_name
   limit greatest(1, least(coalesce(_limit, 200), 500))
$$;

revoke all on function public.walk_list(uuid, integer) from public, anon;
grant execute on function public.walk_list(uuid, integer) to authenticated;

-- Record one door visit, to someone on file (_person_id) or someone met at
-- the door (_new: phone, name, ward_id, segment, language). Runs as the
-- caller: any admitted team member, agents included.
create or replace function public.record_door(
  _client_id      uuid,
  _person_id      uuid,
  _new            jsonb,
  _outcome        text,
  _support        integer,
  _issue          text,
  _consent        jsonb,
  _consent_source text,
  _visited_at     timestamptz
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

  insert into public.person_events (person_id, kind, channel, detail, actor, created_at, client_id)
  values (_pid, _kind, 'door',
          case when _outcome = 'spoke' then nullif(left(btrim(_issue), 120), '') end,
          auth.uid(), _at, _client_id);

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

revoke all on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 7 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
