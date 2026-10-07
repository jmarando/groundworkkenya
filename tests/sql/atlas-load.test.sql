-- Loading a county's atlas files: the SQL scripts/atlas/build_sql.py builds from the fictional
-- Testland files (tests/fixtures/atlas/testland.sql) applies, reads back as the files say,
-- applies again without changing anything, and puts back a figure someone changed. Run with
-- tests/sql/run.sh; each test rolls back.

-- test: a county's files load and read back as they were written
begin;
\ir ../fixtures/atlas/testland.sql
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 5, 'areas';
  assert (select count(*) from public.atlas_candidates where id like '%/testland/%' or id like '2022-president/kenya/p-%-test') = 8, 'candidates';
  assert (select count(*) from public.atlas_results where area_key like 'testland%') = 18, 'results';
  assert (select count(*) from public.atlas_turnout where area_key like 'testland%') = 8, 'turnout';
  assert (select count(*) from public.atlas_register where area_key like 'testland%') = 6, 'registers';
  assert (select count(*) from public.atlas_population where area_key like 'testland%') = 2, 'population';
  assert (select parent from public.atlas_areas where key = 'testland/north-test/ward-one') = 'testland/north-test', 'a ward''s parent';
  assert (select iebc_code from public.atlas_areas where key = 'testland') = '901', 'a code is kept as text';
  assert (select iebc_code from public.atlas_areas where key = 'testland/south-test') is null, 'a blank code is null';
  assert (select name from public.atlas_candidates where id = '2022-governor/testland/wa-test-jr') = 'Wa Test, Jr.', 'a comma in a name';
  assert (select party from public.atlas_candidates where id = '2022-governor/testland/wa-test-jr') = 'Party "C"', 'quotes in a party';
  assert (select name from public.atlas_candidates where id = '2022-mp/testland/north-test/otest') = 'O''Test', 'an apostrophe in a name';
  assert (select party from public.atlas_candidates where id = '2022-mp/testland/north-test/otest') is null, 'a blank party is null';
  assert (select votes from public.atlas_results where candidate_id = '2022-mp/testland/north-test/otest') = 0, 'a real zero is kept';
  assert (select cast_votes from public.atlas_turnout where election_id = '2017-mp' and area_key = 'testland/north-test') is null, 'a missing figure stays missing';
  assert (select registered from public.atlas_turnout where election_id = '2017-mp' and area_key = 'testland/north-test') = 1000, 'and the one given is kept';
  assert (select sum(r.votes) from public.atlas_results r
            join public.atlas_candidates c on c.id = r.candidate_id
           where c.election_id = '2022-governor' and r.area_key like 'testland/%') = 1000,
    'the governor''s votes in the constituencies add up to the county''s';
end $$;
rollback;

-- test: loading it again changes nothing
begin;
\ir ../fixtures/atlas/testland.sql
create temp view counted as
  select 'areas' as t, count(*) as n, sum(length(name)) as w from public.atlas_areas
  union all select 'candidates', count(*), sum(length(name)) from public.atlas_candidates
  union all select 'results', count(*), sum(votes) from public.atlas_results
  union all select 'turnout', count(*), sum(coalesce(cast_votes, 0)) from public.atlas_turnout
  union all select 'register', count(*), sum(registered) from public.atlas_register
  union all select 'population', count(*), sum(adults) from public.atlas_population;
create temp table loaded as select * from counted;
\ir ../fixtures/atlas/testland.sql
do $$ begin
  assert (select count(*) from loaded) = 6, 'six tables counted';
  assert (select count(*) from loaded l join counted c on c.t = l.t and c.n = l.n and c.w = l.w) = 6,
    'loading twice changed a table';
end $$;
rollback;

-- test: loading it again puts back a figure that was changed
begin;
\ir ../fixtures/atlas/testland.sql
update public.atlas_results set votes = 1 where candidate_id = '2022-governor/testland/a-test' and area_key = 'testland';
update public.atlas_turnout set source = 'Someone, changed it' where election_id = '2022-governor' and area_key = 'testland';
\ir ../fixtures/atlas/testland.sql
do $$ begin
  assert (select votes from public.atlas_results
           where candidate_id = '2022-governor/testland/a-test' and area_key = 'testland') = 600, 'a changed result was kept';
  assert (select source from public.atlas_turnout
           where election_id = '2022-governor' and area_key = 'testland') = 'IEBC, Governor results by constituency 2022',
    'a changed source was kept';
end $$;
rollback;
