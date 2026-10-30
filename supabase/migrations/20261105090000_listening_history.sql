-- Schema 46: Listening keeps its history.
--
-- 1. listening_readings: a reading of a post's views and shares. The sweeps save one when the
--    counts moved or the last one is six hours old, so how a post spread can be drawn. The post
--    itself keeps the highest count seen, as before.
-- 2. listening_days: one row per campaign and Kenyan day: the posts found that day by mood, and how
--    many hourly sweeps ran. After the record begins, a day with no row means nothing ran.
-- Only the server writes either; the office reads its own campaign's. Places, never people: a
-- reading is a count on a public post and records nothing about anyone.

-- 1. -----------------------------------------------------------------
create table if not exists public.listening_readings (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  mention_id  uuid not null references public.listening_mentions(id) on delete cascade,
  at          timestamptz not null default clock_timestamp(),
  reach       integer check (reach is null or reach >= 0),
  shares      integer check (shares is null or shares >= 0)
);
create index if not exists listening_readings_mention_idx on public.listening_readings (mention_id, at);
create index if not exists listening_readings_campaign_idx on public.listening_readings (campaign_id, at);

-- 2. -----------------------------------------------------------------
create table if not exists public.listening_days (
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  day           date not null,
  posts         integer not null default 0 check (posts >= 0),
  warm          integer not null default 0 check (warm >= 0),
  neutral       integer not null default 0 check (neutral >= 0),
  angry         integer not null default 0 check (angry >= 0),
  unread        integer not null default 0 check (unread >= 0),
  -- null for a day counted back from the posts already kept, before sweeps recorded themselves.
  sweeps        integer check (sweeps is null or sweeps >= 0),
  last_sweep_at timestamptz,
  backfilled    boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (campaign_id, day),
  constraint listening_days_parts check (warm + neutral + angry + unread <= posts)
);

-- Access ---------------------------------------------------------------
alter table public.listening_readings enable row level security;
alter table public.listening_days enable row level security;
revoke all on public.listening_readings, public.listening_days from anon;
revoke all on public.listening_readings, public.listening_days from authenticated;
grant select on public.listening_readings, public.listening_days to authenticated;
grant all on public.listening_readings, public.listening_days to service_role;

drop policy if exists "own campaign only" on public.listening_readings;
create policy "own campaign only" on public.listening_readings as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "readings read by the office" on public.listening_readings;
create policy "readings read by the office" on public.listening_readings for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));

drop policy if exists "own campaign only" on public.listening_days;
create policy "own campaign only" on public.listening_days as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "days read by the office" on public.listening_days;
create policy "days read by the office" on public.listening_days for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));

-- Saving counts ---------------------------------------------------------
-- _rows is [{campaign_id, url, reach, shares}], what a sweep saw on posts it holds. The post keeps
-- the highest count seen (a post saved with none takes its first). A reading is saved when the post
-- has none yet, when what was seen differs from the latest reading, or when the latest is six hours
-- old, so a flat stretch still shows as checked without a row every hour. Returns readings saved.
create or replace function public.record_post_counts(_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  m          record;
  last_r     record;
  saved      integer := 0;
  new_reach  integer;
  new_shares integer;
begin
  if _rows is null or jsonb_typeof(_rows) <> 'array' then
    return 0;
  end if;
  for r in
    select (e->>'campaign_id')::uuid as campaign_id,
           e->>'url' as url,
           nullif(e->>'reach', '')::integer as reach,
           nullif(e->>'shares', '')::integer as shares
      from jsonb_array_elements(_rows) e
  loop
    continue when r.reach is null and r.shares is null;
    continue when r.reach < 0 or r.shares < 0;
    select id, reach, shares into m
      from public.listening_mentions
     where campaign_id = r.campaign_id and url = r.url;
    continue when not found;

    new_reach := case when r.reach is null then m.reach
                      when m.reach is null then r.reach
                      else greatest(m.reach, r.reach) end;
    new_shares := case when r.shares is null then m.shares
                       when m.shares is null then r.shares
                       else greatest(m.shares, r.shares) end;
    if new_reach is distinct from m.reach or new_shares is distinct from m.shares then
      update public.listening_mentions set reach = new_reach, shares = new_shares where id = m.id;
    end if;

    select reach, shares, at into last_r
      from public.listening_readings
     where mention_id = m.id
     order by at desc
     limit 1;
    if not found
       or last_r.reach is distinct from r.reach
       or last_r.shares is distinct from r.shares
       or last_r.at <= clock_timestamp() - interval '6 hours' then
      insert into public.listening_readings (campaign_id, mention_id, reach, shares)
      values (r.campaign_id, m.id, r.reach, r.shares);
      saved := saved + 1;
    end if;
  end loop;
  return saved;
end;
$$;

-- The day record -------------------------------------------------------
-- Recounts _from to _to (Kenyan days, inclusive) from the posts kept. The candidates' own accounts'
-- posts (rival_id set) and posts read as off-topic are left out, as the Voices tab leaves them out.
-- Counts only: how many sweeps ran is left as it was.
create or replace function public.refresh_listening_days(_campaign uuid, _from date, _to date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _campaign is null or _from is null or _to is null or _to < _from then
    return;
  end if;
  update public.listening_days
     set posts = 0, warm = 0, neutral = 0, angry = 0, unread = 0, updated_at = now()
   where campaign_id = _campaign and day between _from and _to;

  insert into public.listening_days (campaign_id, day, posts, warm, neutral, angry, unread, updated_at)
  select _campaign,
         (found_at at time zone 'Africa/Nairobi')::date,
         count(*),
         count(*) filter (where sentiment = 'positive'),
         count(*) filter (where sentiment = 'neutral'),
         count(*) filter (where sentiment = 'negative'),
         count(*) - count(*) filter (where sentiment in ('positive', 'neutral', 'negative')),
         now()
    from public.listening_mentions
   where campaign_id = _campaign
     and rival_id is null
     and coalesce(issue, '') <> 'off-topic'
     and found_at >= (_from::timestamp at time zone 'Africa/Nairobi')
     and found_at < ((_to + 1)::timestamp at time zone 'Africa/Nairobi')
   group by 2
  on conflict (campaign_id, day) do update
     set posts = excluded.posts, warm = excluded.warm, neutral = excluded.neutral,
         angry = excluded.angry, unread = excluded.unread, updated_at = now();
end;
$$;

-- One hourly run that gathered: for every campaign with an active keyword, the last seven days are
-- recounted (so moods read late land on their own day) and today's sweeps go up by one. A run that
-- was paused calls nothing, which is what makes a missing day mean "nothing ran". Returns the number
-- of campaigns swept.
create or replace function public.record_sweep_days()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c     uuid;
  n     integer := 0;
  today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  for c in
    select distinct campaign_id from public.listening_topics where active and campaign_id is not null
  loop
    perform public.refresh_listening_days(c, today - 6, today);
    insert into public.listening_days (campaign_id, day, sweeps, last_sweep_at)
    values (c, today, 1, now())
    on conflict (campaign_id, day) do update
       set sweeps = coalesce(public.listening_days.sweeps, 0) + 1,
           last_sweep_at = now(),
           backfilled = false;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Days counted back from the posts already kept, marked so Replay can tell them from days a sweep
-- recorded. Safe to run again: it only fills days that have no row. Returns rows written.
create or replace function public.backfill_listening_days()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with written as (
    insert into public.listening_days
      (campaign_id, day, posts, warm, neutral, angry, unread, sweeps, backfilled)
    select campaign_id,
           (found_at at time zone 'Africa/Nairobi')::date,
           count(*),
           count(*) filter (where sentiment = 'positive'),
           count(*) filter (where sentiment = 'neutral'),
           count(*) filter (where sentiment = 'negative'),
           count(*) - count(*) filter (where sentiment in ('positive', 'neutral', 'negative')),
           null,
           true
      from public.listening_mentions
     where campaign_id is not null
       and rival_id is null
       and coalesce(issue, '') <> 'off-topic'
     group by 1, 2
    on conflict (campaign_id, day) do nothing
    returning 1
  )
  select count(*) into n from written;
  return n;
end;
$$;

revoke all on function public.record_post_counts(jsonb) from public, anon, authenticated;
revoke all on function public.refresh_listening_days(uuid, date, date) from public, anon, authenticated;
revoke all on function public.record_sweep_days() from public, anon, authenticated;
revoke all on function public.backfill_listening_days() from public, anon, authenticated;
grant execute on function public.record_post_counts(jsonb) to service_role;
grant execute on function public.refresh_listening_days(uuid, date, date) to service_role;
grant execute on function public.record_sweep_days() to service_role;
grant execute on function public.backfill_listening_days() to service_role;

select public.backfill_listening_days();

-- Retention ------------------------------------------------------------
-- The latest prune_old_records (29 Oct) plus: readings are kept 180 days, and the day record three
-- years like the posts it counts.
create or replace function public.prune_old_records()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _webhooks integer;
  _alerts   integer;
  _mentions integer;
  _readings integer;
begin
  delete from public.whatsapp_webhook_events
   where processed_at is not null and processed_at < now() - interval '30 days';
  get diagnostics _webhooks = row_count;

  delete from public.listening_alert_events where created_at < now() - interval '90 days';
  get diagnostics _alerts = row_count;

  -- Three years of listening: the whole run-up to a general election, read back by the drafts.
  delete from public.listening_mentions where found_at < now() - interval '3 years';
  get diagnostics _mentions = row_count;

  delete from public.listening_readings where at < now() - interval '180 days';
  get diagnostics _readings = row_count;

  delete from public.listening_days where day < (now() - interval '3 years')::date;

  return jsonb_build_object('webhooks', _webhooks, 'alert_events', _alerts, 'mentions', _mentions,
                            'readings', _readings);
end;
$$;

revoke all on function public.prune_old_records() from public, anon, authenticated;
grant execute on function public.prune_old_records() to service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 46 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
