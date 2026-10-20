-- Schema 41: X searched on X itself.
--
-- 1. listening_topics.x_scanned_at: when each keyword was last searched on X (TwitterAPI.io), so
--    the hourly X pass takes the ones searched longest ago first.
-- 2. social_credits counts an "x" budget: one per X search, shared by every campaign.

alter table public.listening_topics add column if not exists x_scanned_at timestamptz;
create index if not exists listening_topics_x_scanned_idx on public.listening_topics (x_scanned_at nulls first)
  where active;

alter table public.social_credits drop constraint if exists social_credits_budget_check;
alter table public.social_credits
  add constraint social_credits_budget_check check (budget in ('rivals', 'keywords', 'trends', 'x'));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 41 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
