-- Schema 48: stories, posts about one thing followed from the first we found to how far it spread.
--
-- 1. listening_stories: formed each hour by the server from posts that share a link, enough of the
--    same words, or an X quote or reply (src/lib/stories.ts). A story has a name (the AI gives it
--    one, or the first headline stands in), when its first post was found, how many posts and voices,
--    and whether the office has handled it. "First seen" is the first post we found, not proof of who
--    started it.
-- 2. listening_mentions.story_id: the story a post belongs to; and refers_to, the address of the post
--    an X post quotes or replies to, when the provider says.
-- 3. rapid_responses.story_id: the story a reaction was drafted for.
-- The office reads; the candidate and managers mark a story handled (and its posts actioned); only
-- the server forms stories. Places, never people: a story is what was published, and nothing here
-- records or guesses anyone's community.

-- 1. -----------------------------------------------------------------
create table if not exists public.listening_stories (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  title            text not null check (length(title) between 1 and 200),
  issue            text,
  first_mention_id uuid references public.listening_mentions(id) on delete set null,
  first_seen_at    timestamptz not null,
  last_post_at     timestamptz not null,
  posts            integer not null default 0 check (posts >= 0),
  voices           integer not null default 0 check (voices >= 0),
  views            bigint check (views is null or views >= 0),
  status           text not null default 'new' check (status in ('new', 'handled')),
  handled_by       uuid references auth.users(id) on delete set null,
  handled_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists listening_stories_recent_idx on public.listening_stories (campaign_id, last_post_at desc);

-- 2. -----------------------------------------------------------------
alter table public.listening_mentions
  add column if not exists story_id uuid references public.listening_stories(id) on delete set null,
  add column if not exists refers_to text check (refers_to is null or refers_to ~ '^https://');
create index if not exists listening_mentions_story_idx on public.listening_mentions (story_id)
  where story_id is not null;

-- 3. -----------------------------------------------------------------
alter table public.rapid_responses
  add column if not exists story_id uuid references public.listening_stories(id) on delete set null;

-- Access ---------------------------------------------------------------
alter table public.listening_stories enable row level security;
revoke all on public.listening_stories from anon;
revoke all on public.listening_stories from authenticated;
grant select on public.listening_stories to authenticated;
grant update (status, handled_by, handled_at, updated_at) on public.listening_stories to authenticated;
grant all on public.listening_stories to service_role;

drop policy if exists "own campaign only" on public.listening_stories;
create policy "own campaign only" on public.listening_stories as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
drop policy if exists "stories read by the office" on public.listening_stories;
create policy "stories read by the office" on public.listening_stories for select to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager', 'organiser'));
drop policy if exists "stories handled by principals" on public.listening_stories;
create policy "stories handled by principals" on public.listening_stories for update to authenticated
  using (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'))
  with check (coalesce(public.my_campaign_role(), '') in ('super', 'candidate', 'manager'));

-- Marks a story handled and its posts actioned, as the Overview's handled button does for one post.
-- Runs as the caller, so the policies above decide who may: a caller who may not changes nothing and
-- is told so.
create or replace function public.set_story_handled(_story uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update public.listening_stories
     set status = 'handled', handled_by = auth.uid(), handled_at = now(), updated_at = now()
   where id = _story;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That story is not yours to mark.' using errcode = '42501';
  end if;
  update public.listening_mentions set status = 'actioned' where story_id = _story and status = 'new';
end;
$$;

revoke all on function public.set_story_handled(uuid) from public, anon;
grant execute on function public.set_story_handled(uuid) to authenticated, service_role;

-- Retention ------------------------------------------------------------
-- The latest prune_old_records (schema 47) plus: a story left with no posts goes after 30 days.
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

  delete from public.listening_accounts
   where greatest(checked_at, failed_at) < now() - interval '180 days';

  delete from public.listening_stories s
   where s.updated_at < now() - interval '30 days'
     and not exists (select 1 from public.listening_mentions m where m.story_id = s.id);

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
as $$ select 48 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
