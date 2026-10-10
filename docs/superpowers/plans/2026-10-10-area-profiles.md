# Area profiles and class indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each place in the atlas the team's profile of it and measured signals of how it lives, so that later guidance isn't naive about places like Kileleshwa and Kawangware.

**Architecture:**
- Two new tables:
  - `area_profiles`, each campaign's own: read and written by the super admin, candidate, manager and organisers, never by field agents.
  - `atlas_indicators`, shared public figures written only by migrations.
- The indicators come from Google Open Buildings v3. A pure TypeScript module does the arithmetic, and a script streams Google's tile into `data/atlas/<county>/indicators.csv`. The existing checker and migration writer take it from there.
- The Elections ward and constituency pages gain an "About this place" card, a profile editor, and three columns in a constituency's wards table.

**Tech Stack:** TanStack Start (`createServerFn`), React Query, Supabase/Postgres with RLS, tsx test scripts (`npm test`), Postgres SQL tests (`tests/sql/run.sh`), Node streams (`zlib`, `readline`).

**Spec:** `docs/superpowers/specs/2026-10-09-area-profiles-design.md`

## Global Constraints

- **Tribe:**
  - Nothing ever records or guesses a person's tribe, including from their name. Profiles are about places, never about people.
  - The editor shows, verbatim: "About the place, never about a person. Don't record anyone's tribe."
- **Who sees profiles:** profiles are read and written by `my_campaign_role()` in `super`, `candidate`, `manager`, `organiser`. Field agents get nothing, and no campaign sees another's.
- **Settlement types:** `high-income`, `middle-income`, `low-income`, `informal`, `mixed`, `peri-urban`, `commercial`. Their labels are High-income residential, Middle-income estates, Low-income estates, Informal settlement, Mixed, Peri-urban or rural, and Commercial.
- **Languages:** `en`, `sw`, `sheng`, `kikuyu`, `luo`, `luhya`, `kamba`, `kisii`, `somali`, `kalenjin`, `meru`, `other`. Their labels are English, Swahili, Sheng, Kikuyu, Dholuo, Luhya, Kamba, Ekegusii, Somali, Kalenjin, Meru, and Other.
- **Text limits:** communities ≤ 500 characters, institutions ≤ 1,000, issues ≤ 500.
- **Indicators:** exactly `area_km2`, `buildings`, `buildings_per_km2`, `median_building_m2`, `small_building_share`, `large_building_share`.
  - Year between 2000 and 2030; value ≥ 0; shares ≤ 1.
- **The building figures:**
  - Source: Google Open Buildings v3 (CC BY 4.0), year 2023.
  - Buildings count at confidence 0.65 or more, assigned by where their centre falls.
  - Small is under 40 m²; large is 200 m² or more.
  - A constituency is computed from all its wards' buildings, and only when every one of its wards is mapped.
  - `area_km2` comes from geoBoundaries KEN ADM3 (CC BY 4.0), year 2020.
- **The file format:**
  - Values in `indicators.csv` are decimals with a point and no thousands separators.
  - Counts, `buildings_per_km2` and `median_building_m2` are whole numbers.
  - `area_km2` and the shares have three decimals.
- **Missing figures never read as zero:** "not measured yet", "There's no ward map for this place yet", or an invitation to fill in an empty profile.
- **Downloads and pushes:**
  - Ask the user before downloading Google's Nairobi tile (tile 183, 1.76 GB) or any other tile.
  - Ask before pushing anything to GitHub.
  - Lovable applies migrations, in timestamp order, before the code that needs them ships.
- **House style:**
  - Tests are tsx scripts with an `eq()` helper, run by `npm test`.
  - Format changed files with prettier.
  - Lint only new or changed lines.
  - Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A constituency only partly on the map** (Nyeri's, outside Mathira) gets no constituency figures, and its card says there's no ward map, never half-figures. Task 3 pins `withConstituencies`; Task 6 pins `placeRows` for an unmapped place.
- **A box emptied in the editor** saves as `null`, not `""`. Text exactly at a limit is accepted and one character over is refused, both in `cleanProfile` (Task 5) and in the database (Task 1).
- **A share of exactly 0 or 1** passes the data checks; 1.2 doesn't (Task 2).
- **Two years of the same indicator:** the screen shows the latest (Task 6, `measuredAt`).
- **No median to compare with** (zero, or no other measured place): the card shows the figure without a comparison, never "Infinity×" (Task 6, `againstMedian`).

---

### Task 1: Schema 23, with its SQL tests

**Files:**
- Create: `supabase/migrations/20261010090000_area_profiles.sql`
- Create: `tests/sql/profiles.test.sql`
- Modify: `tests/sql/access.test.sql` (the list of tables with no campaign, around line 334)

**Interfaces:**
- Produces:
  - Table `public.area_profiles`: `id`, `campaign_id`, `area_key`, `settlement`, `communities`, `languages text[]`, `institutions`, `issues`, `updated_by`, `updated_at`; unique `(campaign_id, area_key)`.
  - Table `public.atlas_indicators`: `area_key`, `indicator`, `year`, `value numeric`, `source_id`; primary key `(area_key, indicator, year)`.
  - `public.groundwork_schema_version()` returns 23.

- [ ] **Step 1: Write the failing SQL test**

Create `tests/sql/profiles.test.sql`:

```sql
-- Area profiles and measured indicators: each campaign's profiles stay inside
-- it, the candidate, manager and organisers read and write them, field agents
-- never see them; every team reads the indicators and nobody signed in writes
-- them. Run with tests/sql/run.sh; each test rolls back.

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

insert into public.atlas_sources (id, title, publisher) values ('test-source', 'A test document', 'IEBC')
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('kenya', 'country', 'Kenya', null)
  on conflict do nothing;
insert into public.atlas_areas (key, level, name, parent) values ('nairobi', 'county', 'Nairobi', 'kenya')
  on conflict do nothing;
insert into public.atlas_indicators (area_key, indicator, year, value, source_id)
  values ('nairobi', 'buildings', 2023, 1000, 'test-source') on conflict do nothing;
-- An organiser on Sakaja's team, beside the shared accounts.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
  values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000a7', 'organiser');

-- test: the schema is at version 23 or later
do $$ begin
  assert public.groundwork_schema_version() >= 23, 'schema 23';
end $$;

-- test: an organiser writes a profile, the manager reads and changes it, and it says who wrote it
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a7';
insert into public.area_profiles (area_key, settlement, communities, languages, institutions, issues)
  values ('nairobi', 'mixed', 'Long-settled families and newer arrivals.', array['sw', 'sheng'],
          'Matatu saccos, two big churches.', 'Water and rents.');
do $$ begin
  assert (select campaign_id from public.area_profiles) = 'ca000000-0000-4000-8000-000000000002', 'the profile is Sakaja''s';
  assert (select updated_by from public.area_profiles) = '00000000-0000-0000-0000-0000000000a7', 'and says who wrote it';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
update public.area_profiles set issues = 'Water.';
do $$ begin
  assert (select settlement from public.area_profiles) = 'mixed', 'the manager reads it';
  assert (select issues from public.area_profiles) = 'Water.', 'and changes it';
end $$;
rollback;

-- test: a field agent neither reads nor writes profiles, and no other campaign sees them
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.area_profiles (area_key, settlement) values ('nairobi', 'informal');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'Sakaja''s agent reads none';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('kenya')$q$) = '42501', 'or writes one';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'Mathira reads none of Sakaja''s';
  assert pg_temp.state_of($q$insert into public.area_profiles (campaign_id, area_key) values ('ca000000-0000-4000-8000-000000000002', 'kenya')$q$) = '42501', 'and can''t write into Sakaja';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.area_profiles) = 0, 'a pending account reads none';
end $$;
rollback;

-- test: a profile keeps to its limits and its lists
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, communities) values ('nairobi', %L)$q$, repeat('a', 501))) = '23514', 'communities over 500';
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, institutions) values ('nairobi', %L)$q$, repeat('a', 1001))) = '23514', 'institutions over 1,000';
  assert pg_temp.state_of(format($q$insert into public.area_profiles (area_key, issues) values ('nairobi', %L)$q$, repeat('a', 501))) = '23514', 'issues over 500';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key, settlement) values ('nairobi', 'posh')$q$) = '23514', 'an unknown settlement type';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key, languages) values ('nairobi', array['klingon'])$q$) = '23514', 'an unknown language';
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('atlantis')$q$) = '23503', 'a place not in the atlas';
end $$;
insert into public.area_profiles (area_key, communities) values ('nairobi', repeat('a', 500));
do $$ begin
  assert pg_temp.state_of($q$insert into public.area_profiles (area_key) values ('nairobi')$q$) = '23505', 'one profile per place';
end $$;
rollback;

-- test: every team reads the indicators, nobody signed in writes them, and shares stay within 0 to 1
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f6';
do $$ begin
  assert (select count(*) from public.atlas_indicators where area_key = 'nairobi') >= 1, 'a Mathira agent reads them';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 2023, 1, 'test-source')$q$) = '42501', 'a team member can''t add one';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.atlas_indicators) = 0, 'a pending account reads none';
end $$;
rollback;
do $$ begin
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'small_building_share', 2023, 1.5, 'test-source')$q$) = '23514', 'a share over 1';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 2023, -1, 'test-source')$q$) = '23514', 'a negative value';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'trees', 2023, 1, 'test-source')$q$) = '23514', 'an unknown indicator';
  assert pg_temp.state_of($q$insert into public.atlas_indicators (area_key, indicator, year, value, source_id) values ('kenya', 'buildings', 1999, 1, 'test-source')$q$) = '23514', 'a year out of range';
end $$;
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash tests/sql/run.sh`
Expected: `FAIL tests/sql/profiles.test.sql`, reporting that the relation "public.atlas_indicators" does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261010090000_area_profiles.sql`:

```sql
-- Area profiles and measured indicators. Schema version 23.
--
-- Each campaign's own profile of a place: its settlement type, the communities
-- that live there, the languages used, its institutions and influencers, and
-- its issues. Read and written by the candidate, the manager and organisers;
-- never by field agents. It is about places, never about people: nothing here
-- records anyone's tribe. And measured indicators of how each place lives (its
-- size and its buildings): public figures every team reads and only
-- migrations write.

create table public.atlas_indicators (
  area_key  text not null references public.atlas_areas(key),
  indicator text not null check (indicator in ('area_km2', 'buildings', 'buildings_per_km2',
                                               'median_building_m2', 'small_building_share',
                                               'large_building_share')),
  year      integer not null check (year between 2000 and 2030),
  value     numeric not null check (value >= 0),
  source_id text not null references public.atlas_sources(id),
  primary key (area_key, indicator, year),
  check (indicator not in ('small_building_share', 'large_building_share') or value <= 1)
);

alter table public.atlas_indicators enable row level security;
revoke all on public.atlas_indicators from anon, authenticated;
grant select on public.atlas_indicators to authenticated;
grant all on public.atlas_indicators to service_role;
create policy "atlas readable by any team" on public.atlas_indicators for select to authenticated
  using (public.is_team_member(auth.uid()));

create table public.area_profiles (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null default public.my_campaign()
               references public.campaigns(id) on delete cascade,
  area_key     text not null references public.atlas_areas(key),
  settlement   text check (settlement in ('high-income', 'middle-income', 'low-income',
                                          'informal', 'mixed', 'peri-urban', 'commercial')),
  communities  text check (length(communities) <= 500),
  languages    text[] not null default '{}'
               check (languages <@ array['en', 'sw', 'sheng', 'kikuyu', 'luo', 'luhya', 'kamba',
                                          'kisii', 'somali', 'kalenjin', 'meru', 'other']),
  institutions text check (length(institutions) <= 1000),
  issues       text check (length(issues) <= 500),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  constraint area_profiles_area_key unique (campaign_id, area_key)
);

create trigger area_profiles_stamp before insert or update on public.area_profiles
  for each row execute function public.atlas_stamp();
alter table public.area_profiles enable row level security;
revoke all on public.area_profiles from anon, authenticated;
grant select, insert, update, delete on public.area_profiles to authenticated;
grant all on public.area_profiles to service_role;
create policy "own campaign only" on public.area_profiles as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "the team but field agents" on public.area_profiles for all to authenticated
  using (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'))
  with check (public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser'));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 23 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: List the new campaign-less table**

In `tests/sql/access.test.sql`, change the atlas lines of the list of tables with no campaign:

```sql
                           -- The election atlas: public figures every campaign reads; only migrations write them
                           'atlas_sources', 'atlas_areas', 'atlas_elections', 'atlas_candidates',
                           'atlas_results', 'atlas_turnout', 'atlas_register', 'atlas_population',
                           'atlas_indicators');
```

- [ ] **Step 5: Run the SQL tests to see them pass**

Run: `bash tests/sql/run.sh`
Expected: every migration applies, the existing files pass, and `ok   tests/sql/profiles.test.sql (5 tests)`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261010090000_area_profiles.sql tests/sql/profiles.test.sql tests/sql/access.test.sql
git commit -m "$(cat <<'EOF'
Schema 23: each campaign's area profiles and the atlas's measured indicators

Profiles are read and written by the candidate, manager and organisers, never
by field agents, and stay inside their campaign; indicators are public
figures every team reads and only migrations write.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Indicators in the data files: reader, checks, migration writer, report

**Files:**
- Modify: `src/lib/atlas-files.ts`
- Modify: `src/lib/atlas-sql.ts`
- Modify: `scripts/atlas/build-sql.ts`
- Test: `tests/atlas-files.test.ts`, `tests/atlas-sql.test.ts`

**Interfaces:**
- Consumes: the `atlas_indicators` columns from Task 1.
- Produces:
  - `INDICATORS` (readonly tuple of the six ids) and `type IndicatorId` from `@/lib/atlas-files`.
  - `type IndicatorRow = { area: string; indicator: string; year: number; value: number; source: string }`.
  - `AtlasFiles.indicators: IndicatorRow[]`, plus `HEADERS.indicators` and `FILE_NAMES.indicators = "indicators.csv"`.
  - `atlasSql(f: AtlasFiles, part?: "figures" | "indicators"): string`.
  - `build-sql.ts <out.sql> <folder>... [--indicators]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/atlas-files.test.ts`, before the final `console.log`:

```ts
const IND = "area,indicator,year,value,source";
const indProblems = (rows: string[]) => check({ indicators: [IND, ...rows].join("\n") });
eq(
  "indicators: clean rows pass, a share of exactly 0 or 1 included",
  indProblems([
    "nairobi/kibra,buildings,2023,1200,iebc-test",
    "nairobi/kibra,small_building_share,2023,1,iebc-test",
    "nairobi/kibra,large_building_share,2023,0,iebc-test",
    "nairobi/kibra,area_km2,2023,2.345,iebc-test",
  ]),
  [],
);
eq(
  "indicators: the checks",
  [
    has(indProblems(["nairobi/kibra,trees,2023,1,iebc-test"]), "indicators: trees for nairobi/kibra in 2023: unknown indicator"),
    has(indProblems(["nairobi/nowhere,buildings,2023,1,iebc-test"]), `the area "nairobi/nowhere" isn't listed`),
    has(indProblems(["nairobi/kibra,large_building_share,2023,1.2,iebc-test"]), "a share must be between 0 and 1"),
    has(indProblems(["nairobi/kibra,buildings,2023,-3,iebc-test"]), `value "-3" is not a number`),
    has(indProblems(["nairobi/kibra,buildings,2023,12.5,iebc-test"]), "must be a whole number"),
    has(indProblems(["nairobi/kibra,buildings,2023,1,iebc-test", "nairobi/kibra,buildings,2023,2,iebc-test"]), "listed twice"),
    has(indProblems(["nairobi/kibra,buildings,2023,1,nope"]), `source "nope" isn't listed`),
    has(indProblems(["nairobi/kibra,buildings,1990,1,iebc-test"]), "the year must be 2000 to 2030"),
    has(indProblems(['nairobi/kibra,area_km2,2023,"1,234",iebc-test']), `value "1,234" is not a number`),
  ],
  [true, true, true, true, true, true, true, true, true],
);
const measured = emptyFiles();
for (const [table, text] of Object.entries({
  ...BASE,
  indicators: `${IND}\nnairobi/kibra/sarangombe,buildings,2023,900,iebc-test`,
}) as [TableName, string][])
  readTable(table, text, table, measured);
eq(
  "the report says how many wards are measured",
  atlasReport(measured).includes("Buildings measured: 1 of 1 wards."),
  true,
);
```

Append to `tests/atlas-sql.test.ts`, before the final `console.log`:

```ts
const withInd = emptyFiles();
readTable(
  "sources",
  "id,title,publisher,url,note\nob,Open Buildings v3 (test),Google Open Buildings,,\nother,Something else,IEBC,,\n",
  "sources",
  withInd,
);
readTable(
  "indicators",
  "area,indicator,year,value,source\nnairobi/kibra,buildings,2023,1200,ob\nnairobi/kibra,small_building_share,2023,0.412,ob\n",
  "indicators",
  withInd,
);
const indSql = atlasSql(withInd, "indicators");
eq(
  "the indicators migration: the sources they cite, then the indicators, as upserts",
  [
    indSql.includes("'ob'"),
    indSql.includes("'other'"),
    indSql.indexOf("atlas_sources") < indSql.indexOf("atlas_indicators"),
    indSql.includes("('nairobi/kibra', 'small_building_share', 2023, 0.412, 'ob')"),
    indSql.includes(
      "on conflict (area_key, indicator, year) do update set value = excluded.value, source_id = excluded.source_id;",
    ),
  ],
  [true, false, true, true, true],
);
eq("the figures migration leaves the indicators out", atlasSql(withInd).includes("atlas_indicators"), false);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-files.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-sql.test.ts`
Expected: the new checks FAIL. `readTable("indicators", …)` either has no case or crashes on the missing header.

- [ ] **Step 3: Teach the files the indicators**

In `src/lib/atlas-files.ts`, after the `COUNTIES` and `INT_MAX` constants, add:

```ts
/** The measured indicators an area can carry (atlas_indicators.indicator). */
export const INDICATORS = [
  "area_km2",
  "buildings",
  "buildings_per_km2",
  "median_building_m2",
  "small_building_share",
  "large_building_share",
] as const;
export type IndicatorId = (typeof INDICATORS)[number];
const WHOLE_INDICATORS: readonly string[] = ["buildings", "buildings_per_km2", "median_building_m2"];
const SHARE_INDICATORS: readonly string[] = ["small_building_share", "large_building_share"];
```

After the `BlocRow` type, add:

```ts
/** A measured figure for an area, from indicators.csv. */
export type IndicatorRow = {
  area: string;
  indicator: string;
  year: number;
  value: number;
  source: string;
};
```

Add `indicators: IndicatorRow[];` to `AtlasFiles` after `blocs`, then make these three edits:
- `HEADERS`: add `indicators: ["area", "indicator", "year", "value", "source"],`.
- `FILE_NAMES`: add `indicators: "indicators.csv",`.
- `emptyFiles()`: add `indicators: [],`.

Next to the `WHOLE` and `SIGNED` regexes, add:

```ts
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
```

In `readTable`, add a case after `case "blocs"`:

```ts
      case "indicators": {
        const year = num("year", true);
        const s = v("value");
        let value = 0;
        if (!s) problems.push(`${at}: value is missing`);
        else if (!DECIMAL.test(s))
          problems.push(`${at}: value "${s}" is not a number (a point for decimals, no commas)`);
        else value = Number(s);
        if (clean())
          into.indicators.push({
            area: v("area"),
            indicator: v("indicator"),
            year: year ?? 0,
            value,
            source: v("source"),
          });
        break;
      }
```

In `checkAtlas`, after the population loop (before the known-differences loop), add:

```ts
  for (const r of f.indicators) {
    const where = `indicators: ${r.indicator} for ${r.area} in ${r.year}`;
    if (!(INDICATORS as readonly string[]).includes(r.indicator)) {
      out.push(`${where}: unknown indicator`);
      continue;
    }
    area(where, r.area);
    source(where, r.source);
    if (r.year < 2000 || r.year > 2030) out.push(`${where}: the year must be 2000 to 2030`);
    if (WHOLE_INDICATORS.includes(r.indicator) && !Number.isInteger(r.value))
      out.push(`${where}: must be a whole number`);
    if (SHARE_INDICATORS.includes(r.indicator) && r.value > 1)
      out.push(`${where}: a share must be between 0 and 1`);
    const k = `indicator|${r.area}|${r.indicator}|${r.year}`;
    if (seen.has(k)) out.push(`${where}: listed twice`);
    seen.add(k);
  }
```

In `atlasReport`, change the push after the register line, so that the measured wards come after the population line:

```ts
    const pop = wards.filter((w) => f.population.some((p) => p.area === w)).length;
    const measuredWards = wards.filter((w) =>
      f.indicators.some((r) => r.area === w && r.indicator === "buildings"),
    ).length;
    lines.push(
      "",
      `Registered voters by ward: ${reg.join(" · ")}.`,
      `Population estimates: ${pop} of ${wards.length} wards.`,
      `Buildings measured: ${measuredWards} of ${wards.length} wards.`,
    );
```

- [ ] **Step 4: Teach the migration writer the indicators**

In `src/lib/atlas-sql.ts`, replace the signature line and the start of the body of `atlasSql` with:

```ts
/**
 * The atlas's files as a migration. "figures" (the default) writes everything
 * but the measured indicators, as the first counties' migration has it;
 * "indicators" writes only the indicators and the sources they cite, for a
 * migration of their own after schema 23.
 */
export function atlasSql(f: AtlasFiles, part: "figures" | "indicators" = "figures"): string {
  if (part === "indicators") {
    const cited = new Set(f.indicators.map((r) => r.source));
    return [
      upsert(
        "atlas_sources",
        ["id", "title", "publisher", "url", "note"],
        f.sources.filter((s) => cited.has(s.id)).map((s) => [s.id, s.title, s.publisher, s.url, s.note]),
        ["id"],
      ),
      upsert(
        "atlas_indicators",
        ["area_key", "indicator", "year", "value", "source_id"],
        f.indicators.map((r) => [r.area, r.indicator, r.year, r.value, r.source]),
        ["area_key", "indicator", "year"],
      ),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const areas = [...f.areas].sort(
```

The rest of the function stays as it is.

In `scripts/atlas/build-sql.ts`, replace the argument handling and the write:

```ts
const args = process.argv.slice(2);
const part = args.includes("--indicators") ? "indicators" : "figures";
const [out, ...folders] = args.filter((a) => a !== "--indicators");
if (!out || !folders.length) {
  console.error("usage: build-sql.ts <migration.sql> <folder>... [--indicators]");
  process.exit(2);
}
const { files, problems } = readAtlas("data/atlas", folders);
const all = [...problems, ...checkAtlas(files, wardMaps())];
if (all.length) {
  console.error(all.join("\n"));
  process.exit(1);
}
writeFileSync(
  out,
  `-- The election atlas's ${part === "indicators" ? "measured indicators" : "figures"} for ${folders.join(", ")}, from data/atlas.\n` +
    "-- Written by scripts/atlas/build-sql.ts: change the CSV files and run it again, not this file.\n\n" +
    atlasSql(files, part),
);
console.log(`wrote ${out}`);
```

Update its header comment's usage line to `…/build-sql.ts supabase/migrations/<stamp>_atlas_<name>.sql kenya nairobi nyeri [--indicators]`.

- [ ] **Step 5: Run the tests, and confirm the first counties' migration doesn't change**

Run: `npx -y tsx --tsconfig tsconfig.json tests/atlas-files.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-sql.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-data.test.ts`
Expected: all pass, and atlas-data reports `0 problems`.

Run: `npx -y tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts "$SCRATCH/first.sql" kenya nairobi nyeri && diff -q "$SCRATCH/first.sql" supabase/migrations/20261007100000_atlas_first_counties.sql && echo SAME`, where `$SCRATCH` is the session's scratchpad directory.
Expected: `SAME`.

- [ ] **Step 6: Typecheck, format, lint, commit**

```bash
npx tsc --noEmit -p . && npx prettier --write src/lib/atlas-files.ts src/lib/atlas-sql.ts scripts/atlas/build-sql.ts tests/atlas-files.test.ts tests/atlas-sql.test.ts && npx eslint src/lib/atlas-files.ts src/lib/atlas-sql.ts scripts/atlas/build-sql.ts tests/atlas-files.test.ts tests/atlas-sql.test.ts
git add src/lib/atlas-files.ts src/lib/atlas-sql.ts scripts/atlas/build-sql.ts tests/atlas-files.test.ts tests/atlas-sql.test.ts
git commit -m "$(cat <<'EOF'
Atlas files: measured indicators, checked and written as a migration of their own

indicators.csv is read with decimals, checked against the indicator list, the
places, the sources, whole counts and shares within 0 to 1, and written by
build-sql.ts --indicators. The report says how many wards are measured.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The building arithmetic

**Files:**
- Create: `src/lib/building-stats.ts`
- Test: `tests/building-stats.test.ts`

**Interfaces:**
- Consumes: `type Ring = [number, number][]` from `@/lib/area-map`.
- Produces, from `@/lib/building-stats`:
  - Constants: `MIN_CONFIDENCE = 0.65`, `SMALL_M2 = 40`, `LARGE_M2 = 200`.
  - `areaKm2(polygons: Ring[][]): number`.
  - `makeLocator(areas: { key: string; polygons: Ring[][] }[]): (lon: number, lat: number) => string | null`.
  - `parseBuilding(line: string): { lat: number; lon: number; m2: number; confidence: number } | null`.
  - `type BuildingStats = { buildings; buildings_per_km2; median_building_m2; small_building_share; large_building_share }`, all numbers.
  - `buildingStats(sizes: number[], km2: number): BuildingStats | null`.
  - `type AreaBuildings = { key: string; km2: number; sizes: number[] }`.
  - `withConstituencies(wards: AreaBuildings[], constituencies: { key: string; wards: string[] }[]): AreaBuildings[]`.
  - `type IndicatorOut = { area: string; indicator: string; year: number; value: number; source: string }`.
  - `indicatorRows(areas: AreaBuildings[], src: { area: string; areaYear: number; buildings: string; buildingsYear: number }): IndicatorOut[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/building-stats.test.ts`:

```ts
// Checks for the building arithmetic: an area's size from its map, which ward
// a building's centre falls in, a line of Google's tile, the building figures,
// constituencies from whole wards, and the rows for indicators.csv. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/building-stats.test.ts

import type { Ring } from "@/lib/area-map";
import {
  areaKm2,
  buildingStats,
  indicatorRows,
  makeLocator,
  parseBuilding,
  withConstituencies,
} from "@/lib/building-stats";

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
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

// A: 0.01° square near Nairobi. B: 0.02° by 0.01°, with a hole 0.01° by 0.006°.
const A = [[sq(36.8, -1.3, 36.81, -1.29)]];
const B = [[sq(36.81, -1.3, 36.83, -1.29), sq(36.815, -1.298, 36.825, -1.292)]];
eq("an area's size, with holes taken out", [round3(areaKm2(A)), round3(areaKm2(B))], [1.231, 1.723]);

const locate = makeLocator([
  { key: "x/c/a", polygons: A },
  { key: "x/c/b", polygons: B },
]);
eq(
  "which ward a building's centre is in: none in a hole or outside",
  [locate(36.805, -1.295), locate(36.812, -1.295), locate(36.82, -1.295), locate(36.9, -1.295)],
  ["x/c/a", "x/c/b", null, null],
);

eq(
  "a building from a line of the tile, and the header is none",
  [
    parseBuilding('-1.2949,36.8051,35.4,0.71,"POLYGON((36.80 -1.29, 36.81 -1.29))",6GCRPQ2W+2F'),
    parseBuilding("latitude,longitude,area_in_meters,confidence,geometry,full_plus_code"),
  ],
  [{ lat: -1.2949, lon: 36.8051, m2: 35.4, confidence: 0.71 }, null],
);

eq("the building figures", buildingStats([250, 10, 50, 30], 1.2306), {
  buildings: 4,
  buildings_per_km2: 3,
  median_building_m2: 40,
  small_building_share: 0.5,
  large_building_share: 0.25,
});
eq(
  "an odd count's median, and nothing to count",
  [
    buildingStats([300, 12, 100], 1)?.median_building_m2,
    buildingStats([300, 12, 100], 1)?.small_building_share,
    buildingStats([], 1),
    buildingStats([5], 0),
  ],
  [100, 0.333, null, null],
);

eq(
  "a constituency from all its wards; one only partly mapped is left out",
  withConstituencies(
    [
      { key: "x/c/a", km2: 1, sizes: [10] },
      { key: "x/c/b", km2: 2, sizes: [30, 300] },
      { key: "x/d/e", km2: 5, sizes: [20] },
    ],
    [
      { key: "x/c", wards: ["x/c/a", "x/c/b"] },
      { key: "x/d", wards: ["x/d/e", "x/d/f"] },
    ],
  ).map((a) => [a.key, a.km2, a.sizes.length]),
  [
    ["x/c/a", 1, 1],
    ["x/c/b", 2, 2],
    ["x/d/e", 5, 1],
    ["x/c", 3, 3],
  ],
);

eq(
  "the rows for indicators.csv: a place without buildings gets only its size",
  indicatorRows(
    [
      { key: "x/c/a", km2: 1.2306, sizes: [10, 30, 50, 250] },
      { key: "x/c/b", km2: 2, sizes: [] },
    ],
    { area: "geo", areaYear: 2020, buildings: "ob", buildingsYear: 2023 },
  ).map((r) => `${r.area} ${r.indicator} ${r.year} ${r.value} ${r.source}`),
  [
    "x/c/a area_km2 2020 1.231 geo",
    "x/c/a buildings 2023 4 ob",
    "x/c/a buildings_per_km2 2023 3 ob",
    "x/c/a median_building_m2 2023 40 ob",
    "x/c/a small_building_share 2023 0.5 ob",
    "x/c/a large_building_share 2023 0.25 ob",
    "x/c/b area_km2 2020 2 geo",
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/building-stats.test.ts`
Expected: FAIL with `Cannot find module '@/lib/building-stats'`.

- [ ] **Step 3: Write the module**

Create `src/lib/building-stats.ts`:

```ts
// How a place lives, from its buildings: Google Open Buildings' footprints
// counted inside each ward, with the ward's size from its map. Pure: the script
// (scripts/atlas/buildings.ts) streams Google's tile and hands each building in.

import type { Ring } from "@/lib/area-map";

/** Google's suggested threshold: below it a footprint is too likely not a building. */
export const MIN_CONFIDENCE = 0.65;
/** Under this a building is a small structure: a single room, a kiosk, a shack. */
export const SMALL_M2 = 40;
/** From this a building is a large house or block. */
export const LARGE_M2 = 200;

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_AT_EQUATOR = 111.32;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One ring's area in km², flat-projected around its middle latitude (fine at a ward's size). */
function ringKm2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lats = ring.map((p) => p[1]);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = KM_PER_DEG_LON_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    twice += x1 * kx * (y2 * KM_PER_DEG_LAT) - x2 * kx * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(twice) / 2;
}

/** An area's size in km²: each polygon's outer ring, less its holes. */
export function areaKm2(polygons: Ring[][]): number {
  return polygons.reduce((sum, [outer, ...holes]) => {
    const hole = holes.reduce((h, r) => h + ringKm2(r), 0);
    return sum + (outer ? ringKm2(outer) : 0) - hole;
  }, 0);
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const inPolygon = (x: number, y: number, [outer, ...holes]: Ring[]): boolean =>
  Boolean(outer && inRing(x, y, outer)) && !holes.some((h) => inRing(x, y, h));

type Box = [number, number, number, number];
function boxOf(polygons: Ring[][]): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const [x, y] of ring) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
  return box;
}

/** Which area a point falls in, or null. Each area's box is checked before its outline. */
export function makeLocator(
  areas: { key: string; polygons: Ring[][] }[],
): (lon: number, lat: number) => string | null {
  const boxed = areas.map((a) => ({ ...a, box: boxOf(a.polygons) }));
  return (lon, lat) => {
    for (const a of boxed) {
      const [x0, y0, x1, y1] = a.box;
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (a.polygons.some((p) => inPolygon(lon, lat, p))) return a.key;
    }
    return null;
  };
}

/**
 * A building from one line of Google's CSV (latitude, longitude, area_in_meters,
 * confidence, geometry, full_plus_code); null for the header or a bad line. Only
 * the first four columns are read: the quoted geometry holds commas of its own.
 */
export function parseBuilding(
  line: string,
): { lat: number; lon: number; m2: number; confidence: number } | null {
  const cells = line.split(",", 4).map(Number);
  if (cells.length < 4 || cells.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon, m2, confidence] = cells as [number, number, number, number];
  return { lat, lon, m2, confidence };
}

export type BuildingStats = {
  buildings: number;
  buildings_per_km2: number;
  median_building_m2: number;
  small_building_share: number;
  large_building_share: number;
};

/** One area's building figures from its footprints (m²) and its size; null with no buildings. */
export function buildingStats(sizes: number[], km2: number): BuildingStats | null {
  if (!sizes.length || km2 <= 0) return null;
  const xs = [...sizes].sort((a, b) => a - b);
  const mid = xs.length / 2;
  const median = xs.length % 2 ? xs[Math.floor(mid)]! : (xs[mid - 1]! + xs[mid]!) / 2;
  return {
    buildings: xs.length,
    buildings_per_km2: Math.round(xs.length / km2),
    median_building_m2: Math.round(median),
    small_building_share: round3(xs.filter((m) => m < SMALL_M2).length / xs.length),
    large_building_share: round3(xs.filter((m) => m >= LARGE_M2).length / xs.length),
  };
}

export type AreaBuildings = { key: string; km2: number; sizes: number[] };

/**
 * The wards, then each constituency made from all its wards' buildings and
 * sizes. A constituency counts only when every one of its wards is mapped:
 * half a constituency would read as the whole.
 */
export function withConstituencies(
  wards: AreaBuildings[],
  constituencies: { key: string; wards: string[] }[],
): AreaBuildings[] {
  const byKey = new Map(wards.map((w) => [w.key, w]));
  const whole = constituencies.flatMap((c) => {
    const parts = c.wards.map((k) => byKey.get(k));
    if (!parts.length || parts.some((p) => !p)) return [];
    const ws = parts as AreaBuildings[];
    return [
      {
        key: c.key,
        km2: ws.reduce((t, w) => t + w.km2, 0),
        sizes: ws.flatMap((w) => w.sizes),
      },
    ];
  });
  return [...wards, ...whole];
}

export type IndicatorOut = {
  area: string;
  indicator: string;
  year: number;
  value: number;
  source: string;
};

/** The rows for indicators.csv: each area's size, and its building figures where it has buildings. */
export function indicatorRows(
  areas: AreaBuildings[],
  src: { area: string; areaYear: number; buildings: string; buildingsYear: number },
): IndicatorOut[] {
  const out: IndicatorOut[] = [];
  for (const a of areas) {
    out.push({
      area: a.key,
      indicator: "area_km2",
      year: src.areaYear,
      value: round3(a.km2),
      source: src.area,
    });
    const s = buildingStats(a.sizes, a.km2);
    if (!s) continue;
    for (const [indicator, value] of Object.entries(s))
      out.push({ area: a.key, indicator, year: src.buildingsYear, value, source: src.buildings });
  }
  return out;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/building-stats.test.ts`
Expected: `7 passed, 0 failed`.

- [ ] **Step 5: Typecheck, format, lint, commit**

```bash
npx tsc --noEmit -p . && npx prettier --write src/lib/building-stats.ts tests/building-stats.test.ts && npx eslint src/lib/building-stats.ts tests/building-stats.test.ts
git add src/lib/building-stats.ts tests/building-stats.test.ts
git commit -m "$(cat <<'EOF'
Building arithmetic: a ward's size, its buildings, density, median size and shares

Pure: sizes from the ward map, buildings assigned by where their centre falls,
constituencies only from wholly mapped wards, and the rows for indicators.csv.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The real figures: the script, the download, the data and its migration

**Files:**
- Create: `scripts/atlas/buildings.ts`
- Modify: `data/atlas/kenya/sources.csv` (two sources)
- Create (generated): `data/atlas/nairobi/indicators.csv`, `data/atlas/nyeri/indicators.csv`
- Create (generated): `supabase/migrations/20261010100000_atlas_indicators.sql`
- Modify (generated): `data/atlas/REPORT.md`

**Interfaces:**
- Consumes:
  - From Task 3: `areaKm2`, `makeLocator`, `parseBuilding`, `MIN_CONFIDENCE`, `withConstituencies`, `indicatorRows`.
  - From Task 2: `HEADERS.indicators` and `build-sql.ts --indicators`.
  - `wardShapes` from `@/lib/area-map`; `readAtlas` from `scripts/atlas/read.ts`.
- Produces: the source ids `google-open-buildings-v3` and `geoboundaries-ken-adm3`; the indicators for every mapped Nairobi and Mathira ward and their constituencies.

- [ ] **Step 1: Add the two sources**

Append to `data/atlas/kenya/sources.csv`:

```csv
google-open-buildings-v3,Open Buildings v3: building footprints,Google Open Buildings,https://sites.research.google/gr/open-buildings/,"Footprints at confidence 0.65 or more, each counted in the ward its centre falls in (CC BY 4.0). Small structures are under 40 m², large buildings 200 m² or more."
geoboundaries-ken-adm3,geoBoundaries Kenya ADM3 (wards),geoBoundaries,https://www.geoboundaries.org/,"Ward boundaries (Omare & Omare 2020, CC BY 4.0), simplified to about 3 m for the ward maps; areas are measured from them."
```

- [ ] **Step 2: Write the script**

Create `scripts/atlas/buildings.ts`:

```ts
// Building figures for one county's mapped wards from one Google Open Buildings
// v3 tile: each ward's size from its map, and the count, density, median size
// and shares of small and large buildings; each constituency from all its
// wards when all are mapped. Writes data/atlas/<county>/indicators.csv. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/buildings.ts <tile.csv.gz> <county> <wards.geojson>
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import { wardShapes } from "@/lib/area-map";
import { HEADERS } from "@/lib/atlas-files";
import {
  areaKm2,
  indicatorRows,
  makeLocator,
  MIN_CONFIDENCE,
  parseBuilding,
  withConstituencies,
} from "@/lib/building-stats";

import { readAtlas } from "./read";

const [tile, county, wardsFile] = process.argv.slice(2);
if (!tile || !county || !wardsFile) {
  console.error("usage: buildings.ts <tile.csv.gz> <county> <wards.geojson>");
  process.exit(2);
}

const { files } = readAtlas("data/atlas", [county]);
const wardKey = new Map(
  files.areas.filter((a) => a.level === "ward").map((a) => [a.key.split("/")[2] ?? "", a.key]),
);
const shapes = wardShapes(JSON.parse(readFileSync(wardsFile, "utf8")))
  .filter((s) => wardKey.has(s.slug))
  .map((s) => ({ key: wardKey.get(s.slug)!, polygons: s.polygons }));
const unmapped = [...wardKey.values()].filter((k) => !shapes.some((s) => s.key === k));
if (unmapped.length) console.error(`no ward map for: ${unmapped.join(", ")}`);

const locate = makeLocator(shapes);
const sizes = new Map(shapes.map((s) => [s.key, [] as number[]]));
let lines = 0;
for await (const line of createInterface({
  input: createReadStream(tile).pipe(createGunzip()),
  crlfDelay: Infinity,
})) {
  lines++;
  const b = parseBuilding(line);
  if (!b || b.confidence < MIN_CONFIDENCE) continue;
  const key = locate(b.lon, b.lat);
  if (key) sizes.get(key)!.push(b.m2);
}

const areas = withConstituencies(
  shapes.map((s) => ({ key: s.key, km2: areaKm2(s.polygons), sizes: sizes.get(s.key)! })),
  files.areas
    .filter((a) => a.level === "constituency")
    .map((c) => ({
      key: c.key,
      wards: files.areas.filter((a) => a.parent === c.key).map((a) => a.key),
    })),
);
const rows = indicatorRows(areas, {
  area: "geoboundaries-ken-adm3",
  areaYear: 2020,
  buildings: "google-open-buildings-v3",
  buildingsYear: 2023,
});
const out = `data/atlas/${county}/indicators.csv`;
writeFileSync(
  out,
  [
    HEADERS.indicators.join(","),
    ...rows.map((r) => [r.area, r.indicator, r.year, r.value, r.source].join(",")),
  ].join("\n") + "\n",
);
console.log(`${lines} lines read; wrote ${rows.length} rows to ${out}`);
for (const [k, v] of sizes) console.log(`  ${k}: ${v.length} buildings`);
```

- [ ] **Step 3: Ask before downloading**

Ask the user, in these words: "OK to download Google Open Buildings tile 183 (183_buildings.csv.gz, 1.76 GB, from storage.googleapis.com/open-buildings-data) into the session's scratchpad? It's used once to measure the wards and never committed." Wait for a yes before Step 4.

- [ ] **Step 4: Download the tile into its own folder**

```bash
mkdir -p "$SCRATCH/openbuildings" && python3 -I -c "
import urllib.request, sys
urllib.request.urlretrieve('https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_4_gzip/183_buildings.csv.gz', sys.argv[1])
" "$SCRATCH/openbuildings/183_buildings.csv.gz" && ls -la "$SCRATCH/openbuildings"
```

`$SCRATCH` is the session's scratchpad directory. Expected: the file is about 1,760,000,000 bytes.

- [ ] **Step 5: Measure Nairobi**

Run: `npx tsx --tsconfig tsconfig.json scripts/atlas/buildings.ts "$SCRATCH/openbuildings/183_buildings.csv.gz" nairobi public/geo/nairobi-wards.json`
Expected:
- no "no ward map for" line
- every one of the 85 wards with thousands of buildings
- 612 rows in `data/atlas/nairobi/indicators.csv`: 85 wards and 17 constituencies, 6 each

Check that Kileleshwa and Kawangware differ: `grep -E "kileleshwa|kawangware" data/atlas/nairobi/indicators.csv`. Kawangware's buildings per km² should be several times Kileleshwa's, and its median building much smaller.

- [ ] **Step 6: Measure Mathira**

Run: `npx tsx --tsconfig tsconfig.json scripts/atlas/buildings.ts "$SCRATCH/openbuildings/183_buildings.csv.gz" nyeri public/geo/mathira-wards.json`
Expected:
- every one of Mathira's 6 wards has buildings
- 42 rows: 6 wards and Mathira itself; Nyeri's other constituencies have no mapped wards, so they get no rows

If every Mathira ward shows 0 buildings, tile 183 doesn't cover Mathira:
- Open the tile index at https://openbuildings-public-dot-gweb-research.uw.r.appspot.com/public/tiles.geojson and find the tile whose polygon contains about lat −0.45, lon 37.05.
- Ask the user before downloading that tile, as in Step 3, then rerun this step with it.

- [ ] **Step 7: Check the data, rebuild the report, write the migration**

```bash
npx -y tsx --tsconfig tsconfig.json tests/atlas-data.test.ts
npx -y tsx --tsconfig tsconfig.json scripts/atlas/report.ts
npx -y tsx --tsconfig tsconfig.json scripts/atlas/build-sql.ts supabase/migrations/20261010100000_atlas_indicators.sql kenya nairobi nyeri --indicators
grep -c "insert into public.atlas_indicators" supabase/migrations/20261010100000_atlas_indicators.sql
bash tests/sql/run.sh
```

Expected:
- atlas-data reports `0 problems`
- REPORT.md says `Buildings measured: 85 of 85 wards.` for Nairobi and `Buildings measured: 6 of 6 wards.` for Nyeri
- the migration holds two insert statements, since its 654 rows go in 500 at a time
- the SQL tests pass, with the indicators migration applying after schema 23

- [ ] **Step 8: Commit**

Don't run prettier on `data/atlas/REPORT.md` (see `.prettierignore`).

```bash
npx prettier --write scripts/atlas/buildings.ts && npx eslint scripts/atlas/buildings.ts
git add scripts/atlas/buildings.ts data/atlas/kenya/sources.csv data/atlas/nairobi/indicators.csv data/atlas/nyeri/indicators.csv data/atlas/REPORT.md supabase/migrations/20261010100000_atlas_indicators.sql
git commit -m "$(cat <<'EOF'
Atlas data: building density and size for Nairobi's 85 wards and Mathira's 6

From Google Open Buildings v3 (CC BY 4.0), with each ward's size from its map
(geoBoundaries). Loaded by a migration of its own after schema 23.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Profiles and indicators on the server

**Files:**
- Create: `src/lib/area-profile.ts`
- Test: `tests/area-profile.test.ts`
- Modify: `src/lib/atlas-view.ts` (the `AtlasData` type, and `populationOf` exported)
- Modify: `src/lib/atlas.functions.ts`
- Modify: `tests/fake-supabase.ts` (`KEYS`)
- Modify: `tests/atlas-functions.test.ts`, `tests/atlas-view.test.ts`, `tests/atlas-app.test.ts` (fixtures)

**Interfaces:**
- Consumes: `cleanHome` from `@/lib/elections-view`; `type IndicatorId` from `@/lib/atlas-files`.
- Produces:
  - From `@/lib/area-profile`:
    - `SETTLEMENTS`, `LANGUAGES` (readonly `[id, label]` tuples), `type Settlement`, `type Language`, `PROFILE_LIMITS`, `PROFILE_EDITORS` (`["super", "candidate", "manager", "organiser"]`).
    - `type AreaProfile = { area: string; settlement: Settlement | null; communities: string | null; languages: Language[]; institutions: string | null; issues: string | null; updatedAt: string | null; updatedBy: string | null }`. `updatedBy` is the name of whoever last saved it, from `profiles.full_name`.
    - `type ProfileInput = Omit<AreaProfile, "updatedAt" | "updatedBy">`.
    - `cleanProfile(input): ProfileInput`, `isEmptyProfile(p): boolean`, `settlementName(s): string`, `languageNames(ls): string`.
  - In `@/lib/atlas-view`:
    - `type AtlasIndicator = { area: string; indicator: IndicatorId; year: number; value: number; source: string }`.
    - `AtlasData.indicators: AtlasIndicator[]`, `AtlasData.profiles: Record<string, AreaProfile>`.
    - `populationOf(d, key)`, now exported.
  - From `@/lib/atlas.functions`: `PROFILE_DENIED`, `writeProfile(sb, p: ProfileInput): Promise<void>`, `saveProfile` (server function).

- [ ] **Step 1: Write the failing tests**

Create `tests/area-profile.test.ts`:

```ts
// Checks for a campaign's profile of a place as typed: tidied, its lists and
// limits held, an emptied box stored as nothing. Pure. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/area-profile.test.ts

import {
  cleanProfile,
  isEmptyProfile,
  languageNames,
  settlementName,
} from "@/lib/area-profile";

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
function refused(name: string, input: Record<string, unknown>, message: string) {
  try {
    cleanProfile(input);
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

eq(
  "a profile as typed, tidied: trimmed, a repeated language once, an emptied box as nothing",
  cleanProfile({
    area: "nairobi/dagoretti-north/kawangware",
    settlement: "informal",
    communities: "  Long-settled families.  ",
    languages: ["sw", "sheng", "sw"],
    institutions: "",
    issues: " Water. ",
  }),
  {
    area: "nairobi/dagoretti-north/kawangware",
    settlement: "informal",
    communities: "Long-settled families.",
    languages: ["sw", "sheng"],
    institutions: null,
    issues: "Water.",
  },
);
eq(
  "no settlement type and no languages",
  cleanProfile({ area: "nairobi", settlement: "", languages: [] }),
  { area: "nairobi", settlement: null, communities: null, languages: [], institutions: null, issues: null },
);
eq(
  "exactly at the limit is fine",
  cleanProfile({ area: "nairobi", communities: "a".repeat(500) }).communities?.length,
  500,
);
refused("a place that isn't a key", { area: "Nairobi!" }, "Which place?");
refused("an unknown settlement type", { area: "nairobi", settlement: "posh" }, "Pick a settlement type from the list.");
refused("an unknown language", { area: "nairobi", languages: ["klingon"] }, "Pick languages from the list.");
refused("communities over 500", { area: "nairobi", communities: "a".repeat(501) }, "Keep communities to 500 characters.");
refused(
  "institutions over 1,000",
  { area: "nairobi", institutions: "a".repeat(1001) },
  "Keep institutions and influencers to 1,000 characters.",
);
refused("issues over 500", { area: "nairobi", issues: "a".repeat(501) }, "Keep local issues to 500 characters.");
eq(
  "names for the screen",
  [settlementName("peri-urban"), languageNames(["luo", "kisii"])],
  ["Peri-urban or rural", "Dholuo, Ekegusii"],
);
const blank = {
  area: "x",
  settlement: null,
  communities: null,
  languages: [],
  institutions: null,
  issues: null,
  updatedAt: null,
  updatedBy: null,
};
eq(
  "an empty profile",
  [isEmptyProfile(undefined), isEmptyProfile(blank), isEmptyProfile({ ...blank, languages: ["sw"] })],
  [true, true, false],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

In `tests/atlas-functions.test.ts`, make these changes:

- Change the import to:

  ```ts
  import {
    ATLAS_DENIED,
    loadAtlas,
    PROFILE_DENIED,
    removeNote,
    writeHome,
    writeNote,
    writeProfile,
    writeSide,
  } from "@/lib/atlas.functions";
  ```

- Add to `SEED`, after `area_notes: []`:

  ```ts
    atlas_indicators: [
      { area_key: "nairobi", indicator: "buildings", year: 2023, value: 1000, source_id: "star" },
    ],
    area_profiles: [],
  ```

- Before the final `console.log`, add:

  ```ts
  eq(
    "the indicators and profiles, read into the screen's shape",
    [d.indicators, d.profiles],
    [[{ area: "nairobi", indicator: "buildings", year: 2023, value: 1000, source: "star" }], {}],
  );
  const org = as("organiser");
  const profile = {
    area: "nairobi",
    settlement: "mixed" as const,
    communities: "Long-settled families.",
    languages: ["sw" as const],
    institutions: null,
    issues: null,
  };
  await writeProfile(org as never, profile);
  await writeProfile(org as never, { ...profile, issues: "Water." });
  const withProfile = await loadAtlas(org as never);
  eq(
    "an organiser's profile, replaced not doubled",
    [
      withProfile.profiles["nairobi"]?.settlement,
      withProfile.profiles["nairobi"]?.issues,
      org.tables["area_profiles"]?.length,
    ],
    ["mixed", "Water.", 1],
  );
  await refuses("a field agent can't write a profile", () => writeProfile(as("agent") as never, profile), PROFILE_DENIED);
  const named = fakeSupabase(
    {
      ...structuredClone(SEED),
      area_profiles: [
        {
          area_key: "nairobi",
          settlement: "informal",
          communities: null,
          languages: [],
          institutions: null,
          issues: null,
          updated_at: "2026-10-10T08:00:00Z",
          updated_by: "u-1",
        },
      ],
      profiles: [{ user_id: "u-1", full_name: "Achieng Otieno" }],
    },
    { my_campaign_role: () => "manager" },
  );
  eq(
    "a profile says who last saved it",
    (await loadAtlas(named as never)).profiles["nairobi"]?.updatedBy,
    "Achieng Otieno",
  );
  ```

In `tests/fake-supabase.ts`, add to `KEYS`:

```ts
  area_profiles: [["campaign_id", "area_key"]],
```

In both `tests/atlas-view.test.ts` and `tests/atlas-app.test.ts`, add to the base fixture `D`, after `notes: {},`:

```ts
  indicators: [],
  profiles: {},
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/area-profile.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-functions.test.ts`
Expected: FAIL. `@/lib/area-profile` isn't found, and `writeProfile` isn't exported.

- [ ] **Step 3: Write the profile module**

Create `src/lib/area-profile.ts`:

```ts
// A campaign's profile of a place: how it lives, who lives there and who it
// listens to, as the team knows it. About places, never about people: nobody's
// tribe is recorded. Pure: the server checks input with this before the
// database checks again.

import { cleanHome } from "@/lib/elections-view";

export const SETTLEMENTS = [
  ["high-income", "High-income residential"],
  ["middle-income", "Middle-income estates"],
  ["low-income", "Low-income estates"],
  ["informal", "Informal settlement"],
  ["mixed", "Mixed"],
  ["peri-urban", "Peri-urban or rural"],
  ["commercial", "Commercial"],
] as const;
export type Settlement = (typeof SETTLEMENTS)[number][0];

export const LANGUAGES = [
  ["en", "English"],
  ["sw", "Swahili"],
  ["sheng", "Sheng"],
  ["kikuyu", "Kikuyu"],
  ["luo", "Dholuo"],
  ["luhya", "Luhya"],
  ["kamba", "Kamba"],
  ["kisii", "Ekegusii"],
  ["somali", "Somali"],
  ["kalenjin", "Kalenjin"],
  ["meru", "Meru"],
  ["other", "Other"],
] as const;
export type Language = (typeof LANGUAGES)[number][0];

export const PROFILE_LIMITS = { communities: 500, institutions: 1000, issues: 500 } as const;
/** Who reads and writes profiles: everyone on the team but field agents. */
export const PROFILE_EDITORS = ["super", "candidate", "manager", "organiser"] as const;

export type AreaProfile = {
  area: string;
  settlement: Settlement | null;
  communities: string | null;
  languages: Language[];
  institutions: string | null;
  issues: string | null;
  updatedAt: string | null;
  /** The name of whoever last saved it, when the team can see it. */
  updatedBy: string | null;
};
export type ProfileInput = Omit<AreaProfile, "updatedAt" | "updatedBy">;

const WHAT: Record<keyof typeof PROFILE_LIMITS, string> = {
  communities: "communities",
  institutions: "institutions and influencers",
  issues: "local issues",
};

/** A profile as typed, checked: a place, a listed settlement type and languages, each box within its limit. */
export function cleanProfile(input: {
  area?: unknown;
  settlement?: unknown;
  communities?: unknown;
  languages?: unknown;
  institutions?: unknown;
  issues?: unknown;
}): ProfileInput {
  const { area } = cleanHome({ area: input?.area });
  const s = typeof input?.settlement === "string" && input.settlement ? input.settlement : null;
  if (s !== null && !SETTLEMENTS.some(([id]) => id === s))
    throw new Error("Pick a settlement type from the list.");
  const langs = Array.isArray(input?.languages) ? input.languages.map(String) : [];
  if (langs.some((l) => !LANGUAGES.some(([id]) => id === l)))
    throw new Error("Pick languages from the list.");
  const text = (name: keyof typeof PROFILE_LIMITS): string | null => {
    const raw = input?.[name];
    const v = typeof raw === "string" ? raw.trim() : "";
    if (v.length > PROFILE_LIMITS[name])
      throw new Error(
        `Keep ${WHAT[name]} to ${PROFILE_LIMITS[name].toLocaleString("en-KE")} characters.`,
      );
    return v || null;
  };
  return {
    area,
    settlement: s as Settlement | null,
    communities: text("communities"),
    languages: [...new Set(langs)] as Language[],
    institutions: text("institutions"),
    issues: text("issues"),
  };
}

/** Nothing written yet. */
export const isEmptyProfile = (p: AreaProfile | null | undefined): boolean =>
  !p || (!p.settlement && !p.communities && !p.languages.length && !p.institutions && !p.issues);

export const settlementName = (s: Settlement): string =>
  SETTLEMENTS.find(([id]) => id === s)?.[1] ?? s;

export const languageNames = (ls: Language[]): string =>
  ls.map((l) => LANGUAGES.find(([id]) => id === l)?.[1] ?? l).join(", ");
```

- [ ] **Step 4: Widen the atlas's data and its loading**

In `src/lib/atlas-view.ts`, add `import type { AreaProfile } from "@/lib/area-profile";` and `import type { IndicatorId } from "@/lib/atlas-files";`. Then make these changes:
- After `AtlasNote`, add:

  ```ts
  export type AtlasIndicator = {
    area: string;
    indicator: IndicatorId;
    year: number;
    value: number;
    source: string;
  };
  ```

- In `AtlasData`, after `sources: AtlasSource[];`, add `indicators: AtlasIndicator[];`. After `notes: Record<string, AtlasNote>;`, add:

  ```ts
    /** The campaign's own profiles of places, by area key; empty for a field agent. */
    profiles: Record<string, AreaProfile>;
  ```

- Change `function populationOf(` to `export function populationOf(`.

In `src/lib/atlas.functions.ts`, add these imports:

```ts
import {
  PROFILE_EDITORS,
  cleanProfile,
  type AreaProfile,
  type Language,
  type ProfileInput,
  type Settlement,
} from "@/lib/area-profile";
import type { IndicatorId } from "@/lib/atlas-files";
```

Then extend `loadAtlas`:
- Add `indicators` and `profiles` to the destructured array.
- Append these two reads to the `Promise.all` list, after the `area_notes` read:

  ```ts
      read<{
        area_key: string;
        indicator: string;
        year: number;
        value: number | string;
        source_id: string;
      }>("atlas_indicators", "area_key, indicator, year, value, source_id"),
      read<{
        area_key: string;
        settlement: string | null;
        communities: string | null;
        languages: string[] | null;
        institutions: string | null;
        issues: string | null;
        updated_at: string;
        updated_by: string | null;
      }>(
        "area_profiles",
        "area_key, settlement, communities, languages, institutions, issues, updated_at, updated_by",
      ),
  ```

- In the returned object, after `sources,`, add:

  ```ts
      indicators: indicators.map((r) => ({
        area: r.area_key,
        indicator: r.indicator as IndicatorId,
        year: r.year,
        value: Number(r.value),
        source: r.source_id,
      })),
  ```

- Before the `return`, look up who last saved each profile (teammates' names are readable in `profiles`):

  ```ts
    const editors = [
      ...new Set(profiles.map((p) => p.updated_by).filter((id): id is string => Boolean(id))),
    ];
    const names = new Map<string, string>();
    if (editors.length) {
      const { data: people } = (await sb
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", editors)) as { data: { user_id: string; full_name: string | null }[] | null };
      for (const p of people ?? []) if (p.full_name) names.set(p.user_id, p.full_name);
    }
  ```

- After `notes: …`, add:

  ```ts
      profiles: Object.fromEntries(
        profiles.map((p): [string, AreaProfile] => [
          p.area_key,
          {
            area: p.area_key,
            settlement: p.settlement as Settlement | null,
            communities: p.communities,
            languages: (p.languages ?? []) as Language[],
            institutions: p.institutions,
            issues: p.issues,
            updatedAt: p.updated_at,
            updatedBy: p.updated_by ? (names.get(p.updated_by) ?? null) : null,
          },
        ]),
      ),
  ```

Add the write path after `removeNote`:

```ts
export const PROFILE_DENIED = "Only the candidate, campaign manager or an organiser can change this.";

function profileError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return PROFILE_DENIED;
  if (e.code === "23503") return "That place isn't in the atlas.";
  if (e.code === "23514") return "The database refused that: keep each box within its limit.";
  return "Could not save that. Try again.";
}

/** A place's profile, replaced whole: checked here for the role, and again by the database. */
export async function writeProfile(sb: Client, p: ProfileInput): Promise<void> {
  const { data } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!(PROFILE_EDITORS as readonly string[]).includes(String(data))) throw new Error(PROFILE_DENIED);
  const { error } = (await sb.from("area_profiles").upsert(
    {
      area_key: p.area,
      settlement: p.settlement,
      communities: p.communities,
      languages: p.languages,
      institutions: p.institutions,
      issues: p.issues,
    },
    { onConflict: "campaign_id,area_key" },
  )) as { error: { code?: string; message?: string } | null };
  if (error) throw new Error(profileError(error));
}

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => cleanProfile(input))
  .handler(async ({ data, context }) => {
    await writeProfile(context.supabase as never, data);
    return { ok: true };
  });
```

Update the file's header comment to mention the profiles: "…and its notes and profiles of places come from its own campaign only. The candidate's or manager's changes (and, for profiles, an organiser's) are checked here first and again by the database."

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/area-profile.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-functions.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-view.test.ts; npx -y tsx --tsconfig tsconfig.json tests/atlas-app.test.ts; npx tsc --noEmit -p .`
Expected: every file reports `0 failed`, and tsc prints nothing. If tsc reports another `AtlasData` literal missing `indicators`/`profiles`, add the two fields there as in Step 1.

- [ ] **Step 6: Format, lint, commit**

```bash
npx prettier --write src/lib/area-profile.ts src/lib/atlas-view.ts src/lib/atlas.functions.ts tests/area-profile.test.ts tests/atlas-functions.test.ts tests/atlas-view.test.ts tests/atlas-app.test.ts tests/fake-supabase.ts && npx eslint src/lib/area-profile.ts src/lib/atlas-view.ts src/lib/atlas.functions.ts tests/area-profile.test.ts tests/atlas-functions.test.ts
git add src/lib/area-profile.ts src/lib/atlas-view.ts src/lib/atlas.functions.ts tests/area-profile.test.ts tests/atlas-functions.test.ts tests/atlas-view.test.ts tests/atlas-app.test.ts tests/fake-supabase.ts
git commit -m "$(cat <<'EOF'
Area profiles and indicators on the server

The atlas loads the measured indicators and the campaign's profiles of places;
saveProfile checks the input and the role (anyone but a field agent) before
the database checks again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The indicators as the screens show them

**Files:**
- Create: `src/lib/area-indicators.ts`
- Test: `tests/area-indicators.test.ts`

**Interfaces:**
- Consumes: `populationOf`, `votes`, `whole`, `type AtlasData`, `type Level` from `@/lib/atlas-view`; `type IndicatorId` from `@/lib/atlas-files`.
- Produces, from `@/lib/area-indicators`:
  - `type Measure = IndicatorId | "people_per_km2"`.
  - `type Measured = Partial<Record<IndicatorId, { value: number; year: number; source: string }>>`.
  - `measuredAt(d, key): Measured`, `peoplePerKm2(d, key): number | null`.
  - `countyMedian(d, county, level, id: Measure): number | null`.
  - `againstMedian(value, median, countyName): string | null`, `comparisonText(id, value, median, countyName): string | null`, `indicatorText(id, value): string`.
  - `PLACE_MEASURES: { id: Measure; label: string }[]`.
  - `type PlaceRow = { id: Measure; label: string; text: string | null; vs: string | null }`.
  - `placeRows(d, key): { mapped: boolean; rows: PlaceRow[]; tag: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/area-indicators.test.ts`:

```ts
// Checks for the measured indicators as the screens show them: the latest
// figure, people per km², the county's median, the comparisons and the card's
// rows, measured or not. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/area-indicators.test.ts

import {
  againstMedian,
  comparisonText,
  countyMedian,
  indicatorText,
  measuredAt,
  peoplePerKm2,
  placeRows,
} from "@/lib/area-indicators";
import type { AtlasData } from "@/lib/atlas-view";

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

const ind = (area: string, indicator: string, year: number, value: number) => ({
  area,
  indicator: indicator as never,
  year,
  value,
  source: indicator === "area_km2" ? "geo" : "ob",
});
const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/dn", level: "constituency", name: "Dagoretti North", parent: "nairobi" },
    { key: "nairobi/dn/kil", level: "ward", name: "Kileleshwa", parent: "nairobi/dn" },
    { key: "nairobi/dn/kaw", level: "ward", name: "Kawangware", parent: "nairobi/dn" },
    { key: "nairobi/dn/x", level: "ward", name: "Unmapped", parent: "nairobi/dn" },
  ],
  candidates: [],
  results: [],
  turnout: [],
  register: [],
  population: [
    { area: "nairobi/dn/kil", year: 2020, total: 20000, adults: 15000, youngAdults: 6000, source: "wp" },
    { area: "nairobi/dn/kaw", year: 2020, total: 140000, adults: 90000, youngAdults: 50000, source: "wp" },
  ],
  sources: [
    { id: "ob", title: "Open Buildings v3", publisher: "Google Open Buildings", url: null, note: null },
    { id: "geo", title: "geoBoundaries", publisher: "geoBoundaries", url: null, note: null },
  ],
  indicators: [
    ind("nairobi/dn/kil", "area_km2", 2020, 4),
    ind("nairobi/dn/kil", "buildings_per_km2", 2019, 900),
    ind("nairobi/dn/kil", "buildings_per_km2", 2023, 1000),
    ind("nairobi/dn/kil", "buildings", 2023, 4000),
    ind("nairobi/dn/kil", "median_building_m2", 2023, 180),
    ind("nairobi/dn/kil", "small_building_share", 2023, 0.1),
    ind("nairobi/dn/kil", "large_building_share", 2023, 0.4),
    ind("nairobi/dn/kaw", "area_km2", 2020, 2),
    ind("nairobi/dn/kaw", "buildings_per_km2", 2023, 12000),
    ind("nairobi/dn/kaw", "buildings", 2023, 24000),
    ind("nairobi/dn/kaw", "median_building_m2", 2023, 30),
    ind("nairobi/dn/kaw", "small_building_share", 2023, 0.6),
    ind("nairobi/dn/kaw", "large_building_share", 2023, 0.02),
  ],
  homeArea: null,
  sides: {},
  notes: {},
  profiles: {},
};

eq("the latest year wins", measuredAt(D, "nairobi/dn/kil").buildings_per_km2, {
  value: 1000,
  year: 2023,
  source: "ob",
});
eq(
  "people per km², and none where the place isn't measured",
  [peoplePerKm2(D, "nairobi/dn/kil"), peoplePerKm2(D, "nairobi/dn/kaw"), peoplePerKm2(D, "nairobi/dn/x")],
  [5000, 70000, null],
);
eq(
  "the county's median over its measured wards",
  [
    countyMedian(D, "nairobi", "ward", "buildings_per_km2"),
    countyMedian(D, "nairobi", "ward", "people_per_km2"),
    countyMedian(D, "nairobi", "constituency", "buildings_per_km2"),
  ],
  [6500, 37500, null],
);
eq(
  "against the median: above, below, about, and none to compare with",
  [
    againstMedian(12000, 6500, "Nairobi"),
    againstMedian(1000, 6500, "Nairobi"),
    againstMedian(6600, 6500, "Nairobi"),
    againstMedian(5, null, "Nairobi"),
    againstMedian(5, 0, "Nairobi"),
  ],
  ["1.8× Nairobi's median", "15% of Nairobi's median", "about Nairobi's median", null, null],
);
eq(
  "a share is set beside the median share",
  [comparisonText("small_building_share", 0.6, 0.35, "Nairobi"), comparisonText("small_building_share", 0.6, null, "Nairobi")],
  ["Nairobi's median: 35%", null],
);
eq(
  "the figures as text",
  [
    indicatorText("buildings_per_km2", 12000),
    indicatorText("people_per_km2", 70000),
    indicatorText("median_building_m2", 30),
    indicatorText("small_building_share", 0.6),
    indicatorText("area_km2", 2.345),
    indicatorText("buildings", 24000),
  ],
  ["12,000 per km²", "70,000 per km²", "30 m²", "60%", "2.3 km²", "24,000"],
);
const kaw = placeRows(D, "nairobi/dn/kaw");
eq(
  "the card's rows for a measured ward",
  [kaw.mapped, kaw.tag, kaw.rows.map((r) => [r.label, r.text, r.vs])],
  [
    true,
    "Google Open Buildings · 2023",
    [
      ["People per km² (estimate)", "70,000 per km²", "1.9× Nairobi's median"],
      ["Buildings per km²", "12,000 per km²", "1.8× Nairobi's median"],
      ["Median building", "30 m²", "29% of Nairobi's median"],
      ["Small structures (under 40 m²)", "60%", "Nairobi's median: 35%"],
      ["Large buildings (200 m² or more)", "2%", "Nairobi's median: 21%"],
    ],
  ],
);
const x = placeRows(D, "nairobi/dn/x");
eq(
  "a place without a ward map: nothing measured, never zero",
  [x.mapped, x.tag, x.rows.every((r) => r.text === null && r.vs === null)],
  [false, null, true],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

These expectations are worked out by hand from the fixture:
- **Median building:** the medians are 180 and 30, so the county median is 105, and 30 ÷ 105 = 28.6%, which rounds to 29%.
- **People per km²:** 70,000 ÷ 37,500 = 1.87, which rounds to 1.9×.
- **Large buildings:** the median share is (0.4 + 0.02) ÷ 2 = 0.21, so 21%.

- [ ] **Step 2: Run it to see it fail**

Run: `npx -y tsx --tsconfig tsconfig.json tests/area-indicators.test.ts`
Expected: FAIL with `Cannot find module '@/lib/area-indicators'`.

- [ ] **Step 3: Write the module**

Create `src/lib/area-indicators.ts`:

```ts
// The measured indicators as the screens show them: an area's latest figures,
// its people per km², how it compares with the county's other measured places
// of its level, and the "About this place" card's rows. Pure.

import type { IndicatorId } from "@/lib/atlas-files";
import { populationOf, votes, whole, type AtlasData, type Level } from "@/lib/atlas-view";

export type Measure = IndicatorId | "people_per_km2";
export type Measured = Partial<Record<IndicatorId, { value: number; year: number; source: string }>>;

/** An area's latest value of each indicator it has. */
export function measuredAt(d: AtlasData, key: string): Measured {
  const out: Measured = {};
  for (const r of d.indicators) {
    const had = out[r.indicator];
    if (r.area === key && (!had || had.year < r.year))
      out[r.indicator] = { value: r.value, year: r.year, source: r.source };
  }
  return out;
}

/** People per km²: the population estimate over the measured size; null without either. */
export function peoplePerKm2(d: AtlasData, key: string): number | null {
  const km2 = measuredAt(d, key).area_km2?.value;
  const people = populationOf(d, key)?.estimate.total;
  return km2 && people !== undefined ? Math.round(people / km2) : null;
}

const valueOf = (d: AtlasData, key: string, id: Measure): number | null =>
  id === "people_per_km2" ? peoplePerKm2(d, key) : (measuredAt(d, key)[id]?.value ?? null);

/** The median over the county's measured places of one level; null with none. */
export function countyMedian(d: AtlasData, county: string, level: Level, id: Measure): number | null {
  const xs = d.areas
    .filter((a) => a.level === level && a.key.startsWith(`${county}/`))
    .map((a) => valueOf(d, a.key, id))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length / 2;
  return xs.length % 2 ? xs[Math.floor(mid)]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** "1.8× Nairobi's median", "15% of Nairobi's median", "about Nairobi's median"; null without a median. */
export function againstMedian(value: number, median: number | null, county: string): string | null {
  if (median === null || median <= 0) return null;
  const r = value / median;
  if (r >= 0.9 && r <= 1.1) return `about ${county}'s median`;
  if (r > 1.1) return `${Math.round(r * 10) / 10}× ${county}'s median`;
  return `${Math.round(r * 100)}% of ${county}'s median`;
}

/** A share is set beside the median share; anything else is compared with the median. */
export function comparisonText(
  id: Measure,
  value: number,
  median: number | null,
  county: string,
): string | null {
  if (id === "small_building_share" || id === "large_building_share")
    return median === null ? null : `${county}'s median: ${whole(median)}`;
  return againstMedian(value, median, county);
}

export function indicatorText(id: Measure, value: number): string {
  switch (id) {
    case "area_km2":
      return `${(Math.round(value * 10) / 10).toFixed(1)} km²`;
    case "buildings":
      return votes(value);
    case "buildings_per_km2":
    case "people_per_km2":
      return `${votes(Math.round(value))} per km²`;
    case "median_building_m2":
      return `${Math.round(value)} m²`;
    default:
      return whole(value);
  }
}

/** The card's measures, in order. */
export const PLACE_MEASURES: { id: Measure; label: string }[] = [
  { id: "people_per_km2", label: "People per km² (estimate)" },
  { id: "buildings_per_km2", label: "Buildings per km²" },
  { id: "median_building_m2", label: "Median building" },
  { id: "small_building_share", label: "Small structures (under 40 m²)" },
  { id: "large_building_share", label: "Large buildings (200 m² or more)" },
];

export type PlaceRow = { id: Measure; label: string; text: string | null; vs: string | null };

/** The "About this place" card's measured rows; `mapped` is false where there's no ward map. */
export function placeRows(
  d: AtlasData,
  key: string,
): { mapped: boolean; rows: PlaceRow[]; tag: string | null } {
  const area = d.areas.find((a) => a.key === key);
  const county = key.split("/")[0] ?? "";
  const countyName = d.areas.find((a) => a.key === county)?.name ?? county;
  const m = measuredAt(d, key);
  const rows = PLACE_MEASURES.map(({ id, label }) => {
    const value = valueOf(d, key, id);
    const median = area ? countyMedian(d, county, area.level, id) : null;
    return {
      id,
      label,
      text: value === null ? null : indicatorText(id, value),
      vs: value === null ? null : comparisonText(id, value, median, countyName),
    };
  });
  const b = m.buildings;
  const source = b ? d.sources.find((s) => s.id === b.source) : undefined;
  return {
    mapped: Boolean(m.area_km2),
    rows,
    tag: source && b ? `${source.publisher} · ${b.year}` : null,
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx -y tsx --tsconfig tsconfig.json tests/area-indicators.test.ts && npx tsc --noEmit -p .`
Expected: `8 passed, 0 failed`, and tsc prints nothing.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/lib/area-indicators.ts tests/area-indicators.test.ts && npx eslint src/lib/area-indicators.ts tests/area-indicators.test.ts
git add src/lib/area-indicators.ts tests/area-indicators.test.ts
git commit -m "$(cat <<'EOF'
The indicators as the screens show them

An area's latest figures, people per km², the county's median for its level,
the comparisons, and the About this place card's rows, never a zero where
nothing was measured.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The screens

**Files:**
- Create: `src/components/gw/elections/PlaceCard.tsx`
- Create: `src/components/gw/elections/ProfileEditor.tsx`
- Modify: `src/components/gw/elections/WardView.tsx`
- Modify: `src/components/gw/elections/ConstituencyView.tsx`
- Modify: `src/routes/_authenticated/elections.tsx`
- Modify: `src/styles/groundwork.css` (append)

**Interfaces:**
- Consumes:
  - From Task 6: `placeRows`, `measuredAt`, `indicatorText`.
  - From Task 5: `isEmptyProfile`, `settlementName`, `languageNames`, `SETTLEMENTS`, `LANGUAGES`, `PROFILE_LIMITS`, `PROFILE_EDITORS`, `type AreaProfile`, `type Language`, `type Settlement`, and `saveProfile`.
  - `useAccess()` from `@/hooks/useAccess`, which returns `{ access: { role }, isPrincipal, campaign, … }`.
- Produces:
  - `<PlaceCard d area canEdit />` and `<ProfileEditor area profile onDone />`.
  - WardView and ConstituencyView take a new `canEditProfile: boolean`.

- [ ] **Step 1: Write the editor**

Create `src/components/gw/elections/ProfileEditor.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  LANGUAGES,
  PROFILE_LIMITS,
  SETTLEMENTS,
  type AreaProfile,
  type Language,
  type Settlement,
} from "@/lib/area-profile";
import { saveProfile } from "@/lib/atlas.functions";
import type { AtlasArea } from "@/lib/atlas-view";

/** The team's profile of a place, edited: a refusal shows here, in the form. */
export function ProfileEditor({
  area,
  profile,
  onDone,
}: {
  area: AtlasArea;
  profile: AreaProfile | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveProfile);
  const [settlement, setSettlement] = useState<Settlement | "">(profile?.settlement ?? "");
  const [languages, setLanguages] = useState<Language[]>(profile?.languages ?? []);
  const [communities, setCommunities] = useState(profile?.communities ?? "");
  const [institutions, setInstitutions] = useState(profile?.institutions ?? "");
  const [issues, setIssues] = useState(profile?.issues ?? "");
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          area: area.key,
          settlement: settlement || null,
          languages,
          communities,
          institutions,
          issues,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["atlas"] });
      toast.success("Profile saved.");
      onDone();
    },
  });
  const box = (
    id: keyof typeof PROFILE_LIMITS,
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <label className="place-box" htmlFor={`place-${id}`}>
      <span>{label}</span>
      <textarea
        id={`place-${id}`}
        rows={3}
        maxLength={PROFILE_LIMITS[id]}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <span className="place-count">
        {value.length} / {PROFILE_LIMITS[id].toLocaleString("en-KE")}
      </span>
    </label>
  );
  return (
    <form
      className="place-edit"
      onSubmit={(e) => {
        e.preventDefault();
        saving.mutate();
      }}
    >
      <p className="f-note">About the place, never about a person. Don't record anyone's tribe.</p>
      <label className="place-box" htmlFor="place-settlement">
        <span>Settlement type</span>
        <select
          id="place-settlement"
          value={settlement}
          onChange={(e) => setSettlement(e.target.value as Settlement | "")}
        >
          <option value="">Not set</option>
          {SETTLEMENTS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="place-langs">
        <legend>Languages commonly used</legend>
        {LANGUAGES.map(([id, name]) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={languages.includes(id)}
              onChange={(e) =>
                setLanguages(e.target.checked ? [...languages, id] : languages.filter((l) => l !== id))
              }
            />{" "}
            {name}
          </label>
        ))}
      </fieldset>
      {box("communities", "Communities in the area", communities, setCommunities)}
      {box("institutions", "Institutions and influencers", institutions, setInstitutions)}
      {box("issues", "Local issues", issues, setIssues)}
      {saving.error ? (
        <p className="place-error" role="alert">
          {(saving.error as Error).message}
        </p>
      ) : null}
      <div className="mb-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving.isPending}>
          {saving.isPending ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the card**

Create `src/components/gw/elections/PlaceCard.tsx`:

```tsx
import { useState } from "react";

import { ProfileEditor } from "@/components/gw/elections/ProfileEditor";
import { placeRows } from "@/lib/area-indicators";
import { isEmptyProfile, languageNames, settlementName } from "@/lib/area-profile";
import type { AtlasArea, AtlasData } from "@/lib/atlas-view";

/** How a place lives: what was measured, and what the team knows about it. */
export function PlaceCard({
  d,
  area,
  canEdit,
}: {
  d: AtlasData;
  area: AtlasArea;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { mapped, rows, tag } = placeRows(d, area.key);
  const profile = d.profiles[area.key] ?? null;
  const empty = isEmptyProfile(profile);
  return (
    <section className="card" aria-labelledby="place-h">
      <div className="card-head">
        <h2 id="place-h">About this place</h2>
        {tag ? <span className="mono">{tag}</span> : null}
      </div>
      {mapped ? (
        <div className="f-rows">
          {rows.map((r) => (
            <div className="f-row" key={r.id}>
              <span>{r.label}</span>
              <b>
                {r.text ?? "not measured yet"}
                {r.vs ? <span className="place-vs">{r.vs}</span> : null}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <p className="f-note">There's no ward map for this place yet, so nothing is measured.</p>
      )}
      <div className="place-profile">
        <h3>Your team's profile</h3>
        {editing ? (
          <ProfileEditor area={area} profile={profile} onDone={() => setEditing(false)} />
        ) : empty ? (
          <p className="f-note">
            Not filled in yet. Your team knows this place: add how it lives, who lives here and who
            it listens to.
          </p>
        ) : (
          <dl className="place-dl">
            {profile?.settlement ? (
              <>
                <dt>Settlement</dt>
                <dd>{settlementName(profile.settlement)}</dd>
              </>
            ) : null}
            {profile?.communities ? (
              <>
                <dt>Communities</dt>
                <dd>{profile.communities}</dd>
              </>
            ) : null}
            {profile?.languages.length ? (
              <>
                <dt>Languages</dt>
                <dd>{languageNames(profile.languages)}</dd>
              </>
            ) : null}
            {profile?.institutions ? (
              <>
                <dt>Institutions and influencers</dt>
                <dd>{profile.institutions}</dd>
              </>
            ) : null}
            {profile?.issues ? (
              <>
                <dt>Local issues</dt>
                <dd>{profile.issues}</dd>
              </>
            ) : null}
          </dl>
        )}
        {!editing && profile?.updatedAt ? (
          <p className="meta">
            Updated{" "}
            {new Date(profile.updatedAt).toLocaleDateString("en-KE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {profile.updatedBy ? ` by ${profile.updatedBy}` : ""}
          </p>
        ) : null}
        {!editing && canEdit ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            {empty ? "Add a profile" : "Edit the profile"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Put the card on the ward and constituency pages, and the columns in the wards table**

In `src/components/gw/elections/WardView.tsx`, make these changes:
- Add `import { PlaceCard } from "@/components/gw/elections/PlaceCard";`.
- Add `canEditProfile: boolean` to the props (destructured and typed).
- Right after `<PeopleCard f={f} />`, insert `<PlaceCard d={d} area={area} canEdit={canEditProfile} />`.

In `src/components/gw/elections/ConstituencyView.tsx`, make these changes:
- Add these imports:

  ```ts
  import { PlaceCard } from "@/components/gw/elections/PlaceCard";
  import { indicatorText, measuredAt } from "@/lib/area-indicators";
  import { settlementName } from "@/lib/area-profile";
  ```

- Add `canEditProfile: boolean` to the props.
- Right after `<PeopleCard f={f} />`, insert `<PlaceCard d={d} area={area} canEdit={canEditProfile} />`.
- In "Its wards", add three headers before `<th>Note</th>`:

  ```tsx
                  <th style={{ textAlign: "right" }}>Buildings per km²</th>
                  <th style={{ textAlign: "right" }}>Median building</th>
                  <th>Settlement</th>
  ```

- Add their cells before the note cell. Start each row's render by computing `const wm = measuredAt(d, w.key);` and `const ws = d.profiles[w.key]?.settlement;`, so the `.map((w) => (` becomes `.map((w) => { … return ( … ); })`:

  ```tsx
                    <td className="num">
                      {wm.buildings_per_km2
                        ? indicatorText("buildings_per_km2", wm.buildings_per_km2.value).replace(" per km²", "")
                        : "—"}
                    </td>
                    <td className="num">
                      {wm.median_building_m2 ? indicatorText("median_building_m2", wm.median_building_m2.value) : "—"}
                    </td>
                    <td>{ws ? settlementName(ws) : "—"}</td>
  ```

In `src/routes/_authenticated/elections.tsx`, make these changes:
- Change `const { campaign, isPrincipal } = useAccess();` to `const { campaign, isPrincipal, access } = useAccess();`.
- Add `import { PROFILE_EDITORS } from "@/lib/area-profile";`.
- Below that line, add:

  ```ts
    // Profiles are for the whole team but field agents; notes and sides stay with the candidate and manager.
    const canEditProfile = (PROFILE_EDITORS as readonly string[]).includes(String(access?.role));
  ```

- Pass `canEditProfile={canEditProfile}` to `<ConstituencyView … />` and `<WardView … />`.

- [ ] **Step 4: The styles**

Append to `src/styles/groundwork.css`:

```css
/* Elections: About this place, and the team's profile of it */
.place-vs { display:block; font-weight:400; font-size:11.5px; color:var(--muted-foreground); text-align:right; }
.place-profile { margin-top:14px; padding-top:12px; border-top:1px solid var(--border); }
.place-profile h3 { font-size:13px; margin:0 0 8px; }
.place-dl { display:grid; grid-template-columns:minmax(0, 11rem) minmax(0, 1fr); gap:6px 12px; margin:0 0 8px; font-size:13px; }
.place-dl dt { color:var(--muted-foreground); }
.place-dl dd { margin:0; white-space:pre-wrap; }
.place-edit { display:flex; flex-direction:column; gap:10px; }
.place-box { display:flex; flex-direction:column; gap:4px; font-size:12.5px; }
.place-box textarea, .place-box select { width:100%; font:inherit; padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:var(--card); color:inherit; }
.place-langs { border:0; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12.5px; }
.place-langs legend { font-size:12.5px; margin-bottom:4px; }
.place-count { font-size:11px; color:var(--muted-foreground); text-align:right; }
.place-error { color:var(--destructive); font-size:12.5px; margin:0; }
@media (max-width:600px) { .place-dl { grid-template-columns:1fr; } }
```

- [ ] **Step 5: Typecheck, lint, then look at it in the preview**

Run: `npx tsc --noEmit -p . && npx prettier --write src/components/gw/elections/PlaceCard.tsx src/components/gw/elections/ProfileEditor.tsx src/components/gw/elections/WardView.tsx src/components/gw/elections/ConstituencyView.tsx src/routes/_authenticated/elections.tsx && npx eslint src/components/gw/elections/PlaceCard.tsx src/components/gw/elections/ProfileEditor.tsx src/components/gw/elections/WardView.tsx src/components/gw/elections/ConstituencyView.tsx src/routes/_authenticated/elections.tsx`
Expected: no errors.

Preview with the scratchpad harness (`home-harness` in `.claude/launch.json`, port 5198):
- Refresh its atlas data from the real files, with the indicators.
- Give its atlas stand-in `profiles: {}` and a `saveProfile` that stores the profile in memory under `own.profiles`.
- Have its `/atlas` page pass `canEditProfile` to the views.

Then check, at desktop and phone width:
- Kawangware's and Kileleshwa's ward pages show clearly different figures, each with a comparison and the "Google Open Buildings · 2023" tag.
- Dagoretti North's wards table shows the three new columns.
- As an organiser (`?role=organiser`), adding a profile shows it after saving.
- A 501-character communities box can't be typed (`maxLength`), and the reminder shows above the form.
- Nyeri's Tetu shows "There's no ward map for this place yet, so nothing is measured."
- No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/gw/elections/PlaceCard.tsx src/components/gw/elections/ProfileEditor.tsx src/components/gw/elections/WardView.tsx src/components/gw/elections/ConstituencyView.tsx src/routes/_authenticated/elections.tsx src/styles/groundwork.css
git commit -m "$(cat <<'EOF'
Elections: About this place, the team's profile, and how each ward lives

Ward and constituency pages show building density and size and people per
km² against the county's median, and the team's profile with an editor for
everyone but field agents; a constituency's wards table gains three columns.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Docs and the release check

**Files:**
- Modify: `data/atlas/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a branch ready to release, and the order Lovable applies migrations in.

- [ ] **Step 1: Document indicators.csv**

In `data/atlas/README.md`, under "Files", after the `population.csv` entry, add:

```markdown
- `indicators.csv` — `area,indicator,year,value,source`: measured figures for an area, written
  by `scripts/atlas/buildings.ts` from a Google Open Buildings v3 tile and the ward map:
  `area_km2` (geoBoundaries, 2020), and `buildings`, `buildings_per_km2`, `median_building_m2`,
  `small_building_share` (under 40 m²) and `large_building_share` (200 m² or more) from
  Open Buildings (2023, confidence 0.65 or more). Values are decimals with a point; counts and
  medians are whole; shares are between 0 and 1. A constituency is measured only when all its
  wards are mapped. `build-sql.ts … --indicators` writes them as a migration of their own.
```

- [ ] **Step 2: The whole suite, the build, and lint on what changed**

Run: `npm test && npm run build && git diff --name-only main...HEAD -- '*.ts' '*.tsx' | xargs npx eslint`
Expected:
- every tsx test file reports `0 failed`
- the SQL tests pass, including `profiles.test.sql (5 tests)`
- the build succeeds
- eslint reports nothing

- [ ] **Step 3: Commit the docs**

```bash
git add data/atlas/README.md
git commit -m "$(cat <<'EOF'
Atlas docs: indicators.csv and how it's made

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Hand the release to the user**

Don't push. Tell the user the branch is ready, and that Lovable must apply these migrations in this order before the code ships:
1. `20261007100000_atlas_first_counties.sql`, if it still isn't applied
2. `20261010090000_area_profiles.sql`
3. `20261010100000_atlas_indicators.sql`

Give them the prompt to paste into Lovable's chat. Push only when they say so (use the superpowers:finishing-a-development-branch skill).
