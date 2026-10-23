-- Schema 33: tighter access.
--
-- 1. Field agents read only the people at the doors of their own open walk lists and the people
--    they have met in the last fortnight; they read none of the inbox (conversations, messages)
--    and only their own entries in a person's history. record_door finds a number already on
--    file without the caller reading the record, so a knock still lands on the right person.
-- 2. A channel's address and status are set by Groundwork (the super admin) alone: a campaign
--    that could write another line's address would receive that line's messages.
-- 3. A sign-up becomes super admin, or takes up an invitation, only once the email is confirmed;
--    an invitation waiting in one campaign can't be taken over by another.
-- 4. What Lovable added outside supabase/migrations (drizzle/migrations): the canvassing streets
--    and the morning job's lease, so a database built from this folder has them too.
--    street_walk was never called and was open to signed-out callers; it goes.
-- 5. The schema version.

-- 1. ----------------------------------------------------------------- agents and people

-- True when the signed-in field agent may read this person: they live at a door of an open list
-- given to the agent, or the agent has recorded meeting them in the last 14 days.
create or replace function public.agent_sees_person(_person uuid, _building text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (_building is not null and exists (
            select 1 from public.walk_list_doors d
              join public.walk_lists l on l.id = d.walk_list_id
             where d.pc = _building and l.given_to = auth.uid() and l.status = 'out'
               and l.campaign_id = public.my_campaign()))
      or exists (select 1 from public.person_events e
                  where e.person_id = _person and e.actor = auth.uid()
                    and e.created_at > now() - interval '14 days')
$$;
revoke all on function public.agent_sees_person(uuid, text) from public, anon;
grant execute on function public.agent_sees_person(uuid, text) to authenticated;

-- A number already on file in the caller's campaign: its record and whether it said STOP.
create or replace function public.person_by_phone(_phone text)
returns table (id uuid, opted_out boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.opted_out from public.people p
   where public.is_team_member(auth.uid()) and p.campaign_id = public.my_campaign() and p.phone = _phone
   limit 1
$$;
revoke all on function public.person_by_phone(text) from public, anon;
grant execute on function public.person_by_phone(text) to authenticated;

drop policy if exists "people readable by team" on public.people;
create policy "people readable by team" on public.people for select to authenticated
  using (public.is_team_member(auth.uid())
         and ((select public.my_campaign_role()) <> 'agent' or public.agent_sees_person(id, building_id)));
drop policy if exists "people updatable by team" on public.people;
create policy "people updatable by team" on public.people for update to authenticated
  using (public.is_team_member(auth.uid())
         and ((select public.my_campaign_role()) <> 'agent' or public.agent_sees_person(id, building_id)))
  with check (public.is_team_member(auth.uid()));

drop policy if exists "convos readable by team" on public.conversations;
create policy "convos readable by team" on public.conversations for select to authenticated
  using (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');
drop policy if exists "convos updatable by team" on public.conversations;
create policy "convos updatable by team" on public.conversations for update to authenticated
  using (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent')
  with check (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');
drop policy if exists "convos writable by team" on public.conversations;
create policy "convos writable by team" on public.conversations for insert to authenticated
  with check (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');

drop policy if exists "messages readable by team" on public.messages;
create policy "messages readable by team" on public.messages for select to authenticated
  using (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');
drop policy if exists "messages updatable by team" on public.messages;
create policy "messages updatable by team" on public.messages for update to authenticated
  using (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent')
  with check (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');
drop policy if exists "messages writable by team" on public.messages;
create policy "messages writable by team" on public.messages for insert to authenticated
  with check (public.is_team_member(auth.uid()) and (select public.my_campaign_role()) <> 'agent');

drop policy if exists "events readable by team" on public.person_events;
create policy "events readable by team" on public.person_events for select to authenticated
  using (public.is_team_member(auth.uid())
         and ((select public.my_campaign_role()) <> 'agent' or actor = auth.uid()));

create index if not exists person_events_actor_idx on public.person_events (actor, created_at desc);

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
  _place          jsonb default null,
  _walk_list_id   uuid default null,
  _door_pc        text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _pid       uuid := _person_id;
  _at        timestamptz;
  _phone     text;
  _created   boolean := false;
  _kind      text;
  _opted     boolean;
  _sms       boolean := coalesce((_consent ->> 'sms')::boolean, false);
  _wa        boolean := coalesce((_consent ->> 'whatsapp')::boolean, false);
  _call      boolean := coalesce((_consent ->> 'call')::boolean, false);
  _channels  text;
  _lat       double precision;
  _lng       double precision;
  _acc       real;
  _bld       text;
  _door_ward uuid;
  _alone     boolean := false;
  _known     boolean := false;
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

  -- At a list's door: the door must be one of the list's in this campaign (the same words for a
  -- list that doesn't exist, so nothing leaks across campaigns). The list's status and holder are
  -- not checked: a knock made before the list moved on is still a knock.
  if _walk_list_id is not null then
    select w.door_ward into _door_ward from public.walk_list_door_ward(_walk_list_id, _door_pc) w;
    if not found then
      raise exception 'That door isn''t on this list.' using errcode = 'P0001';
    end if;
    _bld := _door_pc;
    _alone := _pid is null and coalesce(jsonb_typeof(_new), 'null') = 'null';
  end if;

  if not _alone then
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

      -- Found by number whether or not the caller can read their record (a field agent sees only
      -- the people at their own doors and the people they have met).
      select b.id, b.opted_out into _pid, _opted from public.person_by_phone(_phone) b;
      if _pid is not null then
        _known := true;
      else
        -- The id is made here, not returned by the insert: an agent may not read the new row back
        -- until the visit below is on record.
        _pid := gen_random_uuid();
        _opted := false;
        insert into public.people (id, phone, full_name, ward_id, segment, language, source)
        values (_pid, _phone, btrim(_new ->> 'name'), nullif(_new ->> 'ward_id', '')::uuid,
                nullif(btrim(_new ->> 'segment'), ''), coalesce(nullif(_new ->> 'language', ''), 'sw'), 'door');
        _created := true;
        insert into public.person_events (person_id, kind, channel, detail, actor, created_at)
        values (_pid, 'added', 'door', 'Signed up at the door', auth.uid(), _at);
      end if;
    else
      select opted_out into _opted from public.people where id = _pid;
      if not found then
        raise exception 'That person is not on file, or you cannot see them.' using errcode = 'P0001';
      end if;
    end if;

    _kind := case _outcome when 'spoke' then 'door_spoke'
                           when 'not_home' then 'door_not_home'
                           else 'door_refused' end;

    insert into public.person_events
      (person_id, kind, channel, detail, actor, created_at, client_id, lat, lng, accuracy_m, building_id)
    values (_pid, _kind, 'door',
            case when _outcome = 'spoke' then nullif(left(btrim(_issue), 120), '') end,
            auth.uid(), _at, _client_id, _lat, _lng, _acc, _bld);

    -- Someone already on file: fill only their blanks, now the visit puts them in the caller's sight.
    if _known then
      update public.people
         set full_name = coalesce(full_name, btrim(_new ->> 'name')),
             ward_id   = coalesce(ward_id, nullif(_new ->> 'ward_id', '')::uuid),
             segment   = coalesce(segment, nullif(btrim(_new ->> 'segment'), ''))
       where id = _pid;
    end if;
  end if;

  -- The house, too: every door knocked at a house is counted against it, with the ward of the
  -- door on a walk list and otherwise of the person who answered.
  if _bld is not null then
    insert into public.house_visits
      (client_id, pc, ward_id, person_id, outcome, support, issue, actor, visited_at, lat, lng, accuracy_m, walk_list_id)
    values (_client_id, _bld,
            case when _walk_list_id is not null then _door_ward
                 else (select p.ward_id from public.people p where p.id = _pid) end,
            _pid, _outcome,
            case when _outcome = 'spoke' then _support end,
            case when _outcome = 'spoke' then nullif(left(btrim(_issue), 120), '') end,
            auth.uid(), _at, _lat, _lng, _acc, _walk_list_id)
    on conflict (campaign_id, client_id) do nothing;
  end if;

  if _pid is not null then
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
  end if;

  -- A list whose last door this was becomes done by itself, whether or not the visit named the list.
  if _bld is not null then
    perform public.walk_list_settle(_bld);
  end if;

  return jsonb_build_object('repeat', false, 'person_id', _pid, 'created', _created,
                            'consent_blocked', (_sms or _wa or _call) and coalesce(_opted, false));
end;
$$;

revoke all on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb, uuid, text) from public, anon;
grant execute on function public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb, uuid, text) to authenticated;

create or replace function public.add_person(
  _phone          text,
  _full_name      text,
  _ward_id        uuid,
  _segment        text,
  _language       text,
  _support_score  integer,
  _notes          text,
  _consent        jsonb,
  _consent_source text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _id       uuid;
  _existing record;
  _sms      boolean := coalesce((_consent ->> 'sms')::boolean, false);
  _wa       boolean := coalesce((_consent ->> 'whatsapp')::boolean, false);
  _call     boolean := coalesce((_consent ->> 'call')::boolean, false);
  _channels text;
begin
  if _phone !~ '^\+254[17][0-9]{8}$' then
    raise exception 'Use a Kenyan mobile number like 0712 345 678.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(_full_name), '') = '' then
    raise exception 'Add their name.' using errcode = 'P0001';
  end if;
  if (_sms or _wa or _call) and coalesce(btrim(_consent_source), '') = '' then
    raise exception 'Say how they agreed to be contacted.' using errcode = 'P0001';
  end if;

  select id, full_name into _existing from public.people where phone = _phone;
  if found then
    raise exception '% is already on file as %.', _phone, coalesce(_existing.full_name, 'an unnamed record')
      using errcode = 'P0001';
  end if;
  -- On file but out of the caller's sight (a field agent): say so without the name.
  if exists (select 1 from public.person_by_phone(_phone)) then
    raise exception '% is already on file.', _phone using errcode = 'P0001';
  end if;

  -- The id is made here, not returned by the insert: a field agent may read the new record only
  -- once the entry below says they added it.
  _id := gen_random_uuid();
  insert into public.people
    (id, phone, full_name, ward_id, segment, language, support_score, notes, source,
     consent_sms, consent_whatsapp, consent_call)
  values
    (_id, _phone, btrim(_full_name), _ward_id, nullif(btrim(_segment), ''),
     coalesce(nullif(_language, ''), 'sw'), greatest(0, least(100, coalesce(_support_score, 0))),
     nullif(btrim(_notes), ''), 'manual', _sms, _wa, _call);

  insert into public.person_events (person_id, kind, channel, detail, actor)
  values (_id, 'added', 'console', 'Added by hand', auth.uid());

  if _sms or _wa or _call then
    _channels := concat_ws(', ',
      case when _sms then 'SMS' end, case when _wa then 'WhatsApp' end, case when _call then 'calls' end);
    insert into public.person_events (person_id, kind, channel, detail, actor)
    values (_id, 'consent_given', 'console',
            left(format('Agreed to %s: %s', _channels, btrim(_consent_source)), 500), auth.uid());
  end if;

  return jsonb_build_object('id', _id);
end;
$$;

revoke all on function public.add_person(text, text, uuid, text, text, integer, text, jsonb, text) from public, anon;
grant execute on function public.add_person(text, text, uuid, text, text, integer, text, jsonb, text) to authenticated;

-- 2. ----------------------------------------------------------------- channels

-- Candidates and managers keep the channel's label and note; its address and status are
-- Groundwork's to set. The service role (no signed-in user) is not checked.
create or replace function public.campaign_channels_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.identifier is not null or new.status <> 'not_started' then
      raise exception 'Groundwork sets up a channel''s address. Ask us to connect it.' using errcode = '42501';
    end if;
  elsif new.identifier is distinct from old.identifier or new.status is distinct from old.status
        or new.kind is distinct from old.kind or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Groundwork sets up a channel''s address. Ask us to connect it.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.campaign_channels_guard() from public, anon, authenticated;

drop trigger if exists campaign_channels_guard on public.campaign_channels;
create trigger campaign_channels_guard before insert or update on public.campaign_channels
  for each row execute function public.campaign_channels_guard();

-- 3. ----------------------------------------------------------------- sign-ups and invitations

-- What a confirmed email brings: the super admin's role for Groundwork's own address, and any
-- invitation waiting for it.
create or replace function public.grant_on_confirmed(_user uuid, _email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare _inv public.campaign_invites;
begin
  if lower(_email) = 'justin@glab.africa' then
    insert into public.user_roles (user_id, role) values (_user, 'admin') on conflict do nothing;
  end if;
  select * into _inv from public.campaign_invites where lower(email) = lower(_email);
  if found then
    insert into public.campaign_members (campaign_id, user_id, role) values (_inv.campaign_id, _user, _inv.role)
    on conflict (user_id) do nothing;
    delete from public.campaign_invites where id = _inv.id;
  end if;
end;
$$;
revoke all on function public.grant_on_confirmed(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.email)
  on conflict (user_id) do nothing;
  -- Nothing is granted to an address nobody has proved they hold.
  if new.email_confirmed_at is not null then
    perform public.grant_on_confirmed(new.id, new.email);
  end if;
  return new;
end $$;

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.grant_on_confirmed(new.id, new.email);
  end if;
  return new;
end $$;
revoke all on function public.handle_user_confirmed() from public, anon, authenticated;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

create or replace function public.invite_member(_campaign uuid, _email text, _role public.campaign_role)
returns text language plpgsql security definer set search_path = public as $$
declare _uid uuid; _mine uuid; _waiting uuid;
begin
  if not public.can_admit(auth.uid(), _campaign) then
    raise exception 'Only the candidate or campaign manager can invite people.' using errcode = '42501';
  end if;
  if _role = 'pending' then raise exception 'Pick a role.' using errcode = 'P0001'; end if;
  if _role = 'candidate' and not public.is_super_admin(auth.uid())
     and not exists (select 1 from public.campaign_members where user_id = auth.uid() and role = 'candidate') then
    raise exception 'Only the candidate can add another candidate.' using errcode = '42501';
  end if;
  if coalesce(btrim(_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email does not look right.' using errcode = 'P0001';
  end if;
  select id into _uid from auth.users where lower(email) = lower(btrim(_email));
  if _uid is not null then
    select campaign_id into _mine from public.campaign_members where user_id = _uid;
    if _mine is not null and _mine <> _campaign then
      raise exception 'That person already works on another campaign.' using errcode = 'P0001';
    end if;
    insert into public.campaign_members (campaign_id, user_id, role) values (_campaign, _uid, _role)
    on conflict (user_id) do update set role = excluded.role;
    return 'added';
  end if;
  -- An invitation another campaign is waiting on stays theirs (the super admin may move it).
  select campaign_id into _waiting from public.campaign_invites where email = lower(btrim(_email));
  if _waiting is not null and _waiting <> _campaign and not public.is_super_admin(auth.uid()) then
    raise exception 'That email already has an invitation waiting.' using errcode = 'P0001';
  end if;
  insert into public.campaign_invites (campaign_id, email, role, invited_by)
  values (_campaign, lower(btrim(_email)), _role, auth.uid())
  on conflict (email) do update set campaign_id = excluded.campaign_id, role = excluded.role, invited_by = excluded.invited_by;
  return 'invited';
end $$;
revoke all on function public.invite_member(uuid, text, public.campaign_role) from public, anon;
grant execute on function public.invite_member(uuid, text, public.campaign_role) to authenticated, service_role;

-- 4. ----------------------------------------------------------------- from drizzle/migrations

create table if not exists public.canvass_streets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign() references public.campaigns(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  agent_name text check (agent_name is null or length(agent_name) <= 120),
  agent_phone text check (agent_phone is null or length(agent_phone) <= 20),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ward_id, name)
);
revoke all on public.canvass_streets from anon;
grant select, insert, update, delete on public.canvass_streets to authenticated;
grant all on public.canvass_streets to service_role;
alter table public.canvass_streets enable row level security;
drop policy if exists "own campaign only" on public.canvass_streets;
create policy "own campaign only" on public.canvass_streets as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "streets readable by team" on public.canvass_streets;
create policy "streets readable by team" on public.canvass_streets for select to authenticated
  using (public.is_team_member(auth.uid()));
drop policy if exists "streets managed by staff" on public.canvass_streets;
create policy "streets managed by staff" on public.canvass_streets for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
drop trigger if exists canvass_streets_touch on public.canvass_streets;
create trigger canvass_streets_touch before update on public.canvass_streets
  for each row execute function public.touch_updated_at();

alter table public.people
  add column if not exists street_id uuid references public.canvass_streets(id) on delete set null,
  add column if not exists door_no integer;
create index if not exists people_street_idx on public.people(street_id, door_no);

drop function if exists public.street_walk(uuid);

create or replace function public.claim_morning_job(_key text, _now timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  if _key <> 'morning_story' then raise exception 'Unsupported job'; end if;
  insert into public.listening_jobs(key, status, locked_until, updated_at)
  values (_key, 'running', _now + interval '10 minutes', _now)
  on conflict (key) do update set status = 'running', locked_until = _now + interval '10 minutes', updated_at = _now
  where listening_jobs.status <> 'paused' and (listening_jobs.locked_until is null or listening_jobs.locked_until <= _now)
  returning key into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_morning_job(text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_morning_job(text, timestamptz) to service_role;

-- 5. ----------------------------------------------------------------- version

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 33 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
