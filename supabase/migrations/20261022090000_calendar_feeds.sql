-- Schema 32: the diary as a calendar Google, Apple and Outlook can subscribe to.
--
-- 1. calendar_feeds: one private link per person, a long random token. Anyone holding the link
--    reads the campaign's diary, so the person can make a new one (the old stops working).
-- 2. my_calendar_feed: the caller's link, made on first ask; the office only (candidate,
--    managers, organisers), as the diary is theirs.
-- 3. calendar_feed_entries: what the link shows, read by the server for the calendar app (service
--    role only): thirty days back to four months ahead, and only while the person is still on the
--    campaign's office, so leaving the team ends the feed.
-- 4. The schema version.

create table if not exists public.calendar_feeds (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
grant all on public.calendar_feeds to service_role;
-- No one signed in reads the table (my_calendar_feed hands out the caller's link); the rule every
-- campaign table carries is here all the same.
drop policy if exists "own campaign only" on public.calendar_feeds;
create policy "own campaign only" on public.calendar_feeds as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());

create or replace function public.my_calendar_feed(_reset boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid := public.my_campaign();
  _token text;
begin
  if coalesce(public.my_campaign_role(), '') not in ('super', 'candidate', 'manager', 'organiser') or _campaign is null then
    raise exception 'The diary''s calendar is for the campaign office.' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (user_id, campaign_id)
  values (auth.uid(), _campaign)
  on conflict (user_id) do update
     set campaign_id = excluded.campaign_id,
         token = case when _reset or calendar_feeds.campaign_id <> excluded.campaign_id
                      then replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '') else calendar_feeds.token end,
         created_at = case when _reset then now() else calendar_feeds.created_at end
  returning token into _token;
  return _token;
end;
$$;
revoke all on function public.my_calendar_feed(boolean) from public, anon;
grant execute on function public.my_calendar_feed(boolean) to authenticated;

create or replace function public.calendar_feed_entries(_token text)
returns table (
  id         uuid,
  day        date,
  starts_at  time,
  title      text,
  kind       text,
  note       text,
  ward_name  text,
  updated_at timestamptz,
  campaign   text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.day, d.starts_at, d.title, d.kind, d.note, w.name, d.updated_at, c.name
    from public.calendar_feeds f
    join public.campaigns c on c.id = f.campaign_id
    join public.diary_entries d on d.campaign_id = f.campaign_id
    left join public.wards w on w.id = d.ward_id
   where f.token = _token and _token ~ '^[0-9a-f]{64}$'
     and (public.is_super_admin(f.user_id)
          or exists (select 1 from public.campaign_members m
                      where m.user_id = f.user_id and m.campaign_id = f.campaign_id
                        and m.role::text in ('candidate', 'manager', 'organiser')))
     and d.day between current_date - 30 and current_date + 120
   order by d.day, d.starts_at nulls first
   limit 1000
$$;
revoke all on function public.calendar_feed_entries(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_entries(text) to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 32 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
