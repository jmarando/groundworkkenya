-- Schema 41: X searches are counted against their own daily budget, and each keyword remembers
-- when it was last searched on X. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- test: schema 41 is in
do $$ begin assert public.groundwork_schema_version() >= 41; end $$;

-- test: the x budget counts up to its cap and no further
begin;
do $$ begin
  assert public.take_social_credits('x', 2, 3);
  assert not public.take_social_credits('x', 2, 3);
  assert public.take_social_credits('x', 1, 3);
  assert (select used from public.social_credits where budget = 'x') = 3;
end $$;
rollback;

-- test: a keyword keeps when it was last searched on X
begin;
insert into public.listening_topics (campaign_id, label, query) values ('ca000000-0000-4000-8000-000000000002', 'Kileleshwa', 'Kileleshwa');
update public.listening_topics set x_scanned_at = now() where label = 'Kileleshwa';
do $$ begin assert (select x_scanned_at is not null from public.listening_topics where label = 'Kileleshwa'); end $$;
rollback;
