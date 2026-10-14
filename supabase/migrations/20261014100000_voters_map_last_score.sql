-- The Voters map's door counts, as the reviews of schema 23 asked. Schema 26.
-- 20261012090000_voters_map.sql is applied as it stands; this replaces what
-- needed to change instead of editing it.
-- 1. An index for person_id, which is on delete set null: without it, each
--    person deleted scans every door visit.
-- 2. The two read policies evaluate their calls once per query, not once per
--    row: every door is a row.
-- 3. A house keeps its last score: a later door where no one answered no
--    longer hides the score it gave; visits with no ward are left out, so
--    house_doors() returns one row per ward; ties go the same way every time.

-- 1.
create index if not exists house_visits_person_idx on public.house_visits (person_id);

-- 2. The office reads every door; an agent the doors they knocked.
drop policy if exists "read by the office" on public.house_visits;
create policy "read by the office" on public.house_visits for select to authenticated
  using ((select public.my_campaign_role()) in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "agents read their own" on public.house_visits;
create policy "agents read their own" on public.house_visits for select to authenticated
  using (actor = (select auth.uid()));

-- 3. Doors per ward and per house, for the map's colours. In the last 30 days a
-- house takes its outcome (and its ward) from its latest visit and its score
-- from its latest visit that has one, so a later door where no one answered
-- keeps the score the house gave. house_doors() counts these per ward, with the
-- visits of the last seven days; it skips visits with no ward, so it returns
-- one row per ward. Ties between visits at the same moment go to the one
-- created last, then to the higher id. Both run as the caller, so an agent
-- counts their own.
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
  with recent as (
    select v.pc, v.ward_id, v.outcome, v.support, v.visited_at, v.created_at, v.id
      from public.house_visits v
     where v.visited_at > now() - interval '30 days'
       and v.ward_id is not null
  ),
  latest as (
    select distinct on (r.pc) r.pc, r.ward_id, r.outcome
      from recent r
     order by r.pc, r.visited_at desc, r.created_at desc, r.id desc
  ),
  scored as (
    select distinct on (r.pc) r.pc, r.support
      from recent r
     where r.support is not null
     order by r.pc, r.visited_at desc, r.created_at desc, r.id desc
  ),
  per_ward as (
    select l.ward_id,
           count(*)::integer as knocked,
           (count(*) filter (where s.support is not null))::integer as rated,
           (count(*) filter (where s.support >= 4))::integer as supporters
      from latest l
      left join scored s on s.pc = l.pc
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
       and v.ward_id is not null
     group by v.ward_id
  )
  select coalesce(p.ward_id, w.ward_id),
         coalesce(p.knocked, 0), coalesce(p.rated, 0), coalesce(p.supporters, 0),
         coalesce(w.doors_week, 0), coalesce(w.agents_today, '{}')
    from per_ward p
    full join week w on w.ward_id = p.ward_id
$$;

-- Each house in a ward with a visit in 30 days, ordered by plus code so a long
-- list pages: the outcome and time of its latest visit, and the score of its
-- latest visit that has one (null when none). Ties as in house_doors().
create or replace function public.ward_houses(_ward_id uuid)
returns table (pc text, visited_at timestamptz, outcome text, support smallint)
language sql
stable
security invoker
set search_path = public
as $$
  with recent as (
    select v.pc, v.visited_at, v.outcome, v.support, v.created_at, v.id
      from public.house_visits v
     where v.ward_id = _ward_id
       and v.visited_at > now() - interval '30 days'
  ),
  latest as (
    select distinct on (r.pc) r.pc, r.visited_at, r.outcome
      from recent r
     order by r.pc, r.visited_at desc, r.created_at desc, r.id desc
  ),
  scored as (
    select distinct on (r.pc) r.pc, r.support
      from recent r
     where r.support is not null
     order by r.pc, r.visited_at desc, r.created_at desc, r.id desc
  )
  select l.pc, l.visited_at, l.outcome, s.support
    from latest l
    left join scored s on s.pc = l.pc
   order by l.pc
$$;

revoke all on function public.house_doors() from public, anon;
grant execute on function public.house_doors() to authenticated;
revoke all on function public.ward_houses(uuid) from public, anon;
grant execute on function public.ward_houses(uuid) to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 26 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
