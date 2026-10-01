# Real mornings, part 2: search interest, top of mind, no samples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home compares how much each candidate is searched for on Google, ranks the week's
issues across news and social, messages, the door and searches, and shows nothing invented:
no samples, no "Sample" labels, and "Listen" reads only what Home shows.

**Architecture:** A daily step on the hourly Listening call (own clock, 06:00 Nairobi) asks
SerpApi's Google Trends for each campaign's candidates and its week's top issues, within a
daily "trends" budget, and keeps one read per campaign, day and kind (schema 21). Pure modules
hold the rules (`top-of-mind.ts`, `search-interest.ts`, `home-spoken.ts`); loaders read with the
signed-in person's client or, for the step, one campaign at a time.

**Tech Stack:** TanStack Start and Router, React, React Query, Supabase with RLS, SerpApi's
Google Trends engine, tsx test scripts, SQL tests on a throwaway Postgres.

**Spec:** `docs/superpowers/specs/2026-09-30-real-mornings-design.md` (sections 3, 4, 5, Data,
Privacy, Errors, Release). Part 1 (the diary and the story) is built.

## Global Constraints

- Nothing is pushed until the release; never rewrite pushed history (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint only new or changed lines; in files that already have lint errors the count must not
  rise. Test first for every rule; `npm test` runs every `tests/*.test.ts`, then the SQL tests.
- Campaign tables: `campaign_id default my_campaign()`, the restrictive "own campaign only"
  policy, the team reads; only the server writes search interest.
- Days and times are Nairobi's. The shared `listening_jobs` rows say what happened in counts
  only, never a campaign's names, rivals or issues.
- Only public words leave Groundwork: candidates' names and issue words to SerpApi. No voter data.
- SerpApi: `SERPAPI_API_KEY`; `engine=google_trends`, up to five terms, `date=today 1-m`,
  `data_type=TIMESERIES`, `tz=-180`; Nairobi is `geo=KE-110`, all of Kenya `geo=KE`.
- The daily "trends" budget defaults to 8 (`SERPAPI_DAILY_SEARCHES`), so a month stays under
  the free plan's 250 searches.
- Copy is plain English; nothing on Home says "Sample".

## Review Focus

1. SerpApi doesn't know Nairobi's region, or Nairobi's answer is mostly zeros: Kenya's answer is
   used and Home says so. Tests: Task 7 ("an error for Nairobi falls back to Kenya", "from
   Nairobi then Kenya").
2. The month's free searches run out: the day's budget stops the step and says so. Tests: Task
   5 ("the trends limit is 8"), Task 7 ("the day's limit stops it").
3. A week with too little raised to rank: no top issue is invented. Tests: Task 3 ("a quiet
   week"), Task 8 ("too little this week to name a top issue").
4. Rivals' own posts counted as what people raise: they are left out. Test: Task 6 ("the
   week's news, rivals' posts aside").
5. "Listen" reading invented content once the samples are gone. Test: Task 10 ("nothing
   invented").

---

### Task 1: Schema 21: search interest, names to search by, a SerpApi budget

**Files:**
- Create: `supabase/migrations/20261001090000_search_interest.sql`, `tests/sql/search.test.sql`
- Modify: `src/integrations/supabase/types.ts`, `tests/sql/mornings.test.sql` (its version check
  becomes `>= 20`)

**Interfaces:** Produces `race_rivals.search_as`, the `trends` budget in `social_credits`, and
`search_interest (id, campaign_id, day, kind 'candidates'|'issues', geo 'KE-110'|'KE', series
jsonb, created_at)`, unique `(campaign_id, day, kind)`; `groundwork_schema_version() = 21`.

- [ ] **Step 1: Write the failing SQL tests** in `tests/sql/search.test.sql`:

```sql
-- Search interest: who reads it, one read a day for each kind, the names
-- candidates are searched by, and SerpApi's own budget. Run with
-- tests/sql/run.sh; each test rolls back.

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

-- test: the team reads its own search interest, and only the server writes it
begin;
insert into public.search_interest (campaign_id, day, kind, geo, series) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-01', 'candidates', 'KE-110', '[]'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-01', 'candidates', 'KE', '[]');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.search_interest) = 1, 'Sakaja''s agent reads one read';
  assert (select geo from public.search_interest) = 'KE-110', 'and it is Sakaja''s';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert pg_temp.state_of($q$insert into public.search_interest (day, kind, geo, series)
    values ('2026-10-02', 'issues', 'KE', '[]')$q$) = '42501', 'the manager writes search interest';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.search_interest;
  assert false, 'anon reads search interest';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: one read a day of each kind, from Nairobi or Kenya
begin;
do $$
declare
  head constant text := $h$insert into public.search_interest (campaign_id, day, kind, geo, series)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-01', $h$;
begin
  assert pg_temp.state_of(head || $q$'candidates', 'KE-110', '[]')$q$) is null, 'a good read is refused';
  assert pg_temp.state_of(head || $q$'candidates', 'KE', '[]')$q$) = '23505', 'two reads of a kind in a day';
  assert pg_temp.state_of(head || $q$'issues', 'US', '[]')$q$) = '23514', 'a read from elsewhere';
  assert pg_temp.state_of(head || $q$'weather', 'KE', '[]')$q$) = '23514', 'an unknown kind';
  assert pg_temp.state_of(head || $q$'issues', 'KE', '{}')$q$) = '23514', 'a series that is not a list';
end $$;
rollback;

-- test: candidates are searched as the names people use
do $$ begin
  assert (select search_as from public.race_rivals where name = 'Johnson Sakaja') = 'Sakaja', 'Sakaja';
  assert (select search_as from public.race_rivals where name = 'Agnes Kagure') = 'Kagure', 'Kagure';
  assert (select search_as from public.race_rivals where name = 'James Gakuya') = 'Gakuya', 'Gakuya';
  assert (select search_as from public.race_rivals where name = 'Ronald Karauri') = 'Karauri', 'Karauri';
  assert (select search_as from public.race_rivals where name = 'Babu Owino') is null, 'Babu Owino by his full name';
  assert pg_temp.state_of($q$update public.race_rivals set search_as = 'B' where name = 'Babu Owino'$q$) = '23514',
    'a one-letter search';
end $$;

-- test: SerpApi searches have a budget of their own
begin;
set local role service_role;
do $$ begin
  assert public.take_social_credits('trends', 8, 8), 'the day''s eight searches';
  assert not public.take_social_credits('trends', 1, 8), 'a ninth';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 21, 'schema version'; end $$;
```

- [ ] **Step 2: Run** `bash tests/sql/run.sh`. Expected: `FAIL tests/sql/search.test.sql`
      (relation `search_interest` does not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261001090000_search_interest.sql`:

```sql
-- Real mornings, part 2. Schema version 21.
--
-- Search interest from Google Trends, read through SerpApi once a day for each
-- campaign: its candidates and the week's top issues. Each candidate can be
-- searched as the name people use. SerpApi searches come out of a daily budget
-- of their own. The server writes search interest; the team reads it.

alter table public.race_rivals
  add column search_as text check (search_as is null or length(btrim(search_as)) between 2 and 60);

-- Sakaja's race: searched as the papers name them; Babu Owino by his full name.
update public.race_rivals r
   set search_as = v.search_as
  from (values
    ('Johnson Sakaja', 'Sakaja'),
    ('Agnes Kagure', 'Kagure'),
    ('James Gakuya', 'Gakuya'),
    ('Ronald Karauri', 'Karauri')
  ) as v(name, search_as)
 where r.campaign_id = 'ca000000-0000-4000-8000-000000000002'
   and r.name = v.name
   and r.search_as is null;

alter table public.social_credits drop constraint social_credits_budget_check;
alter table public.social_credits
  add constraint social_credits_budget_check check (budget in ('rivals', 'keywords', 'trends'));

create table public.search_interest (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('candidates', 'issues')),
  geo         text not null check (geo in ('KE-110', 'KE')),
  series      jsonb not null
              check (jsonb_typeof(series) = 'array' and octet_length(series::text) <= 40000),
  created_at  timestamptz not null default now(),
  constraint search_interest_day_key unique (campaign_id, day, kind)
);

alter table public.search_interest enable row level security;
revoke all on public.search_interest from anon, authenticated;
grant select on public.search_interest to authenticated;
grant all on public.search_interest to service_role;

create policy "own campaign only" on public.search_interest as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "search interest readable by team" on public.search_interest for select to authenticated
  using (public.is_team_member(auth.uid()));

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 21 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

  In `tests/sql/mornings.test.sql`, change its last line's `= 20` to `>= 20` (each schema's
  own test pins its own version).

- [ ] **Step 4: Types.** In `src/integrations/supabase/types.ts`: add `search_as: string | null`
      to `race_rivals.Row` and `search_as?: string | null` to its `Insert` and `Update`; and
      before `segments`, add:

```ts
      search_interest: {
        Row: {
          campaign_id: string
          created_at: string
          day: string
          geo: string
          id: string
          kind: string
          series: Json
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          day: string
          geo: string
          id?: string
          kind: string
          series: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          day?: string
          geo?: string
          id?: string
          kind?: string
          series?: Json
        }
        Relationships: [
          {
            foreignKeyName: "search_interest_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 5: Run** `bash tests/sql/run.sh` (Expected: `ok   36 migrations apply cleanly`,
      every file passes) and `npx tsc --noEmit -p tsconfig.json` (no errors).
- [ ] **Step 6: Commit** `Search interest, the names candidates are searched by, and SerpApi's own budget (schema 21)`.

---

### Task 2: Each candidate is searched as the name people use

**Files:**
- Modify: `src/lib/race-data.ts` (`RaceRival`, `RivalRow`, `rivalFromRow`, `RivalInput`,
  `cleanRival`), `src/lib/race.functions.ts` (`RIVAL_COLS`, `writeRival`),
  `src/components/gw/home/RaceEditor.tsx` (`RivalForm`)
- Test: `tests/race-data.test.ts`

**Interfaces:** Produces `RaceRival.searchAs: string | null` (null: the full name),
`RivalRow.search_as?: string | null`, `RivalInput.searchAs?: string | null`.

- [ ] **Step 1: Write the failing tests.** In `tests/race-data.test.ts`, add `searchAs: null`
      as the last field of the expected objects in "a rival, tidied" and the `rivalFromRow`
      check, and after "ours wears our colour" add:

```ts
eq(
  "searched as the name people use",
  cleanRival({ name: "Johnson Sakaja", tone: "a", searchAs: "  Sakaja " }).searchAs,
  "Sakaja",
);
eq("blank: the full name", cleanRival({ name: "Babu Owino", tone: "a", searchAs: " " }).searchAs, null);
refuses(
  "one letter is no search",
  () => cleanRival({ name: "Babu Owino", tone: "a", searchAs: "B" }),
  "Give at least two letters to search for, or leave it blank.",
);
eq(
  "a row's search name",
  rivalFromRow({
    id: "s",
    name: "Johnson Sakaja",
    party: null,
    office: null,
    is_us: true,
    tone: "us",
    sort: 0,
    facebook: null,
    x: null,
    tiktok: null,
    search_as: "Sakaja",
  }).searchAs,
  "Sakaja",
);
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/race-data.test.ts`. Expected:
      FAIL (no `searchAs`).

- [ ] **Step 3: Implement.** In `src/lib/race-data.ts`:
  - `RaceRival`, after `tiktok`: `/** The name searched for on Google ("Sakaja"); null: the full name. */ searchAs: string | null;`
  - `RivalRow`, after `tiktok`: `search_as?: string | null;`
  - `rivalFromRow`, after `tiktok`: `searchAs: r.search_as ?? null,`
  - `RivalInput`, after `tiktok`: `searchAs?: string | null;`
  - `cleanRival`, before the `return`:

```ts
  const searchAs = text(input.searchAs, 60);
  if (searchAs !== null && searchAs.length < 2)
    throw new Error("Give at least two letters to search for, or leave it blank.");
```

    and `searchAs,` after `tiktok: handleOf("tiktok", input.tiktok),` in the returned object.

  In `src/lib/race.functions.ts`: `RIVAL_COLS` gains `, search_as`, and `writeRival`'s row gains
  `search_as: r.searchAs,`. In `RaceEditor.tsx`'s `RivalForm`: add
  `const [searchAs, setSearchAs] = useState(rival?.searchAs ?? "");`, send `searchAs` with the
  other fields in `save({ data: {...} })`, and after the handles row add:

```tsx
      <label className="pb-field">
        <span>Searched as on Google (blank: the full name)</span>
        <input
          value={searchAs}
          maxLength={60}
          placeholder={name.trim() || "Sakaja"}
          autoComplete="off"
          onChange={(e) => setSearchAs(e.target.value)}
        />
      </label>
```

- [ ] **Step 4: Run** all tests (`npm test`); typecheck. Expected: pass. Fix any other test
      that compares a whole rival by adding `searchAs: null` to its expectation.
- [ ] **Step 5: Lint** changed files (counts must not rise). **Commit**
      `Each candidate can be searched as the name people use`.

---

### Task 3: Top of mind: the week's issues across four sources

**Files:**
- Create: `src/lib/top-of-mind.ts`
- Test: `tests/top-of-mind.test.ts`

**Interfaces:** Produces `type MindSource = "news" | "messages" | "door" | "searches"`,
`MIND_SOURCES`, `SOURCE_NAMES`, `MIN_ITEMS = 5`, `issueKey(raw): string | null`,
`issueLabel(key)`, `type MindInputs = { news: { issue; title; url }[]; messages: (string|null)[]; door: (string|null)[]; searches: { issue: string; average: number }[] }`,
`type MindLine = { key; label; score: number; shares: Record<MindSource, number | null>; examples: { text; url: string | null }[] }`,
`type TopOfMind = { lines: MindLine[]; sizes: Record<MindSource, number> }`,
`topOfMind(inputs, max = 5): TopOfMind`, `pct(share): string`, `listOf(parts): string`,
`mindBasis(m): string`, `sourcesOf(line): string`.

- [ ] **Step 1: Write the failing tests** in `tests/top-of-mind.test.ts`:

```ts
// Checks for what's on people's minds this week: issue names brought together,
// and the four sources counted on their own and averaged. Pure; nothing leaves
// this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/top-of-mind.test.ts

import { issueKey, listOf, mindBasis, pct, sourcesOf, topOfMind } from "@/lib/top-of-mind";

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
  "issue names brought together",
  [
    issueKey("Rubbish"),
    issueKey("Water and sanitation"),
    issueKey(" Floods "),
    issueKey("insecurity"),
    issueKey("Street lights"),
  ],
  ["garbage", "water", "floods", "security", "lighting"],
);
eq(
  "no issue",
  [issueKey("general"), issueKey("Campaign"), issueKey(""), issueKey(null)],
  [null, null, null, null],
);

const news = (issue: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    issue,
    title: `${issue} story ${i + 1}`,
    url: `https://news.test/${issue}/${i + 1}`,
  }));
const mind = topOfMind({
  news: [...news("water", 6), ...news("floods", 2), ...news("general", 2)],
  messages: ["water", "water", "water", "Rubbish", "garbage"],
  door: ["Water", "Water"],
  searches: [
    { issue: "water", average: 30 },
    { issue: "floods", average: 10 },
  ],
});
const r3 = (x: number) => Math.round(x * 1000) / 1000;
eq(
  "the week's issues, each source counted on its own",
  mind.lines.map((l) => [l.key, r3(l.score)]),
  [
    ["water", 0.7],
    ["floods", 0.167],
    ["garbage", 0.133],
  ],
);
eq("a source with under five items doesn't count", mind.lines[0]?.shares, {
  news: 0.75,
  messages: 0.6,
  door: null,
  searches: 0.75,
});
eq(
  "with the latest headlines",
  mind.lines[0]?.examples.map((e) => e.text),
  ["water story 1", "water story 2"],
);
eq("how much each source had", mind.sizes, { news: 8, messages: 5, door: 2, searches: 2 });
eq(
  "what it rests on",
  mindBasis(mind),
  "Across 8 news and social items, 5 messages and Google searches, the last 7 days.",
);
eq("an issue's sources in words", sourcesOf(mind.lines[0]!), "news and social, messages to us and searches");
eq(
  "a quiet week",
  topOfMind({ news: news("water", 2), messages: [], door: [], searches: [] }).lines,
  [],
);
eq(
  "nothing to say yet",
  mindBasis(topOfMind({ news: [], messages: [], door: [], searches: [] })),
  "Not enough raised this week to say yet.",
);
eq("percentages", pct(0.7000000000000001), "70%");
eq("lists", [listOf(["a"]), listOf(["a", "b"]), listOf(["a", "b", "c"])], [
  "a",
  "a and b",
  "a, b and c",
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/top-of-mind.ts`:

```ts
// What is on people's minds this week: the issues raised in the news and on
// social media, in messages to the campaign, at the door, and in Google
// searches. Each source is counted on its own and the shares averaged, so no
// one source decides. Pure.

export type MindSource = "news" | "messages" | "door" | "searches";
export const MIND_SOURCES: MindSource[] = ["news", "messages", "door", "searches"];
export const SOURCE_NAMES: Record<MindSource, string> = {
  news: "News and social",
  messages: "Messages to us",
  door: "At the door",
  searches: "Searches",
};

/** A source counts in a week with at least this many items (searches: any interest). */
export const MIN_ITEMS = 5;

const NOT_ISSUES = new Set(["general", "campaign"]);
const SAME: Record<string, string> = {
  rubbish: "garbage",
  trash: "garbage",
  waste: "garbage",
  "garbage and cleanliness": "garbage",
  "water and sanitation": "water",
  sanitation: "water",
  sewer: "water",
  sewerage: "water",
  flooding: "floods",
  road: "roads",
  insecurity: "security",
  crime: "security",
  bursary: "bursaries",
  job: "jobs",
  unemployment: "jobs",
  hospital: "health",
  matatu: "transport",
  matatus: "transport",
  hawker: "hawkers",
  "street lights": "lighting",
  streetlights: "lighting",
};

/** One name per issue, in lower case; null for "no issue". */
export function issueKey(raw: string | null | undefined): string | null {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!k || NOT_ISSUES.has(k)) return null;
  return SAME[k] ?? k;
}

export const issueLabel = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

export type MindInputs = {
  /** Listening's mentions, newest first, rivals' own posts aside. */
  news: { issue: string | null; title: string | null; url: string | null }[];
  messages: (string | null)[];
  door: (string | null)[];
  /** Each issue's average search interest this week. */
  searches: { issue: string; average: number }[];
};

export type MindLine = {
  key: string;
  label: string;
  /** The average share across the sources that count, 0 to 1. */
  score: number;
  /** Each source's share for this issue; null where the source doesn't count this week. */
  shares: Record<MindSource, number | null>;
  examples: { text: string; url: string | null }[];
};

export type TopOfMind = {
  lines: MindLine[];
  /** What each source had this week (searches: issues with any interest). */
  sizes: Record<MindSource, number>;
};

function tally(keys: (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** The week's top issues across the four sources. */
export function topOfMind(inp: MindInputs, max = 5): TopOfMind {
  const counts: Record<MindSource, Map<string, number>> = {
    news: tally(inp.news.map((r) => issueKey(r.issue))),
    messages: tally(inp.messages.map(issueKey)),
    door: tally(inp.door.map(issueKey)),
    searches: new Map(),
  };
  for (const s of inp.searches) {
    const k = issueKey(s.issue);
    if (k && s.average > 0) counts.searches.set(k, (counts.searches.get(k) ?? 0) + s.average);
  }
  const sizes: Record<MindSource, number> = {
    news: sum(counts.news),
    messages: sum(counts.messages),
    door: sum(counts.door),
    searches: counts.searches.size,
  };
  const counting = MIND_SOURCES.filter((s) =>
    s === "searches" ? sizes.searches > 0 : sizes[s] >= MIN_ITEMS,
  );
  const keys = new Set(counting.flatMap((s) => [...counts[s].keys()]));
  const lines = [...keys].map((key): MindLine => {
    const shares = Object.fromEntries(
      MIND_SOURCES.map((s) => [
        s,
        counting.includes(s) ? (counts[s].get(key) ?? 0) / sum(counts[s]) : null,
      ]),
    ) as Record<MindSource, number | null>;
    const got = counting.map((s) => shares[s] ?? 0);
    return {
      key,
      label: issueLabel(key),
      score: got.reduce((a, b) => a + b, 0) / got.length,
      shares,
      examples: inp.news
        .filter((r) => issueKey(r.issue) === key && r.title)
        .slice(0, 2)
        .map((r) => ({ text: r.title!, url: r.url })),
    };
  });
  lines.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  return { lines: lines.slice(0, max), sizes };
}

/** "31%". */
export const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** "a", "a and b", "a, b and c". */
export const listOf = (parts: string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const nf = new Intl.NumberFormat("en-KE");

/** What this week's ranking rests on, in a line. */
export function mindBasis(m: TopOfMind): string {
  const parts = [
    m.sizes.news >= MIN_ITEMS ? `${nf.format(m.sizes.news)} news and social items` : null,
    m.sizes.messages >= MIN_ITEMS ? `${nf.format(m.sizes.messages)} messages` : null,
    m.sizes.door >= MIN_ITEMS ? `${nf.format(m.sizes.door)} door conversations` : null,
    m.sizes.searches > 0 ? "Google searches" : null,
  ].filter((p): p is string => p !== null);
  return parts.length
    ? `Across ${listOf(parts)}, the last 7 days.`
    : "Not enough raised this week to say yet.";
}

/** The sources an issue's score rests on, in words. */
export const sourcesOf = (l: MindLine): string =>
  listOf(MIND_SOURCES.filter((s) => l.shares[s] !== null).map((s) => SOURCE_NAMES[s].toLowerCase()));
```

- [ ] **Step 4: Run** it. Expected: all pass. **Lint** the new files (`--fix` is fine).
- [ ] **Step 5: Commit** `Top of mind: the week's issues across news, messages, the door and searches`.

---
### Task 4: Search interest's rules

**Files:**
- Create: `src/lib/search-interest.ts`
- Test: `tests/search-interest.test.ts`

**Interfaces:** Consumes Task 2's `RaceRival.searchAs`. Produces `type Geo = "KE-110" | "KE"`,
`PLACE_NAMES`, `type TermPoints = { term: string; ref: string | null; points: { day: string; value: number }[] }`
(ref: the rival's id, or the issue's key), `type SearchRead = { day; kind: "candidates" | "issues"; geo: Geo; series: TermPoints[]; at: string }`,
`ISSUE_SEARCH: Record<string, string>`, `searchName({ name, searchAs? })`,
`parseTrends(json, terms): { term; points }[] | null`, `isThin(series): boolean`,
`averageBetween(t, from, to)`, `issueAverages(read, today)`,
`searchSpike(read, rivals, today): RivalMove | null`, `searchSummary(read, rivals): string`,
`type SearchChartModel = { days: string[]; series: { key; label; tone: Tone; values: (number | null)[] }[] }`,
`searchChart(read, rivals): SearchChartModel | null`, `searchFromRow(row): SearchRead | null`.

- [ ] **Step 1: Write the failing tests** in `tests/search-interest.test.ts`:

```ts
// Checks for search interest: reading SerpApi's Google Trends answer, when an
// answer is too thin to show, a rival searched far more this week, and the
// chart's lines. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest.test.ts

import type { RaceRival } from "@/lib/race-data";
import {
  ISSUE_SEARCH,
  isThin,
  issueAverages,
  parseTrends,
  searchChart,
  searchFromRow,
  searchName,
  searchSpike,
  searchSummary,
  type SearchRead,
} from "@/lib/search-interest";

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

// SerpApi's documented answer: a timeline of days, each with a value per term.
const ts = (day: string) => String(Date.parse(`${day}T00:00:00Z`) / 1000);
const ANSWER = {
  interest_over_time: {
    timeline_data: [
      {
        date: "Sep 29, 2026",
        timestamp: ts("2026-09-29"),
        values: [
          { query: "Sakaja", value: "40", extracted_value: 40 },
          { query: "Babu Owino", value: "100", extracted_value: 100 },
        ],
      },
      {
        date: "Sep 30, 2026",
        timestamp: ts("2026-09-30"),
        values: [
          { query: "Sakaja", value: "35", extracted_value: 35 },
          { query: "Babu Owino", value: "<1", extracted_value: 0 },
        ],
      },
      {
        date: "Oct 1, 2026",
        timestamp: ts("2026-10-01"),
        partial_data: true,
        values: [
          { query: "Sakaja", value: "9", extracted_value: 9 },
          { query: "Babu Owino", value: "9", extracted_value: 9 },
        ],
      },
    ],
  },
};
eq("each term's days, the partial day left out", parseTrends(ANSWER, ["Sakaja", "Babu Owino"]), [
  {
    term: "Sakaja",
    points: [
      { day: "2026-09-29", value: 40 },
      { day: "2026-09-30", value: 35 },
    ],
  },
  {
    term: "Babu Owino",
    points: [
      { day: "2026-09-29", value: 100 },
      { day: "2026-09-30", value: 0 },
    ],
  },
]);
eq("an answer with no timeline", parseTrends({ error: "Unsupported geo" }, ["Sakaja"]), null);

const run = (n: number, value: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    value: value(i),
  }));
eq("a few days is thin", isThin([{ points: run(3, () => 50) }]), true);
eq(
  "mostly zeros is thin",
  isThin([{ points: run(10, (i) => (i < 6 ? 0 : 40)) }, { points: run(10, (i) => (i < 7 ? 0 : 10)) }]),
  true,
);
eq("a month of interest is not", isThin([{ points: run(30, () => 20) }]), false);

eq(
  "searched as",
  [searchName({ name: "Johnson Sakaja", searchAs: "Sakaja" }), searchName({ name: "Babu Owino", searchAs: null })],
  ["Sakaja", "Babu Owino"],
);
eq("water is searched as the shortage", ISSUE_SEARCH["water"], "water shortage");

// Four weeks to 30 September: the last seven days at `week`, the three before at `before`.
const TODAY = "2026-09-30";
const month = (before: number, week: number) =>
  Array.from({ length: 28 }, (_, i) => ({
    day: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (27 - i) * 864e5).toISOString().slice(0, 10),
    value: i >= 21 ? week : before,
  }));
const rival = (id: string, name: string, tone: RaceRival["tone"], isUs = false): RaceRival => ({
  id,
  name,
  party: null,
  office: null,
  isUs,
  tone,
  sort: 0,
  facebook: null,
  x: null,
  tiktok: null,
  searchAs: null,
});
const R = [
  rival("s", "Johnson Sakaja", "us", true),
  rival("b", "Babu Owino", "a"),
  rival("k", "Agnes Kagure", "b"),
];
const READ: SearchRead = {
  day: TODAY,
  kind: "candidates",
  geo: "KE-110",
  at: "2026-09-30T03:05:00Z",
  series: [
    { term: "Sakaja", ref: "s", points: month(10, 40) },
    { term: "Babu Owino", ref: "b", points: month(12, 30) },
    { term: "Kagure", ref: "k", points: month(8, 8) },
  ],
};
eq("a rival searched twice as much this week; ours is no rival's move", searchSpike(READ, R, TODAY), {
  title: "Searches for Babu Owino doubled this week",
  detail:
    "Google search interest in Nairobi averaged 30 this week, against 12 over the three weeks before.",
});
eq(
  "three times as much",
  searchSpike({ ...READ, series: [{ term: "Babu Owino", ref: "b", points: month(10, 35) }] }, R, TODAY)
    ?.title,
  "Searches for Babu Owino tripled this week",
);
eq(
  "a steady week is no move",
  searchSpike({ ...READ, series: [{ term: "Kagure", ref: "k", points: month(8, 8) }] }, R, TODAY),
  null,
);
eq(
  "no history, no move",
  searchSpike({ ...READ, series: [{ term: "Babu Owino", ref: "b", points: month(0, 30) }] }, R, TODAY),
  null,
);
eq("a read of issues is no rival's move", searchSpike({ ...READ, kind: "issues" }, R, TODAY), null);
eq(
  "who drew the most searches",
  searchSummary(READ, R),
  "Johnson Sakaja drew the most searches in Nairobi this month, then Babu Owino.",
);
const chart = searchChart(READ, R);
eq(
  "the chart: a line per candidate, a point per day",
  [chart?.days.length, chart?.series.map((s) => [s.key, s.tone, s.values[0], s.values[27]])],
  [
    28,
    [
      ["s", "us", 10, 40],
      ["b", "a", 12, 30],
      ["k", "b", 8, 8],
    ],
  ],
);
eq(
  "issues' interest this week",
  issueAverages(
    { ...READ, kind: "issues", series: [{ term: "water shortage", ref: "water", points: month(10, 40) }] },
    TODAY,
  ),
  [{ issue: "water", average: 40 }],
);
eq(
  "a stored read",
  searchFromRow({
    day: TODAY,
    kind: "candidates",
    geo: "KE",
    created_at: "2026-09-30T03:05:00Z",
    series: [
      { term: "Sakaja", ref: "s", points: [{ day: "2026-09-30", value: 140 }, { day: "soon", value: 3 }] },
    ],
  }),
  {
    day: TODAY,
    kind: "candidates",
    geo: "KE",
    series: [{ term: "Sakaja", ref: "s", points: [{ day: "2026-09-30", value: 100 }] }],
    at: "2026-09-30T03:05:00Z",
  },
);
eq(
  "a read from nowhere we know",
  searchFromRow({ day: TODAY, kind: "candidates", geo: "US", created_at: "x", series: [] }),
  null,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/search-interest.ts`:

```ts
// Search interest from Google Trends, read through SerpApi: how much the race's
// candidates and the week's top issues are searched for, 0 to 100 against the
// busiest day of any term in the set. Pure.

import type { Tone } from "@/lib/demo/types";
import { addDays } from "@/lib/diary";
import type { RaceRival, RivalMove } from "@/lib/race-data";

export type Geo = "KE-110" | "KE";
export const PLACE_NAMES: Record<Geo, string> = { "KE-110": "Nairobi", KE: "Kenya" };

/** One term's daily interest; `ref` ties it to a rival's id or an issue's key. */
export type TermPoints = {
  term: string;
  ref: string | null;
  points: { day: string; value: number }[];
};

export type SearchRead = {
  day: string;
  kind: "candidates" | "issues";
  geo: Geo;
  series: TermPoints[];
  /** When it was read. */
  at: string;
};

/** What people type when an issue is on their mind; issues not here aren't searched. */
export const ISSUE_SEARCH: Record<string, string> = {
  water: "water shortage",
  garbage: "garbage",
  floods: "floods",
  drainage: "drainage",
  roads: "roads",
  transport: "matatu",
  hawkers: "hawkers",
  security: "insecurity",
  jobs: "jobs",
  health: "hospital",
  housing: "housing",
  bursaries: "bursary",
  corruption: "corruption",
  land: "land",
  revenue: "county revenue",
  lighting: "street lights",
};

/** The name a candidate is searched by. */
export const searchName = (r: { name: string; searchAs?: string | null }): string =>
  r.searchAs?.trim() || r.name;

type O = Record<string, unknown>;
const obj = (v: unknown): O => (v && typeof v === "object" ? (v as O) : {});

/** Each term's daily points out of SerpApi's Google Trends answer; null when it has none. */
export function parseTrends(
  json: unknown,
  terms: string[],
): { term: string; points: { day: string; value: number }[] }[] | null {
  const timeline = obj(obj(json)["interest_over_time"])["timeline_data"];
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const out = terms.map((term) => ({ term, points: [] as { day: string; value: number }[] }));
  for (const raw of timeline) {
    const e = obj(raw);
    if (e["partial_data"] === true) continue;
    const seconds = Number(e["timestamp"]);
    if (!Number.isFinite(seconds)) continue;
    // Nairobi's day (UTC+3 all year).
    const day = new Date(seconds * 1000 + 3 * 3600_000).toISOString().slice(0, 10);
    const values = Array.isArray(e["values"]) ? e["values"] : [];
    values.forEach((rawValue, i) => {
      const v = obj(rawValue);
      const k = Number.isInteger(v["query_index"]) ? (v["query_index"] as number) : i;
      const n = Number(v["extracted_value"]);
      const t = out[k];
      if (t && Number.isFinite(n)) t.points.push({ day, value: Math.max(0, Math.min(100, n)) });
    });
  }
  return out;
}

/** Too little to show: under a week of days, or mostly zeros for every term. */
export function isThin(series: { points: { value: number }[] }[]): boolean {
  if (!series.length || series.every((s) => s.points.length < 7)) return true;
  return series.every((s) => s.points.filter((p) => p.value === 0).length > s.points.length / 2);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A term's average over the days after `from` up to and including `to`. */
export const averageBetween = (t: TermPoints, from: string, to: string): number =>
  mean(t.points.filter((p) => p.day > from && p.day <= to).map((p) => p.value));

/** Each issue's average interest over the last seven days, for top of mind. */
export function issueAverages(read: SearchRead | null, today: string): { issue: string; average: number }[] {
  if (!read || read.kind !== "issues") return [];
  return read.series.flatMap((t) =>
    t.ref ? [{ issue: t.ref, average: averageBetween(t, addDays(today, -7), today) }] : [],
  );
}

/** A rival searched at least twice as much this week as in the three weeks before. */
export function searchSpike(read: SearchRead | null, rivals: RaceRival[], today: string): RivalMove | null {
  if (!read || read.kind !== "candidates") return null;
  let best: { name: string; now: number; before: number; ratio: number } | null = null;
  for (const t of read.series) {
    const r = rivals.find((x) => x.id === t.ref);
    if (!r || r.isUs) continue;
    const now = averageBetween(t, addDays(today, -7), today);
    const before = averageBetween(t, addDays(today, -28), addDays(today, -7));
    if (before <= 0) continue;
    const ratio = now / before;
    if (ratio >= 2 && (!best || ratio > best.ratio)) best = { name: r.name, now, before, ratio };
  }
  if (!best) return null;
  const verb =
    best.ratio < 3 ? "doubled" : best.ratio < 4 ? "tripled" : `rose ${Math.floor(best.ratio)}-fold`;
  return {
    title: `Searches for ${best.name} ${verb} this week`,
    detail: `Google search interest in ${PLACE_NAMES[read.geo]} averaged ${Math.round(best.now)} this week, against ${Math.round(best.before)} over the three weeks before.`,
  };
}

/** "Babu Owino drew the most searches in Nairobi this month, then Johnson Sakaja." */
export function searchSummary(read: SearchRead | null, rivals: RaceRival[]): string {
  if (!read || read.kind !== "candidates") return "";
  const ranked = read.series
    .map((t) => ({
      name: rivals.find((r) => r.id === t.ref)?.name ?? t.term,
      avg: mean(t.points.map((p) => p.value)),
    }))
    .filter((x) => x.avg > 0)
    .sort((a, b) => b.avg - a.avg);
  const place = PLACE_NAMES[read.geo];
  if (!ranked[0]) return "";
  return ranked[1]
    ? `${ranked[0].name} drew the most searches in ${place} this month, then ${ranked[1].name}.`
    : `${ranked[0].name} drew searches in ${place} this month.`;
}

export type SearchChartModel = {
  days: string[];
  series: { key: string; label: string; tone: Tone; values: (number | null)[] }[];
};

/** A line per candidate, a point per day; null with under two days to draw. */
export function searchChart(read: SearchRead | null, rivals: RaceRival[]): SearchChartModel | null {
  if (!read || read.kind !== "candidates" || !read.series.length) return null;
  const days = [...new Set(read.series.flatMap((t) => t.points.map((p) => p.day)))].sort();
  if (days.length < 2) return null;
  return {
    days,
    series: read.series.map((t) => {
      const r = rivals.find((x) => x.id === t.ref);
      const byDay = new Map(t.points.map((p) => [p.day, p.value]));
      return {
        key: t.ref ?? t.term,
        label: r?.name ?? t.term,
        tone: r?.tone ?? "a",
        values: days.map((d) => byDay.get(d) ?? null),
      };
    }),
  };
}

/** A stored read, read with care: anything malformed is left out. */
export function searchFromRow(r: {
  day: string;
  kind: string;
  geo: string;
  series: unknown;
  created_at: string;
}): SearchRead | null {
  if (r.kind !== "candidates" && r.kind !== "issues") return null;
  if (r.geo !== "KE-110" && r.geo !== "KE") return null;
  const series = (Array.isArray(r.series) ? r.series : []).flatMap((raw): TermPoints[] => {
    const t = obj(raw);
    const term = typeof t["term"] === "string" ? t["term"] : "";
    if (!term) return [];
    const points = (Array.isArray(t["points"]) ? t["points"] : []).flatMap((rawPoint) => {
      const p = obj(rawPoint);
      const day = p["day"];
      const value = Number(p["value"]);
      return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(value)
        ? [{ day, value: Math.max(0, Math.min(100, value)) }]
        : [];
    });
    return [{ term, ref: typeof t["ref"] === "string" ? t["ref"] : null, points }];
  });
  return { day: r.day, kind: r.kind, geo: r.geo, series, at: r.created_at };
}
```

- [ ] **Step 4: Run** it. Expected: all pass. **Lint** (`--fix` on the new files). Typecheck.
- [ ] **Step 5: Commit** `Search interest's rules: reading Google Trends, thin answers, a rival searched far more`.

---

### Task 5: SerpApi, and a daily budget for it

**Files:**
- Create: `src/lib/serpapi.server.ts`
- Modify: `src/lib/social-credits.ts` (a `trends` budget, per-budget defaults)
- Test: `tests/serpapi.test.ts`

**Interfaces:** Consumes Task 4's `Geo`. Produces `SerpApiError`, `serpConfigured()`,
`trendsAnswer(terms, geo): Promise<unknown>`; `Budget` gains `"trends"`;
`dailyCredits("trends")` is 8 unless `SERPAPI_DAILY_SEARCHES` says otherwise.

- [ ] **Step 1: Write the failing tests** in `tests/serpapi.test.ts`:

```ts
// Checks for asking SerpApi's Google Trends, and its daily budget. A stand-in
// answers instead of SerpApi; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/serpapi.test.ts

import { serpConfigured, trendsAnswer } from "@/lib/serpapi.server";
import { dailyCredits } from "@/lib/social-credits";

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

async function rejects(name: string, p: Promise<unknown>, message: string) {
  try {
    await p;
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

function stub(status: number, body: string) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    asked.push(String(url));
    return new Response(body, { status });
  }) as typeof fetch;
  return asked;
}

async function main() {
  delete process.env["SERPAPI_API_KEY"];
  eq("no key, not connected", serpConfigured(), false);
  await rejects("no key, nothing asked", trendsAnswer(["Sakaja"], "KE-110"), "SerpApi is not connected.");

  process.env["SERPAPI_API_KEY"] = "test-key";
  const asked = stub(200, JSON.stringify({ interest_over_time: { timeline_data: [] } }));
  await trendsAnswer(["Sakaja", "Babu Owino"], "KE-110");
  const u = new URL(asked[0] ?? "https://x.test");
  eq(
    "Google Trends over thirty days, in Nairobi's time",
    [
      u.origin + u.pathname,
      u.searchParams.get("engine"),
      u.searchParams.get("q"),
      u.searchParams.get("geo"),
      u.searchParams.get("date"),
      u.searchParams.get("data_type"),
      u.searchParams.get("tz"),
      u.searchParams.get("api_key"),
    ],
    [
      "https://serpapi.com/search.json",
      "google_trends",
      "Sakaja,Babu Owino",
      "KE-110",
      "today 1-m",
      "TIMESERIES",
      "-180",
      "test-key",
    ],
  );
  const commas = stub(200, JSON.stringify({ interest_over_time: { timeline_data: [] } }));
  await trendsAnswer(["water, sewage"], "KE");
  eq("a comma in a term doesn't split it", new URL(commas[0] ?? "https://x.test").searchParams.get("q"), "water  sewage");
  stub(200, JSON.stringify({ error: "Invalid API key." }));
  await rejects("SerpApi's own refusal", trendsAnswer(["Sakaja"], "KE"), "Invalid API key.");
  stub(500, "<html>down</html>");
  await rejects("SerpApi down", trendsAnswer(["Sakaja"], "KE"), "SerpApi answered 500.");

  eq("the trends limit is 8", dailyCredits("trends"), 8);
  process.env["SERPAPI_DAILY_SEARCHES"] = "5";
  eq("and set by its own variable", dailyCredits("trends"), 5);
  delete process.env["SERPAPI_DAILY_SEARCHES"];
  eq("the others keep theirs", [dailyCredits("rivals"), dailyCredits("keywords")], [60, 60]);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/serpapi.server.ts`:

```ts
// Google Trends through SerpApi (server only): interest over the past 30 days
// for up to five terms. Each request is one search on the SerpApi plan; the
// caller takes it from the day's "trends" budget first.

import type { Geo } from "@/lib/search-interest";

export class SerpApiError extends Error {}

const SERP = "https://serpapi.com/search.json";

export const serpConfigured = (): boolean => Boolean(process.env["SERPAPI_API_KEY"]);

/** SerpApi's Google Trends answer for `terms` in `geo`, by Nairobi's days. */
export async function trendsAnswer(terms: string[], geo: Geo): Promise<unknown> {
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) throw new SerpApiError("SerpApi is not connected.");
  const params = new URLSearchParams({
    engine: "google_trends",
    // Terms are comma-separated, so a comma inside one becomes a space.
    q: terms
      .slice(0, 5)
      .map((t) => t.replace(/,/g, " ").trim())
      .join(","),
    geo,
    date: "today 1-m",
    data_type: "TIMESERIES",
    tz: "-180",
    api_key: key,
  });
  const res = await fetch(`${SERP}?${params}`);
  const body: unknown = await res.json().catch(() => null);
  const error = body && typeof body === "object" ? (body as Record<string, unknown>)["error"] : null;
  if (!res.ok || !body || error) {
    throw new SerpApiError(
      typeof error === "string" ? error.slice(0, 160) : `SerpApi answered ${res.status}.`,
    );
  }
  return body;
}
```

  In `src/lib/social-credits.ts`: update the header comment (a third budget, "trends", for
  SerpApi's Google Trends; 8 a day keeps a month under the free plan's 250), make
  `export type Budget = "rivals" | "keywords" | "trends";`, add
  `trends: "SERPAPI_DAILY_SEARCHES",` to `ENV`, add

```ts
const DEFAULTS: Record<Budget, number> = {
  rivals: DEFAULT_DAILY_CREDITS,
  keywords: DEFAULT_DAILY_CREDITS,
  trends: 8,
};
```

  and in `dailyCredits` return `DEFAULTS[budget]` in place of `DEFAULT_DAILY_CREDITS` (its doc
  comment: "The day's limit for a budget, from its environment variable, else its default.").

- [ ] **Step 4: Run** the SerpApi tests and `tests/listening.test.ts`. Expected: all pass.
      Typecheck; lint (social-credits.ts must not gain errors).
- [ ] **Step 5: Commit** `SerpApi's Google Trends, within a daily budget of its own`.

---

### Task 6: Reading the week's issues and the latest search interest

**Files:**
- Create: `src/lib/search-interest.functions.ts`
- Modify: `tests/fake-supabase.ts` (upsert key for `search_interest`)
- Test: `tests/search-interest-functions.test.ts`

**Interfaces:** Consumes Task 3's `MindInputs`, Task 4's `searchFromRow`, `SearchRead`.
Produces `loadMindInputs(sb, campaignId: string | null, since): Promise<Omit<MindInputs, "searches">>`
and `loadSearch(sb, kind, campaignId: string | null = null): Promise<SearchRead | null>`. With a
campaign id they read that campaign (the server's key); without one, row level security does.

- [ ] **Step 1:** In `tests/fake-supabase.ts`, add to `KEYS`:
      `search_interest: [["campaign_id", "day", "kind"]],`.

- [ ] **Step 2: Write the failing tests** in `tests/search-interest-functions.test.ts`:

```ts
// Checks for reading the week's issues from a campaign's own records and its
// latest reads of search interest, with a stand-in database. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest-functions.test.ts

import { loadMindInputs, loadSearch } from "@/lib/search-interest.functions";

import { fakeSupabase } from "./fake-supabase";

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

const daysAgo = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

async function main() {
  const sb = fakeSupabase({
    listening_mentions: [
      { id: "m1", campaign_id: "c2", issue: "water", title: "Taps dry", url: "https://a.test/1", found_at: daysAgo(1), rival_id: null },
      { id: "m2", campaign_id: "c2", issue: "water", title: "Old", url: "https://a.test/2", found_at: daysAgo(9), rival_id: null },
      { id: "m3", campaign_id: "c2", issue: "water", title: "A rival's post", url: "https://a.test/3", found_at: daysAgo(1), rival_id: "r1" },
      { id: "m4", campaign_id: "c3", issue: "tea", title: "Mathira", url: "https://a.test/4", found_at: daysAgo(1), rival_id: null },
    ],
    conversations: [
      { id: "v1", campaign_id: "c2", issue: "garbage", last_message_at: daysAgo(2) },
      { id: "v2", campaign_id: "c2", issue: null, last_message_at: daysAgo(2) },
      { id: "v3", campaign_id: "c2", issue: "water", last_message_at: daysAgo(10) },
    ],
    person_events: [
      { id: "e1", campaign_id: "c2", kind: "door_spoke", detail: "Water", created_at: daysAgo(3) },
      { id: "e2", campaign_id: "c2", kind: "door_not_home", detail: null, created_at: daysAgo(3) },
    ],
    search_interest: [
      { id: "s1", campaign_id: "c2", day: "2026-09-29", kind: "candidates", geo: "KE", series: [], created_at: "2026-09-29T03:05:00Z" },
      {
        id: "s2",
        campaign_id: "c2",
        day: "2026-09-30",
        kind: "candidates",
        geo: "KE-110",
        series: [{ term: "Sakaja", ref: "s", points: [{ day: "2026-09-30", value: 40 }] }],
        created_at: "2026-09-30T03:05:00Z",
      },
      { id: "s3", campaign_id: "c2", day: "2026-09-30", kind: "issues", geo: "KE", series: "bad", created_at: "2026-09-30T03:05:00Z" },
    ],
  });

  const inp = await loadMindInputs(sb as never, "c2", daysAgo(7));
  eq("the week's news, rivals' posts aside, this campaign's only", inp.news.map((n) => n.title), ["Taps dry"]);
  eq("the week's messages with an issue", inp.messages, ["garbage"]);
  eq("doors where the person spoke", inp.door, ["Water"]);

  const read = await loadSearch(sb as never, "candidates");
  eq("the newest read", [read?.day, read?.geo, read?.series[0]?.term], ["2026-09-30", "KE-110", "Sakaja"]);
  eq("a read that isn't a list has no lines", (await loadSearch(sb as never, "issues"))?.series, []);
  eq("none of a kind", await loadSearch(fakeSupabase({ search_interest: [] }) as never, "issues"), null);

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 3: Run** it. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/search-interest.functions.ts`:

```ts
// The week's issues from a campaign's own records, and its latest reads of
// search interest. Read with the signed-in person's client, where row level
// security keeps each campaign to its own, or by the server for one campaign.

import { searchFromRow, type SearchRead } from "@/lib/search-interest";
import type { MindInputs } from "@/lib/top-of-mind";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

/** One campaign's rows with its id; the signed-in person's own without. */
const ownCampaign =
  (campaignId: string | null) =>
  <T>(q: T): T =>
    campaignId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campaign_id", campaignId) : q;

/** What was raised since `since`: in the news (rivals' own posts aside), in messages, at the door. */
export async function loadMindInputs(
  sb: Client,
  campaignId: string | null,
  since: string,
): Promise<Omit<MindInputs, "searches">> {
  const own = ownCampaign(campaignId);
  const [news, messages, door] = await Promise.all([
    own(
      sb
        .from("listening_mentions")
        .select("issue, title, url")
        .is("rival_id", null)
        .gte("found_at", since),
    )
      .order("found_at", { ascending: false })
      .limit(2000),
    own(sb.from("conversations").select("issue").not("issue", "is", null).gte("last_message_at", since)).limit(
      2000,
    ),
    own(sb.from("person_events").select("detail").eq("kind", "door_spoke").gte("created_at", since)).limit(5000),
  ]);
  return {
    news: (news.data ?? []) as MindInputs["news"],
    messages: ((messages.data ?? []) as { issue: string | null }[]).map((r) => r.issue),
    door: ((door.data ?? []) as { detail: string | null }[]).map((r) => r.detail),
  };
}

/** The newest read of `kind`, or null. */
export async function loadSearch(
  sb: Client,
  kind: "candidates" | "issues",
  campaignId: string | null = null,
): Promise<SearchRead | null> {
  const { data } = await ownCampaign(campaignId)(
    sb.from("search_interest").select("day, kind, geo, series, created_at").eq("kind", kind),
  )
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? searchFromRow(data) : null;
}
```

- [ ] **Step 5: Run** it. Expected: all pass. Typecheck; lint the new files (`--fix`).
- [ ] **Step 6: Commit** `Reading the week's issues and the latest search interest`.

---

### Task 7: The daily search-interest step

**Files:**
- Create: `src/lib/search-interest.server.ts`
- Modify: `src/routes/api/public/listening/scan.ts`
- Test: `tests/search-interest-step.test.ts`

**Interfaces:** Consumes Tasks 3–6. Produces `type SearchRun = { ran; reads; searches; notes }`
and `runSearchInterest(sb, { now?, force? }): Promise<SearchRun>`.

- [ ] **Step 1: Write the failing tests** in `tests/search-interest-step.test.ts`:

```ts
// Checks for the daily read of search interest: once a morning, each
// campaign's candidates searched as people search them and its week's top
// issues, Nairobi first and Kenya when Nairobi's answer is thin, within the
// day's budget. Stand-ins for the database and SerpApi; nothing leaves this
// process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest-step.test.ts

import { runSearchInterest } from "@/lib/search-interest.server";

import { fakeSupabase } from "./fake-supabase";

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

const at = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00+03:00`);
const ts = (day: string) => String(Date.parse(`${day}T00:00:00Z`) / 1000);

/** A month of SerpApi's answer for `terms`, every day at `value`. */
const answer = (terms: string[], value: number) => ({
  interest_over_time: {
    timeline_data: Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.parse("2026-08-31T00:00:00Z") + i * 864e5).toISOString().slice(0, 10);
      return { timestamp: ts(day), values: terms.map((t) => ({ query: t, extracted_value: value })) };
    }),
  },
});

function stubSerp(route: (q: string, geo: string) => unknown) {
  const asked: [string, string][] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const u = new URL(String(url));
    const q = u.searchParams.get("q") ?? "";
    const geo = u.searchParams.get("geo") ?? "";
    asked.push([q, geo]);
    return new Response(JSON.stringify(route(q, geo)), { status: 200 });
  }) as typeof fetch;
  return asked;
}

function world(now: Date, cap = 8) {
  let used = 0;
  const yesterday = new Date(now.getTime() - 864e5).toISOString();
  const story = (id: string, issue: string) => ({
    id,
    campaign_id: "c2",
    issue,
    title: id,
    url: `https://n.test/${id}`,
    found_at: yesterday,
    rival_id: null,
  });
  return fakeSupabase(
    {
      campaigns: [
        { id: "c2", name: "Sakaja 2027" },
        { id: "c3", name: "Waruru Gikandi" },
      ],
      race_rivals: [
        { id: "b", campaign_id: "c2", name: "Babu Owino", search_as: null, is_us: false, sort: 1 },
        { id: "s", campaign_id: "c2", name: "Johnson Sakaja", search_as: "Sakaja", is_us: true, sort: 0 },
      ],
      listening_mentions: [
        ...["w1", "w2", "w3", "w4", "w5"].map((id) => story(id, "water")),
        story("f1", "floods"),
      ],
      conversations: [],
      person_events: [],
      search_interest: [],
      listening_jobs: [],
    },
    {
      take_social_credits: (a) => {
        const n = Number(a["_n"]);
        if (used + n > cap) return false;
        used += n;
        return true;
      },
    },
  );
}
const reads = (sb: ReturnType<typeof world>) => sb.tables["search_interest"] ?? [];
const detail = (sb: ReturnType<typeof world>) => String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");

async function main() {
  process.env["SERPAPI_API_KEY"] = "test-key";

  {
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(world(at("05:59")) as never, { now: at("05:59") });
    eq("before 06:00 nothing is asked", [r.ran, asked.length], [false, 0]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    // Nairobi's answer for the candidates is all zeros, so Kenya's is used.
    const asked = stubSerp((q, geo) =>
      answer(q.split(","), q.startsWith("Sakaja") && geo === "KE-110" ? 0 : 30),
    );
    const r = await runSearchInterest(sb as never, { now });
    eq(
      "ours first, searched as people search, from Nairobi then Kenya; then the week's issues",
      asked,
      [
        ["Sakaja,Babu Owino", "KE-110"],
        ["Sakaja,Babu Owino", "KE"],
        ["water shortage,floods", "KE-110"],
      ],
    );
    const cand = reads(sb).find((x) => x["kind"] === "candidates");
    eq(
      "kept from Kenya, each line tied to its candidate",
      [cand?.["geo"], (cand?.["series"] as { ref: string }[]).map((t) => t.ref)],
      ["KE", ["s", "b"]],
    );
    const issues = reads(sb).find((x) => x["kind"] === "issues");
    eq(
      "the week's issues, from Nairobi",
      [issues?.["geo"], (issues?.["series"] as { term: string; ref: string }[]).map((t) => [t.term, t.ref])],
      [
        "KE-110",
        [
          ["water shortage", "water"],
          ["floods", "floods"],
        ],
      ],
    );
    eq("a campaign with no race and no issues asks nothing", r.searches, 3);
    eq("the shared note names no one", [detail(sb), /Sakaja|Babu|water/i.test(detail(sb))], [
      "Read 2 sets of search interest.",
      false,
    ]);
    eq("once a morning", (await runSearchInterest(sb as never, { now: at("07:05") })).ran, false);
  }
  {
    const now = at("06:05");
    const sb = world(now, 1);
    const asked = stubSerp((q, geo) => answer(q.split(","), geo === "KE-110" ? 0 : 30));
    await runSearchInterest(sb as never, { now });
    eq("the day's limit stops it", asked.length, 1);
    eq("and it says so", detail(sb).includes("limit"), true);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubSerp((q, geo) => (geo === "KE-110" ? { error: "Unsupported geo." } : answer(q.split(","), 20)));
    await runSearchInterest(sb as never, { now });
    eq("an error for Nairobi falls back to Kenya", reads(sb).map((x) => x["geo"]), ["KE", "KE"]);
  }
  {
    delete process.env["SERPAPI_API_KEY"];
    const now = at("06:05");
    const sb = world(now);
    const asked = stubSerp((q) => answer(q.split(","), 30));
    const r = await runSearchInterest(sb as never, { now });
    eq("no key: nothing asked", [r.ran, asked.length], [true, 0]);
    eq("and Home is told", detail(sb).includes("not connected"), true);
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/search-interest.server.ts`:

```ts
// Search interest, read once a day for each campaign through SerpApi (server
// only): its candidates, searched as people search them, and the week's top
// issues from its own records. It rides on the hourly call with its own clock:
// its first run at or after 06:00 Nairobi time. Nairobi first; all of Kenya
// when Nairobi's answer is missing or thin. Every search comes out of the day's
// "trends" budget. The shared job row says what happened in counts only.

import { nairobiToday } from "@/lib/demo/insights";
import { ISSUE_SEARCH, isThin, parseTrends, searchName, type Geo } from "@/lib/search-interest";
import { loadMindInputs } from "@/lib/search-interest.functions";
import { serpConfigured, trendsAnswer } from "@/lib/serpapi.server";
import { takeCredits } from "@/lib/social-credits";
import { topOfMind } from "@/lib/top-of-mind";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Rival = { id: string; name: string; search_as: string | null; is_us: boolean; sort: number };
type Term = { term: string; ref: string };

const JOB_KEY = "search_interest";
const sixOn = (day: string) => Date.parse(`${day}T06:00:00+03:00`);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type SearchRun = {
  ran: boolean;
  /** Reads kept. */
  reads: number;
  /** Searches asked of SerpApi. */
  searches: number;
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

export async function runSearchInterest(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<SearchRun> {
  const now = opts.now ?? new Date();
  const day = nairobiToday(now);
  const out: SearchRun = { ran: false, reads: 0, searches: 0, notes: [] };
  if (!opts.force && now.getTime() < sixOn(day)) return out;
  const { data: job } = await sb.from("listening_jobs").select("*").eq("key", JOB_KEY).maybeSingle();
  if (!opts.force && job?.last_run_at && Date.parse(job.last_run_at) >= sixOn(day)) return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;

  // Every campaign's team can read the job row: shared notes and counts only.
  const shared: string[] = [];
  let failed = 0;
  const finish = async () => {
    const detail =
      [
        ...shared,
        failed ? `${count(failed, "read", "reads")} could not be made.` : null,
        out.reads ? `Read ${count(out.reads, "set", "sets")} of search interest.` : null,
      ]
        .filter((p): p is string => p !== null)
        .join(" · ") || null;
    await sb.from("listening_jobs").upsert(
      {
        key: JOB_KEY,
        status: "idle",
        locked_until: null,
        last_run_at: now.toISOString(),
        detail,
        updated_at: now.toISOString(),
      },
      { onConflict: "key" },
    );
    return out;
  };

  if (!serpConfigured()) {
    shared.push("SerpApi is not connected, so search interest is not being read.");
    return finish();
  }
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  let stop = false;
  const spend = async () => {
    if (stop) return false;
    if (!(await takeCredits(sb, "trends", 1))) {
      stop = true;
      shared.push("Stopped at today's SerpApi limit.");
      return false;
    }
    out.searches++;
    return true;
  };
  /** One search; undefined when the budget is spent, null when SerpApi had no answer. */
  const ask = async (terms: string[], geo: Geo) => {
    if (!(await spend())) return undefined;
    try {
      return parseTrends(await trendsAnswer(terms, geo), terms);
    } catch (err) {
      out.notes.push(`${geo}: ${(err as Error).message}`);
      return null;
    }
  };
  /** Nairobi first; Kenya when Nairobi's answer is missing or thin. */
  const read = async (campaignId: string, kind: "candidates" | "issues", terms: Term[]) => {
    const names = terms.map((t) => t.term);
    let geo: Geo = "KE-110";
    let series = await ask(names, geo);
    if (series === undefined) return;
    if (!series || isThin(series)) {
      const kenya = await ask(names, "KE");
      if (kenya) {
        geo = "KE";
        series = kenya;
      }
    }
    if (!series) {
      failed++;
      return;
    }
    const { error } = await sb.from("search_interest").upsert(
      {
        campaign_id: campaignId,
        day,
        kind,
        geo,
        series: series.map((s, i) => ({ ...s, ref: terms[i]?.ref ?? null })),
      },
      { onConflict: "campaign_id,day,kind" },
    );
    if (error) {
      failed++;
      out.notes.push(`${campaignId} ${kind}: ${error.message}`);
    } else out.reads++;
  };

  const since = new Date(now.getTime() - 7 * 864e5).toISOString();
  const { data: campaigns } = await sb.from("campaigns").select("id");
  for (const c of (campaigns ?? []) as { id: string }[]) {
    if (stop) break;
    const { data: rivals } = await sb
      .from("race_rivals")
      .select("id, name, search_as, is_us, sort")
      .eq("campaign_id", c.id);
    const people = ((rivals ?? []) as Rival[])
      .sort((a, b) => Number(b.is_us) - Number(a.is_us) || a.sort - b.sort)
      .slice(0, 5)
      .map((r) => ({ term: searchName({ name: r.name, searchAs: r.search_as }), ref: r.id }));
    if (people.length) await read(c.id, "candidates", people);

    const mind = topOfMind({ ...(await loadMindInputs(sb, c.id, since)), searches: [] }, 10);
    const issues = mind.lines
      .flatMap((l) => (ISSUE_SEARCH[l.key] ? [{ term: ISSUE_SEARCH[l.key]!, ref: l.key }] : []))
      .slice(0, 5);
    if (issues.length) await read(c.id, "issues", issues);
  }
  return finish();
}
```

- [ ] **Step 4: Ride on the hourly call.** In `src/routes/api/public/listening/scan.ts`, import
      `runSearchInterest` from `@/lib/search-interest.server`, and after the morning story:

```ts
        // And once a morning, each campaign's search interest.
        const search = await runSearchInterest(sb as never).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        return Response.json({ ...result, rivals, story, search });
```

  (replacing `return Response.json({ ...result, rivals, story });`).

- [ ] **Step 5: Run** the step tests, then `npm test`. Expected: all pass. Typecheck; lint the
      new file (`--fix`); `scan.ts` must not gain errors.
- [ ] **Step 6: Commit** `Each morning, each campaign's search interest: its candidates and its week's issues`.

---
### Task 8: Home: top of mind this week

**Files:**
- Create: `src/components/gw/home/TopOfMind.tsx`
- Modify: `src/lib/home.ts`, `src/lib/home.functions.ts`, `src/components/gw/home/RaceReal.tsx`,
  `src/components/gw/home/RaceSection.tsx`, `src/components/gw/home/Home.tsx`,
  `src/styles/groundwork.css`
- Test: `tests/home.test.ts`

**Interfaces:** Consumes Task 3 (`topOfMind`, `TopOfMind`, `MindLine`, `pct`, `sourcesOf`,
`mindBasis`, `MIND_SOURCES`, `SOURCE_NAMES`) and Task 6 (`loadMindInputs`). Produces
`RealSignals.mind: MindLine | null` (in place of `topIssue`), `mindItem(line): TodayItem`,
`HomeData.mind: TopOfMind`, `TopOfMindCard({ mind })`. Removes `topIssue`, `issueBoard`,
`IssueRow`, `IssueLine`, `RaceView.issues` and `SayingCard`: the card that counted 30 days of
Listening alone is replaced by top of mind.

- [ ] **Step 1: Write the failing tests.** In `tests/home.test.ts`:
  - imports: drop `issueBoard` and `topIssue`; add `mindItem`.
  - add, near the top:

```ts
const MIND_LINE = {
  key: "floods",
  label: "Floods",
  score: 0.31,
  shares: { news: 0.4, messages: 0.22, door: null, searches: null },
  examples: [],
};
```

  - in the first Today block, `realToday({ pendingExpenses: 2, unread: 1, mind: MIND_LINE })`,
    and the third item's expectation becomes:

```ts
    [
      "Floods is top of mind this week",
      "31% of what was raised across news and social and messages to us.",
      { kind: "issue", label: "See what's said", issue: "floods" },
    ],
```

  - every other `topIssue: null` becomes `mind: null`, and `topIssue: { label: "Water", … }`
    becomes `mind: { ...MIND_LINE, key: "water", label: "Water" }`;
  - delete the `topIssue(...)` and `issueBoard(...)` checks;
  - in the first loading block, replace the loudest-issue check with
    `eq("too little this week to name a top issue", h.signals.mind, null);`;
  - in the race loading block, replace the two checks of `h.signals.topIssue` and
    `h.race.issues` with
    `eq("rivals' own posts are not counted as what people raise", h.mind.sizes.news, 3);`;
  - add a loading block:

```ts
  {
    const h = await loadHome(
      db({
        listening_mentions: Array.from({ length: 6 }, (_, i) => ({
          id: `w${i}`,
          issue: i < 4 ? "water" : "floods",
          sentiment: null,
          title: `Story ${i}`,
          url: `https://n.test/${i}`,
          found_at: daysAgo(1),
        })),
        conversations: [
          ...Array.from({ length: 3 }, (_, i) => ({ id: `cw${i}`, issue: "water", last_message_at: daysAgo(1), unread: false })),
          ...Array.from({ length: 2 }, (_, i) => ({ id: `cg${i}`, issue: "garbage", last_message_at: daysAgo(1), unread: false })),
        ],
        person_events: Array.from({ length: 5 }, (_, i) => ({
          id: `e${i}`,
          kind: "door_spoke",
          detail: "Water",
          created_at: daysAgo(2),
        })),
      }) as never,
      ME,
      "manager",
    );
    eq(
      "the week's top of mind, across news, messages and the door",
      h.mind.lines.map((l) => l.key),
      ["water", "garbage", "floods"],
    );
    eq("and it is on Today", h.signals.mind?.key, "water");
  }
```

  and a pure check:

```ts
eq("the week's top issue on Today", mindItem(MIND_LINE).title, "Floods is top of mind this week");
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/home.test.ts`. Expected: FAIL
      (`mindItem` is not exported).

- [ ] **Step 3: Implement.** In `src/lib/home.ts`: import `pct`, `sourcesOf` and `type MindLine`
      from `@/lib/top-of-mind`; in `RealSignals` replace `topIssue` with

```ts
  /** The week's top issue across news and social, messages, the door and searches. */
  mind: MindLine | null;
```

  in `realToday` replace the `if (sig.topIssue) { … }` block with
  `if (sig.mind) items.push(mindItem(sig.mind));`, and add:

```ts
/** The week's top issue as a Today item. */
export function mindItem(l: MindLine): TodayItem {
  return {
    title: `${l.label} is top of mind this week`,
    detail: `${pct(l.score)} of what was raised across ${sourcesOf(l)}.`,
    action: { kind: "issue", label: "See what's said", issue: l.key },
    sample: false,
  };
}
```

  Delete `IssueRow`, `IssueLine`, `NOT_ISSUES`, `labelOf`, `topIssue` and `issueBoard`, and
  `issues` from `RaceView`. In `src/lib/home.functions.ts`: drop those imports; import
  `loadMindInputs` from `@/lib/search-interest.functions` and `topOfMind`, `type TopOfMind` from
  `@/lib/top-of-mind`; add to `HomeData`

```ts
  /** The week's top issues across news and social, messages, the door and searches. */
  mind: TopOfMind;
```

  replace the 30-day `listening_mentions` query in the `Promise.all` (and its `mentions` name)
  with `loadMindInputs(sb as never, null, since7).catch(() => ({ news: [], messages: [], door: [] }))`
  named `mindIn`; replace `const rows = …` with `const mind = topOfMind({ ...mindIn, searches: [] });`;
  set `mind: mind.lines[0] ?? null` in `signals` (in place of `topIssue`); make `race`
  `{ rivals, polls, posts }`; and return `mind`.

- [ ] **Step 4: Show it.** Create `src/components/gw/home/TopOfMind.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { MIND_SOURCES, mindBasis, pct, SOURCE_NAMES, type TopOfMind } from "@/lib/top-of-mind";

const isWeb = (u: string | null): u is string => Boolean(u && /^https?:\/\//i.test(u));

/** The week's top issues, each with what every source made of it. */
export function TopOfMindCard({ mind }: { mind: TopOfMind }) {
  return (
    <section className="card home-mind" aria-labelledby="home-mind-h">
      <div className="card-head">
        <div>
          <h2 id="home-mind-h">Top of mind this week</h2>
          <p className="meta">{mindBasis(mind)}</p>
        </div>
      </div>
      {mind.lines.length ? (
        <ol className="home-mind-list">
          {mind.lines.map((l) => (
            <li key={l.key}>
              <div className="home-mind-head">
                <Link to="/listening" search={{ issue: l.key }}>
                  <b>{l.label}</b>
                </Link>
                <span className="home-mind-score">{pct(l.score)}</span>
              </div>
              <dl className="home-mind-bars">
                {MIND_SOURCES.map((s) => {
                  const share = l.shares[s];
                  return (
                    <div key={s}>
                      <dt>{SOURCE_NAMES[s]}</dt>
                      <dd>
                        {share === null ? (
                          <span className="dim">no data</span>
                        ) : (
                          <>
                            <span className="home-mind-bar" aria-hidden="true">
                              <i style={{ width: pct(share) }} />
                            </span>
                            {pct(share)}
                          </>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {l.examples.map((e) => (
                <p key={e.text} className="home-issue-line">
                  {isWeb(e.url) ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer">
                      {e.text}
                    </a>
                  ) : (
                    e.text
                  )}
                </p>
              ))}
            </li>
          ))}
        </ol>
      ) : (
        <p className="meta">Listening, the inbox and the field app fill this in as the week goes.</p>
      )}
    </section>
  );
}
```

  In `RaceReal.tsx`: take `mind: TopOfMind`, replace `<SayingCard issues={race.issues} />` with
  `<TopOfMindCard mind={mind} />`, and delete `SayingCard` (and imports only it used). In
  `RaceSection.tsx`: take `mind: TopOfMind` and pass it to `RaceReal`. In `Home.tsx`: pass
  `mind={d.mind}`; `NOTHING_YET` gets `signals: { pendingExpenses: 0, unread: 0, mind: null }`,
  `race: { rivals: [], polls: [], posts: [] }` and
  `mind: { lines: [], sizes: { news: 0, messages: 0, door: 0, searches: 0 } }`. Append to
  `src/styles/groundwork.css`:

```css
/* Top of mind: each issue with a bar for each source's share. */
.home-mind-list { list-style:none; margin:0; padding:0; }
.home-mind-list > li { padding:12px 0; border-top:1px solid var(--border); }
.home-mind-list > li:first-child { border-top:0; padding-top:0; }
.home-mind-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
.home-mind-score { font-family:var(--font-mono); font-size:12.5px; font-variant-numeric:tabular-nums; }
.home-mind-bars { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px 14px; margin:8px 0 4px; }
.home-mind-bars > div { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:11.5px; color:var(--muted-foreground); }
.home-mind-bars dd { margin:0; display:flex; align-items:center; gap:6px; font-variant-numeric:tabular-nums; }
.home-mind-bar { display:inline-block; width:56px; height:6px; border-radius:3px; background:var(--muted); overflow:hidden; }
.home-mind-bar i { display:block; height:100%; border-radius:3px; background:var(--foreground); opacity:.7; }
```

- [ ] **Step 5: Run** all tests, typecheck, build. Lint changed files (counts must not rise).
- [ ] **Step 6: Commit** `Home ranks the week's issues across news, messages, the door and searches`.

---

### Task 9: Home: search interest

**Files:**
- Create: `src/components/gw/home/SearchChart.tsx`, `src/components/gw/home/SearchCard.tsx`
- Modify: `src/lib/search-interest.ts` (`monthAverages`), `src/lib/home.functions.ts`,
  `src/components/gw/home/RaceReal.tsx`, `src/components/gw/home/RaceSection.tsx`,
  `src/components/gw/home/Home.tsx`
- Test: `tests/search-interest.test.ts`, `tests/home.test.ts`

**Interfaces:** Consumes Task 4 (`searchChart`, `searchSummary`, `searchSpike`,
`issueAverages`, `PLACE_NAMES`, `SearchRead`, `SearchChartModel`) and Task 6 (`loadSearch`).
Produces `monthAverages(read, rivals): { name: string; average: number }[]`,
`HomeData.search: SearchRead | null`, `SearchCard({ read, rivals })`, `SearchChart({ model })`.

- [ ] **Step 1: Write the failing tests.** In `tests/search-interest.test.ts` import
      `monthAverages` and add:

```ts
eq("each candidate's month, for the table under the chart", monthAverages(READ, R), [
  { name: "Johnson Sakaja", average: 18 },
  { name: "Babu Owino", average: 17 },
  { name: "Agnes Kagure", average: 8 },
]);
```

  In `tests/home.test.ts`, a loading block:

```ts
  {
    const today = nairobiToday();
    const points = (before: number, week: number) =>
      Array.from({ length: 28 }, (_, i) => ({ day: addDays(today, i - 27), value: i >= 21 ? week : before }));
    const h = await loadHome(
      db({
        race_rivals: [
          { id: "s", name: "Johnson Sakaja", party: null, office: null, is_us: true, tone: "us", sort: 0, facebook: null, x: null, tiktok: null, search_as: "Sakaja" },
          { id: "b", name: "Babu Owino", party: null, office: null, is_us: false, tone: "a", sort: 1, facebook: null, x: null, tiktok: null, search_as: null },
        ],
        search_interest: [
          {
            id: "c",
            campaign_id: "c2",
            day: today,
            kind: "candidates",
            geo: "KE-110",
            created_at: `${today}T03:05:00Z`,
            series: [
              { term: "Sakaja", ref: "s", points: points(10, 10) },
              { term: "Babu Owino", ref: "b", points: points(12, 30) },
            ],
          },
          {
            id: "i",
            campaign_id: "c2",
            day: today,
            kind: "issues",
            geo: "KE",
            created_at: `${today}T03:05:00Z`,
            series: [{ term: "water shortage", ref: "water", points: points(5, 40) }],
          },
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq("the latest read of search interest", [h.search?.geo, h.search?.series.length], ["KE-110", 2]);
    eq(
      "a rival searched twice as much is the rival's move, with no post or poll to beat it",
      h.signals.rivalMove?.title,
      "Searches for Babu Owino doubled this week",
    );
    eq("the week's issue searches count toward top of mind", h.mind.sizes.searches, 1);
  }
```

- [ ] **Step 2: Run** both. Expected: FAIL (`monthAverages` not exported; `h.search` undefined).

- [ ] **Step 3: Implement.** In `src/lib/search-interest.ts`:

```ts
/** Each candidate's average over the read, most searched first, for the table under the chart. */
export function monthAverages(
  read: SearchRead | null,
  rivals: RaceRival[],
): { name: string; average: number }[] {
  if (!read || read.kind !== "candidates") return [];
  return read.series
    .map((t) => ({
      name: rivals.find((r) => r.id === t.ref)?.name ?? t.term,
      average: Math.round(mean(t.points.map((p) => p.value))),
    }))
    .sort((a, b) => b.average - a.average);
}
```

  In `src/lib/home.functions.ts`: import `loadSearch` (beside `loadMindInputs`) and
  `issueAverages`, `searchSpike`, `type SearchRead` from `@/lib/search-interest`; add to
  `HomeData`

```ts
  /** The newest read of how much each candidate is searched for, or null. */
  search: SearchRead | null;
```

  add `loadSearch(sb as never, "candidates").catch(() => null)` and
  `loadSearch(sb as never, "issues").catch(() => null)` to the `Promise.all` (as `search` and
  `issueSearch`); make `mind` `topOfMind({ ...mindIn, searches: issueAverages(issueSearch, todayIso) })`;
  make the rival move
  `postSpike(rivals, posts, new Date()) ?? rivalMove(rivals, polls, todayIso) ?? searchSpike(search, rivals, todayIso)`;
  and return `search`.

- [ ] **Step 4: Show it.** Create `src/components/gw/home/SearchChart.tsx`:

```tsx
import { useState } from "react";

import { toneVar } from "@/components/gw/demo/tone";
import { dayName } from "@/lib/diary";
import { labelTicks } from "@/lib/race-data";
import type { SearchChartModel } from "@/lib/search-interest";

const W = 600;
const H = 220;
const M = { l: 30, r: 132, t: 12, b: 26 };

/** "5 Oct". */
const shortDay = (d: string) => dayName(d).split(" ").slice(1).join(" ");

/**
 * Thirty days of search interest, a line per candidate, 100 being the busiest
 * day of any of them. Hover a day for every candidate's figure.
 */
export function SearchChart({ model }: { model: SearchChartModel }) {
  const [at, setAt] = useState<number | null>(null);
  const { days, series } = model;
  const last = days.length - 1;
  const plotW = W - M.l - M.r;
  const x = (i: number) => M.l + (last > 0 ? i / last : 0.5) * plotW;
  const y = (v: number) => M.t + (1 - v / 100) * (H - M.t - M.b);
  // Day labels under the chart: the latest always, none crowding the next.
  const ticks = labelTicks(days.map((_, i) => x(i)), 72);

  // Direct labels at the latest day, pushed apart when close.
  const ends = series
    .filter((s) => s.values[last] !== null && s.values[last] !== undefined)
    .map((s) => ({ s, v: s.values[last]!, ly: y(s.values[last]!) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.ly - ends[i - 1]!.ly < 15) ends[i]!.ly = ends[i - 1]!.ly + 15;
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))));
  };

  return (
    <div className="trend">
      <ul className="trend-legend" aria-label="Candidates">
        {series.map((s) => (
          <li key={s.key}>
            <i style={{ background: toneVar(s.tone) }} />
            {s.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Search interest, ${dayName(days[0]!)} to ${dayName(days[last]!)}`}
      >
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line className="trend-grid" x1={M.l} x2={W - M.r} y1={y(g)} y2={y(g)} />
            <text className="trend-axis" x={M.l - 8} y={y(g) + 4} textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text
            key={i}
            className="trend-axis"
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
          >
            {shortDay(days[i]!)}
          </text>
        ))}
        {series.map((s) => {
          const pts = s.values.flatMap((v, i) => (v === null ? [] : [`${x(i)},${y(v)}`]));
          return pts.length > 1 ? (
            <polyline
              key={s.key}
              className="trend-line"
              style={{ stroke: toneVar(s.tone) }}
              points={pts.join(" ")}
            />
          ) : null;
        })}
        {ends.map(({ s, v, ly }) => (
          <g key={s.key}>
            <circle className="trend-dot" cx={x(last)} cy={y(v)} r={4} style={{ fill: toneVar(s.tone) }} />
            <text className="trend-end" x={x(last) + 10} y={ly + 4}>
              <tspan className="trend-end-v">{v}</tspan> {s.label}
            </text>
          </g>
        ))}
        {at !== null && <line className="trend-cross" x1={x(at)} x2={x(at)} y1={M.t} y2={H - M.b} />}
        <rect
          x={M.l}
          y={M.t}
          width={plotW}
          height={H - M.t - M.b}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setAt(null)}
        />
      </svg>
      {at !== null && (
        <div
          className="trend-tip"
          style={{ left: `${(x(at) / W) * 100}%` }}
          role="status"
          aria-live="polite"
        >
          <b>{dayName(days[at]!)}</b>
          {series.map((s) =>
            s.values[at] === null ? null : (
              <span key={s.key}>
                <i style={{ background: toneVar(s.tone) }} />
                {s.label} <b>{s.values[at]}</b>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
```

  and `src/components/gw/home/SearchCard.tsx`:

```tsx
import { useMemo } from "react";

import { SearchChart } from "@/components/gw/home/SearchChart";
import { dayName } from "@/lib/diary";
import type { RaceRival } from "@/lib/race-data";
import {
  monthAverages,
  PLACE_NAMES,
  searchChart,
  searchSummary,
  type SearchRead,
} from "@/lib/search-interest";

/** How much each candidate is searched for on Google: thirty days, read each morning. */
export function SearchCard({ read, rivals }: { read: SearchRead | null; rivals: RaceRival[] }) {
  const model = useMemo(() => searchChart(read, rivals), [read, rivals]);
  const averages = monthAverages(read, rivals);
  return (
    <section className="card home-search" aria-labelledby="home-search-h">
      <div className="card-head">
        <div>
          <h2 id="home-search-h">Search interest, last 30 days</h2>
          <p className="meta">
            {!read
              ? "Read each morning from Google Trends once SerpApi is connected."
              : searchSummary(read, rivals) || "Too few searches to compare yet."}
          </p>
        </div>
      </div>
      {read && model ? (
        <>
          <SearchChart model={model} />
          <p className="home-search-avg">
            This month&apos;s average:{" "}
            {averages.map((a, i) => (
              <span key={a.name}>
                {i ? " · " : ""}
                {a.name} <b>{a.average}</b>
              </span>
            ))}
          </p>
          <p className="mb-source">
            Searched as {read.series.map((t) => t.term).join(", ")} · {PLACE_NAMES[read.geo]} · 100 is
            the busiest day of any of them · Google Trends via SerpApi, read {dayName(read.day)}.
          </p>
        </>
      ) : null}
    </section>
  );
}
```

  In `RaceReal.tsx`: take `search: SearchRead | null` and render
  `<SearchCard read={search} rivals={race.rivals} />` right after `PollsCard`. `RaceSection`
  takes `search` and passes it on; `Home.tsx` passes `search={d.search}` and `NOTHING_YET`
  gets `search: null`. Append to `src/styles/groundwork.css`:

```css
/* Search interest: each candidate's month, under the chart. */
.home-search-avg { font-size:12.5px; color:var(--muted-foreground); margin-top:8px; }
.home-search-avg b { color:var(--foreground); font-variant-numeric:tabular-nums; }
```

- [ ] **Step 5: Run** all tests, typecheck, build. Lint changed files.
- [ ] **Step 6: Commit** `Home shows how much each candidate is searched for, and a rival searched far more`.

---
### Task 10: No samples on Home, and "Listen" reads the real Home

**Files:**
- Create: `src/lib/home-spoken.ts`
- Modify: `src/lib/home.ts`, `src/components/gw/home/Home.tsx`, `HomeHeader.tsx`,
  `TodaySection.tsx`, `SectionHead.tsx`, `RaceSection.tsx`, `RaceReal.tsx` (export
  `OfficialResult`), `CampaignSection.tsx`, `src/styles/groundwork.css`
- Test: `tests/home-spoken.test.ts`, `tests/home.test.ts`

**Interfaces:** Consumes the story (`StoryView`), the diary (`DiaryEntry`), top of mind
(`MindLine`, `pct`, `sourcesOf`). Produces `spokenHome({ name, today, verdict, items, story, plan, mind }): string`;
`SectionMode = "real" | "empty"`; `TodayItem` loses `sample`; `todayItems(real, max = 3)`;
`SectionHead({ id, title })`; `HomeHeader` takes `script` in place of `raceMode` and `items`;
`CampaignSection({ mode })`. Removes `raceVerdict` and `SampleTag`. `spokenBriefing` stays in
the demo module with its own tests; Home no longer uses it.

- [ ] **Step 1: Write the failing tests** in `tests/home-spoken.test.ts`:

```ts
// Checks for Home read out for the car: what Home shows, and nothing invented.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/home-spoken.test.ts

import { spokenHome } from "@/lib/home-spoken";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}`);
  }
}

const text = spokenHome({
  name: "Njeri",
  today: "2026-10-01",
  verdict: "Third, behind Babu Owino and Agnes Kagure.",
  items: [
    {
      title: "2 expenses to approve",
      detail: "Approval needs the supporting document on file.",
      action: { kind: "go", label: "Open Finance", to: "/finance" },
    },
  ],
  story: {
    day: "2026-10-01",
    writtenBy: "groundwork",
    at: "2026-10-01T03:04:00Z",
    editedBy: null,
    story: {
      kind: "written",
      headline: "Rationing hits Eastlands",
      summary: "Water rationing now covers 14 wards.",
      why: null,
      rivals: null,
      line: "Tankers to every ward this week.",
      figures: [],
      sources: [],
      also: [],
      picks: [],
      from: 3,
    },
  },
  plan: [
    { id: "d1", day: "2026-10-01", startsAt: "10:30", title: "Kayole water point", kind: "visit", wardId: null, wardName: null, note: "Bowsers at noon." },
    { id: "d2", day: "2026-10-01", startsAt: null, title: "Sunday service", kind: "church", wardId: null, wardName: null, note: null },
  ],
  mind: {
    key: "water",
    label: "Water",
    score: 0.7,
    shares: { news: 0.75, messages: 0.6, door: null, searches: 0.75 },
    examples: [],
  },
});
ok("it greets the person signed in", text.startsWith("Good morning, Njeri. It's Thursday 1 October, and"));
ok("where the race stands", text.includes("Where you stand: Third, behind Babu Owino and Agnes Kagure."));
ok(
  "today's list",
  text.includes("One thing today. First: 2 expenses to approve. Approval needs the supporting document on file."),
);
ok(
  "the morning's real story",
  text.includes(
    "The story this morning: Rationing hits Eastlands. Water rationing now covers 14 wards. A line you could use: Tankers to every ward this week.",
  ),
);
ok(
  "top of mind",
  text.includes(
    "Top of mind this week: water, 70% of what was raised across news and social, messages to us and searches.",
  ),
);
ok(
  "where to be",
  text.includes("Where to be today. At 10:30, Kayole water point. Bowsers at noon. All day, Sunday service."),
);
ok("nothing invented", !/sample|invented|Challenger/i.test(text));
const quiet = spokenHome({
  name: "Njeri",
  today: "2026-10-01",
  verdict: "",
  items: [],
  story: null,
  plan: [],
  mind: null,
});
ok(
  "a quiet morning says only what there is",
  quiet.replace(/It's .* election\./, "It's …") ===
    "Good morning, Njeri. It's … That's your briefing. Have a good day.",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

  and in `tests/home.test.ts`: "no data: both sample" becomes
  `eq("no data: both empty", sectionModes({ realPeople: 0, rivals: 0, polls: 0 }), { race: "empty", campaign: "empty" });`;
  delete the `raceVerdict` checks and the checks of samples in Today ("real items are not
  samples", "then samples, marked", "all sample when nothing is real"); `todayItems(real, sample)`
  calls become `todayItems(real)`; drop `sample: false` from expected Today items; and add:

```ts
{
  const four = [1, 2, 3, 4].map((n) => ({
    title: `Item ${n}`,
    detail: "",
    action: { kind: "go" as const, label: "Open", to: "/inbox" as const },
  }));
  eq("Today: at most three, all real", todayItems(four).map((i) => i.title), ["Item 1", "Item 2", "Item 3"]);
}
```

- [ ] **Step 2: Run** both. Expected: FAIL (module not found; `sectionModes` says "sample").

- [ ] **Step 3: Implement** `src/lib/home-spoken.ts`:

```ts
// Home read out for the car: about three minutes, written for the ear, and
// only what Home shows. Nothing invented.

import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";
import type { StoryView } from "@/lib/morning-story";
import { pct, sourcesOf, type MindLine } from "@/lib/top-of-mind";

const COUNT = ["", "One thing", "Two things", "Three things"];
const ORDINAL = ["First", "Second", "Third"];

const spokenDate = (iso: string): string =>
  new Date(`${iso}T09:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });

export function spokenHome(o: {
  name: string;
  today: string;
  verdict: string;
  items: TodayItem[];
  story: StoryView | null;
  plan: DiaryEntry[];
  mind: MindLine | null;
}): string {
  const out = [
    `Good morning, ${o.name}. It's ${spokenDate(o.today)}, and ${daysBetween(o.today, ELECTION_DAY)} days to the election.`,
  ];
  if (o.verdict) out.push(`Where you stand: ${o.verdict}`);
  if (o.items.length) out.push(`${COUNT[o.items.length] ?? `${o.items.length} things`} today.`);
  o.items.forEach((t, i) => out.push(`${ORDINAL[i] ?? "Next"}: ${t.title}. ${t.detail}`));
  const st = o.story?.story;
  if (st?.kind === "written") {
    out.push(`The story this morning: ${st.headline}. ${st.summary}`);
    if (st.line) out.push(`A line you could use: ${st.line}`);
  } else if (st?.kind === "headlines" && st.also.length) {
    out.push(`This morning's top stories: ${st.also.slice(0, 3).map((a) => a.title).join(". ")}.`);
  }
  if (o.mind) {
    out.push(
      `Top of mind this week: ${o.mind.label.toLowerCase()}, ${pct(o.mind.score)} of what was raised across ${sourcesOf(o.mind)}.`,
    );
  }
  if (o.plan.length) {
    out.push("Where to be today.");
    for (const e of o.plan)
      out.push(`${e.startsAt ? `At ${e.startsAt}` : "All day"}, ${e.title}.${e.note ? ` ${e.note}` : ""}`);
  }
  out.push("That's your briefing. Have a good day.");
  return out.join(" ");
}
```

  In `src/lib/home.ts`: `export type SectionMode = "real" | "empty";` with `sectionModes`
  returning `"empty"` where it said `"sample"`; `TodayItem` becomes
  `{ title: string; detail: string; action: Action }` and `sample: false` goes from
  `realToday`, `nextStopItem` and `mindItem`; `todayItems` becomes

```ts
/** Today's list: the real items, at most three. */
export const todayItems = (real: TodayItem[], max = 3): TodayItem[] => real.slice(0, max);
```

  and `raceVerdict` goes, with any import only it used.

- [ ] **Step 4: Home, without samples.**
  - `Home.tsx`: `items` is `todayItems([...(next ? [nextStopItem(next)] : []), ...realToday(d.signals)])`;
    `verdict` is `modes.race === "real" ? realVerdict(d.race.rivals, d.race.polls) : ""`;
    compute `plan = dayPlan(d.diary, today)` and `name = greetingName(d.firstName, s.candidate.first)`
    once, and `script = spokenHome({ name, today, verdict, items, story: d.story, plan, mind: d.signals.mind })`;
    render `<HomeHeader s={s} today={today} name={name} verdict={verdict} script={script} />`,
    pass `plan` to `TodaySection`, `<CampaignSection mode={modes.campaign} />`, and delete the
    `mb-foot` paragraph.
  - `HomeHeader.tsx`: props `{ s, today, name, verdict, script }`; drop `SampleTag`, `raceMode`,
    `items` and `spokenBriefing`; the verdict line is `{verdict ? <p className="home-verdict">{verdict}</p> : null}`;
    Listen plays `speech.play(script)`.
  - `TodaySection.tsx`: the item heading is `<h3>{t.title}</h3>`; drop the `SampleTag` import.
  - `SectionHead.tsx` becomes:

```tsx
/** A section's heading. */
export function SectionHead({ id, title }: { id: string; title: string }) {
  return (
    <div className="home-head">
      <h2 id={id}>{title}</h2>
    </div>
  );
}
```

  - `RaceReal.tsx`: `export function OfficialResult`.
  - `RaceSection.tsx`:

```tsx
import { OfficialResult, RaceReal } from "@/components/gw/home/RaceReal";
import { SectionHead } from "@/components/gw/home/SectionHead";
import { TopOfMindCard } from "@/components/gw/home/TopOfMind";
import type { Scenario } from "@/lib/demo/types";
import type { RaceView, SectionMode } from "@/lib/home";
import type { SearchRead } from "@/lib/search-interest";
import type { TopOfMind } from "@/lib/top-of-mind";

/**
 * Where the race stands: the campaign's own candidates, polls and search
 * interest when it has them on record; otherwise what's missing and who adds
 * it. The week's issues and the last election's result show either way.
 */
export function RaceSection({
  s,
  mode,
  race,
  mind,
  search,
  canEdit,
  onEdit,
  onRemovePoll,
}: {
  s: Scenario;
  mode: SectionMode;
  race: RaceView;
  mind: TopOfMind;
  search: SearchRead | null;
  canEdit: boolean;
  onEdit: (what: "rivals" | "poll") => void;
  onRemovePoll: (id: string) => void;
}) {
  return (
    <section className="home-sec" id="race" aria-labelledby="home-race">
      <SectionHead id="home-race" title="The race" />
      {mode === "real" ? (
        <RaceReal
          s={s}
          race={race}
          mind={mind}
          search={search}
          canEdit={canEdit}
          onEdit={onEdit}
          onRemovePoll={onRemovePoll}
        />
      ) : (
        <>
          <section className="card home-empty" aria-label="The race">
            <p>No race on record yet.</p>
            {canEdit ? (
              <div className="mb-actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit("rivals")}>
                  Add the candidates
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit("poll")}>
                  Add a poll
                </button>
              </div>
            ) : (
              <p className="meta">The candidate or campaign manager adds the candidates and published polls.</p>
            )}
          </section>
          <TopOfMindCard mind={mind} />
          {s.lastTime.official ? <OfficialResult s={s} /> : null}
        </>
      )}
    </section>
  );
}
```

  - `CampaignSection.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { SectionHead } from "@/components/gw/home/SectionHead";
import { LiveOverview } from "@/components/gw/overview/LiveOverview";
import type { SectionMode } from "@/lib/home";

/** The campaign's own machine, from its records; until there are some, what fills it. */
export function CampaignSection({ mode }: { mode: SectionMode }) {
  return (
    <section className="home-sec" id="campaign" aria-labelledby="home-campaign">
      <SectionHead id="home-campaign" title="Our campaign" />
      {mode === "real" ? (
        <LiveOverview embedded />
      ) : (
        <section className="card home-empty" aria-label="Our campaign">
          <p>No supporters on record yet.</p>
          <div className="mb-actions">
            <Link to="/people" className="btn btn--primary btn--sm">
              Import people
            </Link>
          </div>
        </section>
      )}
    </section>
  );
}
```

  - `src/styles/groundwork.css`: add

```css
/* A section with nothing on record yet: what's missing and how to fill it. */
.home-empty { padding:18px 20px; }
.home-empty > p { margin:0 0 10px; }
```

    and delete the `.home-sample` rules (and `.home-note` if nothing else uses it).

- [ ] **Step 5: Run** all tests, typecheck, build. `grep -rn "SampleTag\|home-sample\|raceVerdict" src`
      finds nothing. Lint changed files (counts must not rise).
- [ ] **Step 6: Commit** `No samples on Home: real or empty, and Listen reads the real Home`.

---

### Task 11: Look at it

- [ ] In the harness: `homeData` returns `mind` (three issues with shares, one source without
      data) and `search` (thirty days for five candidates, Nairobi), and an "empty" state (no
      rivals, no polls, no people, no story, no diary); `EditRivals` shows "Searched as".
- [ ] Check at 1280 and 375 wide: Today's top-of-mind item; the race section's search card (the
      chart, its hover, the averages and the "searched as" line), the top-of-mind card; the
      empty Home (no race: the buttons for the candidate or manager, the line for others; the
      top-of-mind card; the 2022 result; the campaign's "Import people"); no "Sample" anywhere;
      the Listen button present. No horizontal scroll; no console errors on a fresh load.
- [ ] Fix what looks wrong (test first where a rule is involved), run `npm test`, commit
      `Search interest, top of mind and a Home with nothing invented read cleanly on a phone`.

---

## Self-review against the spec

- Spec 3 (search interest): Tasks 1, 4–7, 9; "searched as": Tasks 1–2; the budget: Tasks 1, 5;
  Nairobi then Kenya: Task 7; "Searches for … doubled" after a post spike and a poll change:
  Task 9. Spec 4 (top of mind): Tasks 3, 6, 8 (four sources, five-item threshold, the card,
  Today's item, the basis line). Spec 5 (no samples): Task 10, including the empty states and
  the 2022 result; "Listen" reading only what Home shows follows from it. Data: Task 1.
  Privacy (counts-only job rows, public words only): Task 7. Errors (SerpApi down or out of
  budget keeps the last read; the card says when it was read): Tasks 7, 9. Release: the user
  adds `SERPAPI_API_KEY`; migrations 15–21 go before the code.
