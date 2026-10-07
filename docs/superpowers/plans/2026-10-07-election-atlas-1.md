# Election atlas, part 1: the shared tables, the calculations and the data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the atlas's foundations: the database tables (schema 22), the pure rules that turn
results, registers and population into "what to do and why", and the Nairobi and Nyeri figures for
the last three elections, loaded from checked, sourced files and reported to the user before any
screen is built.

**Architecture:** One migration creates seven public-fact tables that every team reads and nobody
writes through the API, and three tables each campaign keeps for itself (home area, sides, notes).
The rules are small pure modules in `src/lib/atlas/`, written test first. A county's figures are CSV
files under `data/atlas/<county>/`, checked by a TypeScript checker, turned into an idempotent
migration by a Python script, and summed up by a report. This plan stops at that report: the
Elections section (spec steps 4 to 6) is the second plan.

**Tech Stack:** PostgreSQL with row level security (Supabase), TypeScript run by tsx, Python 3
(standard library, plus rasterio and numpy for WorldPop's grids), poppler's `pdftotext` for IEBC's
PDFs.

**Spec:** `docs/superpowers/specs/2026-10-07-election-atlas-design.md`: sections 1 to 4 (the shared
atlas, each campaign's own, data, calculations), Privacy and the law, Testing, and build steps 1
to 3.

## Global Constraints

- Work on branch `claude/local-folder-access-qo9pew`. Nothing goes to `main`; never rewrite pushed
  history (AGENTS.md). Push the branch only.
- Nothing is applied to the live database. Migrations are written and tested on a throwaway
  Postgres; at the release the user applies them, migrations first, with their OK. The county data
  migrations are written only after the user has read the data report (Task 14).
- Commit messages end with `Co-Authored-By: Claude <noreply@anthropic.com>`. No model name or
  version goes in any file, commit message or comment.
- Test first for every rule: write the test, run it, see it fail for the right reason, then write the
  code. `npm test` runs every `tests/*.test.ts`, then the SQL tests.
- TypeScript is Prettier-formatted (100 columns, double quotes, trailing commas) and passes ESLint:
  run `npx prettier --write` then `npx eslint` on every file you create or change.
  `src/integrations/supabase/types.ts` is generated and already fails Prettier; leave its style alone.
- Shares and turnout are percentages (0 to 100), unrounded until shown: shares to one decimal place,
  turnout as a whole percentage, votes with thousands separators. A missing figure is `null` and
  shows as "not found yet"; it is never zero. (spec section 4)
- Every number carries where it came from and at what level, and an estimate says it is an
  estimate. (spec "Success")
- Nothing anywhere holds a person's ethnicity or tribe, or guesses it from a name; communities
  appear only in the team's notes about places. (spec "Privacy and the law")
- This repository is public: data files hold public figures only, and no secret goes in any file.
- Figures come only from the publisher's own document (IEBC, the Kenya Gazette, WorldPop). A news
  report, a summary or a search snippet is not a source. What is not found stays blank and is listed
  in `data/atlas/SOURCES.md`. (spec section 3)
- The atlas tables are a deliberate exception to "every campaign table has a campaign_id": they hold
  public facts. The three campaign tables carry `campaign_id` and the usual restrictive "own
  campaign only" policy.

## Running things in this cloud container

A fresh session needs these. The install here is partial (Lovable's private npm mirror answers 403),
but eslint, prettier and tsc are present.

```bash
# once, in a fresh container: there is no node_modules. This exits 1 with
# "error: GET https://europe-west4-npm.pkg.dev/... 403" for some packages: expected, and it still
# installs eslint, prettier and typescript. If `npx eslint --version` or `npx prettier --version`
# fails afterwards, tell the user rather than skipping lint.
bun install

# one TypeScript test file
npx -y tsx --tsconfig tsconfig.json tests/atlas-measures.test.ts

# the Python tests; the five that read GeoTIFFs skip without rasterio. To run them too:
#   python3 -m venv /tmp/gwvenv && /tmp/gwvenv/bin/pip install rasterio numpy
# and use /tmp/gwvenv/bin/python (or export ATLAS_PYTHON=/tmp/gwvenv/bin/python for the TypeScript runner)
python3 -m unittest discover -s scripts/atlas -p "test_*.py"

# the SQL suite: Postgres 16 is installed but not on PATH, and initdb refuses to run as root.
# Put the Postgres directory inside env's PATH argument, as below: a PATH=... prefix on runuser is not seen
# by the "$PATH" you pass to env, the runner then finds no initdb, prints SKIP and exits 0, a silent false pass.
# So a run that prints "SKIP: initdb not found" has not run any SQL test.
runuser -u nobody -- env PATH="/usr/lib/postgresql/16/bin:$PATH" HOME=/tmp bash tests/sql/run.sh

# format and lint the files you touched
npx prettier --write <files> && npx eslint <files>

# typecheck: the whole project has hundreds of errors here from the partial install, so look only at yours
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/atlas|integrations/supabase/types"
```

On a full install (the user's machine, CI) `npm test` runs everything. In this container five older
test files fail with `ERR_MODULE_NOT_FOUND` for `@tanstack/react-router` or `@tanstack/react-start`:
`tests/demo.test.ts`, `diary-functions`, `home`, `morning-story-functions` and `race`. They fail the
same on an untouched checkout, so ignore them here; every other `tests/*.test.ts` passes. The SQL
runner needs the checkout readable by the `nobody` user, which `/home/user/groundworkkenya` is.

## What this plan changes in the spec

The spec is updated in the same commit as this plan.

- `atlas_turnout`'s `cast`, `rejected` and `valid` are `cast_votes`, `rejected_votes` and
  `valid_votes`: `cast` is a reserved word in SQL.
- A candidate's `id` is `<election>/<seat>/<slug of the name>`, so loading is idempotent and readable.
- `src/lib/atlas.ts` is a folder of small modules, `src/lib/atlas/`, behind one import,
  `@/lib/atlas`. `tests/atlas.test.ts` is five files, one per module, so each task's tests stand alone.
- Added, not in the spec: `scripts/atlas/areas_from_map.py` (areas.csv from a ward map, so no key is
  typed), `scripts/atlas/report.ts` (the data report the spec promises), `data/atlas/blocs.csv`
  (which coalition each party stood in, so a coalition has one name in every county), and one slug
  rule shared by Python and TypeScript.
- "Staff write notes" is read as `is_staff()`: the candidate or manager. Organisers can read the
  Elections pages and notes but not write them.
- The "what to do" rules follow who is ahead, not the share alone (the user's call on 7 October):
  "Lean theirs" is not a rule, and lean is its own measure.

## Review Focus

1. Nobody writes the atlas through the API: the tables have no write grant and no write policy.
   Test: Task 1 ("nobody writes the atlas through the API"); Task 1 Step 7 shows that the test fails
   when both a grant and a policy are added.
2. A campaign's notes, settings and sides stay inside the campaign; only the candidate or manager
   writes them; who changed a row, and when, cannot be forged. Tests: Task 1 (four of its ten).
3. A missing figure is never zero: every function answers `null` for what it cannot work out.
   Tests: Tasks 2 to 5 ("no result", "no side", "nothing to go on").
4. The "what to do" rules start where they say, the first match wins, and 45% to 30% reads "Lean
   ours" while 38% to 30% reads "Persuade". Tests: Task 5.
5. Loading a county twice changes nothing and puts back a changed figure; names with commas, quotes
   and apostrophes survive. Tests: Task 7 (the golden file, and the SQL load test).
6. The checker catches each fault it names, and nothing in `data/atlas` is trusted until it passes.
   Tests: Task 8.
7. Provenance: every figure's source is a primary document recorded in `SOURCES.md` with its
   checksum, and nothing is guessed. Tasks 12 and 13, and the report in Task 14.
8. Nothing is applied to the live database and nothing is pushed to `main`. Global Constraints.

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20261007090000_election_atlas.sql` | Schema 22: the seven atlas tables, three campaign tables, policies, the nine elections |
| `src/lib/atlas/types.ts` | The shared shapes: `Race`, `Level`, `Vote`, `Turnout`, `BlocShare`, `Lean` |
| `src/lib/atlas/measures.ts` | Turnout, valid votes, bloc shares, our share, margin, lean, swing |
| `src/lib/atlas/register.ts` | Register growth, adults not yet registered, the young share, the register flag |
| `src/lib/atlas/format.ts` | How figures are written, and the tag each carries |
| `src/lib/atlas/advice.ts` | What to do in an area and why; the votes within reach |
| `src/lib/atlas/scope.ts` | The key above an area, an area's level, which area's results a ward shows |
| `src/lib/atlas/index.ts` | One import for all of the above |
| `scripts/atlas/build_sql.py` | A county's files into an idempotent migration |
| `scripts/atlas/slug.py`, `scripts/atlas/checks.ts` | The slug rule (twice, kept in step by shared cases) and the data checker |
| `scripts/atlas/areas_from_map.py` | A county's `areas.csv` from its ward map |
| `scripts/atlas/ward_population.py` | Ward population from WorldPop's age-and-sex grids |
| `scripts/atlas/report.ts` | The data report for the user |
| `data/atlas/` | The county files, `blocs.csv`, `SOURCES.md`, `README.md` |
| `tests/atlas-*.test.ts`, `tests/sql/atlas*.test.sql`, `scripts/atlas/test_*.py`, `tests/fixtures/atlas/` | Tests, and a fictional county, "Testland", for them to run on |

---

### Task 1: Schema 22, the atlas tables

**Files:**
- Create: `tests/sql/atlas.test.sql`
- Create: `supabase/migrations/20261007090000_election_atlas.sql`
- Modify: `tests/sql/access.test.sql` (its list of tables with no campaign)
- Modify: `tests/sql/search.test.sql` (its schema-version check)
- Modify: `src/integrations/supabase/types.ts` (ten tables, alphabetical, between `agent_stipends` and `ballot_candidates`)

**Interfaces:** Produces the tables
`atlas_areas(key, level, name, parent, iebc_code)`,
`atlas_elections(id, year, race, held_on, note)`,
`atlas_candidates(id, election_id, seat, name, party, bloc)`,
`atlas_results(candidate_id, area_key, votes)`,
`atlas_turnout(election_id, area_key, registered, cast_votes, rejected_votes, valid_votes, source, source_url)`,
`atlas_register(year, area_key, registered, source, source_url)`,
`atlas_population(area_key, year, total, adults, young_adults, source, method)`;
and, per campaign,
`atlas_settings(campaign_id, home_area, updated_at, updated_by)`,
`atlas_sides(campaign_id, election_id, bloc, updated_at, updated_by)`,
`area_notes(campaign_id, area_key, note, updated_at, updated_by)`;
the trigger function `public.atlas_stamp()`; `groundwork_schema_version()` = 22. The country row
`kenya` and the nine elections (2013, 2017 and 2022; president, governor and MP) are seeded.

- [ ] **Step 1: Write the failing SQL tests**

Create `tests/sql/atlas.test.sql`. Ten tests: the nine elections are there; every team reads the
atlas and nobody outside a team does; nobody writes it through the API, not even a candidate; an
area's key reads as a place; results, turnout, registers and population must make sense; a
campaign's notes, settings and sides stay inside the campaign; the team reads and only the
candidate or manager writes; one home area and one side per election, changed by upsert; a note is a
note, and keeps who changed it and when; the schema version is 22.

```sql
-- The election atlas: who reads it, that nobody writes it through the API, the
-- shape of its keys and figures, and that a campaign's home area, sides and
-- notes stay inside the campaign. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- An organiser in Sakaja, beside the fixtures' candidate, manager and agent.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b7', 'organiser');

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: the nine elections and the country are there
do $$ begin
  assert (select count(*) from public.atlas_elections) = 9, 'nine elections';
  assert (select count(*) from public.atlas_elections where year in (2013, 2017, 2022)) = 9, 'in three years';
  assert (select held_on from public.atlas_elections where id = '2022-governor') = date '2022-08-09', 'the 2022 date';
  assert (select note from public.atlas_elections where id = '2017-president') like '%annulled%', 'the 2017 note';
  assert (select count(*) from public.atlas_areas where level = 'country') = 1, 'one country';
  assert (select key from public.atlas_areas where level = 'country') = 'kenya', 'and it is Kenya';
end $$;

-- test: every team reads the atlas; nobody outside a team does
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 2, 'an agent reads the atlas';
  assert (select count(*) from public.atlas_elections) = 9, 'an agent reads the elections';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 2, 'another campaign reads the same atlas';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_areas) = 0, 'a pending account reads the atlas';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.atlas_areas;
  assert false, 'anon reads the atlas';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: nobody writes the atlas through the API, not even a candidate
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare
  r record;
begin
  for r in select * from (values
    ('atlas_areas', 'name'), ('atlas_elections', 'note'), ('atlas_candidates', 'party'),
    ('atlas_results', 'votes'), ('atlas_turnout', 'source'), ('atlas_register', 'source'),
    ('atlas_population', 'method')) as v(t, c)
  loop
    assert pg_temp.state_of(format('insert into public.%I default values', r.t)) = '42501', 'a candidate adds to ' || r.t;
    assert pg_temp.state_of(format('update public.%I set %I = %I', r.t, r.c, r.c)) = '42501', 'a candidate edits ' || r.t;
    assert pg_temp.state_of(format('delete from public.%I', r.t)) = '42501', 'a candidate deletes from ' || r.t;
  end loop;
end $$;
rollback;

-- test: an area's key reads as a place
begin;
insert into public.atlas_areas (key, level, name, parent) values ('testland', 'county', 'Testland', 'kenya');
do $$
declare
  head constant text := 'insert into public.atlas_areas (key, level, name, parent) values ';
begin
  assert pg_temp.state_of(head || $q$('Testland-2', 'county', 'Testland Two', 'kenya')$q$) = '23514', 'an upper-case key';
  assert pg_temp.state_of(head || $q$('test land', 'county', 'Test Land', 'kenya')$q$) = '23514', 'a key with a space';
  assert pg_temp.state_of(head || $q$('testland-2', 'county', 'Testland Two', null)$q$) = '23514', 'a county with no parent';
  assert pg_temp.state_of(head || $q$('testland-2', 'county', 'Testland Two', 'testland')$q$) = '23514', 'a county under a county';
  assert pg_temp.state_of(head || $q$('somewhere', 'country', 'Somewhere', null)$q$) = '23514', 'a second country';
  assert pg_temp.state_of(head || $q$('kenya/x-test', 'constituency', 'X Test', 'kenya')$q$) = '23514', 'a constituency straight under Kenya';
  assert pg_temp.state_of(head || $q$('testland/other-test', 'constituency', 'Other Test', 'testland/none')$q$) = '23514', 'a key not under its parent';
  assert pg_temp.state_of(head || $q$('testland/a-test/b-test', 'constituency', 'B Test', 'testland/a-test')$q$) = '23514', 'a constituency at ward depth';
  assert pg_temp.state_of(head || $q$('kenya/x-test/y-test', 'ward', 'Y Test', 'kenya')$q$) = '23514', 'a ward straight under Kenya';
  assert pg_temp.state_of(head || $q$('testland/x-test/y-test', 'ward', 'Y Test', 'testland')$q$) = '23514', 'a ward under a county, skipping its constituency';
  assert pg_temp.state_of(head || $q$('nowhere/some-test', 'constituency', 'Some Test', 'nowhere')$q$) = '23503', 'a parent that is not there';
  assert pg_temp.state_of(head || $q$('testland', 'county', 'Testland', 'kenya')$q$) = '23505', 'the same key twice';
  assert pg_temp.state_of(head || $q$('testland/north-test', 'constituency', 'North Test', 'testland')$q$) is null, 'a good constituency is refused';
  assert pg_temp.state_of(head || $q$('testland/north-test/ward-one', 'ward', 'Ward One', 'testland/north-test')$q$) is null, 'a good ward is refused';
end $$;
rollback;

-- test: results, turnout, registers and population must make sense
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
insert into public.atlas_candidates (id, election_id, seat, name, party, bloc)
values ('2022-governor/testland/a-test', '2022-governor', 'testland', 'A Test', 'Party A', 'Alpha');
do $$
declare
  turnout constant text := 'insert into public.atlas_turnout (election_id, area_key, registered, cast_votes, rejected_votes, valid_votes, source, source_url) values ';
begin
  -- candidates
  assert pg_temp.state_of($q$insert into public.atlas_candidates (id, election_id, seat, name, bloc)
    values ('2022-mp/testland/b-test', '2022-governor', 'testland', 'B Test', 'Beta')$q$) = '23514', 'a candidate id not built from its election and seat';
  assert pg_temp.state_of($q$insert into public.atlas_candidates (id, election_id, seat, name, bloc)
    values ('2022-governor/testland/a-test-2', '2022-governor', 'testland', 'A Test', 'Beta')$q$) = '23505', 'the same name twice in a seat';
  -- results
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', -1)$q$) = '23514', 'negative votes';
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/nobody', 'testland', 5)$q$) = '23503', 'votes for a candidate nobody lists';
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'nowhere', 5)$q$) = '23503', 'votes counted nowhere';
  insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', 100);
  assert pg_temp.state_of($q$insert into public.atlas_results values ('2022-governor/testland/a-test', 'testland', 100)$q$) = '23505', 'the same votes twice';
  -- turnout
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 101, null, null, 'IEBC, Test results', null)$q$) = '23514', 'more cast than registered';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 0, 91, 'IEBC, Test results', null)$q$) = '23514', 'more valid than cast';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, 'IEBC, Test results', 'http://example.test/a')$q$) = '23514', 'a plain http link';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, null, null)$q$) = '23502', 'a figure with no source';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', null, 90, null, null, 'IEBC, Test results', null)$q$) is null, 'missing figures are refused';
  assert pg_temp.state_of(turnout || $q$('2022-governor', 'testland', 100, 90, 1, 89, 'IEBC, Test results', 'https://example.test/a')$q$) = '23505', 'turnout twice for one area';
  -- registers
  assert pg_temp.state_of($q$insert into public.atlas_register values (2022, 'testland', -5, 'IEBC, Test register', null)$q$) = '23514', 'a negative register';
  assert pg_temp.state_of($q$insert into public.atlas_register values (1800, 'testland', 5, 'IEBC, Test register', null)$q$) = '23514', 'a register from 1800';
  assert pg_temp.state_of($q$insert into public.atlas_register values (2022, 'testland', 5, 'IEBC, Test register', null)$q$) is null, 'a good register is refused';
  -- population
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 70, 'WorldPop, Test', 'Test method of estimating')$q$) = '23514', 'more young adults than adults';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 120, 70, 'WorldPop, Test', 'Test method of estimating')$q$) = '23514', 'more adults than people';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 30, 'WorldPop, Test', 'short')$q$) = '23514', 'a method too short to say anything';
  assert pg_temp.state_of($q$insert into public.atlas_population values ('testland', 2025, 100, 60, 30, 'WorldPop, Test', 'Test method of estimating')$q$) is null, 'a good estimate is refused';
  -- elections
  assert pg_temp.state_of($q$insert into public.atlas_elections values ('2022-mp', 2022, 'governor', '2022-08-09', null)$q$) = '23514', 'an election id that is not its year and race';
  assert pg_temp.state_of($q$insert into public.atlas_elections values ('2022-senator', 2022, 'senator', '2022-08-09', null)$q$) = '23514', 'a race the atlas does not hold';
end $$;
rollback;

-- test: a campaign's notes, settings and sides stay inside the campaign
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.area_notes (area_key, note) values ('testland/north-test', 'Sakaja note');
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
do $$ begin
  assert (select campaign_id from public.area_notes) = 'ca000000-0000-4000-8000-000000000002', 'a note is filed under the candidate''s campaign';
  assert (select count(*) from public.atlas_settings) = 1, 'the candidate reads the settings';
  assert (select count(*) from public.atlas_sides) = 1, 'the candidate reads the sides';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'Mathira reads Sakaja''s notes';
  assert (select count(*) from public.atlas_settings) = 0, 'Mathira reads Sakaja''s settings';
  assert (select count(*) from public.atlas_sides) = 0, 'Mathira reads Sakaja''s sides';
  assert pg_temp.state_of($q$insert into public.area_notes (campaign_id, area_key, note)
    values ('ca000000-0000-4000-8000-000000000002', 'testland', 'cross')$q$) = '42501', 'Mathira writes into Sakaja''s notes';
  assert pg_temp.state_of($q$insert into public.atlas_settings (campaign_id, home_area)
    values ('ca000000-0000-4000-8000-000000000002', 'testland')$q$) = '42501', 'Mathira writes into Sakaja''s settings';
  update public.area_notes set note = 'changed';
end $$;
insert into public.area_notes (area_key, note) values ('testland/north-test', 'Mathira note');
do $$ begin
  assert (select note from public.area_notes) = 'Mathira note', 'Mathira reads only its own note on the same area';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
do $$ begin
  assert (select note from public.area_notes) = 'Sakaja note', 'the super admin reads the campaign they are looking at';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'one note per campaign for the same area';
  assert (select note from public.area_notes where campaign_id = 'ca000000-0000-4000-8000-000000000002') = 'Sakaja note',
    'someone outside the campaign changed its note';
end $$;
rollback;

-- test: the team reads; only the candidate or manager writes
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland'),
  ('testland/south-test', 'constituency', 'South Test', 'testland');
insert into public.area_notes (campaign_id, area_key, note)
values ('ca000000-0000-4000-8000-000000000002', 'testland/north-test', 'A note');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
insert into public.area_notes (area_key, note) values ('testland/south-test', 'Manager note');
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'the manager writes a note';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'an organiser reads the notes';
  assert (select count(*) from public.atlas_settings) = 1, 'an organiser reads the settings';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', 'Organiser note')$q$) = '42501', 'an organiser writes a note';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-governor', 'Beta')$q$) = '42501', 'an organiser sets a side';
  update public.area_notes set note = 'changed';
  delete from public.atlas_sides;
  update public.atlas_settings set home_area = 'testland/north-test';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_notes) = 2, 'an agent reads the notes';
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('testland')$q$) = '42501', 'an agent sets the home area';
  update public.area_notes set note = 'changed';
  delete from public.area_notes;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'a pending account reads notes';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.area_notes where note = 'changed') = 0, 'a non-staff edit went through';
  assert (select count(*) from public.area_notes) = 2, 'a non-staff delete went through';
  assert (select count(*) from public.atlas_sides) = 1, 'an organiser deleted a side';
  assert (select home_area from public.atlas_settings) = 'testland', 'an organiser changed the home area';
end $$;
rollback;

-- test: one home area and one side per election, changed by upsert
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('nowhere')$q$) = '23503', 'a home area that is not in the atlas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2030-mp', 'Beta')$q$) = '23503', 'a side in an election that is not in the atlas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-mp', '   ')$q$) = '23514', 'a blank side';
end $$;
insert into public.atlas_settings (home_area) values ('testland');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Alpha');
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_settings (home_area) values ('testland/north-test')$q$) = '23505', 'two home areas';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Beta')$q$) = '23505', 'two sides for one election';
end $$;
insert into public.atlas_settings (home_area) values ('testland/north-test')
  on conflict (campaign_id) do update set home_area = excluded.home_area;
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Beta')
  on conflict (campaign_id, election_id) do update set bloc = excluded.bloc;
do $$ begin
  assert (select home_area from public.atlas_settings) = 'testland/north-test', 'the home area is changed';
  assert (select bloc from public.atlas_sides where election_id = '2022-governor') = 'Beta', 'the side is changed';
  assert (select count(*) from public.atlas_sides) = 1, 'and still one';
end $$;
rollback;

-- test: a note is a note, and it keeps who changed it and when
begin;
insert into public.atlas_areas (key, level, name, parent) values
  ('testland', 'county', 'Testland', 'kenya'),
  ('testland/north-test', 'constituency', 'North Test', 'testland');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', '')$q$) = '23514', 'an empty note';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, note) values ('testland', '   ')$q$) = '23514', 'a blank note';
  assert pg_temp.state_of(format('insert into public.area_notes (area_key, note) values (%L, %L)', 'testland', repeat('x', 2001))) = '23514', 'a note over 2,000 characters';
  assert pg_temp.state_of(format('insert into public.area_notes (area_key, note) values (%L, %L)', 'testland', repeat('x', 2000))) is null, 'a note of exactly 2,000 characters is refused';
end $$;
insert into public.area_notes (area_key, note, updated_at, updated_by)
values ('testland/north-test', 'First', '2020-01-01', '00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select updated_by from public.area_notes where area_key = 'testland/north-test') = '00000000-0000-0000-0000-0000000000a1',
    'a note is signed by someone else';
  assert (select updated_at from public.area_notes where area_key = 'testland/north-test') = now(), 'a note is backdated';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
update public.area_notes set note = 'Second', updated_by = '00000000-0000-0000-0000-0000000000a1' where area_key = 'testland/north-test';
do $$ begin
  assert (select updated_by from public.area_notes where area_key = 'testland/north-test') = '00000000-0000-0000-0000-0000000000c3',
    'an edit keeps the previous editor''s name';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 22, 'schema version'; end $$;
```

- [ ] **Step 2: Run the suite and watch the new test fail**

Run: `runuser -u nobody -- env PATH="/usr/lib/postgresql/16/bin:$PATH" HOME=/tmp bash tests/sql/run.sh`

Expected (the exit status is 1; the other files print `ok`):

```
ok   36 migrations apply cleanly
FAIL tests/sql/atlas.test.sql
psql:tests/sql/atlas.test.sql:30: ERROR:  relation "public.atlas_elections" does not exist
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261007090000_election_atlas.sql`.

Choices worth knowing before you read it:
- The seven public tables get `select` for authenticated users through a team-member policy and
  nothing else: no write grant and no write policy, so only migrations and the service role write.
- `atlas_areas.key` is checked for its shape (a key is a county under `kenya`, or its parent's key
  and one more part). `CASE` answers null for a case it forgot and a `CHECK` lets null through, so
  the whole answer must be `is true`.
- A candidate's `id` must start with its election and seat. The slug of the name is not checked in
  the database: lower-casing differs between locales, so the TypeScript checker (Task 8) owns it.
- `cast` is a reserved word in SQL, so the turnout columns are `cast_votes`, `rejected_votes` and
  `valid_votes`.
- `atlas_stamp()` sets `updated_at` and `updated_by` on every insert and update, whatever the caller
  says, and is locked down like the repository's other trigger helpers (the access test checks that).

```sql
-- Election atlas. Schema version 22.
--
-- The last three general elections down to the constituency, who lives where, and
-- where votes can move. Public facts (areas, results, turnout, registers and
-- population estimates) are held once, in tables every team reads and nobody
-- writes through the API: only migrations and the server do. That is a deliberate
-- exception to "every campaign table has a campaign_id". Each campaign keeps its
-- own home area, sides and notes about places; the team reads them and the
-- candidate or campaign manager writes them.
--
-- Nothing here records a person's ethnicity. Communities appear only in the
-- team's notes about places.

-- ============ the shared atlas ============

-- A place, keyed by a path of slugs that reads as the place and joins the ward
-- maps: kenya, nairobi, nairobi/dagoretti-north, nairobi/dagoretti-north/kileleshwa.
create table public.atlas_areas (
  key       text primary key
            check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){0,2}$'),
  level     text not null check (level in ('country', 'county', 'constituency', 'ward')),
  name      text not null check (length(btrim(name)) between 2 and 80),
  parent    text references public.atlas_areas(key),
  iebc_code text check (iebc_code is null or iebc_code ~ '^[0-9]{1,4}$'),
  -- A county sits under Kenya; below that a key is its parent's key and one more
  -- part, so a ward's parent is its constituency and a constituency's its county.
  -- CASE returns null for a case it forgot, which a check lets through, so the
  -- whole answer must be true.
  constraint atlas_areas_shape check ((case level
    when 'country' then key = 'kenya' and parent is null
    when 'county' then parent = 'kenya' and key !~ '/'
    when 'constituency' then parent <> 'kenya' and key ~ '^[^/]+/[^/]+$'
                         and parent = regexp_replace(key, '/[^/]+$', '')
    else key ~ '^[^/]+/[^/]+/[^/]+$' and parent = regexp_replace(key, '/[^/]+$', '')
  end) is true)
);
create index atlas_areas_parent_idx on public.atlas_areas (parent);

insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null);

-- One race in one general election. The id says which: 2022-president.
create table public.atlas_elections (
  id      text primary key,
  year    integer not null check (year between 1992 and 2100),
  race    text not null check (race in ('president', 'governor', 'mp')),
  held_on date not null,
  note    text check (note is null or length(note) <= 500),
  constraint atlas_elections_id check (id = year::text || '-' || race)
);

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-president', 2013, 'president', '2013-03-04', null),
  ('2013-governor', 2013, 'governor', '2013-03-04', null),
  ('2013-mp', 2013, 'mp', '2013-03-04', null),
  ('2017-president', 2017, 'president', '2017-08-08',
   'The 8 August 2017 vote, annulled by the Supreme Court. The 26 October re-run was boycotted in opposition areas, so it says little about lean and is not loaded.'),
  ('2017-governor', 2017, 'governor', '2017-08-08', null),
  ('2017-mp', 2017, 'mp', '2017-08-08', null),
  ('2022-president', 2022, 'president', '2022-08-09', null),
  ('2022-governor', 2022, 'governor', '2022-08-09', null),
  ('2022-mp', 2022, 'mp', '2022-08-09', null);

-- A candidate for a seat: the area contested (kenya, a county or a constituency).
-- The id is election/seat/name-slug; bloc is the coalition, or the party where
-- there was none (Jubilee and CORD in 2013, Jubilee and NASA in 2017, Kenya
-- Kwanza and Azimio in 2022).
create table public.atlas_candidates (
  id          text primary key,
  election_id text not null references public.atlas_elections(id),
  seat        text not null references public.atlas_areas(key),
  name        text not null check (length(btrim(name)) between 2 and 120),
  party       text check (party is null or length(btrim(party)) between 1 and 120),
  bloc        text not null check (length(btrim(bloc)) between 1 and 80),
  constraint atlas_candidates_id_shape check (id like election_id || '/' || seat || '/%'),
  constraint atlas_candidates_name_key unique (election_id, seat, name)
);

-- Votes where they were counted: a county or a constituency now, wards and
-- polling stations later.
create table public.atlas_results (
  candidate_id text not null references public.atlas_candidates(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  votes        integer not null check (votes >= 0),
  primary key (candidate_id, area_key)
);
create index atlas_results_area_idx on public.atlas_results (area_key);

-- What the document says about turnout; each figure may be missing. source reads
-- "Publisher, document title", so the screens can tag a figure with its publisher.
create table public.atlas_turnout (
  election_id    text not null references public.atlas_elections(id),
  area_key       text not null references public.atlas_areas(key),
  registered     integer check (registered is null or registered >= 0),
  cast_votes     integer check (cast_votes is null or cast_votes >= 0),
  rejected_votes integer check (rejected_votes is null or rejected_votes >= 0),
  valid_votes    integer check (valid_votes is null or valid_votes >= 0),
  source         text not null check (length(btrim(source)) between 3 and 200),
  source_url     text check (source_url is null
                          or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 500)),
  primary key (election_id, area_key),
  constraint atlas_turnout_cast check (cast_votes is null or registered is null or cast_votes <= registered),
  constraint atlas_turnout_valid check (valid_votes is null or cast_votes is null or valid_votes <= cast_votes)
);
create index atlas_turnout_area_idx on public.atlas_turnout (area_key);

-- Registered voters by area for each election year, where IEBC published them.
create table public.atlas_register (
  year       integer not null check (year between 1992 and 2100),
  area_key   text not null references public.atlas_areas(key),
  registered integer not null check (registered >= 0),
  source     text not null check (length(btrim(source)) between 3 and 200),
  source_url text check (source_url is null
                      or (source_url ~ '^https://[^[:space:]]+$' and length(source_url) <= 500)),
  primary key (year, area_key)
);
create index atlas_register_area_idx on public.atlas_register (area_key);

-- Population estimates, never presented as counts: adults are 18 and over, young
-- adults 18 to 34. method says how they were worked out.
create table public.atlas_population (
  area_key     text not null references public.atlas_areas(key),
  year         integer not null check (year between 1990 and 2100),
  total        integer not null check (total >= 0),
  adults       integer not null check (adults >= 0),
  young_adults integer not null check (young_adults >= 0),
  source       text not null check (length(btrim(source)) between 3 and 200),
  method       text not null check (length(btrim(method)) between 10 and 500),
  primary key (area_key, year),
  constraint atlas_population_parts check (young_adults <= adults and adults <= total)
);

alter table public.atlas_areas enable row level security;
alter table public.atlas_elections enable row level security;
alter table public.atlas_candidates enable row level security;
alter table public.atlas_results enable row level security;
alter table public.atlas_turnout enable row level security;
alter table public.atlas_register enable row level security;
alter table public.atlas_population enable row level security;

revoke all on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
              public.atlas_turnout, public.atlas_register, public.atlas_population from anon, authenticated;
grant select on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
                public.atlas_turnout, public.atlas_register, public.atlas_population to authenticated;
grant all on public.atlas_areas, public.atlas_elections, public.atlas_candidates, public.atlas_results,
             public.atlas_turnout, public.atlas_register, public.atlas_population to service_role;

create policy "atlas readable by team" on public.atlas_areas for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_elections for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_candidates for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_results for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_turnout for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_register for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "atlas readable by team" on public.atlas_population for select to authenticated
  using (public.is_team_member(auth.uid()));

-- ============ each campaign's own ============

-- Who changed a row, and when, whatever the caller says.
create or replace function public.atlas_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

revoke all on function public.atlas_stamp() from public, anon, authenticated;

-- The campaign's home area: a constituency for an MP, a county for a governor,
-- kenya for a presidential campaign.
create table public.atlas_settings (
  campaign_id uuid primary key default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  home_area   text not null references public.atlas_areas(key),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null
);

-- For each past election, the bloc the campaign counts as "our side".
create table public.atlas_sides (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  election_id text not null references public.atlas_elections(id),
  bloc        text not null check (length(btrim(bloc)) between 1 and 80),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (campaign_id, election_id)
);

-- One note per area per campaign: about the place (its communities, the
-- languages used, churches, associations, local leaders), never about a person.
create table public.area_notes (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  area_key    text not null references public.atlas_areas(key),
  note        text not null check (length(btrim(note)) >= 1 and length(note) <= 2000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (campaign_id, area_key)
);

create trigger atlas_settings_stamp before insert or update on public.atlas_settings
  for each row execute function public.atlas_stamp();
create trigger atlas_sides_stamp before insert or update on public.atlas_sides
  for each row execute function public.atlas_stamp();
create trigger area_notes_stamp before insert or update on public.area_notes
  for each row execute function public.atlas_stamp();

alter table public.atlas_settings enable row level security;
alter table public.atlas_sides enable row level security;
alter table public.area_notes enable row level security;

revoke all on public.atlas_settings, public.atlas_sides, public.area_notes from anon, authenticated;
grant select, insert, update, delete on public.atlas_settings, public.atlas_sides, public.area_notes to authenticated;
grant all on public.atlas_settings, public.atlas_sides, public.area_notes to service_role;

create policy "own campaign only" on public.atlas_settings as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "settings readable by team" on public.atlas_settings for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "settings written by staff" on public.atlas_settings for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.atlas_sides as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "sides readable by team" on public.atlas_sides for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "sides written by staff" on public.atlas_sides for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.area_notes as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "notes readable by team" on public.area_notes for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "notes written by staff" on public.area_notes for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 22 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Run the suite again; two older tests now fail, correctly**

Run the same command as Step 2.

Expected: the new test passes and two older ones fail, each for a reason this migration owns.

```
ok   37 migrations apply cleanly
FAIL tests/sql/access.test.sql
psql:tests/sql/access.test.sql:334: ERROR:  new tables with no campaign: decide whether they belong to one: atlas_areas, atlas_elections, atlas_candidates, atlas_population, atlas_results, atlas_turnout, atlas_register
ok   tests/sql/atlas.test.sql (10 tests)
...
FAIL tests/sql/search.test.sql
psql:tests/sql/search.test.sql:79: ERROR:  schema version
```

The first is the guard that every table either has a campaign or is on a short list of the
platform's own; the atlas is public facts, so it joins the list. The second pins the schema version
to exactly 21; an older test that does this loosens to `>= 21` when a newer migration lands, as
`mornings.test.sql` did for 20.

- [ ] **Step 5: Update the two older tests**

```diff
--- a/tests/sql/access.test.sql
+++ b/tests/sql/access.test.sql
@@ -329,7 +329,10 @@ begin
      and c.relname not in ('campaigns', 'profiles', 'user_roles', 'demo_leads', 'rate_limits',
                            'whatsapp_webhook_events', 'listening_jobs',
                            -- ScrapeCreators credits: one key, so one count for every campaign
-                           'social_credits');
+                           'social_credits',
+                           -- The election atlas: public facts, the same for every campaign
+                           'atlas_areas', 'atlas_elections', 'atlas_candidates', 'atlas_results',
+                           'atlas_turnout', 'atlas_register', 'atlas_population');
   assert t is null, 'new tables with no campaign: decide whether they belong to one: ' || t;
 end $$;
 
```

```diff
--- a/tests/sql/search.test.sql
+++ b/tests/sql/search.test.sql
@@ -76,4 +76,4 @@ end $$;
 rollback;
 
 -- test: schema version
-do $$ begin assert public.groundwork_schema_version() = 21, 'schema version'; end $$;
+do $$ begin assert public.groundwork_schema_version() >= 21, 'schema version'; end $$;
```

- [ ] **Step 6: Run the suite: everything passes**

Run the same command as Step 2.

Expected:

```
ok   37 migrations apply cleanly
ok   tests/sql/access.test.sql (16 tests)
ok   tests/sql/atlas.test.sql (10 tests)
ok   tests/sql/form34a.test.sql (13 tests)
ok   tests/sql/listening.test.sql (4 tests)
ok   tests/sql/mornings.test.sql (6 tests)
ok   tests/sql/outbox.test.sql (12 tests)
ok   tests/sql/people.test.sql (7 tests)
ok   tests/sql/public.test.sql (4 tests)
ok   tests/sql/race.test.sql (8 tests)
ok   tests/sql/sample.test.sql (2 tests)
ok   tests/sql/search.test.sql (5 tests)
ok   tests/sql/site.test.sql (7 tests)
```

- [ ] **Step 7: Check that the write protection has teeth (nothing to commit)**

A passing test can be a test that cannot fail. Break the migration in a scratch copy, in the way that
would really expose the atlas, and see the test notice.

```bash
rm -rf /tmp/gw-atlas-mut && mkdir -p /tmp/gw-atlas-mut && cp -r supabase tests /tmp/gw-atlas-mut/ && chmod -R a+rX /tmp/gw-atlas-mut
f=/tmp/gw-atlas-mut/supabase/migrations/20261007090000_election_atlas.sql
# let any team member write atlas_areas: a grant and a policy
sed -i -E 's/^grant select on public.atlas_areas,/grant select, insert, update, delete on public.atlas_areas,/' "$f"
sed -i -E '/create policy "atlas readable by team" on public.atlas_areas/,/;$/ { s/for select/for all/; s/using \(public.is_team_member\(auth.uid\(\)\)\);/using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));/ }' "$f"
runuser -u nobody -- env PATH="/usr/lib/postgresql/16/bin:$PATH" HOME=/tmp bash /tmp/gw-atlas-mut/tests/sql/run.sh 2>&1 | grep -E "^FAIL|ERROR:" | head -2
rm -rf /tmp/gw-atlas-mut
```

Expected: `FAIL tests/sql/atlas.test.sql` and `ERROR:  a candidate adds to atlas_areas`. (The two
layers are both there. A grant that no policy backs is caught only for `update` and `delete`: they
raise nothing and change no rows, so the test fails on `a candidate edits atlas_areas`. A grant of
`insert` alone slips past, because row level security then refuses the insert with the same
SQLSTATE, 42501, that a missing privilege gives, and the test cannot tell the two layers apart.)

- [ ] **Step 8: Add the ten tables to the generated types**

The generated types file is updated by hand in this repository until the migration is applied and
Lovable regenerates it. Add the tables in alphabetical order, columns and relationships sorted the
way the generator sorts them:

```diff
--- a/src/integrations/supabase/types.ts
+++ b/src/integrations/supabase/types.ts
@@ -119,6 +119,369 @@ export type Database = {
           },
         ]
       }
+      area_notes: {
+        Row: {
+          area_key: string
+          campaign_id: string
+          note: string
+          updated_at: string
+          updated_by: string | null
+        }
+        Insert: {
+          area_key: string
+          campaign_id?: string
+          note: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Update: {
+          area_key?: string
+          campaign_id?: string
+          note?: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Relationships: [
+          {
+            foreignKeyName: "area_notes_area_key_fkey"
+            columns: ["area_key"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+          {
+            foreignKeyName: "area_notes_campaign_id_fkey"
+            columns: ["campaign_id"]
+            isOneToOne: false
+            referencedRelation: "campaigns"
+            referencedColumns: ["id"]
+          },
+        ]
+      }
+      atlas_areas: {
+        Row: {
+          iebc_code: string | null
+          key: string
+          level: string
+          name: string
+          parent: string | null
+        }
+        Insert: {
+          iebc_code?: string | null
+          key: string
+          level: string
+          name: string
+          parent?: string | null
+        }
+        Update: {
+          iebc_code?: string | null
+          key?: string
+          level?: string
+          name?: string
+          parent?: string | null
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_areas_parent_fkey"
+            columns: ["parent"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+        ]
+      }
+      atlas_candidates: {
+        Row: {
+          bloc: string
+          election_id: string
+          id: string
+          name: string
+          party: string | null
+          seat: string
+        }
+        Insert: {
+          bloc: string
+          election_id: string
+          id: string
+          name: string
+          party?: string | null
+          seat: string
+        }
+        Update: {
+          bloc?: string
+          election_id?: string
+          id?: string
+          name?: string
+          party?: string | null
+          seat?: string
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_candidates_election_id_fkey"
+            columns: ["election_id"]
+            isOneToOne: false
+            referencedRelation: "atlas_elections"
+            referencedColumns: ["id"]
+          },
+          {
+            foreignKeyName: "atlas_candidates_seat_fkey"
+            columns: ["seat"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+        ]
+      }
+      atlas_elections: {
+        Row: {
+          held_on: string
+          id: string
+          note: string | null
+          race: string
+          year: number
+        }
+        Insert: {
+          held_on: string
+          id: string
+          note?: string | null
+          race: string
+          year: number
+        }
+        Update: {
+          held_on?: string
+          id?: string
+          note?: string | null
+          race?: string
+          year?: number
+        }
+        Relationships: []
+      }
+      atlas_population: {
+        Row: {
+          adults: number
+          area_key: string
+          method: string
+          source: string
+          total: number
+          year: number
+          young_adults: number
+        }
+        Insert: {
+          adults: number
+          area_key: string
+          method: string
+          source: string
+          total: number
+          year: number
+          young_adults: number
+        }
+        Update: {
+          adults?: number
+          area_key?: string
+          method?: string
+          source?: string
+          total?: number
+          year?: number
+          young_adults?: number
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_population_area_key_fkey"
+            columns: ["area_key"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+        ]
+      }
+      atlas_register: {
+        Row: {
+          area_key: string
+          registered: number
+          source: string
+          source_url: string | null
+          year: number
+        }
+        Insert: {
+          area_key: string
+          registered: number
+          source: string
+          source_url?: string | null
+          year: number
+        }
+        Update: {
+          area_key?: string
+          registered?: number
+          source?: string
+          source_url?: string | null
+          year?: number
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_register_area_key_fkey"
+            columns: ["area_key"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+        ]
+      }
+      atlas_results: {
+        Row: {
+          area_key: string
+          candidate_id: string
+          votes: number
+        }
+        Insert: {
+          area_key: string
+          candidate_id: string
+          votes: number
+        }
+        Update: {
+          area_key?: string
+          candidate_id?: string
+          votes?: number
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_results_area_key_fkey"
+            columns: ["area_key"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+          {
+            foreignKeyName: "atlas_results_candidate_id_fkey"
+            columns: ["candidate_id"]
+            isOneToOne: false
+            referencedRelation: "atlas_candidates"
+            referencedColumns: ["id"]
+          },
+        ]
+      }
+      atlas_settings: {
+        Row: {
+          campaign_id: string
+          home_area: string
+          updated_at: string
+          updated_by: string | null
+        }
+        Insert: {
+          campaign_id?: string
+          home_area: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Update: {
+          campaign_id?: string
+          home_area?: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_settings_campaign_id_fkey"
+            columns: ["campaign_id"]
+            isOneToOne: true
+            referencedRelation: "campaigns"
+            referencedColumns: ["id"]
+          },
+          {
+            foreignKeyName: "atlas_settings_home_area_fkey"
+            columns: ["home_area"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+        ]
+      }
+      atlas_sides: {
+        Row: {
+          bloc: string
+          campaign_id: string
+          election_id: string
+          updated_at: string
+          updated_by: string | null
+        }
+        Insert: {
+          bloc: string
+          campaign_id?: string
+          election_id: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Update: {
+          bloc?: string
+          campaign_id?: string
+          election_id?: string
+          updated_at?: string
+          updated_by?: string | null
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_sides_campaign_id_fkey"
+            columns: ["campaign_id"]
+            isOneToOne: false
+            referencedRelation: "campaigns"
+            referencedColumns: ["id"]
+          },
+          {
+            foreignKeyName: "atlas_sides_election_id_fkey"
+            columns: ["election_id"]
+            isOneToOne: false
+            referencedRelation: "atlas_elections"
+            referencedColumns: ["id"]
+          },
+        ]
+      }
+      atlas_turnout: {
+        Row: {
+          area_key: string
+          cast_votes: number | null
+          election_id: string
+          registered: number | null
+          rejected_votes: number | null
+          source: string
+          source_url: string | null
+          valid_votes: number | null
+        }
+        Insert: {
+          area_key: string
+          cast_votes?: number | null
+          election_id: string
+          registered?: number | null
+          rejected_votes?: number | null
+          source: string
+          source_url?: string | null
+          valid_votes?: number | null
+        }
+        Update: {
+          area_key?: string
+          cast_votes?: number | null
+          election_id?: string
+          registered?: number | null
+          rejected_votes?: number | null
+          source?: string
+          source_url?: string | null
+          valid_votes?: number | null
+        }
+        Relationships: [
+          {
+            foreignKeyName: "atlas_turnout_area_key_fkey"
+            columns: ["area_key"]
+            isOneToOne: false
+            referencedRelation: "atlas_areas"
+            referencedColumns: ["key"]
+          },
+          {
+            foreignKeyName: "atlas_turnout_election_id_fkey"
+            columns: ["election_id"]
+            isOneToOne: false
+            referencedRelation: "atlas_elections"
+            referencedColumns: ["id"]
+          },
+        ]
+      }
       ballot_candidates: {
         Row: {
           campaign_id: string
```

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "integrations/supabase/types"`

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add tests/sql/atlas.test.sql supabase/migrations/20261007090000_election_atlas.sql tests/sql/access.test.sql tests/sql/search.test.sql src/integrations/supabase/types.ts
git commit -m "Atlas: schema 22, the shared tables and each campaign's own" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Result measures

**Files:**
- Create: `src/lib/atlas/types.ts`
- Create: `src/lib/atlas/measures.ts`
- Test: `tests/atlas-measures.test.ts`

**Interfaces:** Produces, in `types.ts`:
`type Race = "president" | "governor" | "mp"`,
`type Level = "country" | "county" | "constituency" | "ward"`,
`type Vote = { bloc: string; votes: number }`,
`type Turnout = { registered: number | null; cast: number | null; rejected: number | null; valid: number | null }`,
`type BlocShare = { bloc: string; votes: number; share: number }`,
`type Lean = { side: "ours" | "theirs" | "even"; points: number }`.
In `measures.ts`:
`settle(x: number): number`,
`turnoutPct(t: Turnout | null | undefined): number | null`,
`validVotes(t: Turnout | null | undefined, votes: Vote[]): number | null`,
`blocShares(votes: Vote[], valid: number | null): BlocShare[]`,
`ourShare(shares: BlocShare[], ourBloc: string | null): number | null`,
`margin(shares: BlocShare[], ourBloc: string | null): number | null`,
`lean(m: number | null): Lean | null`,
`swing(now: number | null, before: number | null): number | null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/atlas-measures.test.ts`:

```ts
// Checks for the election atlas's result measures: turnout, valid votes, each bloc's
// share, our share, the margin, lean and swing. Pure; nothing leaves this process.
// A missing figure is null and never zero. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-measures.test.ts

import {
  blocShares,
  lean,
  margin,
  ourShare,
  swing,
  turnoutPct,
  validVotes,
} from "@/lib/atlas/measures";
import type { Turnout, Vote } from "@/lib/atlas/types";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const T = (over: Partial<Turnout> = {}): Turnout => ({
  registered: 1000,
  cast: 412,
  rejected: null,
  valid: null,
  ...over,
});

// Turnout is cast over registered, in percent; missing when either is.
eq("turnout", turnoutPct(T()), 41.2);
eq("turnout with no cast", turnoutPct(T({ cast: null })), null);
eq("turnout with no register", turnoutPct(T({ registered: null })), null);
eq("turnout over an empty register", turnoutPct(T({ registered: 0 })), null);
eq("turnout with no row at all", [turnoutPct(null), turnoutPct(undefined)], [null, null]);
eq("a real zero turnout is not missing", turnoutPct(T({ cast: 0 })), 0);

// Valid votes: what the document gives, else the candidates' votes added up.
const VOTES: Vote[] = [
  { bloc: "Alpha", votes: 600 },
  { bloc: "Beta", votes: 300 },
  { bloc: "Alpha", votes: 100 },
];
eq("valid votes as published", validVotes(T({ valid: 950 }), VOTES), 950);
eq("valid votes added up", validVotes(T(), VOTES), 1000);
eq("valid votes with no turnout row", validVotes(null, VOTES), 1000);
eq("valid votes with nothing to go on", validVotes(T(), []), null);

// Shares: a bloc's votes over the valid votes, biggest first, ties by name.
eq("bloc shares", blocShares(VOTES, 1000), [
  { bloc: "Alpha", votes: 700, share: 70 },
  { bloc: "Beta", votes: 300, share: 30 },
]);
eq(
  "a tie is listed by name",
  blocShares(
    [
      { bloc: "Zed", votes: 5 },
      { bloc: "Abe", votes: 5 },
    ],
    10,
  ),
  [
    { bloc: "Abe", votes: 5, share: 50 },
    { bloc: "Zed", votes: 5, share: 50 },
  ],
);
eq("shares with no total", blocShares(VOTES, null), []);
eq("shares over a zero total", blocShares(VOTES, 0), []);

// Our share uses the campaign's side.
const SHARES = blocShares(VOTES, 1000);
eq("our share", ourShare(SHARES, "Alpha"), 70);
eq("a bloc that did not stand has no votes", ourShare(SHARES, "Gamma"), 0);
eq("no side set", ourShare(SHARES, null), null);
eq("no shares to read", ourShare([], "Alpha"), null);

// Margin: our share minus the strongest other bloc's.
eq("margin when ahead", margin(SHARES, "Alpha"), 40);
eq("margin when behind", margin(SHARES, "Beta"), -40);
const THREE = blocShares(
  [
    { bloc: "Alpha", votes: 450 },
    { bloc: "Beta", votes: 300 },
    { bloc: "Gamma", votes: 250 },
  ],
  1000,
);
eq("margin against the strongest other bloc", margin(THREE, "Alpha"), 15);
eq("margin of the middle bloc", margin(THREE, "Beta"), -15);
eq("margin when unopposed", margin(blocShares([{ bloc: "Alpha", votes: 80 }], 80), "Alpha"), 100);
eq("margin when we did not stand", margin(SHARES, "Gamma"), -70);
eq("margin with no side", margin(SHARES, null), null);
eq("margin with no shares", margin([], "Alpha"), null);

// Lean is the margin read as a side.
eq("lean ours", lean(40), { side: "ours", points: 40 });
eq("lean theirs", lean(-15.5), { side: "theirs", points: 15.5 });
eq("level", lean(0), { side: "even", points: 0 });
eq("floating point noise is level", lean(1e-12), { side: "even", points: 0 });
eq("no margin, no lean", lean(null), null);

// Swing is our share now minus our share at the election before, in points.
eq("swing towards us", swing(52.3, 48.1), 4.2);
eq("swing away from us", swing(40, 51.5), -11.5);
eq("swing with no earlier share", swing(52.3, null), null);
eq("swing with no later share", swing(null, 48.1), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-measures.test.ts`

Expected: it does not get as far as a test:
`Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../tests/atlas-measures.test.ts`

- [ ] **Step 3: Write the types and the measures**

Create `src/lib/atlas/types.ts`:

```ts
// The election atlas's shared shapes. Shares and turnout are percentages (0 to 100), kept
// unrounded until they are shown. A missing figure is null, never zero.

export type Race = "president" | "governor" | "mp";
export type Level = "country" | "county" | "constituency" | "ward";

/** One candidate's votes in one area for one election, with the bloc they stood for. */
export type Vote = { bloc: string; votes: number };

/**
 * What the document says about turnout in one area; each figure may be missing. These are
 * `atlas_turnout`'s registered, cast_votes, rejected_votes and valid_votes.
 */
export type Turnout = {
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
};

/** A bloc's votes in an area and its share of the valid votes, in percent. */
export type BlocShare = { bloc: string; votes: number; share: number };

/** Which way an area leans and by how many points. */
export type Lean = { side: "ours" | "theirs" | "even"; points: number };
```

Create `src/lib/atlas/measures.ts`. `settle` rounds to six decimals so that a margin of exactly 10
points is not 10.000000000000002; every measure that feeds a comparison passes through it.

```ts
// What an area's results say: turnout, valid votes, each bloc's share, ours, the margin, which
// way it leans and how it swung. Pure. Every function answers null for a figure it cannot work
// out, so a missing number never reads as zero.

import type { BlocShare, Lean, Turnout, Vote } from "./types";

/** Floating point leaves 10.000000000000002 where the answer is 10; round before comparing. */
export const settle = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Turnout in percent: cast over registered. Missing when either is, or the register is empty. */
export function turnoutPct(t: Turnout | null | undefined): number | null {
  if (!t || t.registered === null || t.cast === null || t.registered <= 0) return null;
  return settle((t.cast / t.registered) * 100);
}

/** Valid votes: what the document gives, else the candidates' votes added up. */
export function validVotes(t: Turnout | null | undefined, votes: Vote[]): number | null {
  if (t && t.valid !== null) return t.valid;
  if (votes.length === 0) return null;
  return votes.reduce((sum, v) => sum + v.votes, 0);
}

/** Each bloc's votes and share of the valid votes, biggest first, ties by name. */
export function blocShares(votes: Vote[], valid: number | null): BlocShare[] {
  if (valid === null || valid <= 0) return [];
  const byBloc = new Map<string, number>();
  for (const v of votes) byBloc.set(v.bloc, (byBloc.get(v.bloc) ?? 0) + v.votes);
  return [...byBloc]
    .map(([bloc, n]) => ({ bloc, votes: n, share: settle((n / valid) * 100) }))
    .sort((a, b) => b.votes - a.votes || a.bloc.localeCompare(b.bloc));
}

/**
 * The campaign's side's share in percent; 0 when it did not stand; null with no side or no
 * shares.
 */
export function ourShare(shares: BlocShare[], ourBloc: string | null): number | null {
  if (ourBloc === null || shares.length === 0) return null;
  return shares.find((s) => s.bloc === ourBloc)?.share ?? 0;
}

/** Our share minus the strongest other bloc's, in points; the other is 0 when unopposed. */
export function margin(shares: BlocShare[], ourBloc: string | null): number | null {
  const ours = ourShare(shares, ourBloc);
  if (ours === null) return null;
  const others = shares.filter((s) => s.bloc !== ourBloc).map((s) => s.share);
  return settle(ours - (others.length ? Math.max(...others) : 0));
}

/** The margin read as a side: ahead leans ours, behind leans theirs. */
export function lean(m: number | null): Lean | null {
  if (m === null) return null;
  const p = settle(m);
  return { side: p > 0 ? "ours" : p < 0 ? "theirs" : "even", points: Math.abs(p) };
}

/** Our share now minus our share at the election before, in points. */
export function swing(now: number | null, before: number | null): number | null {
  return now === null || before === null ? null : settle(now - before);
}
```

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/atlas tests/atlas-measures.test.ts && npx eslint src/lib/atlas tests/atlas-measures.test.ts`

Expected: Prettier lists the files (`(unchanged)` for any that already match) and ESLint prints
nothing.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-measures.test.ts`

Expected: `35 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/atlas/types.ts src/lib/atlas/measures.ts tests/atlas-measures.test.ts
git commit -m "Atlas: turnout, shares, margin, lean and swing" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Register and population measures

**Files:**
- Create: `src/lib/atlas/register.ts`
- Test: `tests/atlas-register.test.ts`

**Interfaces:** Consumes `settle` from `./measures`. Produces:
`registerGrowth(now: number | null, before: number | null): { change: number; pct: number | null } | null`,
`notYetRegistered(adults: number | null, registered: number | null): number | null`,
`youngShare(young: number | null, adults: number | null): number | null`,
`registerFlag(adults: number | null, registered: number | null): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/atlas-register.test.ts`:

```ts
// Checks for the election atlas's register and population measures: register growth, adults not
// yet registered, the young share and the register flag. Pure; nothing leaves this process. A
// missing figure is null and never zero. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-register.test.ts

import { notYetRegistered, registerFlag, registerGrowth, youngShare } from "@/lib/atlas/register";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// Register growth: registered voters now minus at the last election, and as a share.
eq("growth", registerGrowth(52000, 48000), { change: 4000, pct: 8.333333 });
eq("a shrinking register", registerGrowth(45000, 48000), { change: -3000, pct: -6.25 });
eq("growth from an empty register has no share", registerGrowth(500, 0), {
  change: 500,
  pct: null,
});
eq("growth with no earlier register", registerGrowth(52000, null), null);
eq("growth with no later register", registerGrowth(null, 48000), null);

// Not yet registered: adults minus registered voters, never below zero.
eq("not yet registered", notYetRegistered(10000, 7600), 2400);
eq("more registered than adults", notYetRegistered(10000, 10400), 0);
eq("not yet registered, no adults figure", notYetRegistered(null, 7600), null);
eq("not yet registered, no register", notYetRegistered(10000, null), null);

// The young share: 18 to 34 as a share of the area's adults.
eq("young share", youngShare(4200, 10000), 42);
eq("young share of no adults", youngShare(0, 0), null);
eq("young share, no young figure", youngShare(null, 10000), null);
eq("young share, no adults figure", youngShare(4200, null), null);

// The register flag: an estimated quarter or more of the adults are not registered.
eq("exactly a quarter is flagged", registerFlag(10000, 7500), true);
eq("just under a quarter is not", registerFlag(10000, 7501), false);
eq("half unregistered is flagged", registerFlag(10000, 5000), true);
eq("a full register is not", registerFlag(10000, 10000), false);
eq("no adults figure is not flagged", registerFlag(null, 7500), false);
eq("no register is not flagged", registerFlag(10000, null), false);
eq("no adults is not flagged", registerFlag(0, 0), false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-register.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../tests/atlas-register.test.ts`

- [ ] **Step 3: Write the measures**

Create `src/lib/atlas/register.ts`. The young share is 18 to 34 as a share of the area's adults: it
describes who lives there, and says nothing about who is unregistered (nothing does).

```ts
// What the register and the population estimates say about an area: how the register grew, how
// many adults are not yet registered, how young the adults are, and whether the gap is wide
// enough to flag. Pure. Population figures are estimates; a figure that is missing is null.

import { settle } from "./measures";

/** Registered voters now minus at the last election, and that as a share of the last. */
export function registerGrowth(
  now: number | null,
  before: number | null,
): { change: number; pct: number | null } | null {
  if (now === null || before === null) return null;
  return {
    change: now - before,
    pct: before > 0 ? settle(((now - before) / before) * 100) : null,
  };
}

/** Adults minus registered voters, never below zero. An estimate: the adults are. */
export function notYetRegistered(adults: number | null, registered: number | null): number | null {
  if (adults === null || registered === null) return null;
  return Math.max(0, adults - registered);
}

/**
 * 18 to 34 as a share of the area's adults, in percent. It says who lives there, not who is
 * unregistered.
 */
export function youngShare(young: number | null, adults: number | null): number | null {
  if (young === null || adults === null || adults <= 0) return null;
  return settle((young / adults) * 100);
}

/** An estimated quarter or more of the area's adults are not registered. */
export function registerFlag(adults: number | null, registered: number | null): boolean {
  const missing = notYetRegistered(adults, registered);
  if (missing === null || adults === null || adults <= 0) return false;
  return settle(missing / adults) >= 0.25;
}
```

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/atlas tests/atlas-register.test.ts && npx eslint src/lib/atlas tests/atlas-register.test.ts`

Expected: ESLint prints nothing.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-register.test.ts`

Expected: `20 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/atlas/register.ts tests/atlas-register.test.ts
git commit -m "Atlas: register growth, adults not yet registered, the young share" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: How figures are written, and their tags

**Files:**
- Create: `src/lib/atlas/format.ts`
- Test: `tests/atlas-format.test.ts`

**Interfaces:** Consumes `type Level` from `./types`. Produces:
`MISSING` (`"not found yet"`),
`fmtVotes(n: number | null): string` (thousands separators),
`fmtShare(n: number | null): string` (one decimal place and a `%`),
`fmtTurnout(n: number | null): string` (a whole percentage),
`fmtPoints(n: number | null): string` (a size, whatever its sign: `"6.0 points"`),
`resultTag(source: string, level: Level, year: number): string` (`"IEBC · constituency total · 2022"`),
`registerTag(source: string, level: Level, year: number): string` (`"IEBC · ward register · 2022"`),
`estimateTag(source: string, year: number): string` (`"WorldPop estimate · 2025"`).
A `source` reads "Publisher, document title"; the tag keeps the publisher.

- [ ] **Step 1: Write the failing tests**

Create `tests/atlas-format.test.ts`:

```ts
// Checks for how the election atlas writes its figures: shares to one decimal place, turnout as a
// whole percentage, votes with thousands separators, a missing figure as missing, and the tag a
// figure carries to say where it came from. Pure; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-format.test.ts

import {
  MISSING,
  estimateTag,
  fmtPoints,
  fmtShare,
  fmtTurnout,
  fmtVotes,
  registerTag,
  resultTag,
} from "@/lib/atlas/format";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

eq("what missing reads as", MISSING, "not found yet");

// Votes, with thousands separators.
eq("votes", fmtVotes(1234567), "1,234,567");
eq("votes are whole", fmtVotes(999.6), "1,000");
eq("a real zero is a zero", fmtVotes(0), "0");
eq("votes missing", fmtVotes(null), MISSING);

// Shares to one decimal place.
eq("a share", fmtShare(48.25), "48.3%");
eq("a share that is whole", fmtShare(50), "50.0%");
eq("a real zero share is a zero", fmtShare(0), "0.0%");
eq("a share missing", fmtShare(null), MISSING);

// Turnout as a whole percentage.
eq("turnout", fmtTurnout(41.2), "41%");
eq("turnout rounds half up", fmtTurnout(41.5), "42%");
eq("turnout missing", fmtTurnout(null), MISSING);

// Points are a size; the words around them say which way.
eq("points", fmtPoints(6.04), "6.0 points");
eq("points ignore their sign", fmtPoints(-15.5), "15.5 points");
eq("points missing", fmtPoints(null), MISSING);

// A source reads "Publisher, document title"; the tag keeps the publisher.
eq(
  "a result tag",
  resultTag("IEBC, Presidential results by constituency", "constituency", 2022),
  "IEBC · constituency total · 2022",
);
eq(
  "a county result tag",
  resultTag("IEBC, Governor results", "county", 2017),
  "IEBC · county total · 2017",
);
eq(
  "a register tag",
  registerTag("IEBC, Registered voters by ward", "ward", 2022),
  "IEBC · ward register · 2022",
);
eq(
  "an estimate tag",
  estimateTag("WorldPop, Age and sex structures, Kenya", 2025),
  "WorldPop estimate · 2025",
);
eq("a source that is only a name", resultTag("IEBC", "county", 2013), "IEBC · county total · 2013");
eq(
  "a source with stray spaces",
  estimateTag("  WorldPop , grid", 2025),
  "WorldPop estimate · 2025",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-format.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../tests/atlas-format.test.ts`

- [ ] **Step 3: Write the formatting**

Create `src/lib/atlas/format.ts`. Numbers use `Intl.NumberFormat("en-KE")`, as the rest of the app
does.

```ts
// How the atlas writes its figures: shares to one decimal place, turnout as a whole percentage,
// votes with thousands separators, a missing figure as missing, and the tag each figure carries
// to say where it came from. Pure.

import type { Level } from "./types";

/** What a figure that is not there reads as. Never "0". */
export const MISSING = "not found yet";

const nf = new Intl.NumberFormat("en-KE");

export const fmtVotes = (n: number | null): string =>
  n === null ? MISSING : nf.format(Math.round(n));

export const fmtShare = (n: number | null): string => (n === null ? MISSING : `${n.toFixed(1)}%`);

export const fmtTurnout = (n: number | null): string =>
  n === null ? MISSING : `${Math.round(n)}%`;

/** Points are a size: the words around them say which way. */
export const fmtPoints = (n: number | null): string =>
  n === null ? MISSING : `${Math.abs(n).toFixed(1)} points`;

/** A source reads "Publisher, document title"; the tag keeps the publisher. */
const publisher = (source: string): string => source.split(",")[0]?.trim() || source.trim();

/** "IEBC · constituency total · 2022": a result counted at that level, in that year. */
export const resultTag = (source: string, level: Level, year: number): string =>
  `${publisher(source)} · ${level} total · ${year}`;

/** "IEBC · ward register · 2022". */
export const registerTag = (source: string, level: Level, year: number): string =>
  `${publisher(source)} · ${level} register · ${year}`;

/** "WorldPop estimate · 2025": a population figure that is an estimate, never a count. */
export const estimateTag = (source: string, year: number): string =>
  `${publisher(source)} estimate · ${year}`;
```

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/atlas tests/atlas-format.test.ts && npx eslint src/lib/atlas tests/atlas-format.test.ts`

Expected: ESLint prints nothing.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-format.test.ts`

Expected: `21 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/atlas/format.ts tests/atlas-format.test.ts
git commit -m "Atlas: how figures are written, and the tag each carries" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: What to do in an area, and the votes within reach

**Files:**
- Create: `src/lib/atlas/advice.ts`
- Test: `tests/atlas-advice.test.ts`

**Interfaces:** Consumes `settle` from `./measures`; `fmtPoints`, `fmtShare`, `fmtTurnout`, `MISSING`
from `./format`. Produces:
`type Action = "mobilise" | "hold" | "cut-the-gap" | "persuade" | "lean-ours"`,
`type Advice = { action: Action | "set-side" | "no-result"; label: string; reason: string }`,
`type AdviceInput = { side: string | null; ourShare: number | null; margin: number | null; swing: number | null; turnout: number | null; parentTurnout: number | null; parentName: string }`,
`whatToDo(i: AdviceInput): Advice`,
`nearestRank(values: number[], percentile: number): number | null`,
`type ReachInput = { turnout: number | null; siblingTurnouts: number[]; registered: number | null; ourShare: number | null; valid: number | null }`,
`type Reach = { turnout: number | null; persuasion: number | null; total: number | null }`,
`votesWithinReach(i: ReachInput): Reach`.

The rules, first match wins (spec section 4, as the user revised them on 7 October). Without a side
the answer is "Set your side first"; with a side but no result it is "No result".

| # | Answer | When |
|---|--------|------|
| 1 | Mobilise | our share is 50% or more and turnout is more than 3 points below the area above's (skipped when either turnout is missing) |
| 2 | Hold | our share is 60% or more |
| 3 | Cut the gap | we trail the strongest other bloc by more than 10 points |
| 4 | Persuade | the margin is within 10 points either way (10 included), or the last swing was 10 points or more |
| 5 | Lean ours | anything else: ahead by more than 10 points, short of Hold |

Votes within reach, as two parts and their sum: *turnout*, the extra voters if this area's turnout
rose to the 75th percentile (nearest rank) of its siblings', at our share (zero when it is already
there; missing with fewer than four siblings that have a turnout); and *persuasion*, 5% of the valid
votes.

- [ ] **Step 1: Write the failing tests**

Create `tests/atlas-advice.test.ts`:

```ts
// Checks for what the election atlas says to do in an area and why, and for the votes within
// reach: every rule, where each one starts, which wins when two apply, what happens when a figure
// is missing, and the reason line that goes with each answer. Pure; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-advice.test.ts

import { nearestRank, votesWithinReach, whatToDo, type AdviceInput } from "@/lib/atlas/advice";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// A side is set, turnout is level with the area above, and we lead by 20 on 55%.
const A = (over: Partial<AdviceInput> = {}) =>
  whatToDo({
    side: "Alpha",
    ourShare: 55,
    margin: 20,
    swing: null,
    turnout: 44,
    parentTurnout: 44,
    parentName: "Nairobi",
    ...over,
  });
const act = (over: Partial<AdviceInput>) => A(over).action;
const why = (over: Partial<AdviceInput>) => A(over).reason;

// 1. Mobilise: half the vote or more, and turnout more than 3 points below the area above.
eq("mobilise", A({ ourShare: 54.2, margin: 8.4, turnout: 38, parentTurnout: 44 }), {
  action: "mobilise",
  label: "Mobilise",
  reason: "54.2% to us, but turnout was 38%, 6.0 points below Nairobi's 44%",
});
eq("3 points below is not low enough", act({ turnout: 41, parentTurnout: 44 }), "lean-ours");
eq("just over 3 points below is", act({ turnout: 40.9, parentTurnout: 44 }), "mobilise");
eq(
  "the reason for a gap just over 3",
  why({ turnout: 40.9, parentTurnout: 44 }),
  "55.0% to us, but turnout was 41%, 3.1 points below Nairobi's 44%",
);
eq("mobilise needs half the vote", act({ ourShare: 49.9, margin: 3, turnout: 34 }), "persuade");
eq("no turnout, no mobilise", act({ ourShare: 65, margin: 40, turnout: null }), "hold");
eq("no turnout above, no mobilise", act({ ourShare: 65, margin: 40, parentTurnout: null }), "hold");
eq("mobilise comes before hold", A({ ourShare: 65, margin: 40, turnout: 36 }), {
  action: "mobilise",
  label: "Mobilise",
  reason: "65.0% to us, but turnout was 36%, 8.0 points below Nairobi's 44%",
});

// 2. Hold: 60% or more.
eq("hold", A({ ourShare: 60, margin: 25 }), {
  action: "hold",
  label: "Hold",
  reason: "60.0% to us",
});
eq("59.9% is not a stronghold", act({ ourShare: 59.9, margin: 25 }), "lean-ours");

// 3. Cut the gap: trailing the strongest other bloc by more than 10 points.
eq("cut the gap", A({ ourShare: 35, margin: -15 }), {
  action: "cut-the-gap",
  label: "Cut the gap",
  reason: "35.0% to us, 15.0 points behind",
});
eq("10 points behind is still a contest", A({ ourShare: 45, margin: -10 }), {
  action: "persuade",
  label: "Persuade",
  reason: "45.0% to us, 10.0 points behind",
});
eq("just over 10 behind is not", A({ ourShare: 44.9, margin: -10.1 }), {
  action: "cut-the-gap",
  label: "Cut the gap",
  reason: "44.9% to us, 10.1 points behind",
});
eq(
  "cut the gap comes before a swing",
  act({ ourShare: 35, margin: -15, swing: 12 }),
  "cut-the-gap",
);

// 4. Persuade: within 10 points either way, or the last swing was 10 points or more.
eq("persuade, ahead", A({ ourShare: 53, margin: 6 }), {
  action: "persuade",
  label: "Persuade",
  reason: "53.0% to us, 6.0 points ahead",
});
eq("persuade, level", why({ ourShare: 50, margin: 0 }), "50.0% to us, level");
eq(
  "10 points ahead is still a contest",
  why({ ourShare: 55, margin: 10 }),
  "55.0% to us, 10.0 points ahead",
);
eq("floating point noise at 10", act({ ourShare: 55, margin: 10.000000000000002 }), "persuade");
eq("a swing away makes it a contest", A({ ourShare: 58, margin: 16, swing: -12 }), {
  action: "persuade",
  label: "Persuade",
  reason: "58.0% to us, swung 12.0 points away from us since last time",
});
eq(
  "a swing of exactly 10 counts",
  why({ ourShare: 58, margin: 16, swing: 10 }),
  "58.0% to us, swung 10.0 points to us since last time",
);
eq("a swing of 9.9 does not", act({ ourShare: 58, margin: 16, swing: 9.9 }), "lean-ours");
eq(
  "margin and swing together",
  why({ ourShare: 48, margin: -4, swing: 11 }),
  "48.0% to us, 4.0 points behind, swung 11.0 points to us since last time",
);

// 5. Lean ours: ahead by more than 10 points, short of a stronghold.
eq("lean ours", A({ ourShare: 58, margin: 16 }), {
  action: "lean-ours",
  label: "Lean ours",
  reason: "58.0% to us, 16.0 points ahead",
});
eq(
  "a crowded race: 45% to 30% leans ours",
  why({ ourShare: 45, margin: 15 }),
  "45.0% to us, 15.0 points ahead",
);
eq(
  "a narrow lead on a small share: 38% to 30% is a contest",
  why({ ourShare: 38, margin: 8 }),
  "38.0% to us, 8.0 points ahead",
);

// Missing figures.
eq("no side", A({ side: null }), { action: "set-side", label: "Set your side first", reason: "" });
eq("no result", A({ ourShare: null, margin: null }), {
  action: "no-result",
  label: "No result",
  reason: "not found yet",
});
eq("no side beats no result", act({ side: null, ourShare: null, margin: null }), "set-side");

// The 75th percentile by nearest rank.
eq("nearest rank of four", nearestRank([10, 20, 30, 40], 75), 30);
eq("nearest rank sorts first", nearestRank([50, 10, 40, 20, 30], 75), 40);
eq("nearest rank of one", nearestRank([5], 75), 5);
eq("nearest rank of none", nearestRank([], 75), null);
eq(
  "nearest rank at the ends",
  [nearestRank([10, 20, 30], 100), nearestRank([10, 20, 30], 0)],
  [30, 10],
);

// Votes within reach: turnout up to the top quarter of its siblings, and a 5-point swing to us.
const R = (over: Partial<Parameters<typeof votesWithinReach>[0]> = {}) =>
  votesWithinReach({
    turnout: 40,
    siblingTurnouts: [40, 50, 60, 70],
    registered: 10000,
    ourShare: 55,
    valid: 4000,
    ...over,
  });
eq("votes within reach", R(), { turnout: 1100, persuasion: 200, total: 1300 });
eq("already in the top quarter", R({ turnout: 70 }), { turnout: 0, persuasion: 200, total: 200 });
eq("too few siblings to say", R({ siblingTurnouts: [40, 50, 60] }), {
  turnout: null,
  persuasion: 200,
  total: 200,
});
eq("no register", R({ registered: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no share", R({ ourShare: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no own turnout", R({ turnout: null }), { turnout: null, persuasion: 200, total: 200 });
eq("no valid votes", R({ valid: null }), { turnout: 1100, persuasion: null, total: 1100 });
eq("nothing to go on", R({ turnout: null, valid: null }), {
  turnout: null,
  persuasion: null,
  total: null,
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-advice.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../tests/atlas-advice.test.ts`

- [ ] **Step 3: Write the rules**

Create `src/lib/atlas/advice.ts`:

```ts
// What to do in an area and why, and the votes within reach there. Pure. The rules follow who is
// ahead, not the share alone, so a crowded race (45% to 30%) reads "Lean ours" and a narrow lead
// on a small share (38% to 30%) reads "Persuade". Each answer carries a one-line reason built from
// the numbers. Shares, margins and swings are percentages and points, as `measures.ts` gives them.

import { fmtPoints, fmtShare, fmtTurnout, MISSING } from "./format";
import { settle } from "./measures";

export type Action = "mobilise" | "hold" | "cut-the-gap" | "persuade" | "lean-ours";

export type Advice = {
  action: Action | "set-side" | "no-result";
  label: string;
  reason: string;
};

export type AdviceInput = {
  /** The bloc the campaign counts as ours in this election; null until it is set. */
  side: string | null;
  ourShare: number | null;
  margin: number | null;
  /** Our share now minus our share at the election before, in points. */
  swing: number | null;
  turnout: number | null;
  /** Turnout in the area above (the county for a constituency), and what to call that area. */
  parentTurnout: number | null;
  parentName: string;
};

const LABELS: Record<Action, string> = {
  mobilise: "Mobilise",
  hold: "Hold",
  "cut-the-gap": "Cut the gap",
  persuade: "Persuade",
  "lean-ours": "Lean ours",
};

const answer = (action: Action, reason: string): Advice => ({
  action,
  label: LABELS[action],
  reason,
});

/**
 * First match wins:
 * 1. Mobilise: our share is 50% or more and turnout is more than 3 points below the area above.
 * 2. Hold: our share is 60% or more.
 * 3. Cut the gap: we trail the strongest other bloc by more than 10 points.
 * 4. Persuade: the margin is within 10 points either way, or the last swing was 10 or more.
 * 5. Lean ours: anything else, which is ahead by more than 10 points.
 */
export function whatToDo(i: AdviceInput): Advice {
  if (i.side === null) return { action: "set-side", label: "Set your side first", reason: "" };
  if (i.ourShare === null || i.margin === null) {
    return { action: "no-result", label: "No result", reason: MISSING };
  }
  const share = settle(i.ourShare);
  const m = settle(i.margin);
  const swing = i.swing === null ? null : settle(i.swing);
  const gap =
    i.turnout !== null && i.parentTurnout !== null ? settle(i.parentTurnout - i.turnout) : null;
  const to = `${fmtShare(share)} to us`;

  if (share >= 50 && gap !== null && gap > 3) {
    return answer(
      "mobilise",
      `${to}, but turnout was ${fmtTurnout(i.turnout)}, ${fmtPoints(gap)} below ` +
        `${i.parentName}'s ${fmtTurnout(i.parentTurnout)}`,
    );
  }
  if (share >= 60) return answer("hold", to);
  if (m < -10) return answer("cut-the-gap", `${to}, ${fmtPoints(m)} behind`);

  const contest = Math.abs(m) <= 10;
  const swung = swing !== null && Math.abs(swing) >= 10;
  if (contest || swung) {
    const parts = [to];
    if (contest) parts.push(m === 0 ? "level" : `${fmtPoints(m)} ${m > 0 ? "ahead" : "behind"}`);
    if (swung) {
      parts.push(`swung ${fmtPoints(swing)} ${swing > 0 ? "to" : "away from"} us since last time`);
    }
    return answer("persuade", parts.join(", "));
  }
  return answer("lean-ours", `${to}, ${fmtPoints(m)} ahead`);
}

/** The value at a percentile by the nearest-rank method; null for an empty list. */
export function nearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export type ReachInput = {
  /** This area's turnout, in percent. */
  turnout: number | null;
  /** The turnouts of all the areas with the same parent, this one included, that have one. */
  siblingTurnouts: number[];
  registered: number | null;
  /** Our share, in percent. */
  ourShare: number | null;
  valid: number | null;
};

export type Reach = { turnout: number | null; persuasion: number | null; total: number | null };

/**
 * The votes within reach, as two parts and their sum:
 * - turnout: if this area's turnout rose to the 75th percentile of its siblings' (nearest rank),
 *   the extra voters, at our share. Zero when it is already there; missing with fewer than four
 *   siblings that have a turnout, or when a figure it needs is missing.
 * - persuasion: 5% of the valid votes, a 5-point swing to us.
 */
export function votesWithinReach(i: ReachInput): Reach {
  let turnoutVotes: number | null = null;
  if (
    i.turnout !== null &&
    i.registered !== null &&
    i.ourShare !== null &&
    i.siblingTurnouts.length >= 4
  ) {
    const top = nearestRank(i.siblingTurnouts, 75);
    if (top !== null) {
      turnoutVotes = settle(
        Math.max(0, ((top - i.turnout) / 100) * i.registered * (i.ourShare / 100)),
      );
    }
  }
  const persuasion = i.valid === null ? null : settle(i.valid * 0.05);
  const parts = [turnoutVotes, persuasion].filter((x): x is number => x !== null);
  const total = parts.length === 0 ? null : settle(parts.reduce((a, b) => a + b, 0));
  return { turnout: turnoutVotes, persuasion, total };
}
```

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/atlas tests/atlas-advice.test.ts && npx eslint src/lib/atlas tests/atlas-advice.test.ts`

Expected: ESLint prints nothing.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-advice.test.ts`

Expected: `41 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/atlas/advice.ts tests/atlas-advice.test.ts
git commit -m "Atlas: what to do in an area and why, and the votes within reach" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Where a figure comes from, and one import

**Files:**
- Create: `src/lib/atlas/scope.ts`
- Create: `src/lib/atlas/index.ts`
- Test: `tests/atlas-scope.test.ts`

**Interfaces:** Consumes `type Level` from `./types`. Produces:
`parentKey(key: string): string | null` (a county's parent is `kenya`; `kenya` has none),
`levelOfKey(key: string): Level`,
`resultsArea(key: string, has: (key: string) => boolean): { key: string; inherited: boolean } | null`
(an area's own results, else a ward's constituency's; nothing else borrows),
`figureLabel(found: { key: string; inherited: boolean } | null): string | null` (`"constituency figure"`).
`index.ts` re-exports every module, so a screen writes `import { whatToDo } from "@/lib/atlas"`.

- [ ] **Step 1: Write the failing tests**

The last test pins the public surface of `@/lib/atlas`, so a removed export is noticed.

Create `tests/atlas-scope.test.ts`:

```ts
// Checks for where an atlas figure comes from: the key above an area, an area's level, which area
// holds the results a ward shows (its constituency's, until stations give wards their own), the
// label that says so, and the public surface of `@/lib/atlas`. Pure; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-scope.test.ts

import * as atlas from "@/lib/atlas";
import { figureLabel, levelOfKey, parentKey, resultsArea } from "@/lib/atlas";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

eq(
  "the key above",
  [
    parentKey("nairobi/dagoretti-north/kileleshwa"),
    parentKey("nairobi/dagoretti-north"),
    parentKey("nairobi"),
    parentKey("kenya"),
  ],
  ["nairobi/dagoretti-north", "nairobi", "kenya", null],
);
eq(
  "the level of a key",
  [
    levelOfKey("kenya"),
    levelOfKey("nairobi"),
    levelOfKey("nairobi/dagoretti-north"),
    levelOfKey("nairobi/dagoretti-north/kileleshwa"),
  ],
  ["country", "county", "constituency", "ward"],
);

// Results are held at the constituency for now.
const HAS = new Set(["nairobi", "nairobi/dagoretti-north", "nairobi/kibra"]);
const has = (key: string) => HAS.has(key);
eq("a constituency's own results", resultsArea("nairobi/kibra", has), {
  key: "nairobi/kibra",
  inherited: false,
});
eq("a ward shows its constituency's", resultsArea("nairobi/dagoretti-north/kileleshwa", has), {
  key: "nairobi/dagoretti-north",
  inherited: true,
});
eq(
  "a ward with results of its own",
  resultsArea("nairobi/kibra/sarangombe", (k) => k === "nairobi/kibra/sarangombe"),
  {
    key: "nairobi/kibra/sarangombe",
    inherited: false,
  },
);
eq("a ward whose constituency has none", resultsArea("nairobi/langata/karen", has), null);
eq(
  "a constituency with none does not borrow the county's",
  resultsArea("nairobi/langata", has),
  null,
);

eq(
  "the label for a ward showing its constituency's",
  figureLabel(resultsArea("nairobi/kibra/sarangombe", has)),
  "constituency figure",
);
eq("no label for an area's own figures", figureLabel(resultsArea("nairobi/kibra", has)), null);
eq("no label when there is nothing", figureLabel(null), null);

// Everything a screen needs comes from one import.
eq("the public surface", Object.keys(atlas).sort(), [
  "MISSING",
  "blocShares",
  "estimateTag",
  "figureLabel",
  "fmtPoints",
  "fmtShare",
  "fmtTurnout",
  "fmtVotes",
  "lean",
  "levelOfKey",
  "margin",
  "nearestRank",
  "notYetRegistered",
  "ourShare",
  "parentKey",
  "registerFlag",
  "registerGrowth",
  "registerTag",
  "resultTag",
  "resultsArea",
  "settle",
  "swing",
  "turnoutPct",
  "validVotes",
  "votesWithinReach",
  "whatToDo",
  "youngShare",
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-scope.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@/lib' imported from .../tests/atlas-scope.test.ts`

- [ ] **Step 3: Write the scope helpers and the barrel**

Create `src/lib/atlas/scope.ts`:

```ts
// Where an atlas figure comes from. Areas are keyed by a path of slugs (nairobi,
// nairobi/dagoretti-north, nairobi/dagoretti-north/kileleshwa), so the area above and an area's
// level can be read from the key. Until polling stations give wards results of their own, a ward
// shows its constituency's figures, labelled as such. Pure.

import type { Level } from "./types";

/**
 * The key above an area: its path less the last part. A county's is the country's; the country
 * has none.
 */
export function parentKey(key: string): string | null {
  if (key === "kenya") return null;
  const i = key.lastIndexOf("/");
  return i === -1 ? "kenya" : key.slice(0, i);
}

/** An area's level, from the shape of its key. */
export function levelOfKey(key: string): Level {
  if (key === "kenya") return "country";
  const parts = key.split("/").length;
  return parts === 1 ? "county" : parts === 2 ? "constituency" : "ward";
}

/**
 * Where the results an area shows are held: its own when it has any; a ward with none shows its
 * constituency's. Nothing else borrows, so a constituency without results is simply without.
 */
export function resultsArea(
  key: string,
  has: (key: string) => boolean,
): { key: string; inherited: boolean } | null {
  if (has(key)) return { key, inherited: false };
  if (levelOfKey(key) === "ward") {
    const above = parentKey(key);
    if (above !== null && has(above)) return { key: above, inherited: true };
  }
  return null;
}

/**
 * "constituency figure" when an area shows the figures of the area above it; null when they are
 * its own.
 */
export function figureLabel(found: { key: string; inherited: boolean } | null): string | null {
  return found && found.inherited ? `${levelOfKey(found.key)} figure` : null;
}
```

Create `src/lib/atlas/index.ts`:

```ts
// The election atlas's rules, from one import: `import { whatToDo } from "@/lib/atlas"`.

export * from "./advice";
export * from "./format";
export * from "./measures";
export * from "./register";
export * from "./scope";
export * from "./types";
```

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/atlas tests/atlas-scope.test.ts && npx eslint src/lib/atlas tests/atlas-scope.test.ts`

Expected: ESLint prints nothing.

- [ ] **Step 5: Run every atlas test, and typecheck**

Run: `for t in tests/atlas-measures tests/atlas-register tests/atlas-format tests/atlas-advice tests/atlas-scope; do printf "%-28s" $t; npx -y tsx --tsconfig tsconfig.json $t.test.ts | tail -1; done`

Expected:

```
tests/atlas-measures        35 passed, 0 failed
tests/atlas-register        20 passed, 0 failed
tests/atlas-format          21 passed, 0 failed
tests/atlas-advice          41 passed, 0 failed
tests/atlas-scope           11 passed, 0 failed
```

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "src/lib/atlas|integrations/supabase/types"`

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/atlas/scope.ts src/lib/atlas/index.ts tests/atlas-scope.test.ts
git commit -m "Atlas: where a figure comes from, and one import for the rules" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Loading a county's files as an idempotent migration

**Files:**
- Create: `tests/fixtures/atlas/testland/areas.csv`, `candidates.csv`, `results.csv`, `turnout.csv`, `register.csv`, `population.csv`, `known-differences.csv`
- Create: `scripts/atlas/test_build_sql.py`
- Create: `scripts/atlas/build_sql.py`
- Create: `tests/fixtures/atlas/testland.sql` (generated, then committed as the golden file)
- Create: `tests/sql/atlas-load.test.sql`
- Create: `tests/atlas-scripts.test.ts`

**Interfaces:** Produces `build_sql.FILES` (each file's columns), `build_sql.literal(column, value)`
(blank is `null`, a number is bare, anything else is quoted text with apostrophes doubled),
`build_sql.read(directory, name)`, `build_sql.build(directory, title) -> str`,
`build_sql.main(argv)`. The command is
`python3 scripts/atlas/build_sql.py DATA_DIR "County name" [OUT_SQL]`. The fictional county
"Testland" (one county, two constituencies, two wards, three races) that later tasks test against.
`tests/atlas-scripts.test.ts` runs every `scripts/atlas/test_*.py` as part of `npm test`.

- [ ] **Step 1: Create the fictional county**

Testland cannot be mistaken for real data. It is built to exercise what real files will do: a name
with a comma and a party with quotes (`Wa Test, Jr.`, `Party "C"`), an apostrophe (`O'Test`), a blank
party, a real zero (`O'Test` has 0 votes), a turnout row with missing figures, and results that add
up (the governor's votes in the two constituencies make the county's).

`tests/fixtures/atlas/testland/areas.csv`:

```csv
key,level,name,parent,iebc_code
testland,county,Testland,kenya,901
testland/north-test,constituency,North Test,testland,9101
testland/south-test,constituency,South Test,testland,
testland/north-test/ward-one,ward,Ward One,testland/north-test,
testland/north-test/ward-two,ward,Ward Two,testland/north-test,
```

`tests/fixtures/atlas/testland/candidates.csv`:

```csv
id,election_id,seat,name,party,bloc
2022-governor/testland/a-test,2022-governor,testland,A Test,Party A,Alpha
2022-governor/testland/b-test,2022-governor,testland,B Test,Party B,Beta
2022-governor/testland/wa-test-jr,2022-governor,testland,"Wa Test, Jr.","Party ""C""",Gamma
2022-president/kenya/p-one-test,2022-president,kenya,P One Test,Party A,Alpha
2022-president/kenya/p-two-test,2022-president,kenya,P Two Test,Party B,Beta
2022-mp/testland/north-test/m-one-test,2022-mp,testland/north-test,M One Test,Party A,Alpha
2022-mp/testland/north-test/m-two-test,2022-mp,testland/north-test,M Two Test,Party B,Beta
2022-mp/testland/north-test/otest,2022-mp,testland/north-test,O'Test,,Independent
```

`tests/fixtures/atlas/testland/results.csv`:

```csv
candidate_id,area_key,votes
2022-governor/testland/a-test,testland,600
2022-governor/testland/a-test,testland/north-test,350
2022-governor/testland/a-test,testland/south-test,250
2022-governor/testland/b-test,testland,300
2022-governor/testland/b-test,testland/north-test,100
2022-governor/testland/b-test,testland/south-test,200
2022-governor/testland/wa-test-jr,testland,100
2022-governor/testland/wa-test-jr,testland/north-test,40
2022-governor/testland/wa-test-jr,testland/south-test,60
2022-president/kenya/p-one-test,testland,550
2022-president/kenya/p-one-test,testland/north-test,300
2022-president/kenya/p-one-test,testland/south-test,250
2022-president/kenya/p-two-test,testland,450
2022-president/kenya/p-two-test,testland/north-test,250
2022-president/kenya/p-two-test,testland/south-test,200
2022-mp/testland/north-test/m-one-test,testland/north-test,350
2022-mp/testland/north-test/m-two-test,testland/north-test,150
2022-mp/testland/north-test/otest,testland/north-test,0
```

`tests/fixtures/atlas/testland/turnout.csv`:

```csv
election_id,area_key,registered,cast_votes,rejected_votes,valid_votes,source,source_url
2022-governor,testland,2000,1020,20,1000,"IEBC, Governor results by constituency 2022",https://example.test/governor-2022
2022-governor,testland/north-test,1100,500,10,490,"IEBC, Governor results by constituency 2022",https://example.test/governor-2022
2022-governor,testland/south-test,900,520,10,510,"IEBC, Governor results by constituency 2022",https://example.test/governor-2022
2022-president,testland,2000,1020,20,1000,"IEBC, Presidential results by constituency 2022",https://example.test/president-2022
2022-president,testland/north-test,1100,560,10,550,"IEBC, Presidential results by constituency 2022",https://example.test/president-2022
2022-president,testland/south-test,900,460,10,450,"IEBC, Presidential results by constituency 2022",https://example.test/president-2022
2022-mp,testland/north-test,1100,510,10,500,"IEBC, MP results by constituency 2022",https://example.test/mp-2022
2017-mp,testland/north-test,1000,,,,"IEBC, MP results by constituency 2017",
```

`tests/fixtures/atlas/testland/register.csv`:

```csv
year,area_key,registered,source,source_url
2017,testland/north-test/ward-one,550,"IEBC, Registered voters by ward 2017",https://example.test/register-2017
2022,testland,2000,"IEBC, Registered voters by ward 2022",https://example.test/register-2022
2022,testland/north-test,1100,"IEBC, Registered voters by ward 2022",https://example.test/register-2022
2022,testland/south-test,900,"IEBC, Registered voters by ward 2022",https://example.test/register-2022
2022,testland/north-test/ward-one,600,"IEBC, Registered voters by ward 2022",https://example.test/register-2022
2022,testland/north-test/ward-two,500,"IEBC, Registered voters by ward 2022",https://example.test/register-2022
```

`tests/fixtures/atlas/testland/population.csv`:

```csv
area_key,year,total,adults,young_adults,source,method
testland/north-test/ward-one,2025,1500,900,400,"WorldPop, Age and sex structures (test)",Test estimate from the age-and-sex grid
testland/north-test/ward-two,2025,1300,800,350,"WorldPop, Age and sex structures (test)",Test estimate from the age-and-sex grid
```

`tests/fixtures/atlas/testland/known-differences.csv` (header only: Testland has none):

```csv
check,election_id,area_key,candidate_id,difference,reason
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/atlas/test_build_sql.py`:

```python
"""Tests for build_sql.py: how values become SQL, that a county's files build the golden file,
and that bad files are refused. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import shutil
import tempfile
import unittest
from pathlib import Path

import build_sql

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "atlas" / "testland"
GOLDEN = ROOT / "tests" / "fixtures" / "atlas" / "testland.sql"


class Literals(unittest.TestCase):
    def test_text_is_quoted_and_apostrophes_doubled(self):
        self.assertEqual(build_sql.literal("name", "O'Test"), "'O''Test'")

    def test_blank_is_null(self):
        self.assertEqual(build_sql.literal("party", ""), "null")
        self.assertEqual(build_sql.literal("votes", ""), "null")

    def test_numbers_are_bare(self):
        self.assertEqual(build_sql.literal("votes", "0"), "0")
        self.assertEqual(build_sql.literal("votes", "1200"), "1200")

    def test_a_number_with_a_separator_is_refused(self):
        with self.assertRaises(ValueError):
            build_sql.literal("votes", "1,200")

    def test_text_that_looks_like_a_number_stays_text(self):
        self.assertEqual(build_sql.literal("iebc_code", "047"), "'047'")


class Build(unittest.TestCase):
    def test_the_fixture_builds_the_golden_file(self):
        self.assertEqual(build_sql.build(FIXTURE, "Testland"), GOLDEN.read_text())

    def test_building_twice_gives_the_same_text(self):
        self.assertEqual(build_sql.build(FIXTURE, "Testland"), build_sql.build(FIXTURE, "Testland"))

    def test_every_table_is_an_upsert(self):
        sql = build_sql.build(FIXTURE, "Testland")
        for table in (
            "atlas_areas",
            "atlas_candidates",
            "atlas_results",
            "atlas_turnout",
            "atlas_register",
            "atlas_population",
        ):
            self.assertIn(f"insert into public.{table} ", sql)
        self.assertEqual(sql.count("insert into "), sql.count("on conflict "))

    def test_parents_come_before_children(self):
        sql = build_sql.build(FIXTURE, "Testland")
        county = sql.index("'testland', 'county'")
        constituency = sql.index("'testland/north-test', 'constituency'")
        ward = sql.index("'testland/north-test/ward-one', 'ward'")
        self.assertLess(county, constituency)
        self.assertLess(constituency, ward)

    def test_a_large_table_is_split_into_several_statements(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "testland"
            shutil.copytree(FIXTURE, copy)
            rows = "".join(f"2022-governor/testland/a-test,testland/north-test/w{i},{i}\n" for i in range(450))
            (copy / "results.csv").write_text("candidate_id,area_key,votes\n" + rows)
            sql = build_sql.build(copy, "Testland")
            self.assertEqual(sql.count("insert into public.atlas_results "), 3)


class Refusals(unittest.TestCase):
    def copy_fixture(self, tmp):
        copy = Path(tmp) / "testland"
        shutil.copytree(FIXTURE, copy)
        return copy

    def test_wrong_columns_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text("candidate,area,votes\nx,y,1\n")
            with self.assertRaisesRegex(ValueError, "results.csv: the columns must be"):
                build_sql.build(copy, "Testland")

    def test_a_missing_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "register.csv").unlink()
            with self.assertRaisesRegex(ValueError, "register.csv is missing"):
                build_sql.build(copy, "Testland")

    def test_a_short_row_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text("candidate_id,area_key,votes\n2022-governor/testland/a-test,testland\n")
            with self.assertRaisesRegex(ValueError, "results.csv row 2: 2 cells, expected 3"):
                build_sql.build(copy, "Testland")

    def test_a_number_that_is_not_a_number_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = self.copy_fixture(tmp)
            (copy / "results.csv").write_text(
                "candidate_id,area_key,votes\n2022-governor/testland/a-test,testland,6OO\n"
            )
            with self.assertRaisesRegex(ValueError, "results.csv row 2"):
                build_sql.build(copy, "Testland")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run them and watch them fail**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_build_sql.py"`

Expected: `ModuleNotFoundError: No module named 'build_sql'` and `FAILED (errors=1)`.

- [ ] **Step 4: Write the loader**

Create `scripts/atlas/build_sql.py`. It checks only that the files can be read (the right columns,
whole numbers where numbers belong); that they add up is Task 8's job. Areas load a depth at a time,
so a parent is always in before its children; rows go in key order, so the same files always build
the same text.

```python
"""Turns one county's atlas files into a migration of idempotent upserts.

Usage:
  python3 scripts/atlas/build_sql.py DATA_DIR "County name" [OUT_SQL]

DATA_DIR holds areas.csv, candidates.csv, results.csv, turnout.csv, register.csv and
population.csv (the columns of each are in FILES below). The SQL goes to OUT_SQL, or to the
screen. Every statement upserts, so running the migration again changes nothing, and each
county is one more migration, applied before the code that needs it.

This only checks that the files can be read: the right columns, and whole numbers where
numbers belong. That what they say adds up is tests/atlas-data.test.ts's job.
"""
import csv
import re
import sys
from pathlib import Path

# The files, in the order they load, with their columns. scripts/atlas/checks.ts has the same
# lists; tests/atlas-scripts.test.ts fails if the two ever differ.
FILES = {
    "areas": ["key", "level", "name", "parent", "iebc_code"],
    "candidates": ["id", "election_id", "seat", "name", "party", "bloc"],
    "results": ["candidate_id", "area_key", "votes"],
    "turnout": [
        "election_id",
        "area_key",
        "registered",
        "cast_votes",
        "rejected_votes",
        "valid_votes",
        "source",
        "source_url",
    ],
    "register": ["year", "area_key", "registered", "source", "source_url"],
    "population": ["area_key", "year", "total", "adults", "young_adults", "source", "method"],
}

# Each file's table, and the columns that make a row unique: what an upsert matches on.
TABLES = {
    "areas": ("atlas_areas", ["key"]),
    "candidates": ("atlas_candidates", ["id"]),
    "results": ("atlas_results", ["candidate_id", "area_key"]),
    "turnout": ("atlas_turnout", ["election_id", "area_key"]),
    "register": ("atlas_register", ["year", "area_key"]),
    "population": ("atlas_population", ["area_key", "year"]),
}

NUMBERS = {
    "votes",
    "registered",
    "cast_votes",
    "rejected_votes",
    "valid_votes",
    "year",
    "total",
    "adults",
    "young_adults",
}

# Rows per insert, so a county's results are several statements and not one huge one.
CHUNK = 200


def literal(column, value):
    """One cell as SQL: blank is null, a number is bare, anything else is quoted text."""
    if value == "":
        return "null"
    if column in NUMBERS:
        if not re.fullmatch(r"\d+", value):
            raise ValueError(f"{column} must be a whole number, not {value!r}")
        return value
    return "'" + value.replace("'", "''") + "'"


def read(directory, name):
    """A file's rows as dicts, each with the line it came from in "_row"."""
    path = Path(directory) / f"{name}.csv"
    if not path.exists():
        raise ValueError(f"{path.name} is missing")
    with path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    want = FILES[name]
    if not rows or rows[0] != want:
        found = ",".join(rows[0]) if rows else "nothing"
        raise ValueError(f"{path.name}: the columns must be {','.join(want)}; found {found}")
    out = []
    for n, cells in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in cells):
            continue
        if len(cells) != len(want):
            raise ValueError(f"{path.name} row {n}: {len(cells)} cells, expected {len(want)}")
        row = dict(zip(want, cells))
        row["_row"] = n
        out.append(row)
    return out


def sort_key(name):
    """Rows go in the order of their keys, so the same files always build the same text."""
    if name == "areas":
        return lambda r: (r["key"].count("/"), r["key"])
    return lambda r: tuple(r[c] for c in TABLES[name][1])


def upserts(name, rows):
    """The insert statements for one file: parents first for areas, CHUNK rows at a time."""
    table, key = TABLES[name]
    columns = FILES[name]
    sets = ", ".join(f"{c} = excluded.{c}" for c in columns if c not in key)
    if name == "areas":
        by_depth = {}
        for r in rows:
            by_depth.setdefault(r["key"].count("/"), []).append(r)
        groups = [by_depth[depth] for depth in sorted(by_depth)]
    else:
        groups = [rows]
    out = []
    for group in groups:
        for i in range(0, len(group), CHUNK):
            lines = []
            for r in group[i : i + CHUNK]:
                try:
                    cells = [literal(c, r[c]) for c in columns]
                except ValueError as e:
                    raise ValueError(f"{name}.csv row {r['_row']}: {e}") from None
                lines.append("  (" + ", ".join(cells) + ")")
            out.append(
                f"insert into public.{table} ({', '.join(columns)}) values\n"
                + ",\n".join(lines)
                + f"\non conflict ({', '.join(key)}) do update set {sets};\n"
            )
    return out


def build(directory, title):
    """The whole migration for one county's files."""
    directory = Path(directory)
    title = re.sub(r"\s+", " ", title).strip()
    folder = re.sub(r"\s+", " ", directory.name)
    parts = [
        f'-- Election atlas: {title}. Generated by scripts/atlas/build_sql.py from the files in "{folder}".\n'
        "-- Do not edit by hand: change the files and build it again. Every statement upserts,\n"
        "-- so running it again changes nothing.\n"
    ]
    for name in FILES:
        rows = read(directory, name)
        rows.sort(key=sort_key(name))
        if rows:
            parts.append(f"\n-- {TABLES[name][0]}: {len(rows)} rows\n")
            parts.extend(upserts(name, rows))
    return "".join(parts)


def main(argv):
    if len(argv) not in (3, 4):
        raise SystemExit(__doc__)
    try:
        sql = build(argv[1], argv[2])
    except ValueError as e:
        raise SystemExit(f"{argv[1]}: {e}")
    if len(argv) == 4:
        Path(argv[3]).write_text(sql)
    else:
        sys.stdout.write(sql)


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 5: Run the tests: only the golden-file test fails**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_build_sql.py" 2>&1 | tail -5`

Expected: `Ran 14 tests` and `FAILED (errors=1)`, the error being
`FileNotFoundError: ... tests/fixtures/atlas/testland.sql`. Every other test passes.

- [ ] **Step 6: Generate the golden file, and read it**

Run: `python3 scripts/atlas/build_sql.py tests/fixtures/atlas/testland Testland tests/fixtures/atlas/testland.sql`

Read the file. It should be 78 lines and open with:

```
-- Election atlas: Testland. Generated by scripts/atlas/build_sql.py from the files in "testland".
-- Do not edit by hand: change the files and build it again. Every statement upserts,
-- so running it again changes nothing.

-- atlas_areas: 5 rows
insert into public.atlas_areas (key, level, name, parent, iebc_code) values
  ('testland', 'county', 'Testland', 'kenya', '901')
on conflict (key) do update set level = excluded.level, name = excluded.name, parent = excluded.parent, iebc_code = excluded.iebc_code;
```

Check the awkward values came through:

Run: `grep -n "O''Test\|Party \"C\"" tests/fixtures/atlas/testland.sql | cut -c1-140`

Expected:

```
22:  ('2022-governor/testland/wa-test-jr', '2022-governor', 'testland', 'Wa Test, Jr.', 'Party "C"', 'Gamma'),
25:  ('2022-mp/testland/north-test/otest', '2022-mp', 'testland/north-test', 'O''Test', null, 'Independent'),
```

Run: `sha256sum tests/fixtures/atlas/testland.sql`

Expected: `298ac28e9540600339b9af5ef3e2e374e66e31369b38e307741451b705e83044`

- [ ] **Step 7: Run the Python tests: all pass**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_*.py" 2>&1 | tail -4`

Expected: `Ran 14 tests` and `OK`.

- [ ] **Step 8: Write the SQL load test, and run the suite**

The golden file is applied to a real database: it reads back as the files say, applying it again
changes nothing, and applying it again puts back a figure someone changed.

Create `tests/sql/atlas-load.test.sql`:

```sql
-- Loading a county's atlas files: the SQL scripts/atlas/build_sql.py builds from the fictional
-- Testland files (tests/fixtures/atlas/testland.sql) applies, reads back as the files say,
-- applies again without changing anything, and puts back a figure someone changed. Run with
-- tests/sql/run.sh; each test rolls back.

-- test: a county's files load and read back as they were written
begin;
\ir ../fixtures/atlas/testland.sql
do $$ begin
  assert (select count(*) from public.atlas_areas where key like 'testland%') = 5, 'areas';
  assert (select count(*) from public.atlas_candidates where seat like 'testland%' or seat = 'kenya') = 8, 'candidates';
  assert (select count(*) from public.atlas_results) = 18, 'results';
  assert (select count(*) from public.atlas_turnout) = 8, 'turnout';
  assert (select count(*) from public.atlas_register) = 6, 'registers';
  assert (select count(*) from public.atlas_population) = 2, 'population';
  assert (select parent from public.atlas_areas where key = 'testland/north-test/ward-one') = 'testland/north-test', 'a ward''s parent';
  assert (select iebc_code from public.atlas_areas where key = 'testland') = '901', 'a code is kept as text';
  assert (select iebc_code from public.atlas_areas where key = 'testland/south-test') is null, 'a blank code is null';
  assert (select name from public.atlas_candidates where id = '2022-governor/testland/wa-test-jr') = 'Wa Test, Jr.', 'a comma in a name';
  assert (select party from public.atlas_candidates where id = '2022-governor/testland/wa-test-jr') = 'Party "C"', 'quotes in a party';
  assert (select name from public.atlas_candidates where id = '2022-mp/testland/north-test/otest') = 'O''Test', 'an apostrophe in a name';
  assert (select party from public.atlas_candidates where id = '2022-mp/testland/north-test/otest') is null, 'a blank party is null';
  assert (select votes from public.atlas_results where candidate_id = '2022-mp/testland/north-test/otest') = 0, 'a real zero is kept';
  assert (select cast_votes from public.atlas_turnout where election_id = '2017-mp') is null, 'a missing figure stays missing';
  assert (select registered from public.atlas_turnout where election_id = '2017-mp') = 1000, 'and the one given is kept';
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
```

Run: `runuser -u nobody -- env PATH="/usr/lib/postgresql/16/bin:$PATH" HOME=/tmp bash tests/sql/run.sh 2>&1 | cut -c1-120`

Expected: every line `ok`, including `ok   tests/sql/atlas-load.test.sql (3 tests)`; 13 test files.

- [ ] **Step 9: Run the Python tests from `npm test`**

Create `tests/atlas-scripts.test.ts`:

```ts
// Runs the Python unit tests for the atlas scripts (scripts/atlas/test_*.py) as part of
// `npm test`. Skips, as the SQL tests do, when there is no python3. ATLAS_PYTHON names another
// interpreter: the ward population test needs one with rasterio and numpy installed,
// and skips itself without. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-scripts.test.ts

import { spawnSync } from "node:child_process";

const python = process.env["ATLAS_PYTHON"] ?? "python3";
const probe = spawnSync(python, ["--version"], { encoding: "utf8" });
if (probe.error) {
  console.log(`SKIP: ${python} not found. Install Python 3 to run the atlas script tests.`);
  process.exit(0);
}

const run = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "scripts/atlas", "-p", "test_*.py"],
  { encoding: "utf8" },
);
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
console.log(run.status === 0 ? "atlas script tests passed" : "atlas script tests failed");
process.exit(run.status ?? 1);
```

Run: `npx prettier --write tests/atlas-scripts.test.ts && npx eslint tests/atlas-scripts.test.ts && npx -y tsx --tsconfig tsconfig.json tests/atlas-scripts.test.ts | tail -3`

Expected: ESLint prints nothing; the last lines are `OK` and `atlas script tests passed`.

- [ ] **Step 10: Commit**

```bash
git add tests/fixtures/atlas scripts/atlas/build_sql.py scripts/atlas/test_build_sql.py tests/sql/atlas-load.test.sql tests/atlas-scripts.test.ts
git commit -m "Atlas: load a county's files as an idempotent migration" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: The slug rule and the data checks

**Files:**
- Create: `tests/fixtures/atlas/slug-cases.csv`
- Create: `scripts/atlas/test_slug.py`
- Create: `scripts/atlas/slug.py`
- Create: `tests/fixtures/atlas/blocs.csv`
- Create: `tests/atlas-data.test.ts`
- Create: `scripts/atlas/checks.ts`

**Interfaces:** Produces `slug.slugify(name) -> str` (Python) and `slugify(name: string): string`
(TypeScript): the name lower-cased, accents and other non-ASCII dropped, `'`, `` ` `` and `.`
dropped, every other run of non-letters a hyphen (`Lang'ata` is `langata`). Both run the cases in
`tests/fixtures/atlas/slug-cases.csv`, so they cannot drift apart. In `checks.ts`:
`COLUMNS` (each file's columns), `type Row`, `type County`, `type WardMaps` (ward slug to its
constituency's slug, or null where the map names none), `type Blocs`,
`loadCounty(dir): County`, `listCounties(root): string[]`, `loadWardMaps(geoDir): WardMaps`,
`loadBlocs(path): Row[]`, `blocMap(rows): Blocs`, `checkBlocs(rows): string[]`,
`checkCounty(c: County, wards: WardMaps, blocs: Blocs): string[]` (what is wrong, one sentence each;
empty when the files pass), `slugify`.

What `checkCounty` refuses: the spec's six (a county's constituencies that do not add up to the
county's, for president and governor, beyond a difference recorded in `known-differences.csv`; a
share over 100%, which is candidates' votes past the valid votes; cast past registered; valid plus
rejected differing from cast when all three are given; an area whose parent is not in the files; a
ward whose slug is not in a ward map under `public/geo`), and the things those need to mean
anything: no row listed twice, every key and level and parent and seat well formed, a candidate's id
being `<election>/<seat>/<slug of the name>`, a result inside its candidate's seat, every
`source` reading "Publisher, document title", `source_url` being https or blank, population parts
that nest (young adults within adults within the total), and a candidate's bloc being the one
`blocs.csv` records for their party in that election (else the party itself; an independent stands
as `Independent`). A recorded difference must say why, and is refused once nothing needs it.

- [ ] **Step 1: Write the slug cases and the failing Python test**

`tests/fixtures/atlas/slug-cases.csv`:

```csv
name,slug
Dagoretti North,dagoretti-north
Lang'ata,langata
Karatina Town,karatina-town
Ng'ang'a,nganga
"Wa Test, Jr.",wa-test-jr
Mũrĩithi,muriithi
O'Connor-Smith,oconnor-smith
"  Spaces  ",spaces
A & B,a-b
St. Paul's,st-pauls
Ward 7,ward-7
Embakasi East,embakasi-east
```

`scripts/atlas/test_slug.py`:

```python
"""Tests for slug.py, against the cases tests/fixtures/atlas/slug-cases.csv shares with
scripts/atlas/checks.ts. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import csv
import re
import unittest
from pathlib import Path

import slug

CASES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "atlas" / "slug-cases.csv"


def cases():
    with CASES.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


class Slugs(unittest.TestCase):
    def test_every_shared_case(self):
        for row in cases():
            with self.subTest(name=row["name"]):
                self.assertEqual(slug.slugify(row["name"]), row["slug"])

    def test_a_slug_is_a_part_of_a_key(self):
        for row in cases():
            self.assertRegex(slug.slugify(row["name"]), r"^[a-z0-9]+(-[a-z0-9]+)*$")

    def test_nothing_is_left_to_slugify_twice(self):
        for row in cases():
            self.assertEqual(slug.slugify(row["slug"]), row["slug"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_slug.py"`

Expected: `ModuleNotFoundError: No module named 'slug'` and `FAILED (errors=1)`.

- [ ] **Step 3: Write the Python slug rule**

Create `scripts/atlas/slug.py`:

```python
"""The slug rule: how a place's or a candidate's name becomes a part of a key.

The name lower-cased, spaces as hyphens, punctuation dropped: "Lang'ata" becomes "langata".
Accents are dropped, not spelled out: "Mũrĩithi" becomes "muriithi". scripts/atlas/checks.ts
has the same rule in TypeScript; both run the cases in tests/fixtures/atlas/slug-cases.csv, so
the two cannot drift apart.
"""
import re
import unicodedata


def slugify(name):
    ascii_only = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    without_marks = re.sub(r"['`.]", "", ascii_only.lower())
    return re.sub(r"[^a-z0-9]+", "-", without_marks).strip("-")
```

- [ ] **Step 4: Run all the Python tests**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_*.py" 2>&1 | tail -3`

Expected: `Ran 17 tests` and `OK`.

- [ ] **Step 5: Write the fixture's blocs, and the failing data tests**

`tests/fixtures/atlas/blocs.csv` (Testland's coalitions; the real file lives at `data/atlas/blocs.csv`):

```csv
year,party,bloc,source,source_url
2022,Party A,Alpha,"Registrar, Test coalition list",https://example.test/coalitions
2022,Party B,Beta,"Registrar, Test coalition list",https://example.test/coalitions
2022,"Party ""C""",Gamma,"Registrar, Test coalition list",https://example.test/coalitions
```

`tests/atlas-data.test.ts` runs the checker on the fixture and on every county under `data/atlas`
(none yet, so those cases pass for now), breaks the fixture one way at a time to prove each check
fires, reads the real ward maps, runs the shared slug cases, and compares the files' columns with
`build_sql.py`'s (it skips that one case when there is no Python):

```ts
// Checks for the election atlas's data files: that every county under data/atlas adds up, and
// that the checker itself catches each thing it is meant to. The fictional Testland files in
// tests/fixtures/atlas pass; each case below breaks them one way and expects that complaint.
// Pure apart from reading files. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCSV } from "../src/lib/csv";
import {
  COLUMNS,
  blocMap,
  checkBlocs,
  checkCounty,
  listCounties,
  loadBlocs,
  loadCounty,
  loadWardMaps,
  slugify,
  type Blocs,
  type County,
  type Row,
  type WardMaps,
} from "../scripts/atlas/checks";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const FIXTURE = "tests/fixtures/atlas/testland";
const MAPS: WardMaps = new Map([
  ["ward-one", "north-test"],
  ["ward-two", "north-test"],
]);
const good = loadCounty(FIXTURE);
const BLOCS: Blocs = blocMap(loadBlocs("tests/fixtures/atlas/blocs.csv"));

/** The checker's answer for a county, with the fixture's ward maps and blocs unless given. */
const check = (c: County, maps: WardMaps = MAPS, blocs: Blocs = BLOCS) =>
  checkCounty(c, maps, blocs);

/** The row of `rows` with these cell values. */
function find(rows: Row[], where: Row): Row {
  const hit = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  if (!hit) throw new Error(`no row like ${JSON.stringify(where)}`);
  return hit;
}
/** Sets one cell of the row of `rows` with these cell values. */
function set(rows: Row[], where: Row, cell: string, value: string) {
  find(rows, where)[cell] = value;
}
/** What the checker says about the fixture after `edit` has broken it. */
function broken(edit: (c: County) => void, maps: WardMaps = MAPS): string[] {
  const c = structuredClone(good);
  edit(c);
  return check(c, maps);
}
/** True when some complaint contains `text`. */
const says = (problems: string[], text: string) => problems.some((p) => p.includes(text));
/** What `says` ought to answer, with the case's name. */
const flags = (name: string, problems: string[], text: string) =>
  eq(name, says(problems, text) ? text : problems, text);

eq("the fixture county passes", check(good), []);

// Constituencies add up to the county's, for president and governor; an MP race has no county
// total.
const P1 = "2022-president/kenya/p-one-test";
const lowNorth = (c: County) =>
  set(c.results, { candidate_id: P1, area_key: "testland/north-test" }, "votes", "299");
eq("constituencies short of the county", broken(lowNorth), [
  `${P1}: its constituencies add up to 549 but testland says 550`,
]);
const closes = {
  check: "county_sum",
  election_id: "",
  area_key: "testland",
  candidate_id: P1,
  difference: "1",
  reason: "IEBC's own constituency and county figures differ",
};
eq(
  "a recorded difference closes the gap",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes });
  }),
  [],
);
flags(
  "a recorded difference of the wrong size does not",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes, difference: "2" });
  }),
  "the recorded difference of 2 does not close it",
);
flags(
  "a recorded difference nothing needs is stale",
  broken((c) => c.knownDifferences.push({ ...closes })),
  "no longer matches anything",
);
flags(
  "a recorded difference with no reason is refused",
  broken((c) => c.knownDifferences.push({ ...closes, reason: "" })),
  "say why",
);

// Turnout.
const SOUTH_GOV = { election_id: "2022-governor", area_key: "testland/south-test" };
const NORTH_GOV = { election_id: "2022-governor", area_key: "testland/north-test" };
flags(
  "more cast than registered",
  broken((c) => set(c.turnout, SOUTH_GOV, "cast_votes", "901")),
  "more votes cast than registered (901 against 900)",
);
const extraRejected = (c: County) => set(c.turnout, NORTH_GOV, "rejected_votes", "11");
flags(
  "valid plus rejected differs from cast",
  broken(extraRejected),
  "valid plus rejected (501) differs from cast (500)",
);
eq(
  "a recorded cast difference closes it",
  broken((c) => {
    extraRejected(c);
    c.knownDifferences.push({
      check: "cast_split",
      election_id: "2022-governor",
      area_key: "testland/north-test",
      candidate_id: "",
      difference: "-1",
      reason: "IEBC's own valid and rejected figures differ",
    });
  }),
  [],
);
flags(
  "a share over 100%",
  broken((c) =>
    set(
      c.results,
      { candidate_id: "2022-governor/testland/a-test", area_key: "testland/north-test" },
      "votes",
      "600",
    ),
  ),
  "a share over 100%",
);
flags(
  "a source with no publisher",
  broken((c) => set(c.turnout, SOUTH_GOV, "source", "no publisher here")),
  'must read "Publisher, document title"',
);
flags(
  "a plain http link",
  broken((c) => set(c.turnout, SOUTH_GOV, "source_url", "http://example.test/a")),
  "must be an https link",
);

// Areas, parents and ward maps.
flags(
  "a parent that is not there",
  broken((c) => {
    c.areas = c.areas.filter((a) => a["key"] !== "testland/north-test");
  }),
  "the parent testland/north-test is not in the files",
);
flags(
  "a parent that is the wrong one",
  broken((c) =>
    set(c.areas, { key: "testland/north-test/ward-one" }, "parent", "testland/ghost-test"),
  ),
  "parent should be testland/north-test, not testland/ghost-test",
);
flags(
  "a level that is wrong for the key",
  broken((c) => set(c.areas, { key: "testland/south-test" }, "level", "ward")),
  "is a constituency, but the file says ward",
);
flags(
  "a ward missing from the ward maps",
  check(good, new Map([["ward-one", "north-test"]])),
  "testland/north-test/ward-two is not in a ward map",
);
flags(
  "a ward the map puts in another constituency",
  check(
    good,
    new Map([
      ["ward-one", "south-test"],
      ["ward-two", "north-test"],
    ]),
  ),
  "the ward map says ward-one belongs to south-test",
);
eq(
  "a ward map that names no constituency accepts the file's",
  check(
    good,
    new Map([
      ["ward-one", null],
      ["ward-two", null],
    ]),
  ),
  [],
);
flags(
  "kenya stays out of the files",
  broken((c) =>
    c.areas.push({ key: "kenya", level: "country", name: "Kenya", parent: "", iebc_code: "" }),
  ),
  "kenya is added by the schema",
);

// Blocs: one party, one bloc, in an election, as blocs.csv records it. A party with none recorded
// stands as itself, and an independent (no party) as "Independent".
flags(
  "a bloc that is not the one recorded",
  broken((c) => set(c.candidates, { name: "A Test" }, "bloc", "Beta")),
  "the bloc should be Alpha, not Beta",
);
flags(
  "a party with no recorded bloc stands as itself",
  check(good, MAPS, new Map()),
  "the bloc should be Party A, not Alpha",
);
flags(
  "an independent stands as Independent",
  broken((c) => set(c.candidates, { name: "O'Test" }, "bloc", "Alpha")),
  "the bloc should be Independent, not Alpha",
);
const blocRows = loadBlocs("tests/fixtures/atlas/blocs.csv");
const listed = { source: "Registrar, Test coalition list", source_url: "" };
eq("the fixture's blocs pass", checkBlocs(blocRows), []);
flags(
  "a bloc for a year with no election",
  checkBlocs([...blocRows, { year: "2019", party: "Party A", bloc: "Alpha", ...listed }]),
  "2019 is not an election year",
);
flags(
  "a party in two blocs in one election",
  checkBlocs([...blocRows, { year: "2022", party: "Party A", bloc: "Beta", ...listed }]),
  "is listed twice",
);
flags(
  "a bloc with no source",
  checkBlocs([
    { year: "2022", party: "Party A", bloc: "Alpha", source: "no publisher", source_url: "" },
  ]),
  'must read "Publisher, document title"',
);
flags(
  "a bloc with no name",
  checkBlocs([{ year: "2022", party: "Party A", bloc: "", ...listed }]),
  "needs a bloc",
);
eq("no blocs file, no blocs", loadBlocs("tests/fixtures/atlas/nowhere.csv"), []);

// Candidates and their results.
flags(
  "a candidate id that is not election, seat and name",
  broken((c) => set(c.candidates, { name: "A Test" }, "id", "2022-governor/testland/atest")),
  "the id should be 2022-governor/testland/a-test",
);
flags(
  "an election the atlas does not hold",
  broken((c) => set(c.candidates, { name: "A Test" }, "election_id", "2021-governor")),
  "2021-governor is not an election the atlas holds",
);
flags(
  "a seat of the wrong level for the race",
  broken((c) => set(c.candidates, { name: "A Test" }, "seat", "testland/north-test")),
  "a governor seat is a county",
);
flags(
  "votes in an area outside the seat",
  broken((c) =>
    set(
      c.results,
      { candidate_id: "2022-mp/testland/north-test/m-one-test" },
      "area_key",
      "testland/south-test",
    ),
  ),
  "testland/south-test is outside the seat testland/north-test",
);
flags(
  "votes for a candidate nobody lists",
  broken((c) =>
    set(
      c.results,
      { candidate_id: P1, area_key: "testland" },
      "candidate_id",
      "2022-governor/testland/nobody",
    ),
  ),
  "is not in candidates.csv",
);
flags(
  "votes that are not a number",
  broken((c) => set(c.results, { candidate_id: P1, area_key: "testland" }, "votes", "6OO")),
  'votes must be a whole number, not "6OO"',
);
flags(
  "a row listed twice",
  broken((c) => c.results.push({ ...find(c.results, { candidate_id: P1, area_key: "testland" }) })),
  "is listed twice",
);

// Registers and population.
flags(
  "a register for a year with no election",
  broken((c) => set(c.register, { year: "2017" }, "year", "2019")),
  "2019 is not an election year",
);
const WARD_ONE = { area_key: "testland/north-test/ward-one" };
flags(
  "more young adults than adults",
  broken((c) => set(c.population, WARD_ONE, "young_adults", "901")),
  "young adults (901) pass the adults (900)",
);
flags(
  "more adults than people",
  broken((c) => set(c.population, WARD_ONE, "adults", "1501")),
  "adults (1501) pass the total (1500)",
);

// Reading the files.
function refusal(dir: string): string {
  try {
    loadCounty(dir);
    return "";
  } catch (e) {
    return String(e);
  }
}
const tmp = mkdtempSync(join(tmpdir(), "atlas-data-"));
try {
  const copy = (name: string) => {
    const dir = join(tmp, name);
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  };
  const wrong = copy("wrong");
  writeFileSync(join(wrong, "results.csv"), "candidate,area,votes\nx,y,1\n");
  eq(
    "wrong columns are refused",
    refusal(wrong).includes("results.csv: the columns must be candidate_id,area_key,votes"),
    true,
  );
  const short = copy("short");
  writeFileSync(
    join(short, "results.csv"),
    "candidate_id,area_key,votes\n2022-governor/testland/a-test,testland\n",
  );
  eq(
    "a short row is refused",
    refusal(short).includes("results.csv row 2: 2 cells, expected 3"),
    true,
  );
  const missing = copy("missing");
  rmSync(join(missing, "register.csv"));
  eq("a missing file is refused", refusal(missing).includes("register.csv is missing"), true);
  const plain = copy("plain");
  rmSync(join(plain, "known-differences.csv"));
  eq("recorded differences are optional", loadCounty(plain).knownDifferences, []);
  writeFileSync(join(tmp, "blocs.csv"), "year,party,coalition\n2022,Party A,Alpha\n");
  let blocsRefusal = "";
  try {
    loadBlocs(join(tmp, "blocs.csv"));
  } catch (e) {
    blocsRefusal = String(e);
  }
  eq(
    "wrong columns in blocs.csv are refused",
    blocsRefusal.includes("blocs.csv: the columns must be year,party,bloc,source,source_url"),
    true,
  );

  // Which folders are counties.
  const root = join(tmp, "root");
  mkdirSync(join(root, "nairobi"), { recursive: true });
  mkdirSync(join(root, "_sources"), { recursive: true });
  writeFileSync(join(root, "SOURCES.md"), "x");
  eq("counties are the folders not starting with an underscore", listCounties(root), ["nairobi"]);
  eq("no data folder, no counties", listCounties(join(tmp, "nowhere")), []);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// The ward maps under public/geo.
const real = loadWardMaps("public/geo");
eq("the ward maps hold Nairobi's 85 wards and Mathira's 6", real.size, 91);
eq("a Nairobi ward knows its constituency", real.get("umoja-ii"), "embakasi-west");
eq("Mathira's map names no constituency", real.get("iriaini"), null);

// Every county in data/atlas passes, and so does the blocs file they share.
const realBlocRows = loadBlocs("data/atlas/blocs.csv");
const blocProblems = checkBlocs(realBlocRows);
if (blocProblems.length) console.log(`blocs.csv:\n  ${blocProblems.join("\n  ")}`);
eq("data/atlas/blocs.csv passes", blocProblems, []);
for (const name of listCounties("data/atlas")) {
  const problems = checkCounty(loadCounty(join("data/atlas", name)), real, blocMap(realBlocRows));
  if (problems.length) console.log(`${name}:\n  ${problems.join("\n  ")}`);
  eq(`data/atlas/${name} passes`, problems, []);
}

// The slug rule is the one scripts/atlas/slug.py runs.
const cases = parseCSV(readFileSync("tests/fixtures/atlas/slug-cases.csv", "utf8")).slice(1);
eq("there are slug cases", cases.length > 0, true);
for (const [name, slug] of cases) eq(`the slug of "${name}"`, slugify(name ?? ""), slug);

// The files and columns are the ones scripts/atlas/build_sql.py loads.
const python = process.env["ATLAS_PYTHON"] ?? "python3";
const asked = spawnSync(
  python,
  [
    "-c",
    "import json, sys; sys.path.insert(0, 'scripts/atlas'); import build_sql; print(json.dumps(build_sql.FILES))",
  ],
  { encoding: "utf8" },
);
if (asked.error || asked.status !== 0) {
  console.log(`SKIP: ${python} could not say which columns build_sql.py loads.`);
} else {
  const loaded = Object.fromEntries(
    Object.entries(COLUMNS).filter(([file]) => file !== "known-differences"),
  );
  eq("the columns match build_sql.py's", JSON.parse(asked.stdout), loaded);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-data.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/atlas/checks' imported from .../tests/atlas-data.test.ts`

- [ ] **Step 7: Write the checker**

Create `scripts/atlas/checks.ts`. It reads files with the repository's own `parseCSV`
(`src/lib/csv.ts`) and the area rules from `src/lib/atlas/scope.ts`, so a key means one thing
everywhere.

```ts
// The checks every county's atlas files must pass before they become a migration, and the readers
// that load them. `checkCounty` takes the parsed files and says, in a sentence each, what is
// wrong; tests/atlas-data.test.ts runs it on every county under data/atlas. A recorded difference
// (known-differences.csv) is how a county keeps an inconsistency IEBC itself published: it must
// say why, and it is refused once nothing needs it any more. blocs.csv records, for each election,
// which coalition (bloc) each party stood in, so a coalition has one name in every county.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { levelOfKey, parentKey } from "../../src/lib/atlas/scope";
import { parseCSV } from "../../src/lib/csv";

export type Row = Record<string, string>;

/** The files and their columns. scripts/atlas/build_sql.py loads the same first six. */
export const COLUMNS = {
  areas: ["key", "level", "name", "parent", "iebc_code"],
  candidates: ["id", "election_id", "seat", "name", "party", "bloc"],
  results: ["candidate_id", "area_key", "votes"],
  turnout: [
    "election_id",
    "area_key",
    "registered",
    "cast_votes",
    "rejected_votes",
    "valid_votes",
    "source",
    "source_url",
  ],
  register: ["year", "area_key", "registered", "source", "source_url"],
  population: ["area_key", "year", "total", "adults", "young_adults", "source", "method"],
  "known-differences": ["check", "election_id", "area_key", "candidate_id", "difference", "reason"],
} as const;

export type County = {
  areas: Row[];
  candidates: Row[];
  results: Row[];
  turnout: Row[];
  register: Row[];
  population: Row[];
  knownDifferences: Row[];
};

/**
 * Every ward slug in the ward maps under public/geo, and the slug of the constituency the map
 * puts it in; null when the map names none (Mathira's does not).
 */
export type WardMaps = Map<string, string | null>;

/** `${year}|${party}` to the bloc blocs.csv records for that party in that election. */
export type Blocs = Map<string, string>;

/** blocs.csv's columns. */
const BLOC_COLUMNS = ["year", "party", "bloc", "source", "source_url"];

/** The slug rule: lower-case, punctuation dropped, other runs of non-letters a hyphen. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\P{ASCII}/gu, "")
    .toLowerCase()
    .replace(/['`.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A CSV file's rows as objects, refusing the wrong columns or a row of the wrong length. */
function readRows(path: string, want: readonly string[]): Row[] {
  const label = basename(path);
  const [head, ...body] = parseCSV(readFileSync(path, "utf8"));
  if (!head || head.join(",") !== want.join(",")) {
    throw new Error(
      `${label}: the columns must be ${want.join(",")}; found ${head ? head.join(",") : "nothing"}`,
    );
  }
  return body.map((cells, i) => {
    if (cells.length !== want.length) {
      throw new Error(`${label} row ${i + 2}: ${cells.length} cells, expected ${want.length}`);
    }
    return Object.fromEntries(want.map((column, j) => [column, cells[j] ?? ""]));
  });
}

function table(dir: string, name: keyof typeof COLUMNS, optional = false): Row[] {
  const path = join(dir, `${name}.csv`);
  if (!existsSync(path)) {
    if (optional) return [];
    throw new Error(`${name}.csv is missing`);
  }
  return readRows(path, COLUMNS[name]);
}

/** blocs.csv's rows; no file, no rows. */
export function loadBlocs(path: string): Row[] {
  return existsSync(path) ? readRows(path, BLOC_COLUMNS) : [];
}

/** blocs.csv's rows as a lookup. */
export function blocMap(rows: Row[]): Blocs {
  return new Map(rows.map((r) => [`${r["year"] ?? ""}|${r["party"] ?? ""}`, r["bloc"] ?? ""]));
}

/** One county's files. */
export function loadCounty(dir: string): County {
  return {
    areas: table(dir, "areas"),
    candidates: table(dir, "candidates"),
    results: table(dir, "results"),
    turnout: table(dir, "turnout"),
    register: table(dir, "register"),
    population: table(dir, "population"),
    knownDifferences: table(dir, "known-differences", true),
  };
}

/** The county folders under a root: folders whose names do not start with an underscore. */
export function listCounties(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith("_") && statSync(join(root, name)).isDirectory())
    .sort();
}

/** The ward maps under a folder like public/geo: every `*-wards.json`. */
export function loadWardMaps(geoDir: string): WardMaps {
  const maps: WardMaps = new Map();
  for (const file of readdirSync(geoDir)
    .filter((f) => f.endsWith("-wards.json"))
    .sort()) {
    const geo = JSON.parse(readFileSync(join(geoDir, file), "utf8")) as {
      features: { properties: { slug?: string; constituency?: string } }[];
    };
    for (const feature of geo.features) {
      const { slug, constituency } = feature.properties;
      if (slug) maps.set(slug, constituency ? slugify(constituency) : null);
    }
  }
  return maps;
}

const ELECTION_YEARS = ["2013", "2017", "2022"];
const ELECTIONS = new Set(
  ELECTION_YEARS.flatMap((y) => ["president", "governor", "mp"].map((race) => `${y}-${race}`)),
);
const SEAT_LEVEL: Record<string, string> = {
  president: "country",
  governor: "county",
  mp: "constituency",
};
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/;
const WHOLE = /^\d+$/;
const SIGNED = /^-?\d+$/;
const SOURCE = /^[^,]{2,40}, .{3,}$/;
const HTTPS = /^https:\/\/\S+$/;

const cell = (r: Row, column: string): string => r[column] ?? "";
const whole = (s: string): number | null => (WHOLE.test(s) ? Number(s) : null);

/** What is wrong with a row's source and source_url. */
function sourceProblems(r: Row): string[] {
  const out: string[] = [];
  if (!SOURCE.test(cell(r, "source"))) {
    out.push(`source must read "Publisher, document title", not "${cell(r, "source")}"`);
  }
  const url = cell(r, "source_url");
  if (url !== "" && !HTTPS.test(url)) {
    out.push(`source_url must be an https link or blank, not "${url}"`);
  }
  return out;
}

/**
 * What is wrong with blocs.csv: a year with no election, a party twice, a bloc unnamed or
 * unsourced.
 */
export function checkBlocs(rows: Row[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const bad = (what: string) => problems.push(`blocs.csv row ${i + 2}: ${what}`);
    const year = cell(r, "year");
    const party = cell(r, "party");
    if (!ELECTION_YEARS.includes(year)) bad(`${year} is not an election year`);
    if (party === "" || party !== party.trim()) bad("a party must be named, with no stray spaces");
    if (cell(r, "bloc").trim() === "") bad(`${party} needs a bloc`);
    if (seen.has(`${year}|${party}`)) bad(`${party} in ${year} is listed twice`);
    seen.add(`${year}|${party}`);
    sourceProblems(r).forEach(bad);
  });
  return problems;
}

type Known = { row: number; difference: number; used: boolean };

/**
 * What is wrong with a county's files, one sentence each; empty when they pass. `blocs` is what
 * blocs.csv records: a candidate stands in the bloc recorded for their party in that election,
 * else as their party, and an independent (no party) as "Independent".
 */
export function checkCounty(c: County, wards: WardMaps, blocs: Blocs): string[] {
  const problems: string[] = [];
  const bad = (file: string, i: number, what: string) =>
    problems.push(`${file}.csv row ${i + 2}: ${what}`);

  /** A figure that must be a whole number, or blank when `required` is false. */
  const figure = (file: string, i: number, r: Row, column: string, required = false) => {
    const s = cell(r, column);
    if (s === "" && !required) return null;
    const n = whole(s);
    if (n === null)
      bad(file, i, `${column} must be a whole number${required ? "" : " or blank"}, not "${s}"`);
    return n;
  };
  const source = (file: string, i: number, r: Row) =>
    sourceProblems(r).forEach((what) => bad(file, i, what));
  const unique = (file: string, rows: Row[], key: (r: Row) => string) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (seen.has(k)) bad(file, i, `${k} is listed twice`);
      seen.add(k);
    });
  };

  unique("areas", c.areas, (r) => cell(r, "key"));
  unique("candidates", c.candidates, (r) => cell(r, "id"));
  unique("results", c.results, (r) => `${cell(r, "candidate_id")} at ${cell(r, "area_key")}`);
  unique("turnout", c.turnout, (r) => `${cell(r, "election_id")} at ${cell(r, "area_key")}`);
  unique("register", c.register, (r) => `${cell(r, "year")} at ${cell(r, "area_key")}`);
  unique("population", c.population, (r) => `${cell(r, "area_key")} in ${cell(r, "year")}`);

  // The differences IEBC itself published, kept on purpose.
  const known = new Map<string, Known>();
  c.knownDifferences.forEach((r, i) => {
    const check = cell(r, "check");
    const difference = SIGNED.test(cell(r, "difference")) ? Number(cell(r, "difference")) : null;
    if (difference === null)
      return bad("known-differences", i, "difference must be a whole number");
    if (cell(r, "reason").trim().length < 10) {
      return bad("known-differences", i, "the reason must say why the figures differ");
    }
    if (check === "county_sum") {
      known.set(`county_sum|${cell(r, "candidate_id")}|${cell(r, "area_key")}`, {
        row: i,
        difference,
        used: false,
      });
    } else if (check === "cast_split") {
      known.set(`cast_split|${cell(r, "election_id")}|${cell(r, "area_key")}`, {
        row: i,
        difference,
        used: false,
      });
    } else {
      bad("known-differences", i, `check must be county_sum or cast_split, not "${check}"`);
    }
  });

  // Areas: keys, levels, parents, and the ward maps.
  const areaKeys = new Set(["kenya", ...c.areas.map((a) => cell(a, "key"))]);
  c.areas.forEach((a, i) => {
    const key = cell(a, "key");
    if (key === "kenya") {
      return bad("areas", i, "kenya is added by the schema, so it stays out of the files");
    }
    if (!KEY.test(key)) {
      return bad("areas", i, `"${key}" is not a key: lower-case parts joined by "/"`);
    }
    const level = levelOfKey(key);
    const parent = parentKey(key);
    if (cell(a, "level") !== level) {
      bad("areas", i, `${key} is a ${level}, but the file says ${cell(a, "level")}`);
    }
    if (cell(a, "parent") !== parent) {
      bad("areas", i, `${key}'s parent should be ${parent}, not ${cell(a, "parent")}`);
    } else if (parent !== null && !areaKeys.has(parent)) {
      bad("areas", i, `the parent ${parent} is not in the files`);
    }
    const name = cell(a, "name");
    if (name.length < 2 || name !== name.trim()) {
      bad("areas", i, `${key} needs a name of at least two letters with no stray spaces`);
    }
    const code = cell(a, "iebc_code");
    if (code !== "" && !/^\d{1,4}$/.test(code)) {
      bad("areas", i, `the IEBC code ${code} must be one to four digits`);
    }
    if (level === "ward") {
      const [, constituency, slug = ""] = key.split("/");
      if (!wards.has(slug)) {
        bad(
          "areas",
          i,
          `${key} is not in a ward map under public/geo (no ward has the slug ${slug})`,
        );
      } else {
        const there = wards.get(slug);
        if (there !== null && there !== constituency) {
          bad(
            "areas",
            i,
            `${key} is under ${constituency}, but the ward map says ${slug} belongs to ${there}`,
          );
        }
      }
    }
  });

  // Candidates.
  const candidates = new Map(c.candidates.map((r) => [cell(r, "id"), r]));
  c.candidates.forEach((r, i) => {
    const election = cell(r, "election_id");
    const seat = cell(r, "seat");
    const name = cell(r, "name");
    if (!ELECTIONS.has(election)) {
      bad("candidates", i, `${election} is not an election the atlas holds`);
    } else if (areaKeys.has(seat)) {
      const race = election.split("-")[1] ?? "";
      if (levelOfKey(seat) !== SEAT_LEVEL[race]) {
        bad("candidates", i, `a ${race} seat is a ${SEAT_LEVEL[race]}, not ${seat}`);
      }
    }
    if (!areaKeys.has(seat)) bad("candidates", i, `the seat ${seat} is not in the files`);
    const id = `${election}/${seat}/${slugify(name)}`;
    if (cell(r, "id") !== id) bad("candidates", i, `the id should be ${id}`);
    if (name.length < 2 || name !== name.trim()) {
      bad("candidates", i, `${id} needs a name with no stray spaces`);
    }
    const party = cell(r, "party");
    const bloc =
      party === "" ? "Independent" : (blocs.get(`${election.slice(0, 4)}|${party}`) ?? party);
    if (cell(r, "bloc") !== bloc) {
      bad("candidates", i, `${id}: the bloc should be ${bloc}, not ${cell(r, "bloc")}`);
    }
  });

  // Results, and what the candidates' votes come to in each area.
  const votesAt = new Map<string, number>();
  c.results.forEach((r, i) => {
    const candidate = candidates.get(cell(r, "candidate_id"));
    const area = cell(r, "area_key");
    const votes = figure("results", i, r, "votes", true);
    if (!candidate) bad("results", i, `${cell(r, "candidate_id")} is not in candidates.csv`);
    if (!areaKeys.has(area)) bad("results", i, `${area} is not in the files`);
    if (candidate && areaKeys.has(area)) {
      const seat = cell(candidate, "seat");
      if (seat !== "kenya" && area !== seat && !area.startsWith(`${seat}/`)) {
        bad("results", i, `${area} is outside the seat ${seat}`);
      }
      if (votes !== null) {
        const k = `${cell(candidate, "election_id")}|${area}`;
        votesAt.set(k, (votesAt.get(k) ?? 0) + votes);
      }
    }
  });

  // Constituencies add up to their county, for president and governor; an MP race has no
  // county total.
  const byCandidate = new Map<string, Row[]>();
  for (const r of c.results) {
    const id = cell(r, "candidate_id");
    byCandidate.set(id, [...(byCandidate.get(id) ?? []), r]);
  }
  for (const [id, rows] of byCandidate) {
    const candidate = candidates.get(id);
    const race = candidate ? (cell(candidate, "election_id").split("-")[1] ?? "") : "";
    if (race !== "president" && race !== "governor") continue;
    for (const countyRow of rows.filter((r) => levelOfKey(cell(r, "area_key")) === "county")) {
      const county = cell(countyRow, "area_key");
      const kids = rows.filter(
        (r) =>
          levelOfKey(cell(r, "area_key")) === "constituency" &&
          parentKey(cell(r, "area_key")) === county,
      );
      const want = whole(cell(countyRow, "votes"));
      if (kids.length === 0 || want === null) continue;
      const sum = kids.reduce((total, r) => total + (whole(cell(r, "votes")) ?? 0), 0);
      const gap = want - sum;
      const k = known.get(`county_sum|${id}|${county}`);
      if (gap !== 0 && (k === undefined || k.difference !== gap)) {
        problems.push(
          `${id}: its constituencies add up to ${sum} but ${county} says ${want}` +
            (k ? ` (the recorded difference of ${k.difference} does not close it)` : ""),
        );
      } else if (gap !== 0 && k) {
        k.used = true;
      }
    }
  }

  // Turnout.
  c.turnout.forEach((r, i) => {
    const election = cell(r, "election_id");
    const area = cell(r, "area_key");
    if (!ELECTIONS.has(election))
      bad("turnout", i, `${election} is not an election the atlas holds`);
    if (!areaKeys.has(area)) bad("turnout", i, `${area} is not in the files`);
    const registered = figure("turnout", i, r, "registered");
    const cast = figure("turnout", i, r, "cast_votes");
    const rejected = figure("turnout", i, r, "rejected_votes");
    const valid = figure("turnout", i, r, "valid_votes");
    if (cast !== null && registered !== null && cast > registered) {
      bad("turnout", i, `more votes cast than registered (${cast} against ${registered})`);
    }
    if (valid !== null && cast !== null && valid > cast) {
      bad("turnout", i, `more valid votes than votes cast (${valid} against ${cast})`);
    }
    if (valid !== null && rejected !== null && cast !== null) {
      const gap = cast - valid - rejected;
      const k = known.get(`cast_split|${election}|${area}`);
      if (gap !== 0 && (k === undefined || k.difference !== gap)) {
        bad(
          "turnout",
          i,
          `valid plus rejected (${valid + rejected}) differs from cast (${cast})` +
            (k ? `; the recorded difference of ${k.difference} does not close it` : ""),
        );
      } else if (gap !== 0 && k) {
        k.used = true;
      }
    }
    const limit = valid ?? cast;
    const total = votesAt.get(`${election}|${area}`);
    if (limit !== null && total !== undefined && total > limit) {
      bad(
        "turnout",
        i,
        `the candidates' votes (${total}) pass the ${valid !== null ? "valid votes" : "votes cast"} (${limit}), a share over 100%`,
      );
    }
    source("turnout", i, r);
  });

  // Registers.
  c.register.forEach((r, i) => {
    const year = cell(r, "year");
    if (!ELECTION_YEARS.includes(year)) bad("register", i, `${year} is not an election year`);
    if (!areaKeys.has(cell(r, "area_key")))
      bad("register", i, `${cell(r, "area_key")} is not in the files`);
    figure("register", i, r, "registered", true);
    source("register", i, r);
  });

  // Population estimates.
  c.population.forEach((r, i) => {
    if (!areaKeys.has(cell(r, "area_key")))
      bad("population", i, `${cell(r, "area_key")} is not in the files`);
    const year = figure("population", i, r, "year", true);
    if (year !== null && (year < 1990 || year > 2100))
      bad("population", i, `${year} is not a year`);
    const total = figure("population", i, r, "total", true);
    const adults = figure("population", i, r, "adults", true);
    const young = figure("population", i, r, "young_adults", true);
    if (adults !== null && total !== null && adults > total) {
      bad("population", i, `adults (${adults}) pass the total (${total})`);
    }
    if (young !== null && adults !== null && young > adults) {
      bad("population", i, `young adults (${young}) pass the adults (${adults})`);
    }
    if (cell(r, "method").trim().length < 10)
      bad("population", i, "the method must say how it was worked out");
    source("population", i, r);
  });

  // A recorded difference that nothing needs is out of date.
  for (const [key, k] of known) {
    if (!k.used) {
      bad(
        "known-differences",
        k.row,
        `this difference no longer matches anything: remove it (${key})`,
      );
    }
  }
  return problems;
}
```

- [ ] **Step 8: Format, lint and run**

Run: `npx prettier --write scripts/atlas/checks.ts tests/atlas-data.test.ts && npx eslint scripts/atlas/checks.ts tests/atlas-data.test.ts && npx -y tsx --tsconfig tsconfig.json tests/atlas-data.test.ts | tail -3`

Expected: ESLint prints nothing, then `63 passed, 0 failed`.

- [ ] **Step 9: Commit**

```bash
git add tests/fixtures/atlas/slug-cases.csv tests/fixtures/atlas/blocs.csv scripts/atlas/slug.py scripts/atlas/test_slug.py scripts/atlas/checks.ts tests/atlas-data.test.ts
git commit -m "Atlas: the slug rule and the data checks" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: A county's areas from its ward map

**Files:**
- Create: `scripts/atlas/test_areas_from_map.py`
- Create: `scripts/atlas/areas_from_map.py`

**Interfaces:** Consumes `slug.slugify`. Produces `areas_from_map.build_areas(wards_geojson, county, constituency=None, also=()) -> list[list[str]]`
(`key, level, name, parent, iebc_code` rows in key order; the code is blank) and
`areas_from_map.main(argv)`. The command is
`python3 scripts/atlas/areas_from_map.py WARDS_GEOJSON "County name" [OUT_CSV] [--constituency "Name"] [--also "Name"]...`.
`--constituency` names the one constituency of a map that names none (Mathira's); `--also` lists a
constituency that has no ward map. Names are the ward map's, which are the names the app uses.

- [ ] **Step 1: Write the failing tests**

They include the real maps: Nairobi must be one county, 17 constituencies and 85 wards, and
Mathira's six wards must sit under one constituency of a county whose other five are listed bare.

Create `scripts/atlas/test_areas_from_map.py`:

```python
"""Tests for areas_from_map.py: a county's areas.csv made from its ward map. Run from the
repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import json
import tempfile
import unittest
from pathlib import Path

import areas_from_map as afm
import slug

ROOT = Path(__file__).resolve().parents[2]
NAIROBI = ROOT / "public" / "geo" / "nairobi-wards.json"
MATHIRA = ROOT / "public" / "geo" / "mathira-wards.json"


def geo(features):
    tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump({"type": "FeatureCollection", "features": features}, tmp)
    tmp.close()
    return tmp.name


def feature(slug_, name, constituency=None):
    properties = {"slug": slug_, "name": name}
    if constituency:
        properties["constituency"] = constituency
    return {"type": "Feature", "properties": properties, "geometry": None}


class Rows(unittest.TestCase):
    def test_a_map_that_names_constituencies(self):
        path = geo([feature("ward-one", "Ward One", "North Test"), feature("ward-two", "Ward Two", "South Test")])
        rows = afm.build_areas(path, "Testland")
        self.assertEqual(
            rows,
            [
                ["testland", "county", "Testland", "kenya", ""],
                ["testland/north-test", "constituency", "North Test", "testland", ""],
                ["testland/north-test/ward-one", "ward", "Ward One", "testland/north-test", ""],
                ["testland/south-test", "constituency", "South Test", "testland", ""],
                ["testland/south-test/ward-two", "ward", "Ward Two", "testland/south-test", ""],
            ],
        )

    def test_a_map_that_names_none_takes_the_one_given(self):
        path = geo([feature("ward-one", "Ward One"), feature("ward-two", "Ward Two")])
        rows = afm.build_areas(path, "Testland", constituency="North Test")
        self.assertEqual([r[0] for r in rows], ["testland", "testland/north-test", "testland/north-test/ward-one", "testland/north-test/ward-two"])

    def test_a_map_that_names_none_and_is_given_none_is_refused(self):
        with self.assertRaisesRegex(ValueError, "names no constituency"):
            afm.build_areas(geo([feature("ward-one", "Ward One")]), "Testland")

    def test_constituencies_without_a_ward_map_are_listed_too(self):
        path = geo([feature("ward-one", "Ward One", "North Test")])
        rows = afm.build_areas(path, "Testland", also=["Far Test", "Away Test"])
        keys = [r[0] for r in rows]
        self.assertIn("testland/far-test", keys)
        self.assertIn("testland/away-test", keys)
        self.assertEqual([r for r in rows if r[0] == "testland/far-test"], [["testland/far-test", "constituency", "Far Test", "testland", ""]])

    def test_a_constituency_given_twice_is_refused(self):
        path = geo([feature("ward-one", "Ward One", "North Test")])
        with self.assertRaisesRegex(ValueError, "north-test is listed twice"):
            afm.build_areas(path, "Testland", also=["North Test"])

    def test_a_repeated_ward_is_refused(self):
        path = geo([feature("ward-one", "Ward One", "North Test"), feature("ward-one", "Ward One", "North Test")])
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one is listed twice"):
            afm.build_areas(path, "Testland")


class RealMaps(unittest.TestCase):
    def test_nairobi_is_one_county_17_constituencies_and_85_wards(self):
        rows = afm.build_areas(NAIROBI, "Nairobi")
        levels = [r[1] for r in rows]
        self.assertEqual((levels.count("county"), levels.count("constituency"), levels.count("ward")), (1, 17, 85))
        self.assertIn(["nairobi/langata", "constituency", "Langata", "nairobi", ""], rows)
        self.assertIn(["nairobi/embakasi-west/umoja-ii", "ward", "Umoja II", "nairobi/embakasi-west", ""], rows)

    def test_every_key_is_a_slug_path_under_its_parent(self):
        for r in afm.build_areas(NAIROBI, "Nairobi"):
            key, level, name, parent, code = r
            self.assertEqual(key.split("/")[-1], slug.slugify(name) if level != "ward" else key.split("/")[-1])
            if level != "county":
                self.assertTrue(key.startswith(parent + "/"))

    def test_mathira_is_six_wards_in_one_constituency(self):
        rows = afm.build_areas(MATHIRA, "Nyeri", constituency="Mathira", also=["Kieni", "Mukurweini", "Nyeri Town", "Othaya", "Tetu"])
        levels = [r[1] for r in rows]
        self.assertEqual((levels.count("county"), levels.count("constituency"), levels.count("ward")), (1, 6, 6))
        self.assertIn(["nyeri/mathira/karatina-town", "ward", "Karatina Town", "nyeri/mathira", ""], rows)

    def test_the_csv_it_writes(self):
        out = Path(tempfile.mkdtemp()) / "areas.csv"
        afm.main(["areas_from_map.py", str(NAIROBI), "Nairobi", str(out)])
        lines = out.read_text().splitlines()
        self.assertEqual(lines[0], "key,level,name,parent,iebc_code")
        self.assertEqual(lines[1], "nairobi,county,Nairobi,kenya,")
        self.assertEqual(len(lines), 1 + 1 + 17 + 85)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_areas_from_map.py"`

Expected: `ModuleNotFoundError: No module named 'areas_from_map'` and `FAILED (errors=1)`.

- [ ] **Step 3: Write the generator**

Create `scripts/atlas/areas_from_map.py`:

```python
"""A county's areas.csv, made from its ward map, so no key is typed by hand.

Usage:
  python3 scripts/atlas/areas_from_map.py WARDS_GEOJSON "County name" [OUT_CSV]
      [--constituency "Name"] [--also "Name"]...

WARDS_GEOJSON  a ward map whose features carry a "slug" and a "name", and a "constituency" where
               the map knows it (public/geo/nairobi-wards.json does; mathira-wards.json does not)
--constituency the constituency every ward is in, for a map that names none
--also         a constituency of the county that has no ward map, so it is listed with no wards
               (repeat it for each)

Writes the county, its constituencies and its wards as areas.csv rows, keyed by the path of slugs
(see slug.py); the IEBC code is left blank to be filled in from IEBC's documents. Names are the
ward map's, which are the names the app uses. To the screen when there is no OUT_CSV.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

from slug import slugify

HEADER = ["key", "level", "name", "parent", "iebc_code"]


def build_areas(wards_geojson, county, constituency=None, also=()):
    """areas.csv's rows, in key order: the county, then its constituencies and wards."""
    with open(wards_geojson, encoding="utf-8") as f:
        features = json.load(f)["features"]
    county_key = slugify(county)
    rows = {county_key: [county_key, "county", county, "kenya", ""]}
    for feature in features:
        props = feature["properties"]
        name = props.get("constituency") or constituency
        if not name:
            raise ValueError(f"the ward map names no constituency for {props['slug']}; give one with --constituency")
        constituency_key = f"{county_key}/{slugify(name)}"
        if constituency_key not in rows:
            rows[constituency_key] = [constituency_key, "constituency", name, county_key, ""]
        ward_key = f"{constituency_key}/{props['slug']}"
        if ward_key in rows:
            raise ValueError(f"{ward_key} is listed twice")
        rows[ward_key] = [ward_key, "ward", props["name"], constituency_key, ""]
    for name in also:
        key = f"{county_key}/{slugify(name)}"
        if key in rows:
            raise ValueError(f"{key} is listed twice")
        rows[key] = [key, "constituency", name, county_key, ""]
    return [rows[key] for key in sorted(rows)]


def main(argv):
    parser = argparse.ArgumentParser(prog=Path(argv[0]).name, description="A county's areas.csv from its ward map.")
    parser.add_argument("wards")
    parser.add_argument("county")
    parser.add_argument("out", nargs="?")
    parser.add_argument("--constituency")
    parser.add_argument("--also", action="append", default=[])
    args = parser.parse_args(argv[1:])
    try:
        rows = build_areas(args.wards, args.county, args.constituency, args.also)
    except ValueError as e:
        raise SystemExit(str(e))
    if args.out:
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, lineterminator="\n")
            writer.writerow(HEADER)
            writer.writerows(rows)
    else:
        writer = csv.writer(sys.stdout, lineterminator="\n")
        writer.writerow(HEADER)
        writer.writerows(rows)


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 4: Run all the Python tests**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_*.py" 2>&1 | tail -3`

Expected: `Ran 27 tests` and `OK`.

Look at what it makes for Nyeri (Mathira is the one constituency with a ward map):

Run: `python3 scripts/atlas/areas_from_map.py public/geo/mathira-wards.json Nyeri --constituency Mathira --also Kieni --also Mukurweini --also "Nyeri Town" --also Othaya --also Tetu`

Expected: 13 lines after the header: the county `nyeri`, six constituencies (`kieni`, `mathira`,
`mukurweini`, `nyeri-town`, `othaya`, `tetu`) and Mathira's six wards (`iriaini`, `karatina-town`,
`kirimukuyu`, `konyu`, `magutu`, `ruguru`).

- [ ] **Step 5: Commit**

```bash
git add scripts/atlas/areas_from_map.py scripts/atlas/test_areas_from_map.py
git commit -m "Atlas: a county's areas from its ward map" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Ward population from WorldPop's grids

**Files:**
- Create: `scripts/atlas/test_ward_population.py`
- Create: `scripts/atlas/ward_population.py`

**Interfaces:** Produces `ward_population.parse_raster_name(name) -> (sex, first age, year) | None`,
`band_ends(starts) -> {first age: where the next band starts | None}`,
`share_in(lo, hi, start, end=None) -> float` (the part of a band inside a range, people taken as even
through the band),
`ward_numbers(sums) -> (total, adults, young_adults)` (whole people),
`find_rasters(directory, year) -> {(sex, first age): Path}`,
`check_complete(found, year)`, `ward_sums(geometry, rasters)`,
`build_rows(wards_geojson, areas_csv, raster_dir, year, source) -> list`, `METHOD`, `main(argv)`.
The command is
`python3 scripts/atlas/ward_population.py WARDS_GEOJSON AREAS_CSV RASTER_DIR YEAR SOURCE OUT_CSV`.
It writes `population.csv`. Each ward is the sum of the grid pixels whose centres fall inside its
boundary. WorldPop's bands are five years wide, so 18 to 34 is two fifths of 15 to 19 plus 20 to 24,
25 to 29 and 30 to 34; adults likewise. It needs rasterio and numpy at run time; the age-band
arithmetic does not, so those tests run anywhere.

- [ ] **Step 1: Write the failing tests**

The grid tests build 36 tiny GeoTIFFs (10 by 10 pixels, one person in each) and a ward over sixteen
pixel centres, so the answer is known by hand: 16 pixels of 36 bands is 576 people; the adults are
16 pixels x two sexes x (13 whole bands + two fifths of 15-19) = 428.8, so 429; the young are
16 x 2 x (3 whole bands + two fifths) = 108.8, so 109. They skip where rasterio is not installed.

Create `scripts/atlas/test_ward_population.py`:

```python
"""Tests for ward_population.py: reading WorldPop's file names, splitting five-year age bands, and
summing a grid inside a ward. The grid tests build tiny GeoTIFFs and need rasterio and
numpy; without them they skip and the rest still run. Run from the repository root:

  python3 -m unittest discover -s scripts/atlas -p "test_*.py"
"""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import ward_population as wp

try:
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    HAVE_RASTERIO = True
except ImportError:
    HAVE_RASTERIO = False

# WorldPop's bands by their first age: under 1, 1 to 4, then every five years to 80 and over.
STARTS = [0, 1] + list(range(5, 85, 5))


class Names(unittest.TestCase):
    def test_a_worldpop_file_name(self):
        self.assertEqual(wp.parse_raster_name("ken_f_15_2025_CN_100m_R2025A_v1.tif"), ("f", 15, 2025))

    def test_case_and_short_ages(self):
        self.assertEqual(wp.parse_raster_name("KEN_M_5_2020.tif"), ("m", 5, 2020))
        self.assertEqual(wp.parse_raster_name("ken_f_00_2020.tif"), ("f", 0, 2020))
        self.assertEqual(wp.parse_raster_name("ken_f_1_2020.tif"), ("f", 1, 2020))

    def test_other_files_are_not_grids(self):
        self.assertIsNone(wp.parse_raster_name("ken_ppp_2020.tif"))
        self.assertIsNone(wp.parse_raster_name("README.txt"))


class Bands(unittest.TestCase):
    def test_where_each_band_ends(self):
        ends = wp.band_ends(STARTS)
        self.assertEqual(ends[0], 1)
        self.assertEqual(ends[1], 5)
        self.assertEqual(ends[15], 20)
        self.assertIsNone(ends[80])

    def test_adults_are_two_fifths_of_15_to_19_and_everyone_older(self):
        self.assertEqual(wp.share_in(10, 15, 18), 0)
        self.assertAlmostEqual(wp.share_in(15, 20, 18), 0.4)
        self.assertEqual(wp.share_in(20, 25, 18), 1)
        self.assertEqual(wp.share_in(80, None, 18), 1)

    def test_young_adults_are_two_fifths_of_15_to_19_and_the_next_three_bands(self):
        self.assertAlmostEqual(wp.share_in(15, 20, 18, 35), 0.4)
        self.assertEqual(wp.share_in(20, 25, 18, 35), 1)
        self.assertEqual(wp.share_in(30, 35, 18, 35), 1)
        self.assertEqual(wp.share_in(35, 40, 18, 35), 0)
        self.assertEqual(wp.share_in(80, None, 18, 35), 0)

    def test_single_year_bands_need_no_splitting(self):
        self.assertEqual(wp.share_in(17, 18, 18), 0)
        self.assertEqual(wp.share_in(18, 19, 18), 1)
        self.assertEqual(wp.share_in(34, 35, 18, 35), 1)
        self.assertEqual(wp.share_in(35, 36, 18, 35), 0)


class Numbers(unittest.TestCase):
    def test_a_ward_where_every_band_holds_ten_people(self):
        sums = {(sex, lo): 10.0 for sex in ("f", "m") for lo in STARTS}
        # 36 grids of ten; adults are the 13 bands from 20 up and two fifths of 15 to 19, for
        # both sexes; the young are 20 to 34 (three bands) and the same two fifths.
        self.assertEqual(wp.ward_numbers(sums), (360, 268, 68))

    def test_the_order_survives_rounding(self):
        total, adults, young = wp.ward_numbers({("f", 15): 10.4, ("f", 20): 0.3, ("f", 35): 0.2})
        self.assertGreaterEqual(total, adults)
        self.assertGreaterEqual(adults, young)


class Rasters(unittest.TestCase):
    def folder(self, names):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for name in names:
            (Path(tmp.name) / name).write_bytes(b"")
        return tmp.name

    def test_finds_the_years_grids_by_sex_and_age(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2025.tif", "ken_m_0_2025.tif", "ken_f_0_2020.tif", "notes.txt"]), 2025)
        self.assertEqual(sorted(found), [("f", 0), ("m", 0)])

    def test_two_grids_for_one_band_are_refused(self):
        with self.assertRaisesRegex(ValueError, "two grids"):
            wp.find_rasters(self.folder(["ken_f_15_2025_a.tif", "ken_f_15_2025_b.tif"]), 2025)

    def test_a_band_missing_for_one_sex_is_refused(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2025.tif", "ken_m_0_2025.tif", "ken_f_15_2025.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "missing grids: m 15"):
            wp.check_complete(found, 2025)

    def test_grids_must_start_at_age_zero(self):
        found = wp.find_rasters(self.folder(["ken_f_15_2025.tif", "ken_m_15_2025.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "start at age 0"):
            wp.check_complete(found, 2025)

    def test_no_grids_for_the_year_is_refused(self):
        found = wp.find_rasters(self.folder(["ken_f_0_2020.tif"]), 2025)
        with self.assertRaisesRegex(ValueError, "no grids for 2025"):
            wp.check_complete(found, 2025)


@unittest.skipUnless(HAVE_RASTERIO, "needs rasterio and numpy")
class Grids(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)
        # Ten by ten pixels of 0.001 degrees, one person in each pixel of every band's grid.
        transform = from_origin(36.0, -1.0, 0.001, 0.001)
        for sex in ("f", "m"):
            for lo in STARTS:
                with rasterio.open(
                    self.dir / f"ken_{sex}_{lo:02d}_2025_test.tif",
                    "w",
                    driver="GTiff",
                    height=10,
                    width=10,
                    count=1,
                    dtype="float32",
                    crs="EPSG:4326",
                    transform=transform,
                    nodata=-99999,
                ) as dst:
                    dst.write(np.ones((1, 10, 10), dtype="float32"))
        # A ward over four columns and four rows of pixel centres: sixteen pixels.
        self.ward = {
            "type": "Polygon",
            "coordinates": [
                [[36.0021, -1.0021], [36.0059, -1.0021], [36.0059, -1.0059], [36.0021, -1.0059], [36.0021, -1.0021]]
            ],
        }

    def test_a_ward_sums_the_pixels_whose_centres_it_holds(self):
        rasters = wp.find_rasters(self.dir, 2025)
        sums = wp.ward_sums(self.ward, rasters)
        self.assertEqual(len(sums), 36)
        self.assertTrue(all(v == 16 for v in sums.values()))
        self.assertEqual(wp.ward_numbers(sums), (576, 429, 109))

    def test_a_ward_outside_the_grids_is_refused(self):
        far = {"type": "Polygon", "coordinates": [[[40, 3], [40.1, 3], [40.1, 3.1], [40, 3.1], [40, 3]]]}
        with self.assertRaises(ValueError):
            wp.ward_sums(far, wp.find_rasters(self.dir, 2025))

    def test_the_rows_for_a_county(self):
        geo = self.dir / "wards.json"
        geo.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [{"type": "Feature", "properties": {"slug": "ward-one"}, "geometry": self.ward}],
                }
            )
        )
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\n"
            "testland,county,Testland,kenya,\n"
            "testland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        rows = wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")
        self.assertEqual(
            rows, [["testland/north-test/ward-one", 2025, 576, 429, 109, "WorldPop, Test grids", wp.METHOD]]
        )

    def test_a_ward_missing_from_the_map_is_refused(self):
        geo = self.dir / "wards.json"
        geo.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\ntestland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        with self.assertRaisesRegex(ValueError, "testland/north-test/ward-one is not in the ward map"):
            wp.build_rows(geo, areas, self.dir, 2025, "WorldPop, Test grids")

    def test_the_file_it_writes(self):
        geo = self.dir / "wards.json"
        geo.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [{"type": "Feature", "properties": {"slug": "ward-one"}, "geometry": self.ward}],
                }
            )
        )
        areas = self.dir / "areas.csv"
        areas.write_text(
            "key,level,name,parent,iebc_code\ntestland/north-test/ward-one,ward,Ward One,testland/north-test,\n"
        )
        out = self.dir / "population.csv"
        wp.main(["ward_population.py", str(geo), str(areas), str(self.dir), "2025", "WorldPop, Test grids", str(out)])
        with out.open(newline="") as f:
            rows = list(csv.reader(f))
        self.assertEqual(rows[0], ["area_key", "year", "total", "adults", "young_adults", "source", "method"])
        self.assertEqual(rows[1][:6], ["testland/north-test/ward-one", "2025", "576", "429", "109", "WorldPop, Test grids"])
        self.assertEqual(rows[1][6], wp.METHOD)
        self.assertGreaterEqual(len(wp.METHOD), 10)
        self.assertLessEqual(len(wp.METHOD), 500)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run them and watch them fail**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_ward_population.py"`

Expected: `ModuleNotFoundError: No module named 'ward_population'` and `FAILED (errors=1)`.

- [ ] **Step 3: Write the script**

Create `scripts/atlas/ward_population.py`:

```python
"""Population estimates for wards, from WorldPop's age-and-sex grids.

Usage:
  python3 scripts/atlas/ward_population.py WARDS_GEOJSON AREAS_CSV RASTER_DIR YEAR SOURCE OUT_CSV

  WARDS_GEOJSON  a ward map with a "slug" on each feature (public/geo/nairobi-wards.json)
  AREAS_CSV      the county's areas.csv; every ward in it must be in the ward map
  RASTER_DIR     WorldPop's 100 m age-and-sex GeoTIFFs for Kenya for YEAR: one per sex and age
                 band, named like ken_f_15_2025_....tif (sex f or m, the band's first age, year)
  YEAR           the year of the grids
  SOURCE         the source, written "WorldPop, <dataset title and version>"
  OUT_CSV        population.csv: area_key, year, total, adults, young_adults, source, method

Each ward is the sum of the grid pixels whose centres fall inside its boundary. WorldPop's age
bands are five years wide, so 18-34 is two fifths of 15-19 plus 20-24, 25-29 and 30-34, and
adults (18 and over) likewise: people are taken to be spread evenly through a band. Everything
here is an estimate and is recorded as one.

Needs rasterio and numpy (pip install rasterio numpy); the age-band arithmetic does not, so the
tests of it run without.
"""
import csv
import json
import re
import sys
from pathlib import Path

METHOD = (
    "WorldPop age-and-sex grid at 100 m: the people in the pixels whose centres fall inside the "
    "ward. Five-year bands are split evenly, so 18-34 is two fifths of 15-19 plus 20-24, 25-29 and "
    "30-34; adults likewise."
)

RASTER_NAME = re.compile(r"(?:^|_)(f|m)_(\d{1,2})_(\d{4})(?:_|\.|$)", re.IGNORECASE)


def parse_raster_name(name):
    """(sex, the band's first age, year) from a WorldPop file name, or None for any other file."""
    match = RASTER_NAME.search(name)
    if not match:
        return None
    return match.group(1).lower(), int(match.group(2)), int(match.group(3))


def band_ends(starts):
    """Each band's first age mapped to where the next band starts; the last band is open (None)."""
    ordered = sorted(set(starts))
    return {lo: (ordered[i + 1] if i + 1 < len(ordered) else None) for i, lo in enumerate(ordered)}


def share_in(lo, hi, start, end=None):
    """The part of the band lo..hi that lies in start..end, taking people as even through the band.

    hi and end are exclusive; None means no upper limit.
    """
    if hi is None:
        return 1.0 if lo >= start and (end is None or lo < end) else 0.0
    top = hi if end is None else min(hi, end)
    return max(0, top - max(lo, start)) / (hi - lo)


def ward_numbers(sums):
    """(total, adults, young adults), in whole people, from {(sex, first age): people}."""
    ends = band_ends(lo for _, lo in sums)
    total = sum(sums.values())
    adults = sum(v * share_in(lo, ends[lo], 18) for (_, lo), v in sums.items())
    young = sum(v * share_in(lo, ends[lo], 18, 35) for (_, lo), v in sums.items())
    return round(total), round(adults), round(young)


def find_rasters(directory, year):
    """{(sex, first age): path} for the year's grids in a folder; two for one band are refused."""
    found = {}
    for path in sorted(Path(directory).glob("*.tif")):
        parsed = parse_raster_name(path.name)
        if parsed is None or parsed[2] != year:
            continue
        sex, lo, _ = parsed
        if (sex, lo) in found:
            raise ValueError(f"two grids for sex {sex}, age {lo}: {found[(sex, lo)].name} and {path.name}")
        found[(sex, lo)] = path
    return found


def check_complete(found, year):
    """Both sexes for every band, from age 0: a band left out would quietly undercount."""
    if not found:
        raise ValueError(f"no grids for {year}")
    ages = {lo for _, lo in found}
    missing = sorted(f"{sex} {lo}" for lo in ages for sex in ("f", "m") if (sex, lo) not in found)
    if missing:
        raise ValueError("missing grids: " + ", ".join(missing))
    if 0 not in ages:
        raise ValueError("the grids must start at age 0, so that the total counts everyone")


def ward_sums(geometry, rasters):
    """{(sex, first age): people inside the ward}: the pixels whose centres fall within it."""
    import rasterio
    from rasterio.mask import mask

    sums = {}
    for key, path in rasters.items():
        with rasterio.open(path) as src:
            data, _ = mask(src, [geometry], crop=True, all_touched=False, filled=True)
            band = data[0]
            sums[key] = float(band[band > 0].sum())
    return sums


def build_rows(wards_geojson, areas_csv, raster_dir, year, source):
    """population.csv's rows: one for each ward in areas.csv."""
    with open(wards_geojson, encoding="utf-8") as f:
        shapes = {ft["properties"]["slug"]: ft["geometry"] for ft in json.load(f)["features"]}
    with open(areas_csv, newline="", encoding="utf-8-sig") as f:
        wards = sorted(row["key"] for row in csv.DictReader(f) if row["level"] == "ward")
    rasters = find_rasters(raster_dir, year)
    check_complete(rasters, year)
    rows = []
    for key in wards:
        slug = key.rsplit("/", 1)[-1]
        if slug not in shapes:
            raise ValueError(f"{key} is not in the ward map")
        try:
            total, adults, young = ward_numbers(ward_sums(shapes[slug], rasters))
        except ValueError as e:
            raise ValueError(f"{key}: {e}") from None
        if total == 0:
            raise ValueError(f"{key}: the grids hold no people inside it; is the ward map in the right place?")
        rows.append([key, year, total, adults, young, source, METHOD])
    return rows


def main(argv):
    if len(argv) != 7:
        raise SystemExit(__doc__)
    wards, areas, rasters, year, source, out = argv[1:]
    try:
        rows = build_rows(wards, areas, rasters, int(year), source)
    except ValueError as e:
        raise SystemExit(str(e))
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["area_key", "year", "total", "adults", "young_adults", "source", "method"])
        writer.writerows(rows)


if __name__ == "__main__":
    main(sys.argv)
```

- [ ] **Step 4: Run all the Python tests, without and with rasterio**

Run: `python3 -m unittest discover -s scripts/atlas -p "test_*.py" 2>&1 | tail -3`

Expected: `Ran 46 tests` and `OK (skipped=5)`: the five grid tests skip without rasterio.

Run: `python3 -m venv /tmp/gwvenv && /tmp/gwvenv/bin/pip install --quiet rasterio numpy && /tmp/gwvenv/bin/python -m unittest discover -s scripts/atlas -p "test_*.py" 2>&1 | tail -3`

Expected: `Ran 46 tests` and `OK`: nothing skipped.

- [ ] **Step 5: Commit**

```bash
git add scripts/atlas/ward_population.py scripts/atlas/test_ward_population.py
git commit -m "Atlas: ward population from WorldPop's age-and-sex grids" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: The data folder, and the report

**Files:**
- Create: `tests/atlas-report.test.ts`
- Create: `scripts/atlas/report.ts`
- Create: `data/atlas/README.md`
- Create: `data/atlas/SOURCES.md`
- Modify: `.gitignore` (the downloaded documents are not committed)

**Interfaces:** Consumes `checkCounty`, `checkBlocs`, `blocMap`, `loadBlocs`, `loadCounty`,
`loadWardMaps`, `listCounties` from `./checks`; `fmtVotes` from `../../src/lib/atlas/format`;
`levelOfKey` from `../../src/lib/atlas/scope` (scripts import by relative path). Produces `report(c: County, name: string): string` (how much of each
election and year a county's files hold, the blocs the candidates stood in, where candidates' votes
fall short of the valid votes, and the recorded differences), `shortfalls(c: County): string[]`, and
the command `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts [county...]`, which prints the
report and the checks' verdict for the counties named, or for every county under `data/atlas`.
`data/atlas/README.md` says how the files work; `data/atlas/SOURCES.md` is the log Tasks 12 and 13
fill in.

- [ ] **Step 1: Write the failing tests**

The report for Testland is pinned word for word, so a change to what the user reads is a decision.

Create `tests/atlas-report.test.ts`:

```ts
// Checks for the data report: how much of each election a county's files hold and what is missing,
// as the user reads it before any screen work. The report for the fictional Testland files is
// pinned word for word, so a change to it is a decision. Pure apart from reading the fixture.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-report.test.ts

import { loadCounty, type County, type Row } from "../scripts/atlas/checks";
import { report, shortfalls } from "../scripts/atlas/report";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

const good = loadCounty("tests/fixtures/atlas/testland");

eq(
  "the report for the fixture county",
  report(good, "Testland"),
  [
    "Testland: 1 county, 2 constituencies, 2 wards",
    "",
    "Results and turnout, by election (constituencies with figures):",
    "  2013-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-mp: votes in 0 of 2; turnout in 0 of 2",
    "  2017-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-mp: votes in 0 of 2; turnout in 1 of 2",
    "  2022-president: votes in 2 of 2 and the county; turnout in 2 of 2 and the county",
    "  2022-governor: votes in 2 of 2 and the county; turnout in 2 of 2 and the county",
    "  2022-mp: votes in 1 of 2; turnout in 1 of 2",
    "",
    "Registered voters, by year:",
    "  2013: 0 of 2 wards, 0 of 2 constituencies, not the county",
    "  2017: 1 of 2 wards, 0 of 2 constituencies, not the county",
    "  2022: 2 of 2 wards, 2 of 2 constituencies, and the county",
    "",
    "Population estimates: 2 of 2 wards (2025)",
    "",
    "Blocs, by election (candidates):",
    "  2022-president: Alpha 1, Beta 1",
    "  2022-governor: Alpha 1, Beta 1, Gamma 1",
    "  2022-mp: Alpha 1, Beta 1, Independent 1",
    "",
    "Candidates' votes short of the valid votes: none",
    "Recorded differences: none",
  ].join("\n"),
);

eq("no votes short of valid in the fixture", shortfalls(good), []);

// A race whose candidates are not all loaded shows up as a shortfall.
const missingOne: County = structuredClone(good);
missingOne.results = missingOne.results.filter(
  (r: Row) =>
    r["candidate_id"] !== "2022-governor/testland/wa-test-jr" ||
    r["area_key"] !== "testland/north-test",
);
eq("a missing candidate is a shortfall", shortfalls(missingOne), [
  "2022-governor testland/north-test: candidates' votes 450 of 490 valid",
]);
eq(
  "and the report says so",
  report(missingOne, "Testland").includes(
    "Candidates' votes short of the valid votes:\n  2022-governor testland/north-test: candidates' votes 450 of 490 valid",
  ),
  true,
);

// Recorded differences are listed, so the user sees what IEBC itself got wrong.
const withKnown: County = structuredClone(good);
withKnown.knownDifferences.push({
  check: "cast_split",
  election_id: "2022-governor",
  area_key: "testland/north-test",
  candidate_id: "",
  difference: "-1",
  reason: "IEBC's own valid and rejected figures differ",
});
eq(
  "recorded differences are listed",
  report(withKnown, "Testland").includes(
    "Recorded differences:\n  cast_split 2022-governor testland/north-test: -1 (IEBC's own valid and rejected figures differ)",
  ),
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-report.test.ts`

Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/atlas/report' imported from .../tests/atlas-report.test.ts`

- [ ] **Step 3: Write the data folder's documents**

`data/atlas/README.md` is how the files work: the layout, the columns, the rules (keys, slugs,
elections, candidates and blocs, blanks, sources, recorded differences), and the commands.

````markdown
# Election atlas data

Public facts about elections, loaded once into the shared atlas tables (schema 22). This
repository is public: only public figures go here, and nothing about any person, least of all
their ethnicity or tribe.

```
data/atlas/
  README.md          this file
  SOURCES.md         every document used, and everything looked for and not found
  blocs.csv          which coalition each party stood in, election by election (every county)
  <county>/          one folder per county, named by its key: nairobi, nyeri
    areas.csv  candidates.csv  results.csv  turnout.csv  register.csv  population.csv
    known-differences.csv      (optional) differences IEBC itself published, kept on purpose
  _sources/          the documents downloaded to read figures from; not committed
```

## The files

| File | Columns |
|------|---------|
| `areas.csv` | `key,level,name,parent,iebc_code` |
| `candidates.csv` | `id,election_id,seat,name,party,bloc` |
| `results.csv` | `candidate_id,area_key,votes` |
| `turnout.csv` | `election_id,area_key,registered,cast_votes,rejected_votes,valid_votes,source,source_url` |
| `register.csv` | `year,area_key,registered,source,source_url` |
| `population.csv` | `area_key,year,total,adults,young_adults,source,method` |
| `known-differences.csv` | `check,election_id,area_key,candidate_id,difference,reason` |
| `blocs.csv` (in `data/atlas/`, not in a county) | `year,party,bloc,source,source_url` |

## Rules

- **Keys** are paths of slugs: `nairobi`, `nairobi/dagoretti-north`,
  `nairobi/dagoretti-north/kileleshwa`. A slug is the IEBC name lower-cased, punctuation dropped,
  other gaps a hyphen (`Lang'ata` is `langata`); `scripts/atlas/slug.py` is the rule. `kenya` is
  added by the schema and stays out of `areas.csv`. A ward's slug is the one in `public/geo/*-wards.json`.
- **Elections** are `<year>-<race>`: 2013, 2017 and 2022; `president`, `governor`, `mp`. The 2017
  presidential race is the 8 August vote; the 26 October re-run is not loaded.
- **Candidates**: `id` is `<election_id>/<seat>/<slug of the name>`. `seat` is the area contested:
  `kenya` for president, the county for governor, the constituency for MP. `bloc` is the
  coalition the candidate's party stood in at that election (Jubilee and CORD in 2013, Jubilee and
  NASA in 2017, Kenya Kwanza and Azimio in 2022), as `blocs.csv` records it, with its source: the
  Registrar of Political Parties' or the Kenya Gazette's own list. A party with no row stands as
  itself, and an independent (no party) as `Independent`. The checker refuses any other bloc, so a
  coalition has one name in every county. Spell a party as the document does; a party spelt two
  ways needs a `blocs.csv` row for each.
- **Results** are votes where they were counted: a county or a constituency. A candidate's county
  row and constituency rows must agree (president and governor).
- **A blank is "not found"**, never a zero. Write `0` only where the document says 0.
- **`source`** is written "Publisher, document title" (`IEBC, Presidential results by
  constituency 2022`); the screens keep the publisher. `source_url` is the https page or file.
- **Known differences**: `check` is `county_sum` (`difference` is what the county says minus what
  its constituencies add up to; give `candidate_id` and the county in `area_key`) or `cast_split`
  (`difference` is cast minus valid minus rejected; give `election_id` and `area_key`). A reason is
  required, and a difference nothing needs any more is refused.
- Figures come only from the publisher's own document: IEBC, the Kenya Gazette, WorldPop. A news
  report or a summary is not a source; what is not found stays blank and is listed in `SOURCES.md`.

## Commands

```
npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts            # checks every county
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi      # what was found, and the checks
python3 scripts/atlas/build_sql.py data/atlas/nairobi Nairobi supabase/migrations/<stamp>_atlas_nairobi.sql
```
````

`data/atlas/SOURCES.md` starts empty: Tasks 12 and 13 add a row for every document and every gap.

```markdown
# Sources

Every document the atlas's figures come from, and everything that was looked for and not found.
A figure is loaded only from the publisher's own document (IEBC, the Kenya Gazette, WorldPop); a
news report or a summary is not a source here. Downloaded files live in `_sources/` (not
committed), so each is listed with its SHA-256, to let anyone check they have the same file.

## Documents used

| Document | Publisher | Published | URL | Taken from it | Level | SHA-256 |
|----------|-----------|-----------|-----|---------------|-------|---------|

## Gaps

| What | Where it was looked for | Why it is missing |
|------|-------------------------|-------------------|
```

The downloaded documents are public but large, so they live in `data/atlas/_sources/` and stay out
of git; `SOURCES.md` records each one's checksum instead.

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -38,3 +38,7 @@ dist-ssr
 .env.local
 .env.*.local
 .dev.vars
+
+# Election atlas: the documents downloaded to read figures from. They are public but large;
+# data/atlas/SOURCES.md says where each came from and its checksum.
+data/atlas/_sources/
```

- [ ] **Step 4: Write the report**

Create `scripts/atlas/report.ts`:

```ts
// The data report: how much of each election a county's files hold, and what is missing, in the
// words the user reads before any screen work. `report` is pure. Running this file prints the
// report and the checks' verdict for the counties named (default: every county under data/atlas):
//   npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi nyeri

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { fmtVotes } from "../../src/lib/atlas/format";
import { levelOfKey } from "../../src/lib/atlas/scope";
import {
  blocMap,
  checkBlocs,
  checkCounty,
  listCounties,
  loadBlocs,
  loadCounty,
  loadWardMaps,
  type County,
  type Row,
} from "./checks";

const YEARS = [2013, 2017, 2022];
const ELECTIONS = YEARS.flatMap((y) =>
  ["president", "governor", "mp"].map((race) => `${y}-${race}`),
);

const cell = (r: Row, column: string): string => r[column] ?? "";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Where the candidates' votes fall short of the valid votes, which means a candidate is
 * missing.
 */
export function shortfalls(c: County): string[] {
  const election = new Map(c.candidates.map((r) => [cell(r, "id"), cell(r, "election_id")]));
  const counted = new Map<string, number>();
  for (const r of c.results) {
    const e = election.get(cell(r, "candidate_id"));
    if (e === undefined) continue;
    const key = `${e} ${cell(r, "area_key")}`;
    counted.set(key, (counted.get(key) ?? 0) + Number(cell(r, "votes")));
  }
  const out: string[] = [];
  for (const t of c.turnout) {
    const key = `${cell(t, "election_id")} ${cell(t, "area_key")}`;
    const got = counted.get(key);
    const valid = cell(t, "valid_votes");
    if (valid !== "" && got !== undefined && got < Number(valid)) {
      out.push(`${key}: candidates' votes ${fmtVotes(got)} of ${fmtVotes(Number(valid))} valid`);
    }
  }
  return out.sort();
}

/** What one county's files hold, election by election and year by year. */
export function report(c: County, name: string): string {
  const keys = c.areas.map((a) => cell(a, "key"));
  const at = (level: string) => keys.filter((k) => levelOfKey(k) === level);
  const counties = at("county");
  const constituencies = at("constituency");
  const wards = at("ward");
  const electionOf = new Map(c.candidates.map((r) => [cell(r, "id"), cell(r, "election_id")]));
  const nConstituencies = plural(constituencies.length, "constituency", "constituencies");
  const nWards = plural(wards.length, "ward");

  /** "N of M" for the constituencies among `areas`, and whether the county is there too. */
  const coverage = (areas: Set<string>, race: string) => {
    const base = `${constituencies.filter((k) => areas.has(k)).length} of ${constituencies.length}`;
    if (race === "mp") return base;
    return counties.some((k) => areas.has(k))
      ? `${base} and the county`
      : `${base}, not the county`;
  };

  const lines = [
    `${name}: ${plural(counties.length, "county", "counties")}, ${nConstituencies}, ${nWards}`,
    "",
    "Results and turnout, by election (constituencies with figures):",
  ];
  for (const election of ELECTIONS) {
    const race = election.split("-")[1] ?? "";
    const votes = new Set(
      c.results
        .filter((r) => electionOf.get(cell(r, "candidate_id")) === election)
        .map((r) => cell(r, "area_key")),
    );
    const turnout = new Set(
      c.turnout.filter((r) => cell(r, "election_id") === election).map((r) => cell(r, "area_key")),
    );
    lines.push(
      `  ${election}: votes in ${coverage(votes, race)}; turnout in ${coverage(turnout, race)}`,
    );
  }

  lines.push("", "Registered voters, by year:");
  for (const year of YEARS) {
    const have = new Set(
      c.register.filter((r) => cell(r, "year") === String(year)).map((r) => cell(r, "area_key")),
    );
    const w = wards.filter((k) => have.has(k)).length;
    const k = constituencies.filter((x) => have.has(x)).length;
    const county = counties.some((x) => have.has(x)) ? "and the county" : "not the county";
    lines.push(`  ${year}: ${w} of ${nWards}, ${k} of ${nConstituencies}, ${county}`);
  }

  lines.push("");
  const popYears = [...new Set(c.population.map((r) => cell(r, "year")))].sort();
  if (popYears.length === 0) lines.push("Population estimates: none");
  for (const year of popYears) {
    const have = new Set(
      c.population.filter((r) => cell(r, "year") === year).map((r) => cell(r, "area_key")),
    );
    lines.push(
      `Population estimates: ${wards.filter((k) => have.has(k)).length} of ${nWards} (${year})`,
    );
  }

  // The blocs the candidates stood in, so a coalition spelt two ways shows up here.
  const blocLines = ELECTIONS.flatMap((election) => {
    const counts = new Map<string, number>();
    for (const r of c.candidates) {
      if (cell(r, "election_id") !== election) continue;
      counts.set(cell(r, "bloc"), (counts.get(cell(r, "bloc")) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const parts = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([bloc, n]) => `${bloc} ${n}`);
    return [`  ${election}: ${parts.join(", ")}`];
  });
  lines.push(
    "",
    "Blocs, by election (candidates):",
    ...(blocLines.length ? blocLines : ["  none"]),
  );

  const short = shortfalls(c);
  lines.push(
    "",
    short.length
      ? `Candidates' votes short of the valid votes:\n  ${short.join("\n  ")}`
      : "Candidates' votes short of the valid votes: none",
  );
  const known = c.knownDifferences.map((r) => {
    const where =
      cell(r, "check") === "county_sum"
        ? `${cell(r, "candidate_id")} ${cell(r, "area_key")}`
        : `${cell(r, "election_id")} ${cell(r, "area_key")}`;
    return `${cell(r, "check")} ${where}: ${cell(r, "difference")} (${cell(r, "reason")})`;
  });
  lines.push(
    known.length ? `Recorded differences:\n  ${known.join("\n  ")}` : "Recorded differences: none",
  );
  return lines.join("\n");
}

function main(args: string[]) {
  const root = "data/atlas";
  const names = args.length ? args : listCounties(root);
  if (names.length === 0) {
    console.log("No counties under data/atlas yet.");
    return;
  }
  const wards = loadWardMaps("public/geo");
  const blocRows = loadBlocs(join(root, "blocs.csv"));
  const blocProblems = checkBlocs(blocRows);
  if (blocProblems.length) console.log(`blocs.csv: ${blocProblems.join("\n  ")}\n`);
  for (const name of names) {
    const county = loadCounty(join(root, name));
    console.log(report(county, name.charAt(0).toUpperCase() + name.slice(1)));
    const problems = checkCounty(county, wards, blocMap(blocRows));
    console.log(
      problems.length
        ? `\nChecks: ${plural(problems.length, "problem")}\n  ${problems.join("\n  ")}\n`
        : "\nChecks: all pass\n",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 5: Format, lint and run**

Run: `npx prettier --write scripts/atlas/report.ts tests/atlas-report.test.ts && npx eslint scripts/atlas tests/atlas-report.test.ts && npx -y tsx --tsconfig tsconfig.json tests/atlas-report.test.ts | tail -2`

Expected: ESLint prints nothing, then `5 passed, 0 failed`.

Run: `npx -y tsx --tsconfig tsconfig.json scripts/atlas/report.ts`

Expected: `No counties under data/atlas yet.`

- [ ] **Step 6: Run every atlas test together**

Run: `for t in tests/atlas-*.test.ts; do printf "%-34s" $t; npx -y tsx --tsconfig tsconfig.json $t 2>&1 | tail -1; done`

Expected:

```
tests/atlas-advice.test.ts        41 passed, 0 failed
tests/atlas-data.test.ts          63 passed, 0 failed
tests/atlas-format.test.ts        21 passed, 0 failed
tests/atlas-measures.test.ts      35 passed, 0 failed
tests/atlas-register.test.ts      20 passed, 0 failed
tests/atlas-report.test.ts        5 passed, 0 failed
tests/atlas-scope.test.ts         11 passed, 0 failed
tests/atlas-scripts.test.ts       atlas script tests passed
```

- [ ] **Step 7: Commit**

```bash
git add tests/atlas-report.test.ts scripts/atlas/report.ts data/atlas/README.md data/atlas/SOURCES.md .gitignore
git commit -m "Atlas: the data folder's rules and sources log, and the data report" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Gather Nairobi's figures

This is research, not code. The documents' formats are not known until they are read, so the steps
give the procedure, the exact files to produce and the checks that decide when it is done; the
extractor scripts are written against the real documents. The checks from Task 8 are the tests:
the documents are the specification, and a figure is right when it agrees with the document and the
sums agree with each other.

**Files:**
- Create: `data/atlas/blocs.csv`
- Create: `data/atlas/nairobi/areas.csv`, `candidates.csv`, `results.csv`, `turnout.csv`, `register.csv`, `population.csv`, `known-differences.csv`
- Create: `scripts/atlas/extract/*.py` (and any small helpers they share): read the downloaded documents, write the county's CSVs
- Modify: `data/atlas/SOURCES.md`
- Not committed: `data/atlas/_sources/` (the downloaded documents; see `.gitignore`)

**Interfaces:** Consumes `scripts/atlas/areas_from_map.py`, `slug.slugify`, `ward_population.py`,
`checks.ts` and `report.ts`. Produces a `data/atlas/nairobi/` that passes
`npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts`; a `data/atlas/blocs.csv` for the
parties that stood in it; and a `SOURCES.md` that says where every number came from and what was not
found.

**What to find**, for Nairobi's 17 constituencies (the ward map in `public/geo/nairobi-wards.json`
lists them and its 85 wards):
- **Results:** for each of the nine elections (2013, 2017 and 2022; president, governor, MP), every
  candidate's votes in each constituency, with their party; and the county total for president and
  governor. The 2017 presidential race is the 8 August vote; the 26 October re-run is not loaded.
- **Turnout:** for the same elections and areas, registered voters, votes cast, rejected and valid.
- **Registers:** registered voters by ward for each of 2013, 2017 and 2022 where IEBC published
  them, with constituency and county totals when published.
- **Coalitions:** which coalition each party stood in for each election (Jubilee and CORD in 2013,
  Jubilee and NASA in 2017, Kenya Kwanza and Azimio in 2022, and any others), from the Registrar of
  Political Parties or the Kenya Gazette.
- **Population:** WorldPop's age-and-sex grids for Kenya at 100 m, for the latest year offered.

- [ ] **Step 1: Check that the sources can be reached**

Run:

```bash
for u in https://www.iebc.or.ke https://forms.iebc.or.ke https://hub.worldpop.org https://data.worldpop.org https://www.worldpop.org https://new.kenyalaw.org https://www.kenyagazette.go.ke https://www.knbs.or.ke; do
  printf "%-34s" "$u"; curl -sS -m 15 -o /dev/null -w "%{http_code}\n" -I "$u" 2>&1 | tail -1
done
```

A number (200, 301, even 404) means the host answered. `curl: (56) CONNECT tunnel failed, response 403`
means this environment's network policy still blocks it. The user chose to allow these hosts in the
environment's settings (the cloud environment menu in the session's title bar, then Edit, then
Network access and Allowed domains; steps at https://code.claude.com/docs/en/cloud-environments#network-access).

If a host the task needs is blocked, or a document turns out to live on a host not in the list, stop
and tell the user which host. Do not work around the block: no other proxy, no mirror. `WebFetch`
goes through the same proxy and is blocked the same way.

- [ ] **Step 2: Create the county's folder and its areas**

Run:

```bash
mkdir -p data/atlas/nairobi data/atlas/_sources/nairobi
python3 scripts/atlas/areas_from_map.py public/geo/nairobi-wards.json Nairobi data/atlas/nairobi/areas.csv
cd data/atlas/nairobi
printf 'id,election_id,seat,name,party,bloc\n' > candidates.csv
printf 'candidate_id,area_key,votes\n' > results.csv
printf 'election_id,area_key,registered,cast_votes,rejected_votes,valid_votes,source,source_url\n' > turnout.csv
printf 'year,area_key,registered,source,source_url\n' > register.csv
printf 'area_key,year,total,adults,young_adults,source,method\n' > population.csv
printf 'check,election_id,area_key,candidate_id,difference,reason\n' > known-differences.csv
cd ../../..
[ -f data/atlas/blocs.csv ] || printf 'year,party,bloc,source,source_url\n' > data/atlas/blocs.csv
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi | head -1
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi | grep Checks
```

Expected: `Nairobi: 1 county, 17 constituencies, 85 wards`, then `Checks: all pass` (empty files pass:
nothing is wrong with nothing). `areas.csv` has 104 lines. The `[ -f ... ] ||` keeps a `blocs.csv`
that already has rows.

- [ ] **Step 3: Find the documents, and log each one before reading it**

Use `WebSearch` (load it with ToolSearch if it is not listed) to find the publisher's own documents.
Queries along the lines of "IEBC 2022 presidential election results by constituency Nairobi",
"Kenya Gazette declaration of results governor Nairobi 2017", "IEBC registered voters per ward 2022
Nairobi", "Registrar of Political Parties coalition 2013 Jubilee CORD parties". Search results only
locate documents: the figures are read from the downloaded file, never from a snippet, a news report
or a page summary.

A source is IEBC (iebc.or.ke, forms.iebc.or.ke), the Kenya Gazette (Kenya Law's archive or the
Gazette's own site), the Registrar of Political Parties, or WorldPop. Anything else is not a source:
if only a secondary report can be found, the figure is a gap.

For each document, add a row to the "Documents used" table in `data/atlas/SOURCES.md` before
extracting anything: its title, publisher, publication date, URL, what is taken from it, the level of
detail it gives (constituency, ward, county), and (after Step 4) its SHA-256. The title is what goes
in the CSVs' `source` column, written "Publisher, title" and nothing else, so the screens can tag a
figure with its publisher.

- [ ] **Step 4: Download each document, and fingerprint it**

Run, for each document:

```bash
curl -fL --max-time 600 -o "data/atlas/_sources/nairobi/<short-name>.<ext>" "<url>"
sha256sum "data/atlas/_sources/nairobi/<short-name>.<ext>"
file "data/atlas/_sources/nairobi/<short-name>.<ext>"
```

`-f` makes an HTTP error a failure instead of saving an error page; `file` confirms it is the
PDF, spreadsheet or page it should be. Put the checksum in `SOURCES.md`.

- [ ] **Step 5: Read each document**

Run: `pdftotext -layout data/atlas/_sources/nairobi/<short-name>.pdf data/atlas/_sources/nairobi/<short-name>.txt && wc -c data/atlas/_sources/nairobi/<short-name>.txt`

Read the text. A spreadsheet or an HTML table is read with whatever parses it reliably (install the
library into a virtual environment, not the system Python). If the text file is nearly empty the
PDF is a scan and `pdftotext` has nothing to read: render the pages with
`pdftoppm -r 150 -png <file>.pdf data/atlas/_sources/nairobi/<short-name>-page` and read the images.
There is no OCR here, so transcribe only what is legible with certainty, into a CSV committed under
`scripts/atlas/extract/` with a comment saying it is hand-transcribed and from which page; the sums
in Step 9 are the safety net. A figure that cannot be read with confidence is left blank and
becomes a gap.

- [ ] **Step 6: Record the coalitions**

Fill `data/atlas/blocs.csv` (`year,party,bloc,source,source_url`) from the Registrar's or the
Gazette's lists: one row for each party that stood in Nairobi in each election and belonged to a
coalition, with the coalition as `bloc`, and the same "Publisher, title" source as in `SOURCES.md`.
Write each party as the results document spells it; a party spelt two ways needs a row for each. A
party with no row stands as itself, and an independent (no party) as `Independent`, so leave those
out. If a coalition's members cannot be established from a primary document, leave its parties out
(they stand as themselves) and list that as a gap.

- [ ] **Step 7: Write the extractors, and build the CSVs**

Write Python scripts under `scripts/atlas/extract/`, named for what they read (for example
`nairobi_2022_results.py`), that read `data/atlas/_sources/nairobi/` and write the county's CSVs, so
every figure can be regenerated and audited. Each script owns the rows for its table and election and
replaces any earlier ones, so running it twice changes nothing. They must:
- build a candidate's `id` as `<election_id>/<seat>/<slug of the name>` with `slug.slugify`, where
  `seat` is `kenya` for president, the county for governor and the constituency for MP;
- give each candidate's `bloc` from `data/atlas/blocs.csv` (party to bloc), else the party, else
  `Independent` for a blank party;
- take area keys from `areas.csv`, matching the document's constituency names with `slugify` and
  reporting any name that matches nothing instead of guessing;
- leave a figure the document does not give blank, and write `0` only where the document says 0;
- set `source` and `source_url` exactly as in `SOURCES.md`.

Run them, then `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi`.

- [ ] **Step 8: Population from WorldPop**

On WorldPop's hub find the age-and-sex structures for Kenya at 100 m for the latest year offered
(if both a constrained and an unconstrained product are offered, pick one and say which and why in
`SOURCES.md`). Download every GeoTIFF, one for each sex and age band (in the older series that is 36
files: under 1, 1 to 4, then every five years up to 80 and over), into
`data/atlas/_sources/worldpop-<year>/`, checksum them as in Step 4, and check the disk first
(`df -h /home/user` should show several GB free). The script finds a grid by a file name like
`ken_f_15_2025_....tif` (sex `f` or `m`, the band's first age, the year) and accepts any age bands as
long as both sexes have every band and the bands start at age 0. If the names differ from that
pattern, rename copies and leave the originals alone. Then:

```bash
python3 -m venv /tmp/gwvenv && /tmp/gwvenv/bin/pip install --quiet rasterio numpy
/tmp/gwvenv/bin/python scripts/atlas/ward_population.py public/geo/nairobi-wards.json data/atlas/nairobi/areas.csv data/atlas/_sources/worldpop-<year> <year> "WorldPop, <the dataset's exact title and version>" data/atlas/nairobi/population.csv
```

Expected: 85 rows, `population.csv` with the same `source` text as in `SOURCES.md`. A ward with no
people in the grids is an error, not a zero: the ward map may be in the wrong place.

- [ ] **Step 9: Make it pass the checks**

Run: `npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts 2>&1 | head -40`

Each complaint names the file and row. Fix it at the source by re-reading the document, never by
editing a number until a check stops complaining. When IEBC's own document disagrees with itself (its
constituencies do not add up to its county total, or its valid and rejected votes do not make its
cast), keep IEBC's figures as published and record the difference in
`data/atlas/nairobi/known-differences.csv` with a reason that names the document; the report lists
these for the user. Done is `data/atlas/nairobi passes` and `data/atlas/blocs.csv passes`.

- [ ] **Step 10: Look at the report, and log the gaps**

Run: `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi`

For every gap the report shows (an election with no results, a year with no register, a constituency
missing, a race whose candidates' votes fall short of the valid votes), add a row to the "Gaps" table
in `SOURCES.md`: what is missing, where it was looked for, and why it is missing (not published,
published only as an image, behind a host that was blocked, not found).

- [ ] **Step 11: Commit**

```bash
git add data/atlas scripts/atlas/extract
git commit -m "Atlas data: Nairobi's results, turnout, registers and population, with sources" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

`data/atlas/_sources/` is ignored, so only the CSVs, the extractors and the logs are committed. Check
with `git status --short` that no downloaded document is staged.

---

### Task 13: Gather Nyeri's figures

The same research, with these differences. Read Task 12 first: its checks, rules and commands apply
unchanged. The first load covers Nyeri County's six constituencies and Mathira's six wards, because
Mathira's ward map is the only one in the repository.

**Files:**
- Create: `data/atlas/nyeri/areas.csv`, `candidates.csv`, `results.csv`, `turnout.csv`, `register.csv`, `population.csv`, `known-differences.csv`
- Create: `scripts/atlas/extract/*.py` for the Nyeri documents
- Modify: `data/atlas/blocs.csv` (parties and coalitions that stood in Nyeri and not Nairobi), `data/atlas/SOURCES.md`

**Interfaces:** As Task 12. Produces `data/atlas/nyeri/` that passes the checks together with
`data/atlas/nairobi/` and the shared `data/atlas/blocs.csv`.

**What to find**, for Nyeri's six constituencies (Kieni, Mathira, Mukurweini, Nyeri Town, Othaya,
Tetu):
- **Results and turnout:** all nine elections, in all six constituencies, with the county total for
  president and governor.
- **Registers:** for Mathira's six wards (Iriaini, Karatina Town, Kirimukuyu, Konyu, Magutu, Ruguru)
  where published, and constituency and county totals for all six constituencies where published.
- **Population:** Mathira's six wards only (they are the only wards with shapes); a constituency's
  or the county's population is the sum of its wards' and is left to the screens.

- [ ] **Step 1: Check that the sources can be reached**

Run the same loop as Task 12 Step 1. The same hosts apply.

- [ ] **Step 2: Create the county's folder and its areas**

Run:

```bash
mkdir -p data/atlas/nyeri data/atlas/_sources/nyeri
python3 scripts/atlas/areas_from_map.py public/geo/mathira-wards.json Nyeri data/atlas/nyeri/areas.csv --constituency Mathira --also Kieni --also Mukurweini --also "Nyeri Town" --also Othaya --also Tetu
cd data/atlas/nyeri
printf 'id,election_id,seat,name,party,bloc\n' > candidates.csv
printf 'candidate_id,area_key,votes\n' > results.csv
printf 'election_id,area_key,registered,cast_votes,rejected_votes,valid_votes,source,source_url\n' > turnout.csv
printf 'year,area_key,registered,source,source_url\n' > register.csv
printf 'area_key,year,total,adults,young_adults,source,method\n' > population.csv
printf 'check,election_id,area_key,candidate_id,difference,reason\n' > known-differences.csv
cd ../../..
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nyeri | head -1
npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nyeri | grep Checks
```

Expected: `Nyeri: 1 county, 6 constituencies, 6 wards`, then `Checks: all pass`; `areas.csv` has 14 lines.

- [ ] **Step 3: Find, log, download and read the documents**

As Task 12 Steps 3 to 5, with `nyeri` in the paths. Documents that cover the whole country (a
national results book, a national Gazette notice, the Registrar's coalition lists) are already in
`SOURCES.md` from Nairobi if they were used there: log them once, and say in the "Taken from it"
column that both counties use them.

- [ ] **Step 4: Record the coalitions, and extract**

Add to `data/atlas/blocs.csv` any party that stood in Nyeri and is not there yet (Task 12 Step 6
applies). Write the Nyeri extractors as in Task 12 Step 7; reuse Nairobi's where the documents have
the same layout, with the county as a parameter.

- [ ] **Step 5: Population from WorldPop**

The grids are already in `data/atlas/_sources/worldpop-<year>/` from Task 12. Run:

```bash
/tmp/gwvenv/bin/python scripts/atlas/ward_population.py public/geo/mathira-wards.json data/atlas/nyeri/areas.csv data/atlas/_sources/worldpop-<year> <year> "WorldPop, <the dataset's exact title and version>" data/atlas/nyeri/population.csv
```

Expected: 6 rows.

- [ ] **Step 6: Make it pass the checks, then look at the report and log the gaps**

As Task 12 Steps 9 and 10. Done is `data/atlas/nyeri passes` with Nairobi still passing, and
`data/atlas/blocs.csv passes`. Expect more gaps here than in Nairobi (only Mathira has wards); list
them honestly.

- [ ] **Step 7: Commit**

```bash
git add data/atlas scripts/atlas/extract
git commit -m "Atlas data: Nyeri's results, turnout, registers and Mathira's population, with sources" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 14: The data report, for the user to read

**This task ends with a stop.** The spec promises that before any screen work the user gets a report
of what was found and where. Nothing after this task starts until they have read it and answered.

**Files:** none. The report is a message to the user, built from files already committed.

- [ ] **Step 1: Run the report and every check**

Run: `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi nyeri`

Expected: for each county the report, then `Checks: all pass`. If it says otherwise, go back to Task
12 or 13: the user does not read a report on files that fail their own checks.

Run: `npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts | tail -1`

Expected: `0 failed`.

- [ ] **Step 2: Read `data/atlas/SOURCES.md`**

Every document has a row with its URL and checksum; every gap has a row with where it was looked for
and why it is missing. A document used in a CSV and absent from `SOURCES.md`, or a blank figure with
no gap row, is a defect: fix it before reporting.

- [ ] **Step 3: Write the message**

In plain language, in this order, short enough to read on a phone, with the full report pasted
beneath it:

```
Atlas data report: Nairobi and Nyeri

Found: <the report's counts, in a sentence: which elections and years are complete, which are partial>
Where it is from: <N documents; list their titles and publishers; data/atlas/SOURCES.md has the links and checksums>
Not found: <each gap, one line: what, where it was looked for, why it is missing>
IEBC's own inconsistencies, kept as published: <the recorded differences, or "none">
Coalitions: <which parties are in which coalition for each election, from data/atlas/blocs.csv; anything uncertain>
Judgment calls: <for example which WorldPop product and version, and why; any name spelt two ways>
Question: Is this enough to build the Elections section on, or is there something to chase first?
```

Then the report output, unedited.

- [ ] **Step 4: Stop**

Send the message and end the turn. Do not generate the county migrations, and do not begin the
second plan, until the user answers. If they name something to chase, go back to Task 12 or 13 for
that gap alone and report again.

---

### Task 15: The county migrations

**Gate: the user has read the report and said the data is enough.** Not before.

**Files:**
- Create: `supabase/migrations/20261007100000_atlas_nairobi.sql`
- Create: `supabase/migrations/20261007100100_atlas_nyeri.sql`
- Create: `tests/sql/atlas-counties.test.sql`

**Interfaces:** Consumes `scripts/atlas/build_sql.py` and the two counties' files. Produces two data
migrations that sort after schema 22 and change no schema, and a test that loading them again
changes nothing. Any later timestamp is fine if the date has moved on; they must sort after
`20261007090000`.

- [ ] **Step 1: Build the two migrations**

Run:

```bash
python3 scripts/atlas/build_sql.py data/atlas/nairobi Nairobi supabase/migrations/20261007100000_atlas_nairobi.sql
python3 scripts/atlas/build_sql.py data/atlas/nyeri Nyeri supabase/migrations/20261007100100_atlas_nyeri.sql
```

Expected: no output, two files. Each opens with `-- Election atlas: <County>. Generated by ...` and
a `-- atlas_<table>: N rows` line for every table that has rows. Compare those counts with the
files:

```bash
for county in nairobi nyeri; do
  echo "== $county"; grep -E "^-- atlas_" supabase/migrations/*_atlas_$county.sql
  for t in areas candidates results turnout register population; do
    printf "%-11s csv rows: %s\n" $t $(( $(grep -c . data/atlas/$county/$t.csv) - 1 ))
  done
done
```

Each `-- atlas_<table>: N rows` equals that file's csv rows.

- [ ] **Step 2: Write the test that loading again changes nothing**

The runner has already applied both migrations once when this test starts. The test applies them
again and checks that no table changed, and that the areas are all there (Nairobi is 1 county, 17
constituencies and 85 wards: 103 areas; Nyeri is 1, 6 and 6: 13).

Create `tests/sql/atlas-counties.test.sql`:

```sql
-- The county migrations: the areas are all there, and loading them again changes nothing. Run with
-- tests/sql/run.sh; each test rolls back.

-- test: the areas are there
do $$ begin
  assert (select count(*) from public.atlas_areas where key = 'nairobi' or key like 'nairobi/%') = 103, 'Nairobi''s areas';
  assert (select count(*) from public.atlas_areas where key = 'nyeri' or key like 'nyeri/%') = 13, 'Nyeri''s areas';
end $$;

-- test: loading the counties again changes nothing
begin;
create temp table loaded as
  select (select count(*) from public.atlas_areas) as areas,
         (select count(*) from public.atlas_candidates) as candidates,
         (select count(*) from public.atlas_results) as results,
         (select count(*) from public.atlas_turnout) as turnout,
         (select count(*) from public.atlas_register) as register,
         (select count(*) from public.atlas_population) as population,
         (select coalesce(sum(votes), 0) from public.atlas_results) as votes;
\ir ../../supabase/migrations/20261007100000_atlas_nairobi.sql
\ir ../../supabase/migrations/20261007100100_atlas_nyeri.sql
do $$ begin
  assert (select areas from loaded) = (select count(*) from public.atlas_areas), 'areas';
  assert (select candidates from loaded) = (select count(*) from public.atlas_candidates), 'candidates';
  assert (select results from loaded) = (select count(*) from public.atlas_results), 'results';
  assert (select turnout from loaded) = (select count(*) from public.atlas_turnout), 'turnout';
  assert (select register from loaded) = (select count(*) from public.atlas_register), 'registers';
  assert (select population from loaded) = (select count(*) from public.atlas_population), 'population';
  assert (select votes from loaded) = (select coalesce(sum(votes), 0) from public.atlas_results), 'votes';
end $$;
rollback;
```

- [ ] **Step 3: Run the SQL suite**

Run: `runuser -u nobody -- env PATH="/usr/lib/postgresql/16/bin:$PATH" HOME=/tmp bash tests/sql/run.sh 2>&1 | cut -c1-140`

Expected: `ok   39 migrations apply cleanly`, every test file `ok`, including
`ok   tests/sql/atlas-counties.test.sql (2 tests)`.

If a migration fails to apply, the message names the row; the file is wrong, not the migration:
go back to the data, fix it there and build again.

- [ ] **Step 4: Run every test that runs here**

Run: `for t in tests/atlas-*.test.ts; do printf "%-34s" $t; npx -y tsx --tsconfig tsconfig.json $t 2>&1 | tail -1; done`

Expected: every line ends `0 failed` or `passed`. The `atlas-data` count now includes both counties.

- [ ] **Step 5: Commit, and push the branch**

Nothing is applied to the live database and nothing goes to `main`: the user applies migrations at
the release, with their OK, before the code that needs them.

```bash
git add supabase/migrations/20261007100000_atlas_nairobi.sql supabase/migrations/20261007100100_atlas_nyeri.sql tests/sql/atlas-counties.test.sql
git commit -m "Atlas data: the Nairobi and Nyeri migrations" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin claude/local-folder-access-qo9pew
```

- [ ] **Step 6: Hand over to the second plan**

Tell the user what is done and what is next: schema 22, the rules and both counties' data are on
the branch, tested, unapplied. The next piece is the Elections section, Voters, Home, the diary and
the War room (spec steps 4 to 6), planned against what the report showed. Say that applying the
migrations is theirs to do, at the release, with their OK.

---

## Spec coverage

| Spec | Where it is built |
|------|-------------------|
| 1. The shared atlas: the seven tables, keys, the deliberate exception to `campaign_id` | Task 1 |
| 2. Each campaign's own: home area, sides, notes; who reads and writes | Task 1 |
| 3. Files: the six CSVs and `SOURCES.md` | Tasks 7, 9, 11, 12, 13 |
| 3. Loading: idempotent upserts, one migration per county | Tasks 7, 15 |
| 3. Checks: sums, shares, cast, valid and rejected, parents, ward maps | Task 8 |
| 3. Population from WorldPop | Tasks 10, 12, 13 |
| 3. First load, and the report to the user | Tasks 12, 13, 14, 15 |
| 4. Calculations: measures, lean, swing, register, what to do, votes within reach, wards before station data, formatting and tags | Tasks 2 to 6 |
| Privacy and the law | Global Constraints; Task 1's header; `data/atlas/README.md` |
| Testing: the calculations, the data checks, the SQL | Tasks 1 to 8 |
| Build order, steps 1 to 3 | Tasks 1, then 12 to 15 (data), then 2 to 6 (calculations) |

Not in this plan, by the spec's own two-plan split: section 5 (the Elections section, its address
rules, the print brief and the setup panel), section 6 (Voters, Home, the diary, the War room), the
Errors section's screens, the campaign's own race as the default, and the look in the preview. The
second plan covers them once the user has seen what was found.
