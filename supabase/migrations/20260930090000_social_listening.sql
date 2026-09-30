-- Listening, part 2. Schema version 18.
--
-- A keyword may carry a Google Alert feed, read by the hourly sweep. Rivals'
-- own posts are kept as mentions tied to the rival, with how they landed:
-- counts only, never a comment, a name or an id. ScrapeCreators credits are
-- counted per budget per Nairobi day, for every campaign at once because the
-- key is shared.

alter table public.listening_topics
  add column alert_feed_url text
  constraint listening_topics_alert_feed_url_check
  check (alert_feed_url is null or alert_feed_url ~ '^https://www\.google\.com/alerts/feeds/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$');

alter table public.listening_mentions
  add column rival_id uuid references public.race_rivals(id) on delete set null,
  add column comments_read integer check (comments_read is null or comments_read >= 0),
  add column comments_positive integer check (comments_positive is null or comments_positive >= 0),
  add column comments_negative integer check (comments_negative is null or comments_negative >= 0),
  add column comments_issue text check (comments_issue is null or length(comments_issue) <= 40);
create index listening_mentions_rival_idx on public.listening_mentions (rival_id, published_at desc)
  where rival_id is not null;

create table public.social_credits (
  budget text not null check (budget in ('rivals', 'keywords')),
  day    date not null,
  used   integer not null default 0 check (used >= 0),
  primary key (budget, day)
);
alter table public.social_credits enable row level security;
revoke all on public.social_credits from anon, authenticated;
grant all on public.social_credits to service_role;

-- Take _n credits from today's _budget if that stays within _cap: true when
-- taken. The scheduled sweep (no user) and a manager's "Sweep now" may spend.
create or replace function public.take_social_credits(_budget text, _n integer, _cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _day date := (now() at time zone 'Africa/Nairobi')::date;
  _ok boolean;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then
    return false;
  end if;
  if _n <= 0 then
    return true;
  end if;
  insert into public.social_credits (budget, day) values (_budget, _day)
  on conflict (budget, day) do nothing;
  update public.social_credits
     set used = used + _n
   where budget = _budget and day = _day and used + _n <= _cap
  returning true into _ok;
  return coalesce(_ok, false);
end $$;

revoke all on function public.take_social_credits(text, integer, integer) from public, anon;
grant execute on function public.take_social_credits(text, integer, integer) to authenticated, service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 18 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
