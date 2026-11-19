-- Schema 50: crowd events, the places a candidate can meet people without a rally.
--
-- 1. crowd_events: upcoming funerals and burials, church events and harambees, tournaments and
--    sports days, shows, school days and other gatherings in a campaign's area, found once a day
--    in the news by the server (src/lib/crowd-events.server.ts). Each comes with the link it was
--    found at and only what the public notice says. They are suggestions: nothing reaches the
--    diary until the team adds one.
-- 2. add_crowd_event: puts an event in the diary (a funeral as a funeral, a church event as church,
--    the rest as a visit) and marks it added; dismiss_crowd_event sets one aside.
-- The office reads; staff add or dismiss, as staff write the diary; only the server finds events.
-- Places, never people: an event is what was published, and nothing records anyone's community.

-- 1. -----------------------------------------------------------------
create table if not exists public.crowd_events (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  kind           text not null
                 check (kind in ('funeral', 'church', 'sports', 'harambee', 'market', 'school',
                                 'community', 'other')),
  title          text not null check (length(btrim(title)) between 2 and 160),
  starts_on      date not null,
  starts_at      time,
  place          text check (place is null or length(place) <= 120),
  ward_id        uuid,
  crowd          text check (crowd is null or length(crowd) <= 80),
  why            text check (why is null or length(why) <= 300),
  source_url     text not null check (source_url ~ '^https://' and length(source_url) <= 500),
  source_title   text check (source_title is null or length(source_title) <= 300),
  source_name    text check (source_name is null or length(source_name) <= 120),
  status         text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  diary_entry_id uuid references public.diary_entries(id) on delete set null,
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz,
  found_at       timestamptz not null default now(),
  -- The event's name and day, folded: the same event found twice is kept once.
  dedupe         text not null check (length(dedupe) between 3 and 120),
  constraint crowd_events_ward_fkey foreign key (ward_id, campaign_id)
    references public.wards (id, campaign_id) on delete set null (ward_id),
  constraint crowd_events_once unique (campaign_id, dedupe)
);

create index if not exists crowd_events_upcoming_idx on public.crowd_events (campaign_id, starts_on);

-- Access ---------------------------------------------------------------
alter table public.crowd_events enable row level security;
revoke all on public.crowd_events from anon;
revoke all on public.crowd_events from authenticated;
grant select on public.crowd_events to authenticated;
grant update (status, diary_entry_id, decided_by, decided_at) on public.crowd_events to authenticated;
grant all on public.crowd_events to service_role;

drop policy if exists "own campaign only" on public.crowd_events;
create policy "own campaign only" on public.crowd_events as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "crowd events read by the office" on public.crowd_events;
create policy "crowd events read by the office" on public.crowd_events for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "crowd events decided by staff" on public.crowd_events;
create policy "crowd events decided by staff" on public.crowd_events for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- 2. -----------------------------------------------------------------
-- Puts an event in the diary and marks it added; adding one twice gives back the same entry. Runs as
-- the caller, so the policies on both tables decide who may: a caller who may not is told so.
create or replace function public.add_crowd_event(_event uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  e public.crowd_events;
  entry uuid;
  n integer;
begin
  select * into e from public.crowd_events where id = _event for update;
  if not found then
    raise exception 'That event is not yours to add.' using errcode = '42501';
  end if;
  if e.status = 'added' and e.diary_entry_id is not null then
    return e.diary_entry_id;
  end if;
  insert into public.diary_entries (campaign_id, day, starts_at, title, kind, ward_id, note)
  values (
    e.campaign_id, e.starts_on, e.starts_at, left(btrim(e.title), 120),
    case e.kind when 'funeral' then 'funeral' when 'church' then 'church'
                when 'market' then 'market' else 'visit' end,
    e.ward_id,
    left(concat_ws(' · ', nullif(btrim(coalesce(e.place, '')), ''),
                   'Found in ' || coalesce(nullif(btrim(coalesce(e.source_name, '')), ''), 'the news'),
                   e.source_url), 300)
  )
  returning id into entry;
  update public.crowd_events
     set status = 'added', diary_entry_id = entry, decided_by = auth.uid(), decided_at = now()
   where id = _event;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That event is not yours to add.' using errcode = '42501';
  end if;
  return entry;
end;
$$;

revoke all on function public.add_crowd_event(uuid) from public, anon;
grant execute on function public.add_crowd_event(uuid) to authenticated, service_role;

create or replace function public.dismiss_crowd_event(_event uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update public.crowd_events
     set status = 'dismissed', decided_by = auth.uid(), decided_at = now()
   where id = _event and status = 'new';
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That event is not yours to set aside.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.dismiss_crowd_event(uuid) from public, anon;
grant execute on function public.dismiss_crowd_event(uuid) to authenticated, service_role;

-- The schema version --------------------------------------------------
create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 50 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
