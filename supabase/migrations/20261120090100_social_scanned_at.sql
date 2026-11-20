-- Schema 51: the social keyword search keeps its own place in the line of keywords.
--
-- listening_topics.social_scanned_at: when the paid social keyword search (TikTok, Reddit and
-- YouTube through ScrapeCreators) last searched each keyword, so each six-hourly run takes the ones
-- it searched longest ago, as many as its share of the day's budget buys, instead of only the hour's
-- news keywords (src/lib/listening.server.ts). Until this is applied the sweep takes them in the
-- order the news search last reached them.

alter table public.listening_topics add column if not exists social_scanned_at timestamptz;
create index if not exists listening_topics_social_scanned_idx
  on public.listening_topics (social_scanned_at nulls first)
  where active;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 51 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
