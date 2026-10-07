# Election atlas, part 1: the tables, the figures and the arithmetic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared atlas of public election figures (2013, 2017 and 2022; president, governor
and MP) for Nairobi and Nyeri, with registers and population estimates, loaded from checked
files with their sources, plus the tested arithmetic the screens will use; ending with a
report to the user of what was found.

**Architecture:** Schema 22 adds read-only atlas tables (no `campaign_id`: public facts) and
three campaign tables (home area, sides, notes). Figures live as CSV files under
`data/atlas/<folder>/`; a pure module reads and checks them (`src/lib/atlas-files.ts`), another
turns them into an idempotent migration (`src/lib/atlas-sql.ts`), and small scripts under
`scripts/atlas/` do the file reading, the WorldPop calls and the report. The arithmetic is one
pure module (`src/lib/atlas.ts`).

**Tech Stack:** Postgres/Supabase (RLS), TypeScript run with tsx, the repo's CSV helpers,
WorldPop's statistics API, tsx tests and the SQL test harness.

**Spec:** `docs/superpowers/specs/2026-10-07-election-atlas-design.md` (sections 1–4, Data,
Privacy, Errors, Testing; build order steps 1–3). Part 2 (the Elections section and the touches
across the app) is a separate plan written after the user has seen the data report.

## Global Constraints

- Work on the local branch `election-atlas`. Nothing is pushed or merged without the user's
  OK; migrations go to the database before code that needs them; never rewrite pushed history
  (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint only new or changed lines; in files with older lint errors the count must not rise.
  Test first for every rule; `npm test` runs every `tests/*.test.ts`, then the SQL tests.
- The repository is public: only public figures go in `data/atlas`. No personal data, and no
  field anywhere for a person's ethnicity.
- Every figure names its source document; a figure that wasn't found stays missing (never
  zero, never estimated from other figures); estimates are labelled as estimates.
- Schema version 22 (`groundwork_schema_version()`).
- Copy is plain English.

## Review Focus

1. A results document that lists only the leading candidates: shares must come from the
   document's valid votes, not from adding up the listed candidates. Test: Task 2 ("a partial
   list uses the document's valid votes").
2. A figure typed with a thousands separator or a space ("12,345", "12 345"): the row is
   refused, never read as 12. Test: Task 3 ("a number with a comma is refused").
3. IEBC's own figures not adding up (constituencies against the county): the check fails unless
   that exact difference is recorded with a note. Test: Task 3 ("a recorded difference passes",
   "a different amount still fails").
4. A ward in the data that the ward map doesn't know (renamed or misspelt): refused. Test: Task 3
   ("a ward the map doesn't know").
5. Independent candidates lumped into one "Independent" bloc, making a strongest rival that never
   existed: each independent is a bloc of their own and a bare "Independent" bloc is refused.
   Test: Task 3 ("a bare Independent bloc is refused").

---

### Task 1: Schema 22, the atlas tables

**Files:**
- Create: `supabase/migrations/20261007090000_election_atlas.sql`
- Test: `tests/sql/atlas.test.sql`

**Interfaces:** Produces tables `atlas_sources(id, title, publisher, url, note)`,
`atlas_areas(key, level, name, parent, iebc_code)`, `atlas_elections(id, year, race, held_on,
note)` (nine rows, ids like `2022-governor`), `atlas_candidates(id, election_id, seat, name,
party, bloc)`, `atlas_results(candidate_id, area_key, votes, source_id)`,
`atlas_turnout(election_id, area_key, registered, cast_votes, rejected, valid, source_id)`,
`atlas_register(year, area_key, registered, source_id)`, `atlas_population(area_key, year,
total, adults, young_adults, source_id)`; campaign tables `atlas_settings(campaign_id,
home_area, updated_by, updated_at)`, `atlas_sides(campaign_id, election_id, bloc, updated_by,
updated_at)`, `area_notes(id, campaign_id, area_key, body, updated_by, updated_at)`.

- [ ] **Step 1: Write the failing test** `tests/sql/atlas.test.sql`:

```sql
-- The election atlas: every team reads the public figures and nobody signed in
-- writes them; each campaign's home area, sides and notes stay inside it, and
-- only the candidate or manager changes them. Run with tests/sql/run.sh; each
-- test rolls back.

\ir fixtures.sql

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- A few public figures to read, written as a migration would (kept if the
-- first counties' figures already put them there).
insert into public.atlas_sources (id, title, publisher) values ('test-source', 'A test document', 'IEBC')
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null)
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('nairobi', 'county', 'Nairobi', 'kenya')
  on conflict do nothing;

-- test: the schema is at version 22 or later
do $$ begin
  assert public.groundwork_schema_version() >= 22, 'schema 22';
end $$;

-- test: every team reads the atlas, nobody signed in writes it, and a pending account reads nothing
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
do $$ begin
  assert (select count(*) from public.atlas_areas where key = 'nairobi') = 1, 'a Mathira agent reads Nairobi';
  assert (select count(*) from public.atlas_elections) = 9, 'and the nine elections';
  assert pg_temp.state_of($q$insert into public.atlas_areas (key, level, name, parent) values ('nyeri', 'county', 'Nyeri', 'kenya')$q$) = '42501', 'a team member can''t add an area';
  assert pg_temp.state_of($q$update public.atlas_elections set note = 'x'$q$) = '42501', 'or change an election';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert pg_temp.state_of($q$delete from public.atlas_sources$q$) = '42501', 'not even a candidate deletes a source';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_areas) = 0, 'a pending account reads no areas';
end $$;
rollback;

-- test: notes, sides and the home area stay inside their campaign, written by the candidate or manager
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.area_notes (area_key, body) values ('nairobi', 'Matatu saccos meet on Fridays.');
insert into public.atlas_sides (election_id, bloc) values ('2022-governor', 'Kenya Kwanza');
insert into public.atlas_settings (home_area) values ('nairobi');
do $$ begin
  assert (select campaign_id from public.area_notes) = 'ca000000-0000-4000-8000-000000000002', 'the note is Sakaja''s';
  assert (select updated_by from public.area_notes) = '00000000-0000-0000-0000-0000000000c3', 'and says who wrote it';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_notes) = 1, 'Sakaja''s agent reads the note';
  perform pg_temp.state_of($q$update public.area_notes set body = 'x'$q$);
  assert (select body from public.area_notes) = 'Matatu saccos meet on Fridays.', 'but can''t change it';
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, body) values ('kenya', 'x')$q$) = '42501', 'or add one';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2017-governor', 'Jubilee')$q$) = '42501', 'or pick a side';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_notes) = 0, 'Mathira reads none of Sakaja''s notes';
  assert (select count(*) from public.atlas_sides) = 0, 'nor its sides';
  assert (select count(*) from public.atlas_settings) = 0, 'nor its home area';
  assert pg_temp.state_of($q$insert into public.area_notes (campaign_id, area_key, body) values ('ca000000-0000-4000-8000-000000000002', 'nairobi', 'x')$q$) = '42501', 'and can''t write into Sakaja';
end $$;
rollback;

-- test: a note can't be empty or longer than 2,000 characters, and a side needs a real election
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_notes (area_key, body) values ('nairobi', '   ')$q$) = '23514', 'an empty note';
  assert pg_temp.state_of(format($q$insert into public.area_notes (area_key, body) values ('nairobi', %L)$q$, repeat('a', 2001))) = '23514', 'a long note';
  assert pg_temp.state_of($q$insert into public.atlas_sides (election_id, bloc) values ('2019-governor', 'X')$q$) = '23503', 'an election that never was';
end $$;
rollback;
```

- [ ] **Step 2: Run** `bash tests/sql/run.sh`. Expected: FAIL in `atlas.test.sql` (relation
      `public.atlas_sources` does not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261007090000_election_atlas.sql`:

```sql
-- The election atlas. Schema version 22.
--
-- Public facts shared by every campaign: areas from Kenya down to wards, the
-- elections of 2013, 2017 and 2022 (president, governor and MP), who stood and
-- in which bloc, results and turnout by area, registered voters by ward, and
-- population estimates, each figure with the document it came from. Every team
-- reads them; only migrations and the server write them, so they carry no
-- campaign_id. Each campaign keeps its own home area, the bloc it counts as its
-- side in each past election, and notes about places. Nothing here records
-- anything about a person.

create table public.atlas_sources (
  id        text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  title     text not null check (length(btrim(title)) between 2 and 300),
  publisher text not null check (length(btrim(publisher)) between 2 and 120),
  url       text check (url is null or url ~ '^https?://'),
  note      text check (note is null or length(note) <= 1000)
);

create table public.atlas_areas (
  key       text primary key check (key ~ '^[a-z0-9-]+(/[a-z0-9-]+){0,2}$'),
  level     text not null check (level in ('country', 'county', 'constituency', 'ward')),
  name      text not null check (length(btrim(name)) between 2 and 80),
  parent    text references public.atlas_areas(key),
  iebc_code text check (iebc_code is null or iebc_code ~ '^[0-9]{1,6}$'),
  check ((level = 'country') = (parent is null))
);

create table public.atlas_elections (
  id      text primary key,
  year    integer not null check (year in (2013, 2017, 2022)),
  race    text not null check (race in ('president', 'governor', 'mp')),
  held_on date not null,
  note    text,
  check (id = year::text || '-' || race)
);

insert into public.atlas_elections (id, year, race, held_on, note) values
  ('2013-president', 2013, 'president', '2013-03-04', null),
  ('2013-governor', 2013, 'governor', '2013-03-04', null),
  ('2013-mp', 2013, 'mp', '2013-03-04', null),
  ('2017-president', 2017, 'president', '2017-08-08',
   'The 8 August vote, annulled by the Supreme Court. The 26 October re-run was boycotted in opposition areas, so it says little about lean and is not used.'),
  ('2017-governor', 2017, 'governor', '2017-08-08', null),
  ('2017-mp', 2017, 'mp', '2017-08-08', null),
  ('2022-president', 2022, 'president', '2022-08-09', null),
  ('2022-governor', 2022, 'governor', '2022-08-09', null),
  ('2022-mp', 2022, 'mp', '2022-08-09', null);

create table public.atlas_candidates (
  id          text primary key check (length(id) between 5 and 200),
  election_id text not null references public.atlas_elections(id),
  seat        text not null references public.atlas_areas(key),
  name        text not null check (length(btrim(name)) between 2 and 120),
  party       text check (party is null or length(btrim(party)) between 1 and 120),
  bloc        text not null check (length(btrim(bloc)) between 1 and 60),
  unique (election_id, seat, name)
);

create table public.atlas_results (
  candidate_id text not null references public.atlas_candidates(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  votes        integer not null check (votes >= 0),
  source_id    text not null references public.atlas_sources(id),
  primary key (candidate_id, area_key)
);

create table public.atlas_turnout (
  election_id text not null references public.atlas_elections(id),
  area_key    text not null references public.atlas_areas(key),
  registered  integer check (registered is null or registered >= 0),
  cast_votes  integer check (cast_votes is null or cast_votes >= 0),
  rejected    integer check (rejected is null or rejected >= 0),
  valid       integer check (valid is null or valid >= 0),
  source_id   text not null references public.atlas_sources(id),
  primary key (election_id, area_key),
  check (cast_votes is null or registered is null or cast_votes <= registered),
  check (valid is null or cast_votes is null or valid <= cast_votes)
);

create table public.atlas_register (
  year       integer not null check (year in (2013, 2017, 2022)),
  area_key   text not null references public.atlas_areas(key),
  registered integer not null check (registered >= 0),
  source_id  text not null references public.atlas_sources(id),
  primary key (year, area_key)
);

create table public.atlas_population (
  area_key     text not null references public.atlas_areas(key),
  year         integer not null check (year between 2000 and 2030),
  total        integer not null check (total >= 0),
  adults       integer not null check (adults >= 0 and adults <= total),
  young_adults integer not null check (young_adults >= 0 and young_adults <= adults),
  source_id    text not null references public.atlas_sources(id),
  primary key (area_key, year)
);

-- Every team reads the atlas; nobody signed in writes it.
do $$
declare t text;
begin
  foreach t in array array['atlas_sources', 'atlas_areas', 'atlas_elections', 'atlas_candidates',
                           'atlas_results', 'atlas_turnout', 'atlas_register', 'atlas_population'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy "atlas readable by any team" on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
  end loop;
end $$;

-- Each campaign's own: its home area, its side in each past election, and notes about places.
create table public.atlas_settings (
  campaign_id uuid primary key default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  home_area   text not null references public.atlas_areas(key),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table public.atlas_sides (
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  election_id text not null references public.atlas_elections(id),
  bloc        text not null check (length(btrim(bloc)) between 1 and 60),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, election_id)
);

create table public.area_notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  area_key    text not null references public.atlas_areas(key),
  body        text not null check (length(btrim(body)) between 1 and 2000),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  constraint area_notes_area_key unique (campaign_id, area_key)
);

-- Who changed it, and when, whoever writes.
create or replace function public.atlas_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['atlas_settings', 'atlas_sides', 'area_notes'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.atlas_stamp()', t || '_stamp', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy "own campaign only" on public.%I as restrictive for all to authenticated using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign())', t);
    execute format('create policy "read by the team" on public.%I for select to authenticated using (public.is_team_member(auth.uid()))', t);
    execute format('create policy "written by the candidate or manager" on public.%I for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()))', t);
  end loop;
end $$;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 22 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Run** `bash tests/sql/run.sh`. Expected: all SQL tests pass, including
      `atlas.test.sql` (4 tests).
- [ ] **Step 5: Commit** `Schema 22: an election atlas every team reads, and each campaign's notes and sides`.

---

### Task 2: The arithmetic

**Files:**
- Create: `src/lib/atlas.ts`
- Test: `tests/atlas.test.ts`

**Interfaces:** Produces `type Race`, `RACES`, `YEARS`, `electionId(year, race)`,
`type AreaCount = { year; candidates: { name; party: string | null; bloc; votes }[]; registered:
number | null; cast: number | null; rejected: number | null; valid: number | null }`,
`turnout(c)`, `validVotes(c)`, `blocShares(c): { bloc; votes; share }[]`, `ourShare(c, side)`,
`margin(c, side)`, `swing(now, sideNow, before, sideBefore)`, `registerGrowth(now, before)`,
`notRegistered(pop, registered)`, `registerFlag(gap, adults)`, `topQuarter(values)`,
`votesWithinReach(c, side, siblingTurnouts)`, `type Todo`, `TODO_NAMES`,
`whatToDo({ year, count, side, parentTurnout, parentName, before }): { todo; reason }`,
`figureTag(publisher, level, year, estimate?)`.

- [ ] **Step 1: Write the failing test** `tests/atlas.test.ts`:

```ts
// Checks for the election atlas's arithmetic: turnout, shares, margins, swing,
// the register, what to do and why, and the votes within reach. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas.test.ts

import {
  blocShares,
  figureTag,
  margin,
  notRegistered,
  ourShare,
  registerFlag,
  registerGrowth,
  swing,
  topQuarter,
  turnout,
  validVotes,
  votesWithinReach,
  whatToDo,
  type AreaCount,
} from "@/lib/atlas";

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

/** Every number in a value rounded to four places, so float noise can't fail a check. */
const r4 = (v: unknown): unknown =>
  typeof v === "number"
    ? Math.round(v * 1e4) / 1e4
    : Array.isArray(v)
      ? v.map(r4)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r4(x)]))
        : v;
const near = (name: string, got: unknown, want: unknown) => eq(name, r4(got), r4(want));

const count = (cands: [string, number][], o: Partial<AreaCount> = {}): AreaCount => ({
  year: 2022,
  candidates: cands.map(([bloc, votes]) => ({ name: `${bloc} candidate`, party: null, bloc, votes })),
  registered: 100_000,
  cast: 50_000,
  rejected: 0,
  valid: null,
  ...o,
});
const KK = "Kenya Kwanza";
const AZ = "Azimio";
const IND = "Independent: Jane Wambui";
const C = count([
  [KK, 30_000],
  [AZ, 18_000],
  [IND, 2_000],
]);

near("turnout", turnout(C), 0.5);
eq("no turnout without a register", turnout(count([[KK, 1]], { registered: null })), null);
eq("valid votes add up when the document doesn't give them", validVotes(C), 50_000);
near("each bloc's share, largest first", blocShares(C), [
  { bloc: KK, votes: 30_000, share: 0.6 },
  { bloc: AZ, votes: 18_000, share: 0.36 },
  { bloc: IND, votes: 2_000, share: 0.04 },
]);
near(
  "a partial list uses the document's valid votes",
  ourShare(count([[KK, 30_000], [AZ, 18_000]], { valid: 60_000 }), KK),
  0.5,
);
eq("no side, no share", ourShare(C, null), null);
eq("a side with nobody standing here has nothing", ourShare(C, "Jubilee"), 0);
near("margin over the strongest other bloc", margin(C, KK), 0.24);
near("a negative margin when behind", margin(C, AZ), -0.24);
near(
  "swing between elections, each with its own side",
  swing(C, KK, count([["Jubilee", 25_000], ["NASA", 25_000]]), "Jubilee"),
  0.1,
);
eq("no swing without the election before", swing(C, KK, null, "Jubilee"), null);
near("register growth", registerGrowth(120_000, 100_000), { change: 20_000, rate: 0.2 });
eq("no growth without both", registerGrowth(120_000, null), null);
near("adults not registered, and how young they are", notRegistered({ adults: 1_000, young_adults: 400 }, 700), {
  adults: 300,
  youngShare: 0.4,
});
eq("never below zero", notRegistered({ adults: 1_000, young_adults: 400 }, 1_200)?.adults, 0);
eq("the register flag at a quarter", [registerFlag({ adults: 300 }, 1_000), registerFlag({ adults: 200 }, 1_000)], [true, false]);
near("the top quarter of turnouts", topQuarter([0.7, 0.4, 0.6, 0.5]), 0.625);
eq("no turnouts, no top quarter", topQuarter([]), null);
eq("votes within reach: a turnout push and a 5-point swing", votesWithinReach(C, KK, [0.4, 0.5, 0.6, 0.7]), {
  turnout: 7_500,
  persuasion: 2_500,
  total: 10_000,
});
eq("no turnout votes when already in the top quarter", votesWithinReach(C, KK, [0.3, 0.35, 0.4, 0.45])?.turnout, 0);
eq("no reach without a side", votesWithinReach(C, null, [0.5]), null);

const todo = (
  cands: [string, number][],
  parentTurnout: number | null = 0.5,
  before: AreaCount | null = null,
) =>
  whatToDo({
    year: 2022,
    count: count(cands),
    side: KK,
    parentTurnout,
    parentName: "Nairobi",
    before: before ? { year: 2017, count: before, side: "Jubilee" } : null,
  });

eq("mobilise: ours, but turnout well below the county's", todo([[KK, 30_000], [AZ, 20_000]], 0.6), {
  todo: "mobilise",
  reason: "We took 60.0% here in 2022, but turnout was 50%, 10 points below Nairobi.",
});
eq("hold: 60% or more", todo([[KK, 30_000], [AZ, 20_000]], 0.52), {
  todo: "hold",
  reason: "We took 60.0% here in 2022.",
});
eq("cut the gap: under 40%", todo([[KK, 15_000], [AZ, 33_000], [IND, 2_000]]), {
  todo: "cut",
  reason: "We took 30.0% here in 2022; Azimio took 66.0%.",
});
eq("persuade: a close one", todo([[KK, 24_000], [AZ, 22_500], [IND, 3_500]]), {
  todo: "persuade",
  reason: "2022 was close: 48.0% to us against 45.0% for Azimio.",
});
eq(
  "persuade: a big swing",
  todo([[KK, 27_500], [AZ, 17_500], [IND, 5_000]], 0.5, count([["Jubilee", 21_000], ["NASA", 29_000]])),
  { todo: "persuade", reason: "Our share moved 13 points up between 2017 and 2022." },
);
eq("lean ours", todo([[KK, 27_500], [AZ, 17_500], [IND, 5_000]]), {
  todo: "lean-ours",
  reason: "We took 55.0% here in 2022, a 20-point lead.",
});
eq("lean theirs", todo([[KK, 21_000], [AZ, 28_000], [IND, 1_000]]), {
  todo: "lean-theirs",
  reason: "Azimio took 56.0% here in 2022; we took 42.0%.",
});
eq(
  "no side yet",
  whatToDo({ year: 2022, count: C, side: null, parentTurnout: 0.5, parentName: "Nairobi", before: null }),
  { todo: "no-side", reason: "Set your side in 2022 first." },
);
eq(
  "the tag on every figure",
  [figureTag("IEBC", "constituency", 2022), figureTag("WorldPop", "ward", 2020, true)],
  ["IEBC · constituency total · 2022", "WorldPop estimate · 2020"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/atlas.test.ts`. Expected: FAIL
      (module `@/lib/atlas` not found).

- [ ] **Step 3: Implement** `src/lib/atlas.ts`:

```ts
// The election atlas's arithmetic: turnout, shares, margins, swing, register
// growth, the estimate of adults not yet registered, what to do in an area and
// why, and the votes within reach. Pure: the screens hand it an area's count
// and show what comes back.

export type Race = "president" | "governor" | "mp";
export const RACES: Race[] = ["president", "governor", "mp"];
export const YEARS = [2013, 2017, 2022] as const;

export const electionId = (year: number, race: Race) => `${year}-${race}`;

/** One area's count in one election. */
export type AreaCount = {
  year: number;
  /** Who stood, with their bloc and their votes here. */
  candidates: { name: string; party: string | null; bloc: string; votes: number }[];
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
};

export type BlocShare = { bloc: string; votes: number; share: number };

/** Votes cast ÷ registered; null when either is missing or nobody was registered. */
export function turnout(c: AreaCount): number | null {
  return c.cast !== null && c.registered ? c.cast / c.registered : null;
}

/** The document's valid votes, else the candidates' votes added up. */
export const validVotes = (c: AreaCount): number =>
  c.valid ?? c.candidates.reduce((t, x) => t + x.votes, 0);

/** Each bloc's votes and share of the valid votes, largest first. */
export function blocShares(c: AreaCount): BlocShare[] {
  const valid = validVotes(c);
  const by = new Map<string, number>();
  for (const x of c.candidates) by.set(x.bloc, (by.get(x.bloc) ?? 0) + x.votes);
  return [...by.entries()]
    .map(([bloc, votes]) => ({ bloc, votes, share: valid ? votes / valid : 0 }))
    .sort((a, b) => b.votes - a.votes || a.bloc.localeCompare(b.bloc));
}

/** Our side's share: null without a side or votes; 0 when our side had nobody standing here. */
export function ourShare(c: AreaCount, side: string | null): number | null {
  if (!side || !validVotes(c)) return null;
  return blocShares(c).find((b) => b.bloc === side)?.share ?? 0;
}

/** Our share minus the strongest other bloc's. */
export function margin(c: AreaCount, side: string | null): number | null {
  const ours = ourShare(c, side);
  if (ours === null) return null;
  const other = blocShares(c).find((b) => b.bloc !== side);
  return ours - (other?.share ?? 0);
}

/** Our share now minus at the election before, each with that election's side (0.05 is 5 points). */
export function swing(
  now: AreaCount | null,
  sideNow: string | null,
  before: AreaCount | null,
  sideBefore: string | null,
): number | null {
  if (!now || !before) return null;
  const a = ourShare(now, sideNow);
  const b = ourShare(before, sideBefore);
  return a === null || b === null ? null : a - b;
}

export function registerGrowth(
  now: number | null,
  before: number | null,
): { change: number; rate: number | null } | null {
  if (now === null || before === null) return null;
  return { change: now - before, rate: before ? (now - before) / before : null };
}

/** Adults not on the register (an estimate, never below zero) and the share of adults aged 18–34. */
export function notRegistered(
  pop: { adults: number; young_adults: number } | null,
  registered: number | null,
): { adults: number; youngShare: number | null } | null {
  if (!pop || registered === null) return null;
  return {
    adults: Math.max(pop.adults - registered, 0),
    youngShare: pop.adults ? pop.young_adults / pop.adults : null,
  };
}

/** An estimated quarter or more of the adults aren't registered. */
export const registerFlag = (gap: { adults: number } | null, adults: number | null): boolean =>
  Boolean(gap && adults && gap.adults / adults >= 0.25);

/** The 75th percentile, linear between neighbours; null for no values. */
export function topQuarter(values: number[]): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const i = 0.75 * (xs.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (i - lo);
}

/**
 * The votes within reach here: lifting turnout to the top quarter of the
 * area's siblings at our share, and a 5-point swing of the valid votes.
 */
export function votesWithinReach(
  c: AreaCount,
  side: string | null,
  siblingTurnouts: number[],
): { turnout: number; persuasion: number; total: number } | null {
  const share = ourShare(c, side);
  if (share === null) return null;
  const t = turnout(c);
  const target = topQuarter(siblingTurnouts);
  const fromTurnout =
    t !== null && target !== null && c.registered && target > t
      ? Math.round((target - t) * c.registered * share)
      : 0;
  const persuasion = Math.round(0.05 * validVotes(c));
  return { turnout: fromTurnout, persuasion, total: fromTurnout + persuasion };
}

export type Todo = "mobilise" | "hold" | "cut" | "persuade" | "lean-ours" | "lean-theirs" | "no-side";

export const TODO_NAMES: Record<Todo, string> = {
  mobilise: "Mobilise",
  hold: "Hold",
  cut: "Cut the gap",
  persuade: "Persuade",
  "lean-ours": "Lean ours",
  "lean-theirs": "Lean theirs",
  "no-side": "Set your side first",
};

const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => `${Math.round(Math.abs(x) * 1000) / 10}`;

export type TodoInput = {
  year: number;
  count: AreaCount;
  side: string | null;
  /** Turnout in the area around this one (the county for a constituency), same election. */
  parentTurnout: number | null;
  parentName: string | null;
  /** The same area at the election before, with our side then. */
  before: { year: number; count: AreaCount; side: string | null } | null;
};

/** What to do here and why; the first rule that matches wins. */
export function whatToDo(i: TodoInput): { todo: Todo; reason: string } {
  const share = ourShare(i.count, i.side);
  if (share === null) return { todo: "no-side", reason: `Set your side in ${i.year} first.` };
  const t = turnout(i.count);
  const m = margin(i.count, i.side) ?? 0;
  const leader = blocShares(i.count).find((b) => b.bloc !== i.side);
  const sw = i.before ? swing(i.count, i.side, i.before.count, i.before.side) : null;
  if (share >= 0.5 && t !== null && i.parentTurnout !== null && t < i.parentTurnout - 0.03)
    return {
      todo: "mobilise",
      reason: `We took ${pct1(share)} here in ${i.year}, but turnout was ${pct0(t)}, ${points(i.parentTurnout - t)} points below ${i.parentName ?? "the area around it"}.`,
    };
  if (share >= 0.6) return { todo: "hold", reason: `We took ${pct1(share)} here in ${i.year}.` };
  if (share < 0.4)
    return {
      todo: "cut",
      reason: `We took ${pct1(share)} here in ${i.year}; ${leader ? `${leader.bloc} took ${pct1(leader.share)}` : "others took the rest"}.`,
    };
  if (Math.abs(m) <= 0.1)
    return {
      todo: "persuade",
      reason: `${i.year} was close: ${pct1(share)} to us against ${pct1(leader?.share ?? 0)} for ${leader?.bloc ?? "the rest"}.`,
    };
  if (sw !== null && i.before && Math.abs(sw) >= 0.1)
    return {
      todo: "persuade",
      reason: `Our share moved ${points(sw)} points ${sw > 0 ? "up" : "down"} between ${i.before.year} and ${i.year}.`,
    };
  if (share >= 0.5)
    return { todo: "lean-ours", reason: `We took ${pct1(share)} here in ${i.year}, a ${points(m)}-point lead.` };
  return {
    todo: "lean-theirs",
    reason: `${leader?.bloc ?? "Others"} took ${pct1(leader?.share ?? 0)} here in ${i.year}; we took ${pct1(share)}.`,
  };
}

const LEVEL_TOTAL: Record<string, string> = {
  country: "national total",
  county: "county total",
  constituency: "constituency total",
  ward: "ward total",
};

/** The tag every figure carries: "IEBC · constituency total · 2022", "WorldPop estimate · 2020". */
export function figureTag(publisher: string, level: string, year: number, estimate = false): string {
  return estimate
    ? `${publisher} estimate · ${year}`
    : `${publisher} · ${LEVEL_TOTAL[level] ?? level} · ${year}`;
}
```

- [ ] **Step 4: Run** it. Expected: all pass. Lint the new files (`--fix`); typecheck.
- [ ] **Step 5: Commit** `The atlas's arithmetic: turnout, shares, swing, what to do and why, votes within reach`.

---

### Task 3: The data files, their checks and the report

**Files:**
- Create: `src/lib/atlas-files.ts`, `scripts/atlas/read.ts`, `scripts/atlas/areas.ts`,
  `scripts/atlas/report.ts`, `data/atlas/README.md`, `data/atlas/kenya/areas.csv`
- Test: `tests/atlas-files.test.ts`, `tests/atlas-data.test.ts`

**Interfaces:** Produces `ATLAS_ELECTIONS`, `type Level`, row types `SourceRow`, `AreaRow`,
`CandidateRow`, `ResultRow`, `TurnoutRow` (`cast_votes`), `RegisterRow`, `PopulationRow`,
`DifferenceRow`, `type AtlasFiles`, `type TableName`, `HEADERS`, `FILE_NAMES`, `emptyFiles()`,
`slugify(s)`, `candidateId(election, seat, name)`, `readTable(table, text, where, into):
string[]`, `checkAtlas(files, wardSlugs: Record<string, string[]>): string[]`,
`atlasReport(files): string`; scripts `readAtlas(root, folders)`, `atlasFolders(root)`,
`wardSlugs()`.

- [ ] **Step 1: Write the failing test** `tests/atlas-files.test.ts`:

```ts
// Checks for reading the atlas's data files and the checks every figure must
// pass: whole numbers, areas and their parents, seats, blocs, sources, sums
// that add up, and the report. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-files.test.ts

import {
  atlasReport,
  candidateId,
  checkAtlas,
  emptyFiles,
  readTable,
  slugify,
  type TableName,
} from "@/lib/atlas-files";

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

const BASE: Partial<Record<TableName, string>> = {
  sources: "id,title,publisher,url,note\niebc-test,Form 37C (test),IEBC,https://example.test/37c,\n",
  areas: [
    "key,level,name,parent,iebc_code",
    "kenya,country,Kenya,,",
    "nairobi,county,Nairobi,kenya,047",
    "nairobi/westlands,constituency,Westlands,nairobi,274",
    "nairobi/kibra,constituency,Kibra,nairobi,278",
    "nairobi/kibra/sarangombe,ward,Sarangombe,nairobi/kibra,",
  ].join("\n"),
  candidates: [
    "election,seat,name,party,bloc",
    "2022-governor,nairobi,Johnson Sakaja,UDA,Kenya Kwanza",
    "2022-governor,nairobi,Polycarp Igathe,Jubilee,Azimio",
  ].join("\n"),
  results: [
    "election,seat,candidate,area,votes,source",
    "2022-governor,nairobi,Johnson Sakaja,nairobi,300,iebc-test",
    "2022-governor,nairobi,Johnson Sakaja,nairobi/westlands,100,iebc-test",
    "2022-governor,nairobi,Johnson Sakaja,nairobi/kibra,200,iebc-test",
    "2022-governor,nairobi,Polycarp Igathe,nairobi/westlands,80,iebc-test",
  ].join("\n"),
  turnout: [
    "election,area,registered,cast_votes,rejected,valid,source",
    "2022-governor,nairobi/westlands,400,190,10,180,iebc-test",
  ].join("\n"),
};
const WARDS = { nairobi: ["sarangombe", "kileleshwa"] };

/** The base files with some tables replaced, read and checked. */
function check(over: Partial<Record<TableName, string>> = {}): string[] {
  const f = emptyFiles();
  const problems: string[] = [];
  for (const [table, text] of Object.entries({ ...BASE, ...over }) as [TableName, string][])
    problems.push(...readTable(table, text, table, f));
  return [...problems, ...checkAtlas(f, WARDS)];
}
const has = (problems: string[], part: string) => problems.some((p) => p.includes(part));
const swap = (table: TableName, from: string, to: string) => ({ [table]: BASE[table]!.replace(from, to) });
const DIFF = (n: number) => ({
  differences: `election,seat,candidate,area,difference,note\n2022-governor,nairobi,Johnson Sakaja,nairobi,${n},IEBC's 37C differs from its 37Bs\n`,
});

eq("a clean county passes", check(), []);
eq(
  "a number with a comma is refused",
  has(check(swap("results", "nairobi/kibra,200", 'nairobi/kibra,"1,200"')), 'votes "1,200" is not a whole number'),
  true,
);
eq(
  "a number with a space too",
  has(check(swap("turnout", ",400,", ",4 00,")), 'registered "4 00" is not a whole number'),
  true,
);
eq(
  "a wrong header",
  has(check({ sources: "id,title,publisher\nx,y,z" }), "the header must be id,title,publisher,url,note"),
  true,
);
eq(
  "constituencies that don't add up to the county",
  has(check(swap("results", "nairobi,300", "nairobi,310")), "nairobi has 310 but its 2 parts add up to 300"),
  true,
);
eq("a recorded difference passes", check({ ...swap("results", "nairobi,300", "nairobi,310"), ...DIFF(10) }), []);
eq(
  "a different amount still fails",
  has(check({ ...swap("results", "nairobi,300", "nairobi,310"), ...DIFF(9) }), "add up to 300"),
  true,
);
eq(
  "more candidate votes than valid",
  has(check(swap("results", "westlands,80", "westlands,90")), "the candidates' votes (190) are more than the valid votes (180)"),
  true,
);
eq("cast must be valid plus rejected", has(check(swap("turnout", "400,190,10", "400,195,10")), "don't make cast (195)"), true);
eq(
  "more cast than registered",
  has(check(swap("turnout", ",400,190", ",150,190")), "more votes cast (190) than registered (150)"),
  true,
);
eq(
  "a ward the map doesn't know",
  has(
    check(swap("areas", "nairobi/kibra/sarangombe,ward,Sarangombe", "nairobi/kibra/laini-saba,ward,Laini Saba")),
    `the ward "laini-saba" isn't in nairobi's ward map`,
  ),
  true,
);
eq(
  "an area under the wrong parent",
  has(
    check(swap("areas", "nairobi/kibra,constituency,Kibra,nairobi", "nairobi/kibra,constituency,Kibra,kenya")),
    `"nairobi/kibra" should have the parent "nairobi"`,
  ),
  true,
);
eq(
  "a bare Independent bloc is refused",
  has(check(swap("candidates", "Jubilee,Azimio", "Independent,Independent")), 'as "Independent: Polycarp Igathe"'),
  true,
);
eq(
  "a governor's seat must be a county",
  has(
    check({ candidates: `${BASE.candidates}\n2022-governor,nairobi/westlands,Somebody Else,ODM,Azimio` }),
    "a governor seat must be a county",
  ),
  true,
);
eq(
  "results outside the seat",
  has(
    check({
      candidates: `${BASE.candidates}\n2022-mp,nairobi/westlands,Tim Wanyonyi,ODM,Azimio`,
      results: `${BASE.results}\n2022-mp,nairobi/westlands,Tim Wanyonyi,nairobi/kibra,5,iebc-test`,
    }),
    'outside the seat "nairobi/westlands"',
  ),
  true,
);
eq("an unknown source", has(check(swap("results", "kibra,200,iebc-test", "kibra,200,nope")), `source "nope" isn't listed`), true);
eq(
  "population inside its total",
  has(
    check({ population: "area,year,total,adults,young_adults,source\nnairobi/kibra/sarangombe,2020,100,120,10,iebc-test" }),
    "adults must be within the total",
  ),
  true,
);
eq(
  "ids and slugs",
  [slugify("Ann Ng'ang'a"), candidateId("2022-governor", "nairobi", "Johnson Sakaja")],
  ["ann-ng-ang-a", "2022-governor:nairobi:johnson-sakaja"],
);

const files = emptyFiles();
for (const [table, text] of Object.entries(BASE) as [TableName, string][]) readTable(table, text, table, files);
const report = atlasReport(files);
eq(
  "the report's rows",
  [
    report.includes("| 2022 governor | 2 of 2 | 1 of 2 | yes |"),
    report.includes("| 2013 mp | 0 of 2 | 0 of 2 | n/a |"),
    report.includes("Registered voters by ward: 2013: 0 of 1 · 2017: 0 of 1 · 2022: 0 of 1."),
    report.includes("- `iebc-test`: Form 37C (test), IEBC, https://example.test/37c"),
  ],
  [true, true, true, true],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/atlas-files.test.ts`. Expected:
      FAIL (module `@/lib/atlas-files` not found).

- [ ] **Step 3: Implement** `src/lib/atlas-files.ts`:

```ts
// The atlas's data files: each folder's CSVs read into rows, the checks every
// figure must pass before it becomes a migration, and the report of what is
// loaded. Pure: the scripts and the data test read the files and hand the
// text in.

import { parseCSV } from "@/lib/csv";

export const ATLAS_ELECTIONS = ["2013", "2017", "2022"].flatMap((y) =>
  ["president", "governor", "mp"].map((r) => `${y}-${r}`),
);
const LEVELS = ["country", "county", "constituency", "ward"] as const;
export type Level = (typeof LEVELS)[number];
const SEAT_LEVEL: Record<string, Level> = { president: "country", governor: "county", mp: "constituency" };
const KEY_SHAPE: Record<Level, RegExp> = {
  country: /^[a-z0-9-]+$/,
  county: /^[a-z0-9-]+$/,
  constituency: /^[a-z0-9-]+\/[a-z0-9-]+$/,
  ward: /^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/,
};
/** Kenya's counties: the national total is only checked against them once all are in. */
const COUNTIES = 47;

export type SourceRow = { id: string; title: string; publisher: string; url: string | null; note: string | null };
export type AreaRow = { key: string; level: Level; name: string; parent: string | null; iebc_code: string | null };
export type CandidateRow = { election: string; seat: string; name: string; party: string | null; bloc: string };
export type ResultRow = { election: string; seat: string; candidate: string; area: string; votes: number; source: string };
export type TurnoutRow = {
  election: string;
  area: string;
  registered: number | null;
  cast_votes: number | null;
  rejected: number | null;
  valid: number | null;
  source: string;
};
export type RegisterRow = { year: number; area: string; registered: number; source: string };
export type PopulationRow = {
  area: string;
  year: number;
  total: number;
  adults: number;
  young_adults: number;
  source: string;
};
export type DifferenceRow = {
  election: string;
  seat: string;
  candidate: string;
  area: string;
  difference: number;
  note: string;
};

export type AtlasFiles = {
  sources: SourceRow[];
  areas: AreaRow[];
  candidates: CandidateRow[];
  results: ResultRow[];
  turnout: TurnoutRow[];
  register: RegisterRow[];
  population: PopulationRow[];
  differences: DifferenceRow[];
};
export type TableName = keyof AtlasFiles;

export const HEADERS: Record<TableName, string[]> = {
  sources: ["id", "title", "publisher", "url", "note"],
  areas: ["key", "level", "name", "parent", "iebc_code"],
  candidates: ["election", "seat", "name", "party", "bloc"],
  results: ["election", "seat", "candidate", "area", "votes", "source"],
  turnout: ["election", "area", "registered", "cast_votes", "rejected", "valid", "source"],
  register: ["year", "area", "registered", "source"],
  population: ["area", "year", "total", "adults", "young_adults", "source"],
  differences: ["election", "seat", "candidate", "area", "difference", "note"],
};

/** The file each table is read from, inside a folder of data/atlas. */
export const FILE_NAMES: Record<TableName, string> = {
  sources: "sources.csv",
  areas: "areas.csv",
  candidates: "candidates.csv",
  results: "results.csv",
  turnout: "turnout.csv",
  register: "register.csv",
  population: "population.csv",
  differences: "known-differences.csv",
};

export const emptyFiles = (): AtlasFiles => ({
  sources: [],
  areas: [],
  candidates: [],
  results: [],
  turnout: [],
  register: [],
  population: [],
  differences: [],
});

/** Lower case, accents dropped, anything else a dash: "Ann Ng'ang'a" is "ann-ng-ang-a". */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const candidateId = (election: string, seat: string, name: string) =>
  `${election}:${seat}:${slugify(name)}`;

const WHOLE = /^(0|[1-9][0-9]*)$/;
const SIGNED = /^-?(0|[1-9][0-9]*)$/;

/** Reads one table's CSV text into `into`; returns what stopped rows being read. */
export function readTable(table: TableName, text: string, where: string, into: AtlasFiles): string[] {
  const problems: string[] = [];
  const [head, ...lines] = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  const want = HEADERS[table];
  if (!head || head.map((h) => h.trim()).join(",") !== want.join(","))
    return [`${where}: the header must be ${want.join(",")}`];
  lines.forEach((cells, i) => {
    const at = `${where} line ${i + 2}`;
    const start = problems.length;
    const v = (name: string) => (cells[want.indexOf(name)] ?? "").trim();
    const opt = (name: string) => v(name) || null;
    const num = (name: string, required: boolean, signed = false): number | null => {
      const s = v(name);
      if (!s) {
        if (required) problems.push(`${at}: ${name} is missing`);
        return null;
      }
      if (!(signed ? SIGNED : WHOLE).test(s)) {
        problems.push(`${at}: ${name} "${s}" is not a whole number (no commas or spaces)`);
        return null;
      }
      return Number(s);
    };
    const clean = () => problems.length === start;
    switch (table) {
      case "sources":
        into.sources.push({ id: v("id"), title: v("title"), publisher: v("publisher"), url: opt("url"), note: opt("note") });
        break;
      case "areas":
        into.areas.push({
          key: v("key"),
          level: v("level") as Level,
          name: v("name"),
          parent: opt("parent"),
          iebc_code: opt("iebc_code"),
        });
        break;
      case "candidates":
        into.candidates.push({ election: v("election"), seat: v("seat"), name: v("name"), party: opt("party"), bloc: v("bloc") });
        break;
      case "results": {
        const votes = num("votes", true);
        if (clean())
          into.results.push({
            election: v("election"),
            seat: v("seat"),
            candidate: v("candidate"),
            area: v("area"),
            votes: votes ?? 0,
            source: v("source"),
          });
        break;
      }
      case "turnout": {
        const row: TurnoutRow = {
          election: v("election"),
          area: v("area"),
          registered: num("registered", false),
          cast_votes: num("cast_votes", false),
          rejected: num("rejected", false),
          valid: num("valid", false),
          source: v("source"),
        };
        if (clean()) into.turnout.push(row);
        break;
      }
      case "register": {
        const year = num("year", true);
        const registered = num("registered", true);
        if (clean()) into.register.push({ year: year ?? 0, area: v("area"), registered: registered ?? 0, source: v("source") });
        break;
      }
      case "population": {
        const year = num("year", true);
        const total = num("total", true);
        const adults = num("adults", true);
        const young = num("young_adults", true);
        if (clean())
          into.population.push({
            area: v("area"),
            year: year ?? 0,
            total: total ?? 0,
            adults: adults ?? 0,
            young_adults: young ?? 0,
            source: v("source"),
          });
        break;
      }
      case "differences": {
        const difference = num("difference", true, true);
        if (clean())
          into.differences.push({
            election: v("election"),
            seat: v("seat"),
            candidate: v("candidate"),
            area: v("area"),
            difference: difference ?? 0,
            note: v("note"),
          });
        break;
      }
    }
  });
  return problems;
}

/** Every problem with the figures, one sentence each; none means they can become a migration. */
export function checkAtlas(f: AtlasFiles, wardSlugs: Record<string, string[]>): string[] {
  const out: string[] = [];
  // Differences IEBC's own documents carry, keyed as election|seat|candidate|area
  // (seat and candidate empty for a turnout row's valid + rejected against cast).
  const known = new Map(f.differences.map((d) => [`${d.election}|${d.seat}|${d.candidate}|${d.area}`, d.difference]));
  const allowed = (key: string, diff: number) => diff === 0 || known.get(key) === diff;

  const sources = new Set<string>();
  for (const s of f.sources) {
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s.id)) out.push(`sources: "${s.id}" must be lower-case letters, digits and dashes`);
    if (sources.has(s.id)) out.push(`sources: "${s.id}" is listed twice`);
    if (!s.title || !s.publisher) out.push(`sources: "${s.id}" needs a title and a publisher`);
    if (s.url && !/^https?:\/\//.test(s.url)) out.push(`sources: "${s.id}" has a url that doesn't start with http`);
    sources.add(s.id);
  }
  const source = (where: string, id: string) => {
    if (!sources.has(id)) out.push(`${where}: source "${id}" isn't listed`);
  };

  const areas = new Map<string, AreaRow>();
  for (const a of f.areas) {
    if (areas.has(a.key)) out.push(`areas: "${a.key}" is listed twice`);
    areas.set(a.key, a);
  }
  for (const a of f.areas) {
    if (!(LEVELS as readonly string[]).includes(a.level)) {
      out.push(`areas: "${a.key}" has an unknown level "${a.level}"`);
      continue;
    }
    if (!KEY_SHAPE[a.level].test(a.key)) out.push(`areas: "${a.key}" isn't shaped like a ${a.level} key`);
    if (!a.name) out.push(`areas: "${a.key}" needs a name`);
    if (a.iebc_code && !/^[0-9]{1,6}$/.test(a.iebc_code)) out.push(`areas: "${a.key}" has an IEBC code that isn't digits`);
    const parent =
      a.level === "country" ? null : a.level === "county" ? "kenya" : a.key.split("/").slice(0, -1).join("/");
    if (a.parent !== parent) out.push(`areas: "${a.key}" should have the parent "${parent ?? ""}"`);
    else if (parent && !areas.has(parent)) out.push(`areas: "${a.key}"'s parent "${parent}" isn't listed`);
    if (a.level === "ward") {
      const [county = "", , slug = ""] = a.key.split("/");
      const map = wardSlugs[county];
      if (!map) out.push(`areas: there's no ward map for ${county}, so "${a.key}" can't be checked`);
      else if (!map.includes(slug)) out.push(`areas: the ward "${slug}" isn't in ${county}'s ward map`);
    }
  }
  const area = (where: string, key: string) => {
    if (areas.has(key)) return true;
    out.push(`${where}: the area "${key}" isn't listed`);
    return false;
  };

  const candidates = new Map<string, CandidateRow>();
  for (const c of f.candidates) {
    const where = `candidates: ${c.name || "(no name)"} in ${c.election}`;
    if (!ATLAS_ELECTIONS.includes(c.election)) {
      out.push(`${where}: unknown election`);
      continue;
    }
    const race = c.election.slice(5);
    const seat = areas.get(c.seat);
    if (!seat) out.push(`${where}: the seat "${c.seat}" isn't listed`);
    else if (seat.level !== SEAT_LEVEL[race])
      out.push(`${where}: a ${race} seat must be a ${SEAT_LEVEL[race]}, not "${c.seat}"`);
    if (!c.name) out.push(`${where}: needs a name`);
    if (!c.bloc) out.push(`${where}: needs a bloc`);
    else if (/^independent$/i.test(c.bloc)) out.push(`${where}: name the independent's bloc, as "Independent: ${c.name}"`);
    const id = candidateId(c.election, c.seat, c.name);
    if (candidates.has(id)) out.push(`${where}: listed twice for ${c.seat}`);
    candidates.set(id, c);
  }

  const votesAt = new Map<string, number>();
  const sumAt = new Map<string, number>();
  for (const r of f.results) {
    const where = `results: ${r.election} ${r.candidate} in ${r.area}`;
    const id = candidateId(r.election, r.seat, r.candidate);
    if (!candidates.has(id)) out.push(`${where}: no such candidate for ${r.seat}`);
    if (area(where, r.area) && !(r.seat === "kenya" || r.area === r.seat || r.area.startsWith(`${r.seat}/`)))
      out.push(`${where}: the area is outside the seat "${r.seat}"`);
    source(where, r.source);
    const k = `${id}|${r.area}`;
    if (votesAt.has(k)) out.push(`${where}: listed twice`);
    votesAt.set(k, r.votes);
    const at = `${r.election}|${r.area}`;
    sumAt.set(at, (sumAt.get(at) ?? 0) + r.votes);
  }

  const turnoutAt = new Map<string, TurnoutRow>();
  for (const t of f.turnout) {
    const where = `turnout: ${t.election} in ${t.area}`;
    if (!ATLAS_ELECTIONS.includes(t.election)) out.push(`${where}: unknown election`);
    area(where, t.area);
    source(where, t.source);
    const k = `${t.election}|${t.area}`;
    if (turnoutAt.has(k)) out.push(`${where}: listed twice`);
    turnoutAt.set(k, t);
    if (t.cast_votes !== null && t.registered !== null && t.cast_votes > t.registered)
      out.push(`${where}: more votes cast (${t.cast_votes}) than registered (${t.registered})`);
    if (t.valid !== null && t.cast_votes !== null && t.valid > t.cast_votes)
      out.push(`${where}: more valid votes (${t.valid}) than cast (${t.cast_votes})`);
    if (
      t.valid !== null &&
      t.rejected !== null &&
      t.cast_votes !== null &&
      !allowed(`${t.election}|||${t.area}`, t.cast_votes - t.valid - t.rejected)
    )
      out.push(`${where}: valid (${t.valid}) and rejected (${t.rejected}) don't make cast (${t.cast_votes})`);
  }
  for (const [k, total] of sumAt) {
    const t = turnoutAt.get(k);
    const cap = t ? (t.valid ?? t.cast_votes) : null;
    if (cap !== null && total > cap) {
      const [election, at] = k.split("|");
      const what = t?.valid !== null ? "valid votes" : "votes cast";
      out.push(`results: ${election} in ${at}: the candidates' votes (${total}) are more than the ${what} (${cap})`);
    }
  }

  // Each total against its parts, once every part is in.
  const children = new Map<string, string[]>();
  for (const a of f.areas) if (a.parent) children.set(a.parent, [...(children.get(a.parent) ?? []), a.key]);
  for (const r of f.results) {
    const kids = children.get(r.area) ?? [];
    if (areas.get(r.area)?.level === "country" && kids.length < COUNTIES) continue;
    const id = candidateId(r.election, r.seat, r.candidate);
    const parts = kids.map((k) => votesAt.get(`${id}|${k}`));
    if (!kids.length || parts.some((p) => p === undefined)) continue;
    const sum = parts.reduce((t: number, p) => t + (p ?? 0), 0);
    if (!allowed(`${r.election}|${r.seat}|${r.candidate}|${r.area}`, r.votes - sum))
      out.push(`results: ${r.election} ${r.candidate}: ${r.area} has ${r.votes} but its ${kids.length} parts add up to ${sum}`);
  }

  const seen = new Set<string>();
  for (const r of f.register) {
    const where = `register: ${r.year} in ${r.area}`;
    if (![2013, 2017, 2022].includes(r.year)) out.push(`${where}: the year must be 2013, 2017 or 2022`);
    area(where, r.area);
    source(where, r.source);
    if (seen.has(`register|${r.year}|${r.area}`)) out.push(`${where}: listed twice`);
    seen.add(`register|${r.year}|${r.area}`);
  }
  for (const p of f.population) {
    const where = `population: ${p.area} in ${p.year}`;
    area(where, p.area);
    source(where, p.source);
    if (p.adults > p.total || p.young_adults > p.adults)
      out.push(`${where}: adults must be within the total, and 18–34 within the adults`);
    if (seen.has(`population|${p.year}|${p.area}`)) out.push(`${where}: listed twice`);
    seen.add(`population|${p.year}|${p.area}`);
  }
  return out;
}

/** What is loaded for each county, what is missing, and every source, as Markdown. */
export function atlasReport(f: AtlasFiles): string {
  const name = new Map(f.areas.map((a) => [a.key, a.name]));
  const counties = f.areas.filter((a) => a.level === "county").map((a) => a.key).sort();
  const lines = [
    "# Election atlas: what's loaded",
    "",
    "Written by scripts/atlas/report.ts from data/atlas. Each figure's document is listed under Sources; whatever a county lists as missing was not found.",
    "",
  ];
  for (const county of counties) {
    const consts = f.areas.filter((a) => a.parent === county).map((a) => a.key);
    const wards = f.areas.filter((a) => a.level === "ward" && a.key.startsWith(`${county}/`)).map((a) => a.key);
    const missing: string[] = [];
    lines.push(`## ${name.get(county) ?? county}`, "", "| Election | Constituencies with results | Turnout | County total |", "|---|---|---|---|");
    for (const e of ATLAS_ELECTIONS) {
      const label = e.replace("-", " ");
      const withResults = consts.filter((c) => f.results.some((r) => r.election === e && r.area === c)).length;
      const withTurnout = consts.filter((c) => f.turnout.some((t) => t.election === e && t.area === c)).length;
      const countyTotal = e.endsWith("-mp") ? "n/a" : f.results.some((r) => r.election === e && r.area === county) ? "yes" : "no";
      lines.push(`| ${label} | ${withResults} of ${consts.length} | ${withTurnout} of ${consts.length} | ${countyTotal} |`);
      if (withResults < consts.length) missing.push(`${label}: results for ${consts.length - withResults} of ${consts.length} constituencies`);
      if (countyTotal === "no") missing.push(`${label}: the county total`);
    }
    const reg = [2013, 2017, 2022].map(
      (y) => `${y}: ${wards.filter((w) => f.register.some((r) => r.year === y && r.area === w)).length} of ${wards.length}`,
    );
    const pop = wards.filter((w) => f.population.some((p) => p.area === w)).length;
    lines.push("", `Registered voters by ward: ${reg.join(" · ")}.`, `Population estimates: ${pop} of ${wards.length} wards.`, "");
    if (missing.length) lines.push("Missing:", ...missing.map((m) => `- ${m}`), "");
  }
  lines.push(
    "## Sources",
    "",
    ...[...f.sources]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => `- \`${s.id}\`: ${s.title}, ${s.publisher}${s.url ? `, ${s.url}` : ""}${s.note ? `. ${s.note}` : ""}`),
    "",
  );
  return lines.join("\n");
}
```

  Run the test. Expected: all pass.

- [ ] **Step 4: The files on disk.** `scripts/atlas/read.ts`:

```ts
// Reads the atlas's folders from disk for the scripts and the data test.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { emptyFiles, FILE_NAMES, readTable, type AtlasFiles, type TableName } from "@/lib/atlas-files";

/** Every table of the named folders under root, merged; a missing file is an empty table. */
export function readAtlas(root: string, folders: string[]): { files: AtlasFiles; problems: string[] } {
  const files = emptyFiles();
  const problems: string[] = [];
  for (const folder of folders)
    for (const table of Object.keys(FILE_NAMES) as TableName[]) {
      const path = join(root, folder, FILE_NAMES[table]);
      if (existsSync(path)) problems.push(...readTable(table, readFileSync(path, "utf8"), path, files));
    }
  return { files, problems };
}

/** The folders under root, alphabetically. */
export const atlasFolders = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

/** The ward slugs each county's ward map knows. Nyeri's map holds Mathira's wards only. */
export function wardSlugs(): Record<string, string[]> {
  const slugs = (file: string) =>
    (JSON.parse(readFileSync(file, "utf8")) as { features: { properties: { slug: string } }[] }).features.map(
      (f) => f.properties.slug,
    );
  return { nairobi: slugs("public/geo/nairobi-wards.json"), nyeri: slugs("public/geo/mathira-wards.json") };
}
```

  `scripts/atlas/areas.ts`:

```ts
// Prints areas.csv rows for every ward in a ward map, under its constituency,
// to paste into data/atlas/<county>/areas.csv below the county's own row. Run
// from the repository root, for example:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/nairobi-wards.json nairobi
//   npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/mathira-wards.json nyeri mathira
// The last argument names the constituency for a map whose wards don't say.
import { readFileSync } from "node:fs";

import { slugify } from "@/lib/atlas-files";
import { toCSV } from "@/lib/csv";

const [geoFile, county, constituency] = process.argv.slice(2);
if (!geoFile || !county) {
  console.error("usage: areas.ts <ward map> <county key> [constituency key]");
  process.exit(2);
}
const titled = (slug: string) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
type Ward = { properties: { slug: string; name: string; constituency?: string } };
const wards = (JSON.parse(readFileSync(geoFile, "utf8")) as { features: Ward[] }).features;
const rows = new Map<string, string[]>();
for (const w of wards) {
  const cName = w.properties.constituency ?? titled(constituency ?? "");
  const c = constituency ?? slugify(cName);
  rows.set(`${county}/${c}`, [`${county}/${c}`, "constituency", cName, county, ""]);
  rows.set(`${county}/${c}/${w.properties.slug}`, [`${county}/${c}/${w.properties.slug}`, "ward", w.properties.name, `${county}/${c}`, ""]);
}
console.log(
  toCSV(["key", "level", "name", "parent", "iebc_code"], [...rows.values()].sort((a, b) => a[0]!.localeCompare(b[0]!))).replace(/\r\n/g, "\n"),
);
```

  `scripts/atlas/report.ts`:

```ts
// Writes data/atlas/REPORT.md: what is loaded for each county, what is
// missing, and every source. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts
import { writeFileSync } from "node:fs";

import { atlasReport } from "@/lib/atlas-files";

import { atlasFolders, readAtlas } from "./read";

const { files, problems } = readAtlas("data/atlas", atlasFolders("data/atlas"));
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync("data/atlas/REPORT.md", atlasReport(files));
console.log("wrote data/atlas/REPORT.md");
```

  `data/atlas/kenya/areas.csv`:

```csv
key,level,name,parent,iebc_code
kenya,country,Kenya,,
```

  `data/atlas/README.md`:

```markdown
# The election atlas's figures

Public figures only: this repository is public. Each folder is one county (`kenya` holds the
country itself, the presidential candidates and national totals, and sources several counties
share). `scripts/atlas/build-sql.ts` turns folders into a migration once
`tests/atlas-data.test.ts` passes; `scripts/atlas/report.ts` writes `REPORT.md`.

## Files (every one optional, every header exact)

- `sources.csv` — `id,title,publisher,url,note`: one row per document. Ids are lower case with
  dashes, e.g. `iebc-2022-form-37c-nairobi`.
- `areas.csv` — `key,level,name,parent,iebc_code`: `kenya`; counties (`nairobi`, parent
  `kenya`); constituencies (`nairobi/westlands`); wards (`nairobi/westlands/kangemi`, the slug
  from the ward map). `scripts/atlas/areas.ts` prints the constituency and ward rows.
- `candidates.csv` — `election,seat,name,party,bloc`: elections are `2013-president` …
  `2022-mp`; the seat is `kenya` for president, the county for governor, the constituency for
  MP.
- `results.csv` — `election,seat,candidate,area,votes,source`: votes where they were counted
  (a constituency or the county total), whole numbers with no commas.
- `turnout.csv` — `election,area,registered,cast_votes,rejected,valid,source`: blanks for what
  the document doesn't give.
- `register.csv` — `year,area,registered,source`: registered voters, by ward and above.
- `population.csv` — `area,year,total,adults,young_adults,source`: WorldPop estimates, written
  by `scripts/atlas/population.ts`.
- `known-differences.csv` — `election,seat,candidate,area,difference,note`: a sum that doesn't
  add up in IEBC's own documents, with the exact difference (total minus its parts) and what
  the documents say. For a turnout row whose valid and rejected don't make cast, leave seat and
  candidate empty.

## Rules

- A figure comes from a document listed in `sources.csv`, or it isn't entered. Nothing is
  estimated from other figures, averaged or filled in.
- Prefer IEBC's own documents (results forms 34B/34C, 35B, 37B/37C; published results and
  registers; post-election reports) and the Kenya Gazette. A media tally or open dataset is
  used only to fill a gap, with its own publisher, and the report flags it.
- List every candidate the document lists. When a document lists only the leaders, enter
  them and the document's valid votes, so shares stay right.
- The bloc is the coalition the candidate's party stood in, else the party. An independent
  is a bloc of their own: `Independent: <name>`. The main coalitions: 2013 Jubilee (TNA, URP
  and partners), CORD (ODM, Wiper, Ford-K and partners), Amani (UDF, KANU and partners); 2017
  Jubilee (Jubilee Party), NASA (ODM, Wiper, ANC, Ford-K, CCM); 2022 Kenya Kwanza (UDA, ANC,
  Ford-K and partners), Azimio (ODM, Jubilee, Wiper, KANU, DAP-K and partners). Where a party's
  membership is unclear, use the party and say so in the source's note.
- The 2017 presidential figures are the 8 August vote.
```

  `tests/atlas-data.test.ts`:

```ts
// Checks every county's figures in data/atlas before they become a migration:
// the sums, the shares, the areas and the sources. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts

import { checkAtlas } from "@/lib/atlas-files";

import { atlasFolders, readAtlas, wardSlugs } from "../scripts/atlas/read";

const folders = atlasFolders("data/atlas");
const { files, problems } = readAtlas("data/atlas", folders);
const all = [...problems, ...checkAtlas(files, wardSlugs())];
for (const p of all) console.log(`FAIL ${p}`);
console.log(`${folders.length} folders, ${files.results.length} results, ${all.length} problems`);
process.exit(all.length ? 1 : 0);
```

- [ ] **Step 5: Run** the files test, the data test (expected: `1 folders, 0 results, 0
      problems`) and `npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts
      public/geo/mathira-wards.json nyeri mathira` (expected: a header, `nyeri/mathira` and six
      ward rows). Lint the new files (`--fix`); typecheck.
- [ ] **Step 6: Commit** `The atlas's data files: formats, the checks every figure must pass, and the report`.

---

### Task 4: From files to a migration

**Files:**
- Create: `src/lib/atlas-sql.ts`, `scripts/atlas/build-sql.ts`
- Test: `tests/atlas-sql.test.ts`

**Interfaces:** Consumes Task 3's `AtlasFiles`, `candidateId`. Produces `atlasSql(files):
string` (upserts in foreign-key order, 500 rows a statement) and the script
`build-sql.ts <migration.sql> <folder>…`.

- [ ] **Step 1: Write the failing test** `tests/atlas-sql.test.ts`:

```ts
// Checks for turning the atlas's files into a migration: quoting, the order
// the foreign keys need, ids, upserts and chunking. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-sql.test.ts

import { emptyFiles, readTable } from "@/lib/atlas-files";
import { atlasSql } from "@/lib/atlas-sql";

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

const f = emptyFiles();
readTable("sources", "id,title,publisher,url,note\niebc-test,Kenya's register (test),IEBC,,\n", "sources", f);
readTable(
  "areas",
  "key,level,name,parent,iebc_code\nnairobi/kibra,constituency,Kibra,nairobi,\nnairobi,county,Nairobi,kenya,047\nkenya,country,Kenya,,\n",
  "areas",
  f,
);
readTable("candidates", "election,seat,name,party,bloc\n2022-governor,nairobi,Ann Ng'ang'a,UDA,Kenya Kwanza\n", "candidates", f);
readTable("results", "election,seat,candidate,area,votes,source\n2022-governor,nairobi,Ann Ng'ang'a,nairobi/kibra,12,iebc-test\n", "results", f);
const sql = atlasSql(f);
const at = (s: string) => sql.indexOf(s);

eq("quotes are doubled", sql.includes("'Kenya''s register (test)'"), true);
eq("parents go in before their children", at("('kenya'") < at("('nairobi'") && at("('nairobi'") < at("('nairobi/kibra'"), true);
eq("sources and areas before candidates, candidates before results", at("atlas_sources") < at("atlas_areas") && at("atlas_candidates") < at("atlas_results"), true);
eq("the candidate's id", sql.includes("'2022-governor:nairobi:ann-ng-ang-a'"), true);
eq(
  "upserts",
  sql.includes("on conflict (candidate_id, area_key) do update set votes = excluded.votes, source_id = excluded.source_id;"),
  true,
);
eq("an empty cell is null", sql.includes("'Kibra', 'nairobi', null)"), true);
eq("an empty table is left out", sql.includes("atlas_population"), false);

const many = emptyFiles();
readTable(
  "register",
  `year,area,registered,source\n${Array.from({ length: 501 }, (_, i) => `2022,w${i},1,s`).join("\n")}`,
  "register",
  many,
);
eq("long tables go in 500 rows at a time", (atlasSql(many).match(/insert into public\.atlas_register/g) ?? []).length, 2);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module `@/lib/atlas-sql` not found).

- [ ] **Step 3: Implement** `src/lib/atlas-sql.ts`:

```ts
// The atlas's figures as a migration: upserts in the order the foreign keys
// need, so running it twice changes nothing and a corrected file replaces the
// old figure. Pure.

import { candidateId, type AtlasFiles } from "@/lib/atlas-files";

type Cell = string | number | null;

const lit = (v: Cell): string =>
  v === null ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

function upsert(table: string, cols: string[], rows: Cell[][], key: string[]): string {
  if (!rows.length) return "";
  const update = cols
    .filter((c) => !key.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows
      .slice(i, i + 500)
      .map((r) => `  (${r.map(lit).join(", ")})`)
      .join(",\n");
    out.push(
      `insert into public.${table} (${cols.join(", ")}) values\n${values}\non conflict (${key.join(", ")}) do ${update ? `update set ${update}` : "nothing"};\n`,
    );
  }
  return out.join("\n");
}

const depth = (key: string) => (key === "kenya" ? 0 : key.split("/").length);

export function atlasSql(f: AtlasFiles): string {
  const areas = [...f.areas].sort((a, b) => depth(a.key) - depth(b.key) || a.key.localeCompare(b.key));
  return [
    upsert("atlas_sources", ["id", "title", "publisher", "url", "note"], f.sources.map((s) => [s.id, s.title, s.publisher, s.url, s.note]), ["id"]),
    upsert("atlas_areas", ["key", "level", "name", "parent", "iebc_code"], areas.map((a) => [a.key, a.level, a.name, a.parent, a.iebc_code]), ["key"]),
    upsert(
      "atlas_candidates",
      ["id", "election_id", "seat", "name", "party", "bloc"],
      f.candidates.map((c) => [candidateId(c.election, c.seat, c.name), c.election, c.seat, c.name, c.party, c.bloc]),
      ["id"],
    ),
    upsert(
      "atlas_results",
      ["candidate_id", "area_key", "votes", "source_id"],
      f.results.map((r) => [candidateId(r.election, r.seat, r.candidate), r.area, r.votes, r.source]),
      ["candidate_id", "area_key"],
    ),
    upsert(
      "atlas_turnout",
      ["election_id", "area_key", "registered", "cast_votes", "rejected", "valid", "source_id"],
      f.turnout.map((t) => [t.election, t.area, t.registered, t.cast_votes, t.rejected, t.valid, t.source]),
      ["election_id", "area_key"],
    ),
    upsert("atlas_register", ["year", "area_key", "registered", "source_id"], f.register.map((r) => [r.year, r.area, r.registered, r.source]), ["year", "area_key"]),
    upsert(
      "atlas_population",
      ["area_key", "year", "total", "adults", "young_adults", "source_id"],
      f.population.map((p) => [p.area, p.year, p.total, p.adults, p.young_adults, p.source]),
      ["area_key", "year"],
    ),
  ]
    .filter(Boolean)
    .join("\n");
}
```

  Run the test. Expected: all pass.

- [ ] **Step 4: The script** `scripts/atlas/build-sql.ts`:

```ts
// Writes one migration from the atlas folders named on the command line, once
// their figures pass the checks. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts supabase/migrations/<stamp>_atlas_<name>.sql kenya nairobi nyeri
import { writeFileSync } from "node:fs";

import { checkAtlas } from "@/lib/atlas-files";
import { atlasSql } from "@/lib/atlas-sql";

import { readAtlas, wardSlugs } from "./read";

const [out, ...folders] = process.argv.slice(2);
if (!out || !folders.length) {
  console.error("usage: build-sql.ts <migration.sql> <folder>...");
  process.exit(2);
}
const { files, problems } = readAtlas("data/atlas", folders);
const all = [...problems, ...checkAtlas(files, wardSlugs())];
if (all.length) {
  console.error(all.join("\n"));
  process.exit(1);
}
writeFileSync(
  out,
  `-- The election atlas's figures for ${folders.join(", ")}, from data/atlas.\n` +
    "-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.\n\n" +
    atlasSql(files),
);
console.log(`wrote ${out}`);
```

- [ ] **Step 5: Run** the tests; lint the new files (`--fix`); typecheck. Then check the
      script end to end on the `kenya` folder alone:
      `npx tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts "$TMPDIR/atlas-try.sql" kenya`
      (expected: `wrote …`, and the file holds one `insert into public.atlas_areas` for `kenya`);
      delete the try file.
- [ ] **Step 6: Commit** `The atlas's figures become a migration, checked first`.

---

### Task 5: Population estimates from WorldPop

**Files:**
- Create: `src/lib/atlas-population.ts`, `scripts/atlas/population.ts`,
  `data/atlas/kenya/sources.csv`
- Test: `tests/atlas-population.test.ts`

**Interfaces:** Produces `type PyramidBand = { age; male; female }`, `bandStart(age)`,
`fromPyramid(bands): { total; adults; young_adults }`, `simplifyRing(ring, tolerance)`,
`compactGeometry(geometry, tolerance)`, and the script `population.ts <ward map> <county>
<out.csv> [constituency]` (env `ATLAS_LIMIT=n` for a trial on the first n wards). The shared
source `worldpop-2020-agesex` lives in `data/atlas/kenya/sources.csv`.

- [ ] **Step 1: Write the failing test** `tests/atlas-population.test.ts`:

```ts
// Checks for turning WorldPop's age-and-sex pyramid into the atlas's numbers,
// and for shrinking a ward's outline to send to WorldPop. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-population.test.ts

import { bandStart, compactGeometry, fromPyramid, simplifyRing } from "@/lib/atlas-population";

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

eq("a band's first age", ["15 to 19", "15-19", "80+", "0", "x"].map(bandStart), [15, 15, 80, 0, null]);
eq(
  "total, adults and 18–34, a band shared evenly across its ages",
  fromPyramid([
    { age: "35 to 39", male: 50, female: 50 },
    { age: "10 to 14", male: 50, female: 50 },
    { age: "15 to 19", male: 50, female: 50 },
    { age: "20 to 24", male: 50, female: 50 },
    { age: "25 to 29", male: 50, female: 50 },
    { age: "30 to 34", male: 50, female: 50 },
    { age: "80+", male: 5, female: 5 },
  ]),
  { total: 610, adults: 450, young_adults: 340 },
);
const square: [number, number][] = [
  [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5], [0, 0],
];
eq("a square loses its points along straight edges", simplifyRing(square, 0.01), [
  [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
]);
const spike: [number, number][] = [
  [0, 0], [1, 0], [1, 0.5], [1.2, 0.55], [1, 0.6], [1, 1], [0, 1], [0, 0],
];
eq("but keeps a spike bigger than the tolerance", simplifyRing(spike, 0.05).some(([x]) => x === 1.2), true);
eq(
  "compacting rounds to five places",
  compactGeometry(
    { type: "Polygon", coordinates: [[[36.123456789, -1.2], [36.2, -1.2], [36.2, -1.3], [36.123456789, -1.2]]] },
    0.0001,
  ),
  { type: "Polygon", coordinates: [[[36.12346, -1.2], [36.2, -1.2], [36.2, -1.3], [36.12346, -1.2]]] },
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module `@/lib/atlas-population` not found).

- [ ] **Step 3: Implement** `src/lib/atlas-population.ts`:

```ts
// WorldPop's age-and-sex pyramid for a ward turned into the atlas's three
// numbers, and a ward's outline shrunk enough to send to WorldPop. Pure.

export type PyramidBand = { age: string; male: number; female: number };

/** The first age in a band's label: "15 to 19", "15-19", "80+" and "0" all work. */
export function bandStart(age: string): number | null {
  const m = String(age).match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Total, adults (18+) and young adults (18–34), each band's people spread evenly over its ages. */
export function fromPyramid(bands: PyramidBand[]): { total: number; adults: number; young_adults: number } {
  const rows = bands
    .map((b) => ({ start: bandStart(b.age), people: (Number(b.male) || 0) + (Number(b.female) || 0) }))
    .filter((b): b is { start: number; people: number } => b.start !== null)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let adults = 0;
  let young = 0;
  rows.forEach((b, i) => {
    const end = rows[i + 1]?.start ?? Infinity;
    // The share of this band's ages that fall in [lo, hi); the oldest band is open-ended.
    const within = (lo: number, hi: number) =>
      end === Infinity
        ? b.start >= lo && b.start < hi
          ? 1
          : 0
        : Math.max(0, Math.min(end, hi) - Math.max(b.start, lo)) / (end - b.start);
    total += b.people;
    adults += b.people * within(18, Infinity);
    young += b.people * within(18, 35);
  });
  return { total: Math.round(total), adults: Math.round(adults), young_adults: Math.round(young) };
}

type Pt = [number, number];

function distance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on a closed ring, keeping its ends; never fewer than four points. */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length <= 4) return ring;
  const keep = ring.map((_, i) => i === 0 || i === ring.length - 1);
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let most = 0;
    for (let i = a + 1; i < b; i++) {
      const d = distance(ring[i]!, ring[a]!, ring[b]!);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far !== -1 && most > tolerance) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

export type Outline =
  | { type: "Polygon"; coordinates: Pt[][] }
  | { type: "MultiPolygon"; coordinates: Pt[][][] };

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** A ward's outline with every ring simplified and its coordinates rounded to about a metre. */
export function compactGeometry(g: Outline, tolerance: number): Outline {
  const ring = (r: Pt[]): Pt[] => simplifyRing(r, tolerance).map(([x, y]) => [round5(x), round5(y)]);
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: g.coordinates.map(ring) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(ring)) };
}
```

  Run the test. Expected: all pass.

- [ ] **Step 4: The script** `scripts/atlas/population.ts`:

```ts
// WorldPop's 2020 age-and-sex estimate for every ward in a ward map, written as
// an atlas population.csv. Run from the repository root, for example:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts public/geo/nairobi-wards.json nairobi data/atlas/nairobi/population.csv
//   npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts public/geo/mathira-wards.json nyeri data/atlas/nyeri/population.csv mathira
// The optional last argument names the constituency for a map whose wards
// don't say. ATLAS_LIMIT=2 tries the first two wards only. A ward WorldPop
// can't answer for is left out and named at the end: missing stays missing.
import { readFileSync, writeFileSync } from "node:fs";

import { slugify } from "@/lib/atlas-files";
import { compactGeometry, fromPyramid, type Outline, type PyramidBand } from "@/lib/atlas-population";
import { toCSV } from "@/lib/csv";

const YEAR = 2020;
const SOURCE = "worldpop-2020-agesex";
const API = "https://api.worldpop.org/v1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Body = { status?: string; taskid?: string; error?: boolean; error_message?: string; data?: { agesexpyramid?: PyramidBand[] } };

async function pyramid(geometry: Outline): Promise<PyramidBand[]> {
  const geojson = JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] });
  let body = (await (await fetch(`${API}/services/stats?dataset=wpgpas&year=${YEAR}&runasync=false&geojson=${encodeURIComponent(geojson)}`)).json()) as Body;
  for (let i = 0; body.taskid && body.status !== "finished" && !body.error && i < 90; i++) {
    await wait(2000);
    body = (await (await fetch(`${API}/tasks/${body.taskid}`)).json()) as Body;
  }
  if (body.error) throw new Error(body.error_message ?? "WorldPop refused the query");
  const bands = body.data?.agesexpyramid;
  if (!Array.isArray(bands)) throw new Error(`no age-sex pyramid in ${JSON.stringify(body).slice(0, 300)}`);
  return bands;
}

const [geoFile, county, out, constituency] = process.argv.slice(2);
if (!geoFile || !county || !out) {
  console.error("usage: population.ts <ward map> <county key> <out.csv> [constituency key]");
  process.exit(2);
}
type Ward = { properties: { slug: string; constituency?: string }; geometry: Outline };
const wards = (JSON.parse(readFileSync(geoFile, "utf8")) as { features: Ward[] }).features.slice(
  0,
  Number(process.env["ATLAS_LIMIT"]) || undefined,
);
const rows: (string | number)[][] = [];
const failed: string[] = [];
for (const w of wards) {
  const key = `${county}/${constituency ?? slugify(w.properties.constituency ?? "")}/${w.properties.slug}`;
  try {
    const p = fromPyramid(await pyramid(compactGeometry(w.geometry, 0.0003)));
    rows.push([key, YEAR, p.total, p.adults, p.young_adults, SOURCE]);
    console.log(`${key}: ${p.total} people, ${p.adults} adults, ${p.young_adults} aged 18–34`);
  } catch (e) {
    failed.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await wait(1500);
}
writeFileSync(out, `${toCSV(["area", "year", "total", "adults", "young_adults", "source"], rows).replace(/\r\n/g, "\n")}\n`);
console.log(`wrote ${rows.length} wards to ${out}`);
if (failed.length) console.log(`not answered, left out:\n${failed.join("\n")}`);
```

  `data/atlas/kenya/sources.csv`:

```csv
id,title,publisher,url,note
worldpop-2020-agesex,"Age and sex structures, Kenya, 2020, 100 m grid",WorldPop (University of Southampton),https://hub.worldpop.org/geodata/listing?id=65,"Estimates, summed inside each ward's boundary through WorldPop's statistics API (dataset wpgpas); 18–34 counts two fifths of the 15–19 band."
```

- [ ] **Step 5: Try it on one ward:** `ATLAS_LIMIT=1 npx tsx --tsconfig tsconfig.json
      scripts/atlas/population.ts public/geo/mathira-wards.json nyeri "$TMPDIR/pop-try.csv"
      mathira`. Expected: one ward with a few thousand people, adults below the total and 18–34
      below the adults. If WorldPop answers in another shape (the age list under another name,
      or other band labels), change `pyramid()`'s reading to match and ledger it as a ruling;
      if the API is down or refuses, ledger it and leave population out (the report will say
      so). Delete the try file.
- [ ] **Step 6: Run** the tests and the data test; lint the new files (`--fix`); typecheck.
- [ ] **Step 7: Commit** `Population estimates for each ward from WorldPop's open grid`.

---

### Task 6: Nairobi's figures

**Files:**
- Create: `data/atlas/nairobi/areas.csv`, `sources.csv`, `candidates.csv`, `results.csv`,
  `turnout.csv`, `register.csv`, `population.csv` (and `known-differences.csv` if needed)
- Modify: `data/atlas/kenya/sources.csv`, and create `data/atlas/kenya/candidates.csv`,
  `results.csv`, `turnout.csv` (the presidential candidates and national totals)

**Interfaces:** Consumes Tasks 3–5 (formats, checks, scripts). Produces figures that pass
`tests/atlas-data.test.ts`.

Rules for every step (also in `data/atlas/README.md`): a figure comes from a listed document or
it isn't entered; prefer IEBC's documents and the Kenya Gazette; open datasets and media tallies
only fill gaps and are named as their publisher; list every candidate the document lists, else
the leaders plus the document's valid votes; blocs as in the README; every independent is
`Independent: <name>`. Spend about ten searches or fetches on an item; if nothing trustworthy
turns up, leave it missing and go on (the report lists it). Record how each figure was read in
its source's note (e.g. "constituency totals read from the scanned Form 37C").

- [ ] **Step 1: Areas.** Write `data/atlas/nairobi/areas.csv`:

```bash
{ echo "key,level,name,parent,iebc_code"; echo "nairobi,county,Nairobi,kenya,047"; npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/nairobi-wards.json nairobi | tail -n +2; } > data/atlas/nairobi/areas.csv
```

  Check: `grep -c ",constituency," data/atlas/nairobi/areas.csv` is 17 and
  `grep -c ",ward," data/atlas/nairobi/areas.csv` is 85. Run the data test: 0 problems. Add
  constituency IEBC codes later where a document gives them.

- [ ] **Step 2: Population.** `npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts
      public/geo/nairobi-wards.json nairobi data/atlas/nairobi/population.csv` (about five
      minutes). Expected: 85 wards written, or the ones WorldPop didn't answer named. Run the
      data test.

- [ ] **Step 3: The presidential race, nationally** (`data/atlas/kenya/`): for 2022, 2017
      (8 August) and 2013, every presidential candidate in `candidates.csv` (seat `kenya`),
      their national votes in `results.csv` (area `kenya`) and the national registered, cast,
      rejected and valid in `turnout.csv`, from IEBC's declarations (Form 34C) or the Gazette.
      Sources in `data/atlas/kenya/sources.csv`. Run the data test.

- [ ] **Step 4: Governor and president in Nairobi, by constituency and for the county,** in this
      order: 2022, 2017, 2013. Governor candidates go in `nairobi/candidates.csv` (seat
      `nairobi`); results for each constituency (`nairobi/<constituency>`) and the county
      (`nairobi`) in `nairobi/results.csv`; each area's registered, cast, rejected and valid for
      that race in `nairobi/turnout.csv`. Presidential results at the same areas use the
      candidates in `kenya/candidates.csv` (seat `kenya`). Look first for IEBC's county and
      constituency forms (34B/34C, 37B/37C) and published results, then openAFRICA or Code for
      Africa datasets citing IEBC, then a reputable media tally. Run the data test after each
      election; when a county total differs from its constituencies in the documents
      themselves, record the exact difference in `known-differences.csv` with a note.

- [ ] **Step 5: MP in each of the 17 constituencies,** 2022, then 2017, then 2013: candidates
      with seat `nairobi/<constituency>`, results at the constituency, and the MP race's turnout
      there (Form 35B or published constituency results). Run the data test after each
      election.

- [ ] **Step 6: Registered voters by ward,** 2022, 2017, 2013, from IEBC's registers by county
      assembly ward, in `nairobi/register.csv`. Run the data test.

- [ ] **Step 7: Run** `npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts` (0 problems)
      and `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts`; read `data/atlas/REPORT.md`
      for Nairobi and check its gaps match what wasn't found.
- [ ] **Step 8: Commit** `Atlas figures for Nairobi: results, turnout, registers and population, with their sources`.

---

### Task 7: Nyeri's figures (Mathira's county)

**Files:**
- Create: `data/atlas/nyeri/areas.csv`, `sources.csv`, `candidates.csv`, `results.csv`,
  `turnout.csv`, `register.csv`, `population.csv` (and `known-differences.csv` if needed)

**Interfaces:** As Task 6. Same rules.

- [ ] **Step 1: Areas.** The county, its six constituencies, and Mathira's six wards (the only
      Nyeri wards with a map):

```bash
{ echo "key,level,name,parent,iebc_code"; echo "nyeri,county,Nyeri,kenya,019"; printf '%s\n' "nyeri/kieni,constituency,Kieni,nyeri," "nyeri/mukurweini,constituency,Mukurweini,nyeri," "nyeri/nyeri-town,constituency,Nyeri Town,nyeri," "nyeri/othaya,constituency,Othaya,nyeri," "nyeri/tetu,constituency,Tetu,nyeri,"; npx tsx --tsconfig tsconfig.json scripts/atlas/areas.ts public/geo/mathira-wards.json nyeri mathira | tail -n +2; } > data/atlas/nyeri/areas.csv
```

  Check: 6 constituencies, 6 wards. Run the data test.

- [ ] **Step 2: Population:** `npx tsx --tsconfig tsconfig.json scripts/atlas/population.ts
      public/geo/mathira-wards.json nyeri data/atlas/nyeri/population.csv mathira`. Run the data
      test.
- [ ] **Step 3: Governor and president in Nyeri, by constituency and for the county,** 2022,
      2017, 2013, as Task 6 Step 4 (governor seat `nyeri`).
- [ ] **Step 4: MP in each of the six constituencies,** 2022, 2017, 2013, as Task 6 Step 5.
- [ ] **Step 5: Registered voters in Mathira's wards,** 2022, 2017, 2013.
- [ ] **Step 6: Run** the data test (0 problems) and the report; read Nyeri's section.
- [ ] **Step 7: Commit** `Atlas figures for Nyeri: results, turnout, Mathira's registers and population, with their sources`.

---

### Task 8: Load the figures, and the report for the user

**Files:**
- Create: `supabase/migrations/<stamp>_atlas_first_counties.sql` (written by the script;
  `<stamp>` is the UTC time it is built, `YYYYMMDDHHMMSS`, later than `20261007090000`),
  `data/atlas/REPORT.md`
- Modify: `tests/sql/atlas.test.sql`

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Write the failing test.** Append to `tests/sql/atlas.test.sql`:

```sql
-- test: the first counties' figures are loaded
do $$ begin
  assert (select count(*) from public.atlas_areas where level = 'constituency' and parent in ('nairobi', 'nyeri')) = 23,
    'Nairobi''s 17 and Nyeri''s 6 constituencies';
  assert (select count(*) from public.atlas_areas where level = 'ward' and parent like 'nairobi/%') = 85, 'Nairobi''s 85 wards';
  assert exists (select 1 from public.atlas_results), 'and some results';
end $$;
```

- [ ] **Step 2: Run** `bash tests/sql/run.sh`. Expected: FAIL in `atlas.test.sql` (0
      constituencies).
- [ ] **Step 3: Build the migration:**
      `npx tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_atlas_first_counties.sql" kenya nairobi nyeri`.
      Expected: `wrote …`.
- [ ] **Step 4: Run** `npm test`. Expected: every test passes, the SQL tests applying the new
      migration. Then `npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts`.
- [ ] **Step 5: Commit** `The first counties' figures, loaded, with the report of what was found`.
- [ ] **Step 6: Report to the user,** from `data/atlas/REPORT.md`: what is loaded for each
      county and election, what is missing and why (not published, not found), which figures
      came from a media tally or open dataset rather than IEBC, and the known differences in
      IEBC's own documents. Ask whether to fill any gap differently before part 2 (the screens)
      is planned. Nothing is pushed.
