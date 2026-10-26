-- Schema 45: was the agent at the door?
--
-- 1. pluscode_centre(pc): where a house is, from its plus code (as src/lib/pluscode.ts reads it).
-- 2. Every door visit keeps how far the phone was from the house when it was recorded
--    (distance_m) and what that means (place_check): at the door, nearby, far away, or no position.
--    A house whose plus code says nowhere (a test code) is left unchecked. Worked out in the
--    database as the visit is written, so the phone cannot say it was there.
-- 3. field_days(campaign, from, to): each person's day on walk lists, counted: doors, at the door,
--    nearby, far, no position, recorded too quickly after the last one, and synced long after.
--    A day is held for a look when a quarter of its doors were far away or had no position, or
--    over half were recorded within 20 seconds of the one before, or over half reached Groundwork
--    more than 12 hours after they were said to happen.
--    field_day_checks(from, to): the same, for the office, with each person's name.
-- 4. Stipends: a day that is held becomes a "held" stipend with what to check (check_note), not a
--    pending one; approve_stipends approves a held line only when it is named, never in bulk by
--    accident (the page sends only pending lines to "Approve all"). Pending lines already on file
--    whose day is held are held too.

-- 1. -----------------------------------------------------------------
create or replace function public.pluscode_centre(_pc text, out lat double precision, out lng double precision)
language plpgsql
immutable
set search_path = public
as $$
declare
  digits constant text := '23456789CFGHJMPQRVWX';
  c      text := upper(btrim(coalesce(_pc, '')));
  d      text;
  res    double precision := 20;
  lat_r  double precision;
  lng_r  double precision;
  v      integer;
  i      integer;
begin
  lat := null;
  lng := null;
  if c !~ '^[23456789C][23456789CFGHJMPQRV][23456789CFGHJMPQRVWX]{6}\+[23456789CFGHJMPQRVWX]{2,7}$' then
    return;
  end if;
  d := replace(c, '+', '');
  lat := -90;
  lng := -180;
  -- Five pairs of latitude and longitude digits, each 20 times finer than the last.
  i := 1;
  while i <= 9 loop
    lat := lat + (strpos(digits, substr(d, i, 1)) - 1) * res;
    lng := lng + (strpos(digits, substr(d, i + 1, 1)) - 1) * res;
    if i < 9 then
      res := res / 20;
    end if;
    i := i + 2;
  end loop;
  -- Then a 5-row, 4-column grid per digit.
  lat_r := res;
  lng_r := res;
  i := 11;
  while i <= length(d) loop
    lat_r := lat_r / 5;
    lng_r := lng_r / 4;
    v := strpos(digits, substr(d, i, 1)) - 1;
    lat := lat + floor(v / 4) * lat_r;
    lng := lng + (v % 4) * lng_r;
    i := i + 1;
  end loop;
  lat := lat + lat_r / 2;
  lng := lng + lng_r / 2;
end $$;

revoke all on function public.pluscode_centre(text) from public, anon;
grant execute on function public.pluscode_centre(text) to authenticated, service_role;

-- Metres between two points on the ground.
create or replace function public.metres_between(
  _lat1 double precision, _lng1 double precision, _lat2 double precision, _lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(_lat2 - _lat1) / 2), 2)
    + cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)))
$$;

revoke all on function public.metres_between(double precision, double precision, double precision, double precision)
  from public, anon;
grant execute on function public.metres_between(double precision, double precision, double precision, double precision)
  to authenticated, service_role;

-- 2. -----------------------------------------------------------------
alter table public.house_visits
  add column if not exists distance_m  real,
  add column if not exists place_check text
    check (place_check in ('door', 'near', 'far', 'no_gps'));

-- At the door: within 50 metres, or within what the phone said its fix was good to (up to 100 m).
-- Nearby: within 250 metres. Beyond that, far away.
create or replace function public.house_visit_place()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c record;
  d double precision;
begin
  if new.lat is null or new.lng is null then
    new.distance_m := null;
    new.place_check := 'no_gps';
    return new;
  end if;
  select * into c from public.pluscode_centre(new.pc);
  if c.lat is null then
    new.distance_m := null;
    new.place_check := null;
    return new;
  end if;
  d := public.metres_between(new.lat, new.lng, c.lat, c.lng);
  new.distance_m := round(d);
  new.place_check := case
    when d <= greatest(50, least(coalesce(new.accuracy_m, 0), 100)) then 'door'
    when d <= 250 then 'near'
    else 'far'
  end;
  return new;
end $$;

revoke all on function public.house_visit_place() from public, anon, authenticated;

drop trigger if exists house_visit_place on public.house_visits;
create trigger house_visit_place
  before insert or update of lat, lng, accuracy_m, pc on public.house_visits
  for each row execute function public.house_visit_place();

-- The visits already on file, checked the same way.
update public.house_visits set pc = pc;

-- 3. -----------------------------------------------------------------
create or replace function public.field_days(_campaign uuid, _from date, _to date)
returns table (
  user_id    uuid,
  work_date  date,
  doors      integer,
  at_door    integer,
  near       integer,
  far        integer,
  no_gps     integer,
  unchecked  integer,
  quick      integer,
  late       integer,
  first_at   timestamptz,
  last_at    timestamptz,
  ward_id    uuid,
  held       boolean,
  reasons    text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select h.actor, (h.visited_at at time zone 'Africa/Nairobi')::date as day, h.visited_at,
           h.created_at, h.place_check, h.ward_id,
           h.visited_at - lag(h.visited_at) over (
             partition by h.actor, (h.visited_at at time zone 'Africa/Nairobi')::date
             order by h.visited_at) as gap
      from public.house_visits h
     where h.campaign_id = _campaign and h.walk_list_id is not null and h.actor is not null
       and (h.visited_at at time zone 'Africa/Nairobi')::date between _from and _to
  ), d as (
    select v.actor, v.day,
           count(*)::integer as doors,
           count(*) filter (where v.place_check = 'door')::integer as at_door,
           count(*) filter (where v.place_check = 'near')::integer as near,
           count(*) filter (where v.place_check = 'far')::integer as far,
           count(*) filter (where v.place_check = 'no_gps')::integer as no_gps,
           count(*) filter (where v.place_check is null)::integer as unchecked,
           count(*) filter (where v.gap < interval '20 seconds')::integer as quick,
           count(*) filter (where v.created_at - v.visited_at > interval '12 hours')::integer as late,
           min(v.visited_at) as first_at,
           max(v.visited_at) as last_at,
           mode() within group (order by v.ward_id) as ward_id
      from v
     group by 1, 2
  )
  select d.actor, d.day, d.doors, d.at_door, d.near, d.far, d.no_gps, d.unchecked, d.quick, d.late,
         d.first_at, d.last_at, d.ward_id,
         r.reasons <> '{}'::text[],
         r.reasons
    from d
    cross join lateral (
      select array_remove(array[
        case when d.far * 4 > d.doors then 'far' end,
        case when d.no_gps * 4 > d.doors then 'no_gps' end,
        case when (d.far + d.no_gps) * 4 > d.doors and d.far * 4 <= d.doors and d.no_gps * 4 <= d.doors
             then 'far_or_no_gps' end,
        case when d.quick * 2 > d.doors then 'quick' end,
        case when d.late * 2 > d.doors then 'late' end
      ], null) as reasons
    ) r
$$;

revoke all on function public.field_days(uuid, date, date) from public, anon, authenticated;
grant execute on function public.field_days(uuid, date, date) to service_role;

create or replace function public.field_day_checks(_from date, _to date)
returns table (
  user_id    uuid,
  name       text,
  work_date  date,
  doors      integer,
  at_door    integer,
  near       integer,
  far        integer,
  no_gps     integer,
  unchecked  integer,
  quick      integer,
  late       integer,
  first_at   timestamptz,
  last_at    timestamptz,
  ward       text,
  held       boolean,
  reasons    text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager', 'organiser') then
    raise exception 'Only the campaign office reads the field checks.' using errcode = '42501';
  end if;
  if _to < _from or _to - _from > 62 then
    raise exception 'Up to two months at a time.' using errcode = '22023';
  end if;
  return query
    select f.user_id, coalesce(nullif(p.full_name, ''), p.email, 'Agent'), f.work_date, f.doors,
           f.at_door, f.near, f.far, f.no_gps, f.unchecked, f.quick, f.late, f.first_at, f.last_at,
           w.name, f.held, f.reasons
      from public.field_days(public.my_campaign(), _from, _to) f
      left join public.profiles p on p.user_id = f.user_id
      left join public.wards w on w.id = f.ward_id
     order by f.work_date desc, f.held desc, 2;
end $$;

revoke all on function public.field_day_checks(date, date) from public, anon;
grant execute on function public.field_day_checks(date, date) to authenticated;

-- 4. -----------------------------------------------------------------
alter table public.agent_stipends add column if not exists check_note text;

create or replace function public.stipends_from_field(_from date, _to date, _rate numeric)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
  _added integer;
begin
  perform public.stipend_money_only();
  if _rate is null or _rate <= 0 or _rate > 20000 then
    raise exception 'A day''s rate is up to KES 20,000.' using errcode = '22023';
  end if;
  if _to < _from or _to - _from > 62 then
    raise exception 'Up to two months at a time.' using errcode = '22023';
  end if;
  with ins as (
    insert into public.agent_stipends
      (campaign_id, user_id, work_date, doors, agent_name, phone, role, ward_id, rate_kes, days,
       amount_kes, status, method, check_note)
    select _campaign, d.user_id, d.work_date, d.doors,
           coalesce(nullif(p.full_name, ''), p.email, 'Agent'), coalesce(p.phone, ''), 'agent', d.ward_id,
           _rate, 1, _rate, case when d.held then 'held' else 'pending' end, 'mpesa',
           case when d.held then array_to_string(d.reasons, ',') end
      from public.field_days(_campaign, _from, _to) d
      join public.campaign_members m on m.user_id = d.user_id and m.campaign_id = _campaign
      left join public.profiles p on p.user_id = d.user_id
    on conflict (campaign_id, user_id, work_date) where user_id is not null and work_date is not null do nothing
    returning 1
  )
  select count(*) into _added from ins;
  return _added;
end;
$$;

create or replace function public.approve_stipends(_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _n integer;
begin
  perform public.stipend_money_only();
  update public.agent_stipends
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = any(_ids) and campaign_id = public.my_campaign() and status in ('pending', 'held');
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Pending day stipends already on file whose day would be held now.
do $$
declare
  s record;
  f record;
begin
  for s in
    select id, campaign_id, user_id, work_date from public.agent_stipends
     where status = 'pending' and user_id is not null and work_date is not null
  loop
    select * into f from public.field_days(s.campaign_id, s.work_date, s.work_date) d
     where d.user_id = s.user_id;
    if found and f.held then
      update public.agent_stipends
         set status = 'held', check_note = array_to_string(f.reasons, ',')
       where id = s.id;
    end if;
  end loop;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 45 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
