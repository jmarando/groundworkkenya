-- Schema 51: each keyword remembers when the social keyword search (TikTok, Reddit, YouTube) last
-- searched it, so each six-hourly run takes the ones searched longest ago. Run with
-- tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 51 is in
do $$ begin assert public.groundwork_schema_version() >= 51; end $$;

-- test: a new keyword has never been searched, and keeps when it was
begin;
insert into public.listening_topics (campaign_id, label, query) values ('ca000000-0000-4000-8000-000000000002', 'Kileleshwa', 'Kileleshwa');
do $$ begin assert (select social_scanned_at is null from public.listening_topics where label = 'Kileleshwa'); end $$;
update public.listening_topics set social_scanned_at = now() where label = 'Kileleshwa';
do $$ begin assert (select social_scanned_at is not null from public.listening_topics where label = 'Kileleshwa'); end $$;
rollback;

-- test: running the migration again changes nothing
begin;
insert into public.listening_topics (campaign_id, label, query, social_scanned_at) values ('ca000000-0000-4000-8000-000000000002', 'Kileleshwa', 'Kileleshwa', '2026-11-20 06:07+03');
\ir ../../supabase/migrations/20261120090100_social_scanned_at.sql
do $$ begin
  assert (select social_scanned_at = '2026-11-20 06:07+03' from public.listening_topics where label = 'Kileleshwa');
  assert public.groundwork_schema_version() = 51;
end $$;
rollback;
