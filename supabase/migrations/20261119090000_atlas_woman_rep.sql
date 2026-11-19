-- The atlas holds the county woman representative's race too (woman_rep), counted county-wide
-- as the governor's is, for the 2013, 2017 and 2022 general elections: the race a woman rep
-- campaign looks at first (src/lib/elections-view.ts defaultRace). Safe to run again. No schema
-- version change: a constraint widened, and rows.

alter table public.atlas_elections drop constraint if exists atlas_elections_race_check;
alter table public.atlas_elections
  add constraint atlas_elections_race_check
  check (race in ('president', 'governor', 'woman_rep', 'mp', 'mca'));

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-woman_rep', 2013, 'woman_rep', '2013-03-04', null),
  ('2017-woman_rep', 2017, 'woman_rep', '2017-08-08', null),
  ('2022-woman_rep', 2022, 'woman_rep', '2022-08-09', null)
on conflict (id) do nothing;
