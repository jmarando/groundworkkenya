-- The people seeded into Sakaja's workspace are tagged as samples, so the
-- console can tell them from real records. Run with tests/sql/run.sh.

\ir fixtures.sql

-- test: the seeded people are tagged sample, and nobody else is
do $$
declare
  n integer;
begin
  select count(*) into n from public.people where 'sample' = any(tags);
  assert n = 1200, format('tagged %s, expected 1200', n);
  select count(*) into n from public.people
   where campaign_id <> 'ca000000-0000-4000-8000-000000000002' and 'sample' = any(tags);
  assert n = 0, 'another campaign had people tagged';
end $$;

-- test: tagging again changes nothing, and never tags a real record
begin;
-- A real person in Mathira with a seeded number, and a seeded row in Sakaja that
-- the team has since turned into a real record (new name, tag removed).
insert into public.people (campaign_id, phone, full_name)
values ('ca000000-0000-4000-8000-000000000003', '+254710007307', 'Real Person');
update public.people set full_name = 'Now Real', tags = array_remove(tags, 'sample')
 where campaign_id = 'ca000000-0000-4000-8000-000000000002' and phone = '+254710014614';
\ir ../../supabase/migrations/20260929120000_sample_people.sql
do $$
begin
  assert not (select 'sample' = any(tags) from public.people where full_name = 'Real Person'),
    'a real person in another campaign was tagged';
  assert not (select 'sample' = any(tags) from public.people where full_name = 'Now Real'),
    'a renamed record was tagged again';
  assert (select count(*) from public.people where 'sample' = any(tags)) = 1199,
    'running again tagged someone twice or someone new';
  assert (select count(*) from public.people where array_length(array_positions(tags, 'sample'), 1) > 1) = 0,
    'a tag was added twice';
end $$;
rollback;
