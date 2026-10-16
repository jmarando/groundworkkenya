-- Schema 28: walk lists, part 2 of polling centres and walk lists
-- (docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md, sections 2 to 4).
--
-- 1. walk_lists and walk_list_doors: up to 150 houses in walking order, given to one person.
--    Written only by create_walk_list, give_walk_list, close_walk_list and (when the last door
--    is knocked) walk_list_settle. The office reads every list; an agent the lists given to them.
-- 2. house_visits.walk_list_id, and the agent's right to read the visits at their lists' doors.
-- 3. walk_list_counts decides what "done" means for a door; the screens' reads sit on it.
-- 4. record_door at a list's door, with a person or without one.
-- 5. The schema version.

-- 1. A list and its doors.
create table if not exists public.walk_lists (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null default public.my_campaign()
                references public.campaigns(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  centre_id     uuid references public.polling_stations(id) on delete set null,
  ward_id       uuid references public.wards(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft', 'out', 'done')),
  given_to      uuid references auth.users(id) on delete set null,
  made_by       uuid default auth.uid() references auth.users(id) on delete set null,
  -- When it first went out: a door is done when it has a visit from then on. Giving the
  -- list to someone else keeps it, so the progress stays.
  first_sent_at timestamptz,
  given_at      timestamptz,
  done_at       timestamptz,
  closed_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.walk_list_doors (
  campaign_id  uuid not null default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  walk_list_id uuid not null references public.walk_lists(id) on delete cascade,
  -- 1, 2, 3 ... in walking order.
  position     integer not null check (position >= 1),
  -- The house's plus code, as the house file names it.
  pc           text not null check (pc ~ '^[0-9A-Z+]{4,24}$'),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  -- The house's rings, [[lng, lat], ...] each, so a phone with no signal can draw it.
  outline      jsonb check (outline is null or jsonb_typeof(outline) = 'array'),
  ward_id      uuid references public.wards(id) on delete set null,
  primary key (walk_list_id, position),
  unique (walk_list_id, pc)
);

create index if not exists walk_lists_campaign_idx on public.walk_lists (campaign_id, status);
create index if not exists walk_lists_given_to_idx on public.walk_lists (given_to) where given_to is not null;
create index if not exists walk_list_doors_pc_idx on public.walk_list_doors (campaign_id, pc);

drop trigger if exists stamp_campaign on public.walk_lists;
create trigger stamp_campaign before insert on public.walk_lists
  for each row execute function public.stamp_campaign('wards', 'ward_id', 'polling_stations', 'centre_id');
drop trigger if exists stamp_campaign on public.walk_list_doors;
create trigger stamp_campaign before insert on public.walk_list_doors
  for each row execute function public.stamp_campaign('walk_lists', 'walk_list_id');

alter table public.walk_lists enable row level security;
alter table public.walk_list_doors enable row level security;
revoke all on public.walk_lists from anon, authenticated;
revoke all on public.walk_list_doors from anon, authenticated;
grant select on public.walk_lists to authenticated;
grant select on public.walk_list_doors to authenticated;
grant all on public.walk_lists to service_role;
grant all on public.walk_list_doors to service_role;

drop policy if exists "own campaign only" on public.walk_lists;
create policy "own campaign only" on public.walk_lists as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "read by the office" on public.walk_lists;
create policy "read by the office" on public.walk_lists for select to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "agents read their lists" on public.walk_lists;
create policy "agents read their lists" on public.walk_lists for select to authenticated
  using (given_to = auth.uid());

drop policy if exists "own campaign only" on public.walk_list_doors;
create policy "own campaign only" on public.walk_list_doors as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "read by the office" on public.walk_list_doors;
create policy "read by the office" on public.walk_list_doors for select to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "agents read their doors" on public.walk_list_doors;
create policy "agents read their doors" on public.walk_list_doors for select to authenticated
  using (exists (select 1 from public.walk_lists l
                  where l.id = walk_list_doors.walk_list_id and l.given_to = auth.uid()));

-- 2. The visits at a door carry the list they were made for; an agent also reads the visits
-- at the doors of their lists (who knocked there before, and what they heard).
alter table public.house_visits
  add column if not exists walk_list_id uuid references public.walk_lists(id) on delete set null;
create index if not exists house_visits_walk_list_idx on public.house_visits (walk_list_id)
  where walk_list_id is not null;

drop policy if exists "agents read the visits at their doors" on public.house_visits;
create policy "agents read the visits at their doors" on public.house_visits for select to authenticated
  using (exists (select 1 from public.walk_list_doors d join public.walk_lists l on l.id = d.walk_list_id
                  where d.campaign_id = house_visits.campaign_id and d.pc = house_visits.pc
                    and l.given_to = auth.uid()));

-- Planning, giving and closing are for the candidate, managers and organisers.
create or replace function public.walk_list_staff_only()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager', 'organiser') then
    raise exception 'Only organisers and managers can plan walk lists.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.walk_list_staff_only() from public, anon, authenticated;

-- 3. The one place that decides "done": a door is done when its house has a visit from the
-- moment the list first went out, "not home" included. not_home counts the doors whose latest
-- such visit was a not home. Runs as the caller, so an agent counts their own lists.
create or replace function public.walk_list_counts(_ids uuid[])
returns table (list_id uuid, doors integer, done integer, not_home integer)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id,
         count(d.pc)::integer,
         (count(d.pc) filter (where v.outcome is not null))::integer,
         (count(d.pc) filter (where v.outcome = 'not_home'))::integer
    from public.walk_lists l
    left join public.walk_list_doors d on d.walk_list_id = l.id
    left join lateral (
      select hv.outcome
        from public.house_visits hv
       where hv.campaign_id = l.campaign_id and hv.pc = d.pc and hv.visited_at >= l.first_sent_at
       order by hv.visited_at desc, hv.created_at desc
       limit 1
    ) v on true
   where l.id = any(_ids) and l.campaign_id = public.my_campaign()
   group by l.id
$$;

-- The lists in a ward that are still open (a draft, or out with someone), newest first.
create or replace function public.open_walk_lists(_ward_id uuid)
returns table (
  id              uuid,
  name            text,
  status          text,
  centre_id       uuid,
  ward_id         uuid,
  given_to        uuid,
  given_to_name   text,
  doors           integer,
  done            integer,
  not_home        integer,
  first_sent_at   timestamptz,
  given_at        timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.name, l.status, l.centre_id, l.ward_id, l.given_to, p.full_name,
         c.doors, c.done, c.not_home, l.first_sent_at, l.given_at
    from public.walk_lists l
    join public.walk_list_counts(array(
           select x.id from public.walk_lists x
            where x.status in ('draft', 'out') and (_ward_id is null or x.ward_id = _ward_id)
         )) c on c.list_id = l.id
    left join public.profiles p on p.user_id = l.given_to
   order by l.created_at desc, l.id
$$;

-- The lists out with the caller, newest first.
create or replace function public.my_walk_lists()
returns table (
  id            uuid,
  name          text,
  centre_id     uuid,
  centre_name   text,
  ward_id       uuid,
  doors         integer,
  done          integer,
  given_at      timestamptz,
  first_sent_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.name, l.centre_id, s.name, l.ward_id, c.doors, c.done, l.given_at, l.first_sent_at
    from public.walk_lists l
    join public.walk_list_counts(array(
           select x.id from public.walk_lists x where x.given_to = auth.uid() and x.status = 'out'
         )) c on c.list_id = l.id
    left join public.polling_stations s on s.id = l.centre_id
   order by l.given_at desc nulls last, l.id
$$;

-- A list's doors in walking order, each with the latest visit at its house (any time, so the
-- screen can show the last visit; the list's own progress is walk_list_counts).
create or replace function public.walk_list_doors(_list_id uuid)
returns table (
  "position"   integer,
  pc           text,
  lat          double precision,
  lng          double precision,
  outline      jsonb,
  ward_id      uuid,
  last_outcome text,
  last_at      timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.position, d.pc, d.lat, d.lng, d.outline, d.ward_id, v.outcome, v.visited_at
    from public.walk_list_doors d
    left join lateral (
      select hv.outcome, hv.visited_at
        from public.house_visits hv
       where hv.campaign_id = d.campaign_id and hv.pc = d.pc
       order by hv.visited_at desc, hv.created_at desc
       limit 1
    ) v on true
   where d.walk_list_id = _list_id
   order by d.position
$$;

-- The team a list can be given to: agents first, each with the doors still open on their lists.
create or replace function public.walk_list_team()
returns table (user_id uuid, full_name text, role text, doors_open integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.walk_list_staff_only();
  return query
  select m.user_id, p.full_name, m.role::text,
         coalesce((select sum(c.doors - c.done)
                     from public.walk_list_counts(array(
                            select l.id from public.walk_lists l
                             where l.given_to = m.user_id and l.status = 'out' and l.campaign_id = m.campaign_id
                          )) c), 0)::integer
    from public.campaign_members m
    left join public.profiles p on p.user_id = m.user_id
   where m.campaign_id = public.my_campaign() and m.role <> 'pending'
   order by (m.role = 'agent') desc, p.full_name nulls last, m.user_id;
end;
$$;

-- What planning in a ward needs to know of its houses: the latest spoke or refused and the
-- latest not home in the last 30 days, and the open list a house is on. The screen applies
-- the 30 and 3 day rules.
create or replace function public.walk_list_planning(_ward_id uuid)
returns table (pc text, spoke_or_refused_at timestamptz, not_home_at timestamptz, on_list uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _campaign uuid := public.my_campaign();
begin
  perform public.walk_list_staff_only();
  return query
  with seen as (
    select v.pc,
           max(v.visited_at) filter (where v.outcome in ('spoke', 'refused')) as spoke_or_refused_at,
           max(v.visited_at) filter (where v.outcome = 'not_home') as not_home_at
      from public.house_visits v
     where v.campaign_id = _campaign and v.ward_id = _ward_id and v.visited_at > now() - interval '30 days'
     group by v.pc
  ),
  held as (
    select d.pc, (array_agg(l.id order by l.created_at, l.id))[1] as on_list
      from public.walk_list_doors d
      join public.walk_lists l on l.id = d.walk_list_id
     where d.campaign_id = _campaign and d.ward_id = _ward_id and l.status in ('draft', 'out')
     group by d.pc
  )
  select coalesce(s.pc, h.pc), s.spoke_or_refused_at, s.not_home_at, h.on_list
    from seen s
    full join held h on h.pc = s.pc;
end;
$$;

-- Makes a list: its doors (an array in walking order of {pc, lat, lng, outline, ward_id}) leave
-- off any house already on another open list, and the answer says how many were left off.
-- Given to someone, it goes out; otherwise it is a draft, which holds its houses all the same.
create or replace function public.create_walk_list(
  _name      text,
  _centre_id uuid,
  _ward_id   uuid,
  _doors     jsonb,
  _give_to   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
  _nm       text := btrim(coalesce(_name, ''));
  _n        integer;
  _kept     integer;
  _id       uuid;
begin
  perform public.walk_list_staff_only();
  if _nm = '' or char_length(_nm) > 80 then
    raise exception 'Name the list, in 80 letters or fewer.' using errcode = 'P0001';
  end if;
  if _doors is null or jsonb_typeof(_doors) <> 'array' or jsonb_array_length(_doors) = 0 then
    raise exception 'Pick at least one house.' using errcode = 'P0001';
  end if;
  _n := jsonb_array_length(_doors);
  if _n > 150 then
    raise exception 'A list is at most 150 houses.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(_doors) as e(value)
              where jsonb_typeof(e.value -> 'pc') is distinct from 'string'
                 or (e.value ->> 'pc') !~ '^[0-9A-Z+]{4,24}$'
                 or jsonb_typeof(e.value -> 'lat') is distinct from 'number'
                 or jsonb_typeof(e.value -> 'lng') is distinct from 'number') then
    raise exception 'Each house needs a plus code and a place.' using errcode = 'P0001';
  end if;

  -- Two organisers planning the same street at once: the second waits, then finds the houses taken.
  perform pg_advisory_xact_lock(hashtextextended('walk-list:' || coalesce(_campaign::text, ''), 0));

  if not exists (select 1 from public.wards w where w.id = _ward_id and w.campaign_id = _campaign) then
    raise exception 'That ward isn''t on file.' using errcode = 'P0001';
  end if;
  if _centre_id is not null
     and not exists (select 1 from public.polling_stations s where s.id = _centre_id and s.campaign_id = _campaign) then
    raise exception 'That centre isn''t on file.' using errcode = 'P0001';
  end if;
  if _give_to is not null
     and not exists (select 1 from public.campaign_members m
                      where m.user_id = _give_to and m.campaign_id = _campaign and m.role <> 'pending') then
    raise exception 'That person isn''t on your team.' using errcode = 'P0001';
  end if;

  insert into public.walk_lists
    (campaign_id, name, centre_id, ward_id, status, given_to, made_by, first_sent_at, given_at)
  values (_campaign, _nm, _centre_id, _ward_id,
          case when _give_to is null then 'draft' else 'out' end, _give_to, auth.uid(),
          case when _give_to is not null then now() end, case when _give_to is not null then now() end)
  returning id into _id;

  insert into public.walk_list_doors (campaign_id, walk_list_id, position, pc, lat, lng, outline, ward_id)
  select _campaign, _id, (row_number() over (order by d.ord))::integer, d.pc, d.lat, d.lng, d.outline, d.ward
    from (
      select e.ord,
             e.value ->> 'pc' as pc,
             (e.value ->> 'lat')::double precision as lat,
             (e.value ->> 'lng')::double precision as lng,
             case when jsonb_typeof(e.value -> 'outline') = 'array' then e.value -> 'outline' end as outline,
             coalesce((select w.id from public.wards w
                        where w.id = nullif(e.value ->> 'ward_id', '')::uuid and w.campaign_id = _campaign),
                      _ward_id) as ward,
             row_number() over (partition by e.value ->> 'pc' order by e.ord) as nth
        from jsonb_array_elements(_doors) with ordinality as e(value, ord)
    ) d
   where d.nth = 1
     and not exists (select 1 from public.walk_list_doors o join public.walk_lists ol on ol.id = o.walk_list_id
                      where o.campaign_id = _campaign and o.pc = d.pc
                        and ol.status in ('draft', 'out') and ol.id <> _id);
  get diagnostics _kept = row_count;
  if _kept = 0 then
    raise exception 'Every one of those houses is on another list.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', _id, 'left_off', _n - _kept);
end;
$$;

-- Gives a list to someone on the team: a draft goes out, an out list changes hands and keeps its progress.
create or replace function public.give_walk_list(_id uuid, _to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.walk_lists;
begin
  perform public.walk_list_staff_only();
  select * into l from public.walk_lists where id = _id and campaign_id = public.my_campaign() for update;
  if not found then
    raise exception 'That list isn''t on file.' using errcode = 'P0001';
  end if;
  if l.status = 'done' then
    raise exception 'That list is done.' using errcode = 'P0001';
  end if;
  if _to is null or not exists (select 1 from public.campaign_members m
                                 where m.user_id = _to and m.campaign_id = l.campaign_id and m.role <> 'pending') then
    raise exception 'That person isn''t on your team.' using errcode = 'P0001';
  end if;
  update public.walk_lists
     set status = 'out', given_to = _to, given_at = now(), first_sent_at = coalesce(first_sent_at, now())
   where id = _id;
end;
$$;

-- Closes a list by hand: its houses are free again. Closing a list that is done changes nothing.
create or replace function public.close_walk_list(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.walk_lists;
begin
  perform public.walk_list_staff_only();
  select * into l from public.walk_lists where id = _id and campaign_id = public.my_campaign() for update;
  if not found then
    raise exception 'That list isn''t on file.' using errcode = 'P0001';
  end if;
  if l.status <> 'done' then
    update public.walk_lists set status = 'done', done_at = now(), closed_by = auth.uid() where id = _id;
  end if;
end;
$$;

-- Used by record_door, which runs as the agent: the ward of a list's door, one row if the door is
-- on that list in this campaign and none otherwise. The list's status and holder do not matter, so
-- a knock made before the list moved on is still accepted.
create or replace function public.walk_list_door_ward(_list_id uuid, _pc text)
returns table (door_ward uuid)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(d.ward_id, l.ward_id)
    from public.walk_list_doors d
    join public.walk_lists l on l.id = d.walk_list_id
   where d.walk_list_id = _list_id and d.pc = _pc and l.campaign_id = public.my_campaign()
$$;

-- Used by record_door after a visit at a house: an out list with a door there, every door of which now
-- has a visit since it went out, becomes done (once: only an out list changes). Two last doors
-- knocked at the same moment: the second waits for the first, then sees its visit.
create or replace function public.walk_list_settle(_pc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _l uuid;
begin
  for _l in
    select distinct l.id
      from public.walk_lists l
      join public.walk_list_doors d on d.walk_list_id = l.id
     where l.campaign_id = public.my_campaign() and l.status = 'out' and d.pc = _pc
     order by l.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('walk-list-done:' || _l::text, 0));
    update public.walk_lists l
       set status = 'done', done_at = now()
     where l.id = _l and l.status = 'out'
       and exists (select 1 from public.walk_list_counts(array[l.id]) c where c.doors > 0 and c.done = c.doors);
  end loop;
end;
$$;

revoke all on function public.walk_list_counts(uuid[]) from public, anon;
grant execute on function public.walk_list_counts(uuid[]) to authenticated;
revoke all on function public.open_walk_lists(uuid) from public, anon;
grant execute on function public.open_walk_lists(uuid) to authenticated;
revoke all on function public.my_walk_lists() from public, anon;
grant execute on function public.my_walk_lists() to authenticated;
revoke all on function public.walk_list_doors(uuid) from public, anon;
grant execute on function public.walk_list_doors(uuid) to authenticated;
revoke all on function public.walk_list_team() from public, anon;
grant execute on function public.walk_list_team() to authenticated;
revoke all on function public.walk_list_planning(uuid) from public, anon;
grant execute on function public.walk_list_planning(uuid) to authenticated;
revoke all on function public.create_walk_list(text, uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_walk_list(text, uuid, uuid, jsonb, uuid) to authenticated;
revoke all on function public.give_walk_list(uuid, uuid) from public, anon;
grant execute on function public.give_walk_list(uuid, uuid) to authenticated;
revoke all on function public.close_walk_list(uuid) from public, anon;
grant execute on function public.close_walk_list(uuid) to authenticated;
revoke all on function public.walk_list_door_ward(uuid, text) from public, anon;
grant execute on function public.walk_list_door_ward(uuid, text) to authenticated;
revoke all on function public.walk_list_settle(text) from public, anon;
grant execute on function public.walk_list_settle(text) to authenticated;

-- 4. record_door, as 20261012090000_voters_map.sql left it, plus two arguments: the walk list a
-- visit is made for and the door's plus code. At a list's door the house is the door whatever the
-- place read says, the visit takes the door's ward and the list, and no person is needed (nobody
-- home, a refusal, or a conversation with no name given is the house alone). Without a list it is
-- exactly what it was. The old ten-argument form goes first: two overloads with defaults would
-- make every call ambiguous.
drop function if exists public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb);

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

-- 5.
create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 28 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
