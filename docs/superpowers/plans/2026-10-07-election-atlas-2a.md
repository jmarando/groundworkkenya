# Election atlas, part 2a: the Elections section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Elections section: county, constituency and ward pages showing three elections'
results, turnout, swing, what to do and why, votes within reach, registers, population and the
team's notes, with a one-time setup (home area, sides) and a printable constituency brief.

**Architecture:** Two pure modules hold every rule: `src/lib/elections-view.ts` (the address,
the home area, the breadcrumb, cleaning what is saved) and `src/lib/atlas-view.ts` (an area's
figures from the atlas rows, rankings, results tables, map colours), on top of part 1's
`src/lib/atlas.ts`. `src/lib/atlas.functions.ts` loads the atlas and saves the campaign's
home area, sides and notes. A small SVG map (`src/lib/area-map.ts`, `AreaMap.tsx`) draws the
county from the existing ward outlines. The route `/elections` puts them together.

**Tech Stack:** TanStack Router and Start (validateSearch, server functions), React Query,
Supabase with RLS, SVG, tsx tests with the fake Supabase.

**Spec:** `docs/superpowers/specs/2026-10-07-election-atlas-design.md` (sections 4 and 5, Errors,
Testing). Part 2b (Voters, Home, the diary, the War room) follows in its own plan.

## Global Constraints

- Work on `election-atlas`; nothing is pushed or merged without the user's OK; migrations before
  code; never rewrite pushed history (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint only new or changed lines; in files with older lint errors the count must not rise. Test
  first for every rule; `npm test` runs every `tests/*.test.ts`, then the SQL tests.
- Every figure shows its tag ("IEBC · constituency total · 2022", "The Star · …"); shares from a
  list without a valid total say "of the candidates listed"; a missing figure shows "—" with
  "not found yet", never 0; estimates say "estimate".
- "Not registered" is never shown where the register is bigger than the population estimate;
  the page says the estimate is below the register there.
- Nothing anywhere records or infers a person's ethnicity; the note box says notes are about
  places.
- The team opens Elections; agents don't (they keep their field pages). Only the candidate or
  manager changes the home area, sides and notes.
- Copy is plain English.

## Review Focus

1. A constituency with results from a top-two press list (no valid total): its shares read "of the
   candidates listed" and its what-to-do still works. Test: Task 2 ("a listed-only count").
2. A ward where more are registered than WorldPop's adults: no "not registered" figure, a flag
   instead. Test: Task 2 ("the estimate below the register").
3. An address for an area the atlas doesn't hold (`?area=mombasa`): "Not loaded yet", not a crash
   or a silent jump home. Test: Task 1 ("an unknown area is kept for the not-loaded page").
4. A campaign whose seat doesn't name a loaded area: home falls back to Kenya. Test: Task 1 ("an
   unknown seat").
5. Saving a side as someone who isn't the candidate or manager: refused with a plain message
   before the database is touched. Test: Task 3 ("an organiser can't pick a side").

---

### Task 1: The section's address, home area and breadcrumb

**Files:**
- Create: `src/lib/elections-view.ts`
- Test: `tests/elections-view.test.ts`

**Interfaces:** Produces `type Shade = "todo" | "lean" | "turnout" | "swing"`, `SHADES`,
`type AreaRef = { key; level; name; parent }`, `type ElectionsSearch = { area?; race?; year?;
shade? }`, `type ElectionsChanges`, `validateElectionsSearch(raw)`, `nextElectionsSearch(prev,
changes)`, `defaultRace(level)`, `homeAreaFor(campaign, set, areas)`, `crumbsTo(areas, key)`,
`countyOf(key)`, `cleanNote(input)`, `cleanSide(input)`, `cleanHome(input)`.

- [ ] **Step 1: Write the failing test** `tests/elections-view.test.ts`:

```ts
// Checks for the Elections section's rules: the address, the campaign's home
// area, the breadcrumb, and cleaning what the candidate or manager saves.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/elections-view.test.ts

import {
  cleanHome,
  cleanNote,
  cleanSide,
  countyOf,
  crumbsTo,
  defaultRace,
  homeAreaFor,
  nextElectionsSearch,
  validateElectionsSearch,
  type AreaRef,
} from "@/lib/elections-view";

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

function throws(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const AREAS: AreaRef[] = [
  { key: "kenya", level: "country", name: "Kenya", parent: null },
  { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
  { key: "nairobi/westlands", level: "constituency", name: "Westlands", parent: "nairobi" },
  { key: "nairobi/westlands/kangemi", level: "ward", name: "Kangemi", parent: "nairobi/westlands" },
  { key: "nyeri", level: "county", name: "Nyeri", parent: "kenya" },
  { key: "nyeri/mathira", level: "constituency", name: "Mathira", parent: "nyeri" },
];

eq(
  "an address, cleaned",
  validateElectionsSearch({ area: "nairobi/westlands", race: "mp", year: "2017", shade: "swing", other: 1 }),
  { area: "nairobi/westlands", race: "mp", year: 2017, shade: "swing" },
);
eq("unknown values are dropped", validateElectionsSearch({ area: "Nairobi!", race: "senate", year: "2019", shade: "x" }), {});
eq("an unknown area is kept for the not-loaded page", validateElectionsSearch({ area: "mombasa" }), { area: "mombasa" });
eq(
  "a change to the address; undefined removes",
  nextElectionsSearch({ area: "nairobi", race: "mp", year: 2017 }, { area: "nairobi/westlands", year: undefined }),
  { area: "nairobi/westlands", race: "mp" },
);
eq("each campaign's own race first", [defaultRace("mp"), defaultRace("president"), defaultRace("governor"), defaultRace(undefined)], [
  "mp",
  "president",
  "governor",
  "governor",
]);
eq("the home area the campaign set", homeAreaFor({ level: "governor", seat: "Governor · Nairobi" }, "nairobi/westlands", AREAS), "nairobi/westlands");
eq("a set home the atlas lacks falls back to the seat", homeAreaFor({ level: "governor", seat: "Governor · Nairobi" }, "mombasa", AREAS), "nairobi");
eq("an MP's constituency from the seat", homeAreaFor({ level: "mp", seat: "MP · Mathira" }, null, AREAS), "nyeri/mathira");
eq("a presidential campaign's is Kenya", homeAreaFor({ level: "president", seat: "President · Kenya" }, null, AREAS), "kenya");
eq("an unknown seat", homeAreaFor({ level: "mp", seat: "MP · Lamu East" }, null, AREAS), "kenya");
eq("the breadcrumb", crumbsTo(AREAS, "nairobi/westlands/kangemi").map((a) => a.name), ["Kenya", "Nairobi", "Westlands", "Kangemi"]);
eq("the county an area sits in", [countyOf("nairobi/westlands/kangemi"), countyOf("nyeri"), countyOf("kenya")], ["nairobi", "nyeri", null]);
eq("a note, trimmed", cleanNote({ area: "nairobi/westlands", body: "  Matatu saccos meet on Fridays.  " }), {
  area: "nairobi/westlands",
  body: "Matatu saccos meet on Fridays.",
});
throws("an empty note", () => cleanNote({ area: "nairobi", body: "   " }), "Write the note first.");
throws("a long note", () => cleanNote({ area: "nairobi", body: "a".repeat(2001) }), "Keep a note to 2,000 characters.");
throws("a note for no place", () => cleanNote({ area: "Nairobi!", body: "x" }), "Which place?");
eq("clearing a side", cleanSide({ election: "2022-governor", bloc: "  " }), { election: "2022-governor", bloc: null });
throws("a side for an election that never was", () => cleanSide({ election: "2019-governor", bloc: "X" }), "Which election?");
eq("a home area", cleanHome({ area: "nyeri/mathira" }), { area: "nyeri/mathira" });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/elections-view.test.ts`. Expected:
      FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/elections-view.ts`:

```ts
// The Elections section's rules: what the address holds (area, race, year,
// shade), the campaign's home area, the breadcrumb, and cleaning what the
// candidate or manager saves (home area, sides, notes). Pure.

import { RACES, YEARS, type Race } from "@/lib/atlas";
import { ATLAS_ELECTIONS, slugify } from "@/lib/atlas-files";

export type Shade = "todo" | "lean" | "turnout" | "swing";
export const SHADES: Shade[] = ["todo", "lean", "turnout", "swing"];

export type AreaRef = { key: string; level: string; name: string; parent: string | null };

export type ElectionsSearch = { area?: string; race?: Race; year?: number; shade?: Shade };
export type ElectionsChanges = { [K in keyof ElectionsSearch]?: ElectionsSearch[K] | undefined };

const KEY = /^[a-z0-9-]+(\/[a-z0-9-]+){0,2}$/;

/** The address's search, anything unknown dropped (an unknown but well-formed area is kept). */
export function validateElectionsSearch(raw: Record<string, unknown>): ElectionsSearch {
  const out: ElectionsSearch = {};
  const area = raw["area"];
  if (typeof area === "string" && KEY.test(area)) out.area = area;
  if (RACES.includes(raw["race"] as Race)) out.race = raw["race"] as Race;
  const year = Number(raw["year"]);
  if ((YEARS as readonly number[]).includes(year)) out.year = year;
  if (SHADES.includes(raw["shade"] as Shade)) out.shade = raw["shade"] as Shade;
  return out;
}

/** The address with `changes` applied; an undefined change removes its key. */
export function nextElectionsSearch(prev: ElectionsSearch, changes: ElectionsChanges): ElectionsSearch {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return validateElectionsSearch(out);
}

/** The race a campaign looks at first: its own. */
export const defaultRace = (level: string | null | undefined): Race =>
  level === "mp" ? "mp" : level === "president" ? "president" : "governor";

/** The campaign's home area: what it set, else its seat ("MP · Mathira", "Governor · Nairobi"), else Kenya. */
export function homeAreaFor(
  campaign: { level: string; seat: string } | null,
  set: string | null,
  areas: AreaRef[],
): string {
  if (set && areas.some((a) => a.key === set)) return set;
  if (!campaign || campaign.level === "president") return "kenya";
  const place = slugify(campaign.seat.split("·").pop() ?? "");
  const level = campaign.level === "mp" ? "constituency" : "county";
  return (
    areas.find((a) => a.level === level && (slugify(a.name) === place || a.key.split("/").pop() === place))?.key ??
    "kenya"
  );
}

/** Kenya › Nairobi › Westlands › Kangemi, for the areas the atlas holds. */
export function crumbsTo(areas: AreaRef[], key: string): AreaRef[] {
  const byKey = new Map(areas.map((a) => [a.key, a]));
  const out: AreaRef[] = [];
  for (let a = byKey.get(key); a; a = a.parent ? byKey.get(a.parent) : undefined) out.unshift(a);
  return out;
}

/** The county an area sits in; null for Kenya. */
export const countyOf = (key: string): string | null => (key === "kenya" ? null : (key.split("/")[0] ?? null));

/** A note as the candidate or manager saves it. */
export function cleanNote(input: { area?: unknown; body?: unknown }): { area: string; body: string } {
  const area = String(input?.area ?? "");
  const body = String(input?.body ?? "").trim();
  if (!KEY.test(area)) throw new Error("Which place?");
  if (!body) throw new Error("Write the note first.");
  if (body.length > 2000) throw new Error("Keep a note to 2,000 characters.");
  return { area, body };
}

/** Our side in one election; an empty one clears it. */
export function cleanSide(input: { election?: unknown; bloc?: unknown }): { election: string; bloc: string | null } {
  const election = String(input?.election ?? "");
  if (!ATLAS_ELECTIONS.includes(election)) throw new Error("Which election?");
  const bloc = typeof input?.bloc === "string" ? input.bloc.trim() : "";
  if (bloc.length > 60) throw new Error("That side's name is too long.");
  return { election, bloc: bloc || null };
}

export function cleanHome(input: { area?: unknown }): { area: string } {
  const area = String(input?.area ?? "");
  if (!KEY.test(area)) throw new Error("Which place?");
  return { area };
}
```

- [ ] **Step 4: Run** it. Expected: all pass. Lint (`--fix`) and typecheck.
- [ ] **Step 5: Commit** `The Elections section's address, home area and breadcrumb`.

---

### Task 2: An area's figures, rankings, results tables and map colours

**Files:**
- Create: `src/lib/atlas-view.ts`
- Test: `tests/atlas-view.test.ts`

**Interfaces:** Consumes part 1's `src/lib/atlas.ts`. Produces the loaded-data types
`AtlasArea`, `AtlasCandidate`, `AtlasResult`, `AtlasTurnout` (`cast`), `AtlasRegister`,
`AtlasPopulation` (`youngAdults`), `AtlasSource`, `AtlasNote`, `AtlasData`; `electionOf(race,
year)`, `countAt(d, election, area)`, `sourceAt(d, election, area)`, `type AreaFigures`,
`figuresFor(d, key, race, year)`, `rankChildren(d, key, race, year)`, `type ResultBlock`,
`resultBlocks(d, key, races?)`, `blocsIn(d, election)`, `TODO_COLOURS`, `shadeOf(f, shade)`,
and formatters `share1`, `whole`, `signedPoints`, `votes`.

- [ ] **Step 1: Write the failing test** `tests/atlas-view.test.ts`:

```ts
// Checks for what the Elections section shows: an area's count, its figures in
// a race and year, the ranking of its parts, its results tables and the map's
// colours. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-view.test.ts

import {
  TODO_COLOURS,
  blocsIn,
  countAt,
  figuresFor,
  rankChildren,
  resultBlocks,
  shadeOf,
  signedPoints,
  type AtlasData,
} from "@/lib/atlas-view";

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
const r4 = (x: number | null | undefined) => (x === null || x === undefined ? x : Math.round(x * 1e4) / 1e4);

const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/a", level: "constituency", name: "Alpha", parent: "nairobi" },
    { key: "nairobi/b", level: "constituency", name: "Beta", parent: "nairobi" },
    { key: "nairobi/c", level: "constituency", name: "Gamma", parent: "nairobi" },
    { key: "nairobi/a/w1", level: "ward", name: "Ward One", parent: "nairobi/a" },
  ],
  candidates: [
    { id: "g22-s", election: "2022-governor", seat: "nairobi", name: "Sakaja", party: "UDA", bloc: "Kenya Kwanza" },
    { id: "g22-i", election: "2022-governor", seat: "nairobi", name: "Igathe", party: "Jubilee", bloc: "Azimio" },
    { id: "g17-s", election: "2017-governor", seat: "nairobi", name: "Sonko", party: "Jubilee", bloc: "Jubilee" },
    { id: "g17-k", election: "2017-governor", seat: "nairobi", name: "Kidero", party: "ODM", bloc: "NASA" },
  ],
  results: [
    { candidate: "g22-s", area: "nairobi", votes: 600, source: "iebc" },
    { candidate: "g22-i", area: "nairobi", votes: 400, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/a", votes: 240, source: "iebc" },
    { candidate: "g22-i", area: "nairobi/a", votes: 225, source: "iebc" },
    { candidate: "g17-s", area: "nairobi/a", votes: 300, source: "iebc" },
    { candidate: "g17-k", area: "nairobi/a", votes: 200, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/b", votes: 280, source: "iebc" },
    { candidate: "g22-i", area: "nairobi/b", votes: 120, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/c", votes: 60, source: "star" },
    { candidate: "g22-i", area: "nairobi/c", votes: 140, source: "star" },
  ],
  turnout: [
    { election: "2022-governor", area: "nairobi", registered: 3000, cast: 1500, rejected: null, valid: null, source: "iebc" },
    { election: "2022-governor", area: "nairobi/a", registered: 1000, cast: 505, rejected: 5, valid: 500, source: "iebc" },
    { election: "2017-governor", area: "nairobi/a", registered: 900, cast: 510, rejected: 10, valid: 500, source: "iebc" },
    { election: "2022-governor", area: "nairobi/b", registered: 800, cast: 410, rejected: 10, valid: 400, source: "iebc" },
  ],
  register: [
    { year: 2022, area: "nairobi/a", registered: 1000, source: "iebc" },
    { year: 2017, area: "nairobi/a", registered: 900, source: "iebc" },
    { year: 2022, area: "nairobi/b", registered: 800, source: "iebc" },
  ],
  population: [
    { area: "nairobi/a", year: 2020, total: 2000, adults: 1500, youngAdults: 600, source: "worldpop" },
    { area: "nairobi/b", year: 2020, total: 900, adults: 600, youngAdults: 300, source: "worldpop" },
  ],
  sources: [
    { id: "iebc", title: "Form 37C (test)", publisher: "IEBC", url: null, note: null },
    { id: "star", title: "A newspaper tally", publisher: "The Star", url: null, note: null },
    { id: "worldpop", title: "WorldPop", publisher: "WorldPop", url: null, note: null },
  ],
  homeArea: null,
  sides: { "2022-governor": "Kenya Kwanza", "2017-governor": "Jubilee" },
  notes: {},
};

eq("an area's count", countAt(D, "2022-governor", "nairobi/a"), {
  year: 2022,
  candidates: [
    { name: "Sakaja", party: "UDA", bloc: "Kenya Kwanza", votes: 240 },
    { name: "Igathe", party: "Jubilee", bloc: "Azimio", votes: 225 },
  ],
  registered: 1000,
  cast: 505,
  rejected: 5,
  valid: 500,
});
eq("no count where nothing was found", countAt(D, "2013-governor", "nairobi/a"), null);

const A = figuresFor(D, "nairobi/a", "governor", 2022);
eq(
  "Alpha's figures",
  [r4(A.ourShare), r4(A.margin), r4(A.turnout), r4(A.swing), A.yearBefore, A.todo?.todo, A.reach, A.tag],
  [0.48, 0.03, 0.505, -0.12, 2017, "persuade", { turnout: 3, persuasion: 25, total: 28 }, "IEBC · constituency total · 2022"],
);
eq("its register and people", [A.registered, A.growth?.change, r4(A.growth?.rate ?? null), A.notRegistered, A.estimateBelowRegister], [
  1000,
  100,
  0.1111,
  { adults: 500, youngShare: 0.4 },
  false,
]);
const B = figuresFor(D, "nairobi/b", "governor", 2022);
eq("the estimate below the register", [B.todo?.todo, B.notRegistered, B.estimateBelowRegister], ["hold", null, true]);
const C = figuresFor(D, "nairobi/c", "governor", 2022);
eq("a listed-only count", [C.listedOnly, r4(C.ourShare), C.todo?.todo, C.turnout, C.tag], [
  true,
  0.3,
  "cut",
  null,
  "The Star · constituency total · 2022",
]);
const W = figuresFor(D, "nairobi/a/w1", "governor", 2022);
eq("a ward with no count of its own", [W.count, W.todo, W.reach, W.tag], [null, null, null, null]);
eq("the county's parts, most votes within reach first", rankChildren(D, "nairobi", "governor", 2022).map((f) => f.key), [
  "nairobi/a",
  "nairobi/b",
  "nairobi/c",
]);
eq(
  "results tables, newest first",
  resultBlocks(D, "nairobi/a").map((b) => [b.race, b.year, b.rows.map((r) => [r.name, r4(r.share)])]),
  [
    ["governor", 2022, [["Sakaja", 0.48], ["Igathe", 0.45]]],
    ["governor", 2017, [["Sonko", 0.6], ["Kidero", 0.4]]],
  ],
);
eq("the blocs to pick a side from, most votes first", blocsIn(D, "2022-governor"), ["Kenya Kwanza", "Azimio"]);
eq("the map's colours", [shadeOf(A, "todo"), shadeOf(W, "lean"), shadeOf(B, "lean")?.label], [
  { colour: TODO_COLOURS.persuade, label: "Persuade" },
  null,
  "70.0% to us",
]);
eq("signed points", [signedPoints(0.052), signedPoints(-0.12), signedPoints(0)], ["+5.2 points", "−12 points", "0 points"]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/atlas-view.ts`:

```ts
// What the Elections section shows, from the atlas's rows: an area's count in
// one election, its figures in a race and year, the ranking of its parts, its
// results tables, the blocs to pick a side from, and the map's colours. Pure.

import {
  figureTag,
  margin,
  notRegistered,
  ourShare,
  registerGrowth,
  swing,
  turnout,
  validVotes,
  votesWithinReach,
  whatToDo,
  TODO_NAMES,
  YEARS,
  type AreaCount,
  type Race,
  type Todo,
} from "@/lib/atlas";

export type Level = "country" | "county" | "constituency" | "ward";
export type AtlasArea = { key: string; level: Level; name: string; parent: string | null };
export type AtlasCandidate = {
  id: string;
  election: string;
  seat: string;
  name: string;
  party: string | null;
  bloc: string;
};
export type AtlasResult = { candidate: string; area: string; votes: number; source: string };
export type AtlasTurnout = {
  election: string;
  area: string;
  registered: number | null;
  cast: number | null;
  rejected: number | null;
  valid: number | null;
  source: string;
};
export type AtlasRegister = { year: number; area: string; registered: number; source: string };
export type AtlasPopulation = {
  area: string;
  year: number;
  total: number;
  adults: number;
  youngAdults: number;
  source: string;
};
export type AtlasSource = { id: string; title: string; publisher: string; url: string | null; note: string | null };
export type AtlasNote = { body: string; updatedAt: string };
export type AtlasData = {
  areas: AtlasArea[];
  candidates: AtlasCandidate[];
  results: AtlasResult[];
  turnout: AtlasTurnout[];
  register: AtlasRegister[];
  population: AtlasPopulation[];
  sources: AtlasSource[];
  /** The campaign's own: its home area, its side in each election, its notes by area. */
  homeArea: string | null;
  sides: Record<string, string>;
  notes: Record<string, AtlasNote>;
};

export const electionOf = (race: Race, year: number) => `${year}-${race}`;

export const share1 = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;
export const whole = (x: number) => `${Math.round(x * 100)}%`;
export const votes = (n: number) => new Intl.NumberFormat("en-KE").format(n);
/** "+5.2 points", "−12 points", "0 points". */
export function signedPoints(x: number): string {
  const p = Math.round(Math.abs(x) * 1000) / 10;
  return `${p === 0 ? "" : x > 0 ? "+" : "−"}${p} points`;
}

/** One area's count in one election, from the rows; null when nothing was found. */
export function countAt(d: AtlasData, election: string, area: string): AreaCount | null {
  const byId = new Map(d.candidates.filter((c) => c.election === election).map((c) => [c.id, c]));
  const rows = d.results.filter((r) => r.area === area && byId.has(r.candidate));
  const t = d.turnout.find((x) => x.election === election && x.area === area);
  if (!rows.length && !t) return null;
  return {
    year: Number(election.slice(0, 4)),
    candidates: rows
      .map((r) => {
        const c = byId.get(r.candidate)!;
        return { name: c.name, party: c.party, bloc: c.bloc, votes: r.votes };
      })
      .sort((a, b) => b.votes - a.votes),
    registered: t?.registered ?? null,
    cast: t?.cast ?? null,
    rejected: t?.rejected ?? null,
    valid: t?.valid ?? null,
  };
}

/** The document behind an area's figures in one election. */
export function sourceAt(d: AtlasData, election: string, area: string): AtlasSource | null {
  const ids = new Set(d.candidates.filter((c) => c.election === election).map((c) => c.id));
  const id =
    d.results.find((r) => r.area === area && ids.has(r.candidate))?.source ??
    d.turnout.find((t) => t.election === election && t.area === area)?.source;
  return d.sources.find((s) => s.id === id) ?? null;
}

export type AreaFigures = {
  key: string;
  name: string;
  level: Level;
  count: AreaCount | null;
  /** The document gave no valid total: shares are of the candidates listed. */
  listedOnly: boolean;
  turnout: number | null;
  ourShare: number | null;
  margin: number | null;
  /** Against `yearBefore`, the latest earlier election with a count here. */
  swing: number | null;
  yearBefore: number | null;
  todo: { todo: Todo; reason: string } | null;
  reach: { turnout: number; persuasion: number; total: number } | null;
  /** The latest register: 2022's, else the election's own. */
  registered: number | null;
  growth: { change: number; rate: number | null } | null;
  population: AtlasPopulation | null;
  /** Null where there's no estimate, or where it's below the register. */
  notRegistered: { adults: number; youngShare: number | null } | null;
  estimateBelowRegister: boolean;
  tag: string | null;
};

const latestBefore = (d: AtlasData, race: Race, year: number, key: string): number | null =>
  [...YEARS].reverse().find((y) => y < year && countAt(d, electionOf(race, y), key)?.candidates.length) ?? null;

/** One area's figures in a race and year. */
export function figuresFor(d: AtlasData, key: string, race: Race, year: number): AreaFigures {
  const byKey = new Map(d.areas.map((a) => [a.key, a]));
  const area = byKey.get(key);
  const election = electionOf(race, year);
  const count = countAt(d, election, key);
  const side = d.sides[election] ?? null;
  const prev = latestBefore(d, race, year, key);
  const before =
    prev === null
      ? null
      : { year: prev, count: countAt(d, electionOf(race, prev), key)!, side: d.sides[electionOf(race, prev)] ?? null };
  const parent = area?.parent ? byKey.get(area.parent) : undefined;
  const parentCount = parent ? countAt(d, election, parent.key) : null;
  const siblingTurnouts = d.areas
    .filter((a) => a.parent === area?.parent && a.level === area?.level)
    .map((a) => countAt(d, election, a.key))
    .map((c) => (c ? turnout(c) : null))
    .filter((t): t is number => t !== null);
  const reg = (y: number) => d.register.find((r) => r.year === y && r.area === key)?.registered ?? null;
  const registered = reg(2022) ?? count?.registered ?? null;
  const population = d.population.filter((p) => p.area === key).sort((a, b) => b.year - a.year)[0] ?? null;
  const below = Boolean(population && registered !== null && registered > population.adults);
  const source = sourceAt(d, election, key);
  const counted = Boolean(count?.candidates.length);
  return {
    key,
    name: area?.name ?? key,
    level: area?.level ?? "ward",
    count,
    listedOnly: Boolean(count && counted && count.valid === null),
    turnout: count ? turnout(count) : null,
    ourShare: count ? ourShare(count, side) : null,
    margin: count ? margin(count, side) : null,
    swing: count && before ? swing(count, side, before.count, before.side) : null,
    yearBefore: prev,
    todo:
      count && counted
        ? whatToDo({
            year,
            count,
            side,
            parentTurnout: parentCount ? turnout(parentCount) : null,
            parentName: parent?.name ?? null,
            before,
          })
        : null,
    reach: count && counted ? votesWithinReach(count, side, siblingTurnouts) : null,
    registered,
    growth: registerGrowth(reg(2022), reg(2017)),
    population,
    notRegistered:
      population && !below
        ? notRegistered({ adults: population.adults, young_adults: population.youngAdults }, registered)
        : null,
    estimateBelowRegister: below,
    tag: source && area ? figureTag(source.publisher, area.level, year) : null,
  };
}

/** An area's parts, most votes within reach first; those without a count last, by name. */
export function rankChildren(d: AtlasData, key: string, race: Race, year: number): AreaFigures[] {
  return d.areas
    .filter((a) => a.parent === key)
    .map((a) => figuresFor(d, a.key, race, year))
    .sort((a, b) => (b.reach?.total ?? -1) - (a.reach?.total ?? -1) || a.name.localeCompare(b.name));
}

export type ResultBlock = {
  race: Race;
  year: number;
  rows: { name: string; party: string | null; bloc: string; votes: number; share: number }[];
  listedOnly: boolean;
  turnout: number | null;
  registered: number | null;
  tag: string | null;
  source: AtlasSource | null;
};

/** Every race and year with candidates counted here, in the races' order, newest first. */
export function resultBlocks(
  d: AtlasData,
  key: string,
  races: Race[] = ["mp", "governor", "president"],
): ResultBlock[] {
  const level = d.areas.find((a) => a.key === key)?.level ?? "ward";
  const out: ResultBlock[] = [];
  for (const race of races)
    for (const year of [...YEARS].reverse()) {
      const election = electionOf(race, year);
      const count = countAt(d, election, key);
      if (!count?.candidates.length) continue;
      const valid = validVotes(count);
      const source = sourceAt(d, election, key);
      out.push({
        race,
        year,
        rows: count.candidates.map((c) => ({ ...c, share: valid ? c.votes / valid : 0 })),
        listedOnly: count.valid === null,
        turnout: turnout(count),
        registered: count.registered,
        tag: source ? figureTag(source.publisher, level, year) : null,
        source,
      });
    }
  return out;
}

/** The blocs in one election, most votes in the atlas first: what a side is picked from. */
export function blocsIn(d: AtlasData, election: string): string[] {
  const bloc = new Map(d.candidates.filter((c) => c.election === election).map((c) => [c.id, c.bloc]));
  const total = new Map<string, number>();
  for (const b of bloc.values()) total.set(b, total.get(b) ?? 0);
  for (const r of d.results) {
    const b = bloc.get(r.candidate);
    if (b) total.set(b, (total.get(b) ?? 0) + r.votes);
  }
  return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([b]) => b);
}

export const TODO_COLOURS: Record<Todo, string> = {
  mobilise: "hsl(32 90% 50%)",
  hold: "hsl(142 55% 36%)",
  persuade: "hsl(205 75% 46%)",
  cut: "hsl(0 70% 50%)",
  "lean-ours": "hsl(142 40% 62%)",
  "lean-theirs": "hsl(0 45% 66%)",
  "no-side": "hsl(0 0% 76%)",
};

type Hsl = [number, number, number];
/** A colour between stops at x (clamped), mixed in HSL. */
function ramp(x: number, stops: [number, Hsl][]): string {
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  let c: Hsl = x <= first[0] ? first[1] : last[1];
  for (let i = 1; i < stops.length; i++) {
    const [x0, a] = stops[i - 1]!;
    const [x1, b] = stops[i]!;
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return `hsl(${Math.round(c[0])} ${Math.round(c[1])}% ${Math.round(c[2])}%)`;
}
const RED: Hsl = [0, 70, 52];
const AMBER: Hsl = [40, 90, 52];
const GREEN: Hsl = [142, 60, 38];

/** How the map shades an area by the chosen measure; null where there's nothing to show. */
export function shadeOf(f: AreaFigures, shade: "todo" | "lean" | "turnout" | "swing"): { colour: string; label: string } | null {
  if (shade === "todo") return f.todo ? { colour: TODO_COLOURS[f.todo.todo], label: TODO_NAMES[f.todo.todo] } : null;
  if (shade === "lean")
    return f.ourShare === null ? null : { colour: ramp(f.ourShare, [[0.3, RED], [0.5, AMBER], [0.7, GREEN]]), label: `${share1(f.ourShare)} to us` };
  if (shade === "turnout")
    return f.turnout === null ? null : { colour: ramp(f.turnout, [[0.3, [210, 30, 86]], [0.75, [210, 80, 34]]]), label: `${whole(f.turnout)} turnout` };
  return f.swing === null ? null : { colour: ramp(f.swing, [[-0.15, RED], [0, [0, 0, 80]], [0.15, GREEN]]), label: signedPoints(f.swing) };
}
```

- [ ] **Step 4: Run** it. Expected: all pass. Lint (`--fix`) and typecheck.
- [ ] **Step 5: Commit** `What the Elections section shows: an area's figures, its parts, its results and colours`.

---

### Task 3: Loading the atlas, and saving the home area, sides and notes

**Files:**
- Create: `src/lib/atlas.functions.ts`
- Modify: `tests/fake-supabase.ts` (the three tables' upsert keys)
- Test: `tests/atlas-functions.test.ts`

**Interfaces:** Consumes Task 1's cleaners and Task 2's `AtlasData`. Produces `ATLAS_DENIED`,
`loadAtlas(sb)`, `writeHome(sb, area)`, `writeSide(sb, election, bloc)`, `writeNote(sb, area,
body)`, `removeNote(sb, area)`, and the server functions `getAtlas`, `saveHome`, `saveSide`,
`saveNote`, `deleteNote`.

- [ ] **Step 1: The fake's keys.** In `tests/fake-supabase.ts`, add to `KEYS`:

```ts
  atlas_settings: [["campaign_id"]],
  atlas_sides: [["campaign_id", "election_id"]],
  area_notes: [["campaign_id", "area_key"]],
```

- [ ] **Step 2: Write the failing test** `tests/atlas-functions.test.ts`:

```ts
// Checks for reading the election atlas and for the candidate's or manager's
// changes to the campaign's home area, sides and notes, against a stand-in
// database. Nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-functions.test.ts

import { ATLAS_DENIED, loadAtlas, removeNote, writeHome, writeNote, writeSide } from "@/lib/atlas.functions";

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

async function refuses(name: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const SEED = {
  atlas_areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
  ],
  atlas_candidates: [
    { id: "2022-governor:nairobi:sakaja", election_id: "2022-governor", seat: "nairobi", name: "Sakaja", party: "UDA", bloc: "Kenya Kwanza" },
  ],
  atlas_results: [{ candidate_id: "2022-governor:nairobi:sakaja", area_key: "nairobi", votes: 699392, source_id: "star" }],
  atlas_turnout: [
    { election_id: "2022-president", area_key: "nairobi", registered: 2416551, cast_votes: 1352236, rejected: 12869, valid: 1339367, source_id: "iebc" },
  ],
  atlas_register: [{ year: 2022, area_key: "nairobi", registered: 2415310, source_id: "ek" }],
  atlas_population: [{ area_key: "nairobi", year: 2020, total: 4748124, adults: 3231692, young_adults: 2059932, source_id: "worldpop" }],
  atlas_sources: [{ id: "star", title: "A tally", publisher: "The Star", url: null, note: null }],
  atlas_settings: [],
  atlas_sides: [],
  area_notes: [],
};
const as = (role: string) => fakeSupabase(structuredClone(SEED), { my_campaign_role: () => role });

const d = await loadAtlas(as("manager") as never);
eq("the atlas, read into the screen's shape", [d.areas.length, d.candidates[0]?.election, d.turnout[0]?.cast, d.population[0]?.youngAdults, d.homeArea, d.sides, d.notes], [
  2,
  "2022-governor",
  1352236,
  2059932,
  null,
  {},
  {},
]);

const sb = as("manager");
await writeHome(sb as never, "nairobi");
await writeSide(sb as never, "2022-governor", "Kenya Kwanza");
await writeNote(sb as never, "nairobi", "Matatu saccos meet on Fridays.");
const after = await loadAtlas(sb as never);
eq("the manager's changes", [after.homeArea, after.sides, after.notes["nairobi"]?.body], [
  "nairobi",
  { "2022-governor": "Kenya Kwanza" },
  "Matatu saccos meet on Fridays.",
]);
await writeNote(sb as never, "nairobi", "Saccos meet on Thursdays now.");
eq("a note is replaced, not doubled", [(await loadAtlas(sb as never)).notes["nairobi"]?.body, sb.tables["area_notes"]?.length], [
  "Saccos meet on Thursdays now.",
  1,
]);
await writeSide(sb as never, "2022-governor", null);
eq("a side cleared", (await loadAtlas(sb as never)).sides, {});
await removeNote(sb as never, "nairobi");
eq("a note removed", (await loadAtlas(sb as never)).notes, {});
await refuses("an organiser can't pick a side", () => writeSide(as("organiser") as never, "2022-governor", "Azimio"), ATLAS_DENIED);
await refuses("an agent can't write a note", () => writeNote(as("agent") as never, "nairobi", "x"), ATLAS_DENIED);
await refuses("nor set the home area", () => writeHome(as("agent") as never, "nairobi"), ATLAS_DENIED);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Run** it. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/atlas.functions.ts`:

```ts
// The election atlas read as the signed-in person: every team reads the public
// figures, and its home area, sides and notes come from its own campaign only.
// And the candidate's or manager's changes to those three, checked here first
// and again by the database.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AtlasData, Level } from "@/lib/atlas-view";
import { cleanHome, cleanNote, cleanSide } from "@/lib/elections-view";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: the atlas tables are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const ATLAS_DENIED = "Only the candidate or campaign manager can change this.";
const STAFF = ["super", "candidate", "manager"];

export async function loadAtlas(sb: Client): Promise<AtlasData> {
  const read = async <T>(table: string, cols: string): Promise<T[]> => {
    const { data, error } = (await sb.from(table).select(cols)) as { data: T[] | null; error: unknown };
    if (error) throw new Error("Could not read the election atlas.");
    return data ?? [];
  };
  const [areas, candidates, results, turnout, register, population, sources, settings, sides, notes] =
    await Promise.all([
      read<{ key: string; level: string; name: string; parent: string | null }>("atlas_areas", "key, level, name, parent"),
      read<{ id: string; election_id: string; seat: string; name: string; party: string | null; bloc: string }>(
        "atlas_candidates",
        "id, election_id, seat, name, party, bloc",
      ),
      read<{ candidate_id: string; area_key: string; votes: number; source_id: string }>(
        "atlas_results",
        "candidate_id, area_key, votes, source_id",
      ),
      read<{
        election_id: string;
        area_key: string;
        registered: number | null;
        cast_votes: number | null;
        rejected: number | null;
        valid: number | null;
        source_id: string;
      }>("atlas_turnout", "election_id, area_key, registered, cast_votes, rejected, valid, source_id"),
      read<{ year: number; area_key: string; registered: number; source_id: string }>(
        "atlas_register",
        "year, area_key, registered, source_id",
      ),
      read<{ area_key: string; year: number; total: number; adults: number; young_adults: number; source_id: string }>(
        "atlas_population",
        "area_key, year, total, adults, young_adults, source_id",
      ),
      read<{ id: string; title: string; publisher: string; url: string | null; note: string | null }>(
        "atlas_sources",
        "id, title, publisher, url, note",
      ),
      read<{ home_area: string }>("atlas_settings", "home_area"),
      read<{ election_id: string; bloc: string }>("atlas_sides", "election_id, bloc"),
      read<{ area_key: string; body: string; updated_at: string }>("area_notes", "area_key, body, updated_at"),
    ]);
  return {
    areas: areas.map((a) => ({ key: a.key, level: a.level as Level, name: a.name, parent: a.parent })),
    candidates: candidates.map((c) => ({
      id: c.id,
      election: c.election_id,
      seat: c.seat,
      name: c.name,
      party: c.party,
      bloc: c.bloc,
    })),
    results: results.map((r) => ({ candidate: r.candidate_id, area: r.area_key, votes: r.votes, source: r.source_id })),
    turnout: turnout.map((t) => ({
      election: t.election_id,
      area: t.area_key,
      registered: t.registered,
      cast: t.cast_votes,
      rejected: t.rejected,
      valid: t.valid,
      source: t.source_id,
    })),
    register: register.map((r) => ({ year: r.year, area: r.area_key, registered: r.registered, source: r.source_id })),
    population: population.map((p) => ({
      area: p.area_key,
      year: p.year,
      total: p.total,
      adults: p.adults,
      youngAdults: p.young_adults,
      source: p.source_id,
    })),
    sources,
    homeArea: settings[0]?.home_area ?? null,
    sides: Object.fromEntries(sides.map((s) => [s.election_id, s.bloc])),
    notes: Object.fromEntries(notes.map((n) => [n.area_key, { body: n.body, updatedAt: n.updated_at }])),
  };
}

/** Only the candidate, the manager or the super admin change the campaign's atlas settings. */
async function mustBeStaff(sb: Client): Promise<void> {
  const { data } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!STAFF.includes(String(data))) throw new Error(ATLAS_DENIED);
}

function atlasError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return ATLAS_DENIED;
  if (e.code === "23503") return "That place or election isn't in the atlas.";
  if (e.code === "23514") return "The database refused that: keep a note to 2,000 characters.";
  return "Could not save that. Try again.";
}

async function done(q: PromiseLike<{ error: { code?: string; message?: string } | null }>): Promise<void> {
  const { error } = await q;
  if (error) throw new Error(atlasError(error));
}

export async function writeHome(sb: Client, area: string): Promise<void> {
  await mustBeStaff(sb);
  await done(sb.from("atlas_settings").upsert({ home_area: area }, { onConflict: "campaign_id" }));
}

export async function writeSide(sb: Client, election: string, bloc: string | null): Promise<void> {
  await mustBeStaff(sb);
  await done(
    bloc
      ? sb.from("atlas_sides").upsert({ election_id: election, bloc }, { onConflict: "campaign_id,election_id" })
      : sb.from("atlas_sides").delete().eq("election_id", election),
  );
}

export async function writeNote(sb: Client, area: string, body: string): Promise<void> {
  await mustBeStaff(sb);
  await done(sb.from("area_notes").upsert({ area_key: area, body }, { onConflict: "campaign_id,area_key" }));
}

export async function removeNote(sb: Client, area: string): Promise<void> {
  await mustBeStaff(sb);
  await done(sb.from("area_notes").delete().eq("area_key", area));
}

export const getAtlas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AtlasData> => loadAtlas(context.supabase as never));

export const saveHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string }) => cleanHome(input))
  .handler(async ({ data, context }) => {
    await writeHome(context.supabase as never, data.area);
    return { ok: true };
  });

export const saveSide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { election: string; bloc: string | null }) => cleanSide(input))
  .handler(async ({ data, context }) => {
    await writeSide(context.supabase as never, data.election, data.bloc);
    return { ok: true };
  });

export const saveNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string; body: string }) => cleanNote(input))
  .handler(async ({ data, context }) => {
    await writeNote(context.supabase as never, data.area, data.body);
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { area: string }) => cleanHome(input))
  .handler(async ({ data, context }) => {
    await removeNote(context.supabase as never, data.area);
    return { ok: true };
  });
```

- [ ] **Step 5: Run** it and `npm test`. Expected: all pass. Lint (`--fix`) and typecheck.
- [ ] **Step 6: Commit** `Reading the atlas, and the candidate's or manager's home area, sides and notes`.

---

### Task 4: The county, drawn

**Files:**
- Create: `src/lib/area-map.ts`, `src/components/gw/elections/AreaMap.tsx`
- Test: `tests/area-map.test.ts`

**Interfaces:** Produces `type Ring`, `type WardShape = { slug; name; constituency; polygons }`,
`wardShapes(geo)`, `projectShapes(shapes, width): { width; height; paths: { slug; d }[] }`, and
`<AreaMap county focus colourOf onPick? label />` (wards keyed `county/constituency/ward`).

- [ ] **Step 1: Write the failing test** `tests/area-map.test.ts`:

```ts
// Checks for drawing a county from its ward outlines: shapes from a ward map,
// and flat-projected SVG paths at the width asked for. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/area-map.test.ts

import { projectShapes, wardShapes } from "@/lib/area-map";

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

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
const shapes = wardShapes({
  features: [
    { properties: { slug: "one", name: "One", constituency: "Alpha" }, geometry: { type: "Polygon", coordinates: square } },
    { properties: { slug: "two", name: "Two" }, geometry: { type: "MultiPolygon", coordinates: [square] } },
  ],
});
eq("shapes from a ward map", shapes.map((s) => [s.slug, s.constituency, s.polygons.length]), [
  ["one", "Alpha", 1],
  ["two", null, 1],
]);
const drawn = projectShapes([shapes[0]!], 100);
eq("a square near the equator, 100 wide", [drawn.width, drawn.height, drawn.paths[0]?.d], [
  100,
  100,
  "M0,100L100,100L100,0L0,0L0,100Z",
]);
eq("nothing to draw", projectShapes([], 100), { width: 100, height: 0, paths: [] });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/area-map.ts`:

```ts
// A county drawn from its ward outlines as SVG: each ward's rings projected
// flat (fine at a county's size) and scaled to the width asked for. Pure.

export type Ring = [number, number][];
export type WardShape = { slug: string; name: string; constituency: string | null; polygons: Ring[][] };

type Geo = {
  features: {
    properties: { slug: string; name: string; constituency?: string };
    geometry: { type: string; coordinates: unknown };
  }[];
};

/** The wards in a ward map, as polygons of rings. */
export function wardShapes(geo: Geo): WardShape[] {
  return geo.features.map((f) => ({
    slug: f.properties.slug,
    name: f.properties.name,
    constituency: f.properties.constituency ?? null,
    polygons:
      f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]),
  }));
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** SVG paths for the shapes, flat-projected and scaled to `width`; the height follows. */
export function projectShapes(
  shapes: WardShape[],
  width: number,
): { width: number; height: number; paths: { slug: string; d: string }[] } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of shapes)
    for (const poly of s.polygons)
      for (const ring of poly)
        for (const [x, y] of ring) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
  if (!Number.isFinite(minX)) return { width, height: 0, paths: [] };
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = width / ((maxX - minX) * k || 1);
  const pt = ([x, y]: [number, number]) => `${r1((x - minX) * k * scale)},${r1((maxY - y) * scale)}`;
  return {
    width,
    height: Math.round((maxY - minY) * scale),
    paths: shapes.map((s) => ({
      slug: s.slug,
      d: s.polygons.map((poly) => poly.map((ring) => `M${ring.map(pt).join("L")}Z`).join("")).join(""),
    })),
  };
}
```

  Run the test. Expected: all pass.

- [ ] **Step 4: The component** `src/components/gw/elections/AreaMap.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { projectShapes, wardShapes } from "@/lib/area-map";
import { slugify } from "@/lib/atlas-files";
import { getJson } from "@/lib/geo-files";

/** The ward maps the atlas can draw, by county. Nyeri's holds Mathira's wards only. */
const MAPS: Record<string, { url: string; constituency?: string }> = {
  nairobi: { url: "/geo/nairobi-wards.json" },
  nyeri: { url: "/geo/mathira-wards.json", constituency: "mathira" },
};
const WIDTH = 640;

/** The county drawn ward by ward; wards outside `focus` are faded. */
export function AreaMap({
  county,
  focus,
  colourOf,
  onPick,
  label,
}: {
  county: string;
  /** The area on show: its wards are drawn in full. */
  focus: string;
  /** A ward's fill from its key (county/constituency/ward); null leaves it plain. */
  colourOf: (wardKey: string) => string | null;
  onPick?: (wardKey: string) => void;
  label: string;
}) {
  const map = MAPS[county];
  const { data: geo } = useQuery({
    queryKey: ["geo", "wards", county],
    queryFn: () => getJson<Parameters<typeof wardShapes>[0]>(map!.url),
    enabled: Boolean(map),
    staleTime: Infinity,
  });
  const drawn = useMemo(() => {
    if (!geo || !map) return null;
    const shapes = wardShapes(geo);
    const p = projectShapes(shapes, WIDTH);
    return {
      height: p.height,
      wards: shapes.map((s, i) => ({
        key: `${county}/${map.constituency ?? slugify(s.constituency ?? "")}/${s.slug}`,
        name: s.name,
        d: p.paths[i]?.d ?? "",
      })),
    };
  }, [geo, map, county]);

  if (!map) return <p className="f-note">There's no ward map for this county yet.</p>;
  if (!drawn) return <p className="meta">Drawing the map…</p>;
  return (
    <svg className="el-map" viewBox={`0 0 ${WIDTH} ${drawn.height}`} role="img" aria-label={label}>
      {drawn.wards.map((w) => {
        const inside = focus === county || w.key === focus || w.key.startsWith(`${focus}/`);
        return (
          <path
            key={w.key}
            d={w.d}
            fill={colourOf(w.key) ?? "var(--muted)"}
            fillOpacity={inside ? 0.9 : 0.25}
            stroke="var(--card)"
            strokeWidth={1}
            onClick={onPick ? () => onPick(w.key) : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <title>{w.name}</title>
          </path>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Run** the tests; lint (`--fix`); typecheck.
- [ ] **Step 6: Commit** `The county drawn from its ward outlines`.

---

### Task 5: The Elections screen

**Files:**
- Create: `src/components/gw/elections/ResultList.tsx`, `AreaNumbers.tsx`, `PeopleCard.tsx`,
  `NoteBox.tsx`, `SetupPanel.tsx`, `CountyView.tsx`, `ConstituencyView.tsx`, `WardView.tsx`;
  `src/routes/_authenticated/elections.tsx`
- Modify: `src/styles/groundwork.css`

**Interfaces:** Consumes Tasks 1–4. Produces the `/elections` screen and `RACE_NAMES` (in
`ResultList.tsx`).

- [ ] **Step 1: A result, the numbers, the people.** `src/components/gw/elections/ResultList.tsx`:

```tsx
import type { Race } from "@/lib/atlas";
import { share1, votes, whole, type ResultBlock } from "@/lib/atlas-view";

export const RACE_NAMES: Record<Race, string> = { president: "President", governor: "Governor", mp: "MP" };

/** One race in one year: each candidate's votes and share, and where the figures came from. */
export function ResultList({ block, caption }: { block: ResultBlock; caption?: string }) {
  const top = Math.max(...block.rows.map((r) => r.votes), 1);
  return (
    <div className="el-result">
      <p className="el-result-h">
        <b>
          {RACE_NAMES[block.race]} · {block.year}
        </b>
        {caption ? <span className="dim"> · {caption}</span> : null}
      </p>
      <ul className="mb-results">
        {block.rows.map((r) => (
          <li key={r.name}>
            <span className="mb-results-n">
              {r.name}
              <span className="dim"> · {r.party ?? r.bloc}</span>
            </span>
            <span className="mb-results-bar" aria-hidden="true">
              <i style={{ width: `${(r.votes / top) * 100}%` }} />
            </span>
            <b>{votes(r.votes)}</b>
            <small className="dim">{share1(r.share)}</small>
          </li>
        ))}
      </ul>
      <p className="el-src">
        {block.tag ?? "Source not recorded"}
        {block.listedOnly ? " · shares of the candidates listed" : ""}
        {block.turnout !== null ? ` · turnout ${whole(block.turnout)}` : ""}
        {block.source?.url ? (
          <>
            {" · "}
            <a href={block.source.url} target="_blank" rel="noreferrer">
              the document
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}
```

  `src/components/gw/elections/AreaNumbers.tsx`:

```tsx
import { TODO_NAMES } from "@/lib/atlas";
import { share1, signedPoints, TODO_COLOURS, votes, whole, type AreaFigures } from "@/lib/atlas-view";

const DASH = "—";
const growth = (rate: number) => `${rate >= 0 ? "+" : "−"}${whole(Math.abs(rate))} since 2017`;

/** What to do here and why, then the area's five numbers. */
export function AreaNumbers({
  f,
  year,
  raceName,
  canSetSides,
  onSetup,
}: {
  f: AreaFigures;
  year: number;
  raceName: string;
  canSetSides: boolean;
  onSetup: () => void;
}) {
  return (
    <>
      {f.todo ? (
        <div className="el-todo" style={{ borderLeftColor: TODO_COLOURS[f.todo.todo] }}>
          <span className="el-chip" style={{ background: TODO_COLOURS[f.todo.todo] }}>
            {TODO_NAMES[f.todo.todo]}
          </span>
          <span>{f.todo.reason}</span>
          {f.todo.todo === "no-side" ? (
            canSetSides ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onSetup}>
                Set sides
              </button>
            ) : (
              <span className="dim">Ask the candidate or campaign manager to set it.</span>
            )
          ) : null}
        </div>
      ) : (
        <p className="f-note">
          No {raceName.toLowerCase()} result found here for {year} yet.
        </p>
      )}
      <div className="ladder fx2">
        <div>
          <span className="l">Our share</span>
          <span className="n stat">{f.ourShare === null ? DASH : share1(f.ourShare)}</span>
          <span className="s">
            {f.listedOnly ? "of the candidates listed" : f.margin === null ? DASH : `margin ${signedPoints(f.margin)}`}
          </span>
        </div>
        <div>
          <span className="l">Turnout</span>
          <span className="n stat">{f.turnout === null ? DASH : whole(f.turnout)}</span>
          <span className="s">{f.count?.registered ? `of ${votes(f.count.registered)} registered` : "not found yet"}</span>
        </div>
        <div>
          <span className="l">Swing</span>
          <span className="n stat">{f.swing === null ? DASH : signedPoints(f.swing)}</span>
          <span className="s">{f.yearBefore ? `since ${f.yearBefore}` : "no earlier result"}</span>
        </div>
        <div>
          <span className="l">Votes within reach</span>
          <span className="n stat">{f.reach ? votes(f.reach.total) : DASH}</span>
          <span className="s">
            {f.reach
              ? `${votes(f.reach.turnout)} from turnout, ${votes(f.reach.persuasion)} from a 5-point swing`
              : "needs a result and a side"}
          </span>
        </div>
        <div>
          <span className="l">Registered</span>
          <span className="n stat">{f.registered === null ? DASH : votes(f.registered)}</span>
          <span className="s">{f.growth && f.growth.rate !== null ? growth(f.growth.rate) : "the 2022 register"}</span>
        </div>
      </div>
      {f.tag ? <p className="el-src">{f.tag}</p> : null}
    </>
  );
}
```

  `src/components/gw/elections/PeopleCard.tsx`:

```tsx
import { votes, whole, type AreaFigures } from "@/lib/atlas-view";

/** Who lives here (estimates) against the register. */
export function PeopleCard({ f }: { f: AreaFigures }) {
  const p = f.population;
  const rows: [string, string][] = [
    ["People (estimate)", p ? votes(p.total) : "—"],
    ["Adults (estimate)", p ? votes(p.adults) : "—"],
    ["Aged 18–34, share of adults", p && p.adults ? whole(p.youngAdults / p.adults) : "—"],
    ["Registered voters (2022)", f.registered === null ? "—" : votes(f.registered)],
    ["Adults not registered (estimate)", f.notRegistered ? votes(f.notRegistered.adults) : "—"],
  ];
  return (
    <section className="card">
      <div className="card-head">
        <h2>Who lives here</h2>
        {p ? <span className="mono">WorldPop estimate · {p.year}</span> : null}
      </div>
      <div className="f-rows">
        {rows.map(([k, v]) => (
          <div className="f-row" key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {f.estimateBelowRegister ? (
        <p className="f-note">
          More people are registered here than the estimate has adults: people often register where they
          work, and the estimate is rough at this size. It can't say who isn't registered here.
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Notes and setup.** `src/components/gw/elections/NoteBox.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { deleteNote, saveNote } from "@/lib/atlas.functions";
import type { AtlasNote } from "@/lib/atlas-view";

/** The team's note on a place: read by the team, written by the candidate or manager. */
export function NoteBox({ area, name, note, canEdit }: { area: string; name: string; note: AtlasNote | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note?.body ?? "");
  const qc = useQueryClient();
  const save = useServerFn(saveNote);
  const remove = useServerFn(deleteNote);
  const done = async (message: string) => {
    await qc.invalidateQueries({ queryKey: ["atlas"] });
    setEditing(false);
    toast.success(message);
  };
  const saving = useMutation({
    mutationFn: () => save({ data: { area, body } }),
    onSuccess: () => done("Note saved."),
    onError: (e: Error) => toast.error(e.message),
  });
  const removing = useMutation({
    mutationFn: () => remove({ data: { area } }),
    onSuccess: () => {
      setBody("");
      return done("Note removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="card el-note">
      <div className="card-head">
        <h2>The team's note on {name}</h2>
      </div>
      {editing ? (
        <>
          <label className="sr" htmlFor="el-note-body">
            Note
          </label>
          <textarea id="el-note-body" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="f-note">
            Notes are about places: communities, languages used locally, churches, associations, local leaders.
            Never about a person's tribe.
          </p>
          <div className="mb-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={saving.isPending || !body.trim()}
              onClick={() => saving.mutate()}
            >
              Save note
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setBody(note?.body ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : note ? (
        <>
          <p className="el-note-body">{note.body}</p>
          <p className="meta">
            Updated {new Date(note.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {canEdit ? (
            <div className="mb-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setBody(note.body);
                  setEditing(true);
                }}
              >
                Edit
              </button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={removing.isPending} onClick={() => removing.mutate()}>
                Remove
              </button>
            </div>
          ) : null}
        </>
      ) : canEdit ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
          Add a note about this place
        </button>
      ) : (
        <p className="f-note">No note yet. The candidate or campaign manager can add one.</p>
      )}
    </section>
  );
}
```

  `src/components/gw/elections/SetupPanel.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { RACE_NAMES } from "@/components/gw/elections/ResultList";
import type { Race } from "@/lib/atlas";
import { ATLAS_ELECTIONS } from "@/lib/atlas-files";
import { saveHome, saveSide } from "@/lib/atlas.functions";
import { blocsIn, type AtlasData } from "@/lib/atlas-view";

type Job = { kind: "home"; area: string } | { kind: "side"; election: string; bloc: string | null };

const label = (election: string) => `${election.slice(0, 4)} · ${RACE_NAMES[election.slice(5) as Race]}`;

/** The candidate's or manager's one-time setup: where Elections opens, and our side in each election. */
export function SetupPanel({ d, home, onClose }: { d: AtlasData; home: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toHome = useServerFn(saveHome);
  const toSide = useServerFn(saveSide);
  const run = useMutation({
    mutationFn: (job: Job) =>
      job.kind === "home"
        ? toHome({ data: { area: job.area } })
        : toSide({ data: { election: job.election, bloc: job.bloc } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["atlas"] });
      toast.success("Saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const name = new Map(d.areas.map((a) => [a.key, a.name]));
  const places = d.areas.filter((a) => a.level !== "ward");
  const elections = [...ATLAS_ELECTIONS].reverse().filter((e) => blocsIn(d, e).length);
  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="el-setup-title">
      <div className="pb re-panel">
        <div className="pb-head">
          <div>
            <span className="eyebrow">Elections · setup</span>
            <h2 id="el-setup-title">Your home area and sides</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <section className="card">
            <div className="card-head">
              <h2>Home area</h2>
            </div>
            <p className="meta">Where Elections opens: your constituency, your county or Kenya.</p>
            <select value={home} onChange={(e) => run.mutate({ kind: "home", area: e.target.value })} aria-label="Home area">
              {places.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                  {a.level === "constituency" && a.parent ? `, ${name.get(a.parent) ?? ""}` : ""}
                </option>
              ))}
            </select>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Our side in each election</h2>
            </div>
            <p className="meta">
              Which bloc counts as yours in each past election. Politics has moved since, so you decide; lean,
              swing and what to do need it.
            </p>
            <div className="f-rows">
              {elections.map((e) => (
                <div className="f-row" key={e}>
                  <span>{label(e)}</span>
                  <select
                    value={d.sides[e] ?? ""}
                    onChange={(ev) => run.mutate({ kind: "side", election: e, bloc: ev.target.value || null })}
                    aria-label={`Our side, ${label(e)}`}
                  >
                    <option value="">Not set</option>
                    {blocsIn(d, e).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The three pages.** `src/components/gw/elections/CountyView.tsx` (also Kenya's):

```tsx
import { AreaMap } from "@/components/gw/elections/AreaMap";
import { AreaNumbers } from "@/components/gw/elections/AreaNumbers";
import { RACE_NAMES, ResultList } from "@/components/gw/elections/ResultList";
import { TODO_NAMES, type Race } from "@/lib/atlas";
import {
  figuresFor,
  rankChildren,
  resultBlocks,
  shadeOf,
  share1,
  signedPoints,
  TODO_COLOURS,
  votes,
  whole,
  type AtlasArea,
  type AtlasData,
} from "@/lib/atlas-view";
import type { Shade } from "@/lib/elections-view";

const SHADE_NAMES: Record<Shade, string> = { todo: "what to do", lean: "lean", turnout: "turnout", swing: "swing" };

/** A county (or Kenya): its result, its map, and its parts ranked by the votes within reach. */
export function CountyView({
  d,
  area,
  race,
  year,
  shade,
  canEdit,
  onArea,
  onSetup,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  shade: Shade;
  canEdit: boolean;
  onArea: (key: string) => void;
  onSetup: () => void;
}) {
  const own = figuresFor(d, area.key, race, year);
  const parts = rankChildren(d, area.key, race, year);
  const block = resultBlocks(d, area.key, [race]).find((b) => b.year === year) ?? null;
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const constituencyOf = (wardKey: string) => wardKey.split("/").slice(0, 2).join("/");
  const colourOf = (wardKey: string) => {
    const part = byKey.get(constituencyOf(wardKey));
    return part ? (shadeOf(part, shade)?.colour ?? null) : null;
  };
  const tags = [...new Set(parts.map((p) => p.tag).filter((t): t is string => Boolean(t)))];
  return (
    <>
      <AreaNumbers f={own} year={year} raceName={RACE_NAMES[race]} canSetSides={canEdit} onSetup={onSetup} />
      <div className="el-grid">
        <section className="card">
          <div className="card-head">
            <h2>
              {RACE_NAMES[race]}, {year}
            </h2>
          </div>
          {block ? (
            <ResultList block={block} />
          ) : (
            <p className="f-note">
              No {area.level === "country" ? "national" : "county"} {RACE_NAMES[race].toLowerCase()} result found for {year} yet.
            </p>
          )}
        </section>
        {area.level === "county" ? (
          <section className="card">
            <div className="card-head">
              <h2>By constituency</h2>
              <span className="mono">shaded by {SHADE_NAMES[shade]}</span>
            </div>
            <AreaMap
              county={area.key}
              focus={area.key}
              colourOf={colourOf}
              onPick={(wardKey) => onArea(constituencyOf(wardKey))}
              label={`${area.name} by constituency, shaded by ${SHADE_NAMES[shade]}`}
            />
            <p className="meta">Tap a constituency to open it.</p>
          </section>
        ) : null}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Where votes can move</h2>
          <span className="mono">
            {parts.length} {area.level === "country" ? "counties" : "constituencies"}
          </span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{area.level === "country" ? "County" : "Constituency"}</th>
                <th>What to do</th>
                <th style={{ textAlign: "right" }}>Our share</th>
                <th style={{ textAlign: "right" }}>Turnout</th>
                <th style={{ textAlign: "right" }}>Swing</th>
                <th style={{ textAlign: "right" }}>Within reach</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.key}>
                  <td>
                    <button type="button" className="vt-link" onClick={() => onArea(p.key)}>
                      {p.name}
                    </button>
                  </td>
                  <td>
                    {p.todo ? (
                      <>
                        <span className="el-chip" style={{ background: TODO_COLOURS[p.todo.todo] }}>
                          {TODO_NAMES[p.todo.todo]}
                        </span>
                        <br />
                        <span className="meta">{p.todo.reason}</span>
                      </>
                    ) : (
                      <span className="meta">not found yet</span>
                    )}
                  </td>
                  <td className="num">
                    {p.ourShare === null ? "—" : share1(p.ourShare)}
                    {p.listedOnly ? "*" : ""}
                  </td>
                  <td className="num">{p.turnout === null ? "—" : whole(p.turnout)}</td>
                  <td className="num">{p.swing === null ? "—" : signedPoints(p.swing)}</td>
                  <td className="num">{p.reach ? votes(p.reach.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parts.some((p) => p.listedOnly) ? (
          <p className="f-note">* Share of the candidates listed: the report gave no total of valid votes.</p>
        ) : null}
        {tags.length ? <p className="el-src">{tags.join(" · ")}</p> : null}
      </section>
    </>
  );
}
```

  `src/components/gw/elections/ConstituencyView.tsx`:

```tsx
import { AreaMap } from "@/components/gw/elections/AreaMap";
import { AreaNumbers } from "@/components/gw/elections/AreaNumbers";
import { NoteBox } from "@/components/gw/elections/NoteBox";
import { PeopleCard } from "@/components/gw/elections/PeopleCard";
import { RACE_NAMES, ResultList } from "@/components/gw/elections/ResultList";
import { RACES, type Race } from "@/lib/atlas";
import { figuresFor, resultBlocks, votes, whole, type AtlasArea, type AtlasData } from "@/lib/atlas-view";

const FOCUS = "hsl(158 40% 40%)";

/** A constituency: its numbers, every result found here, who lives here, its wards and the team's note. */
export function ConstituencyView({
  d,
  area,
  race,
  year,
  canEdit,
  onArea,
  onSetup,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  canEdit: boolean;
  onArea: (key: string) => void;
  onSetup: () => void;
}) {
  const f = figuresFor(d, area.key, race, year);
  const blocks = resultBlocks(d, area.key, [race, ...RACES.filter((r) => r !== race)]);
  const wards = d.areas.filter((a) => a.parent === area.key).map((w) => figuresFor(d, w.key, race, year));
  const missing = RACES.filter((r) => !blocks.some((b) => b.race === r)).map((r) => RACE_NAMES[r]);
  return (
    <>
      <AreaNumbers f={f} year={year} raceName={RACE_NAMES[race]} canSetSides={canEdit} onSetup={onSetup} />
      <div className="el-grid">
        <section className="card">
          <div className="card-head">
            <h2>Results here</h2>
          </div>
          {blocks.map((b) => (
            <ResultList key={`${b.race}-${b.year}`} block={b} />
          ))}
          {missing.length ? (
            <p className="f-note">Not found yet for {area.name}: {missing.join(", ")}.</p>
          ) : null}
        </section>
        <div className="el-side">
          <PeopleCard f={f} />
          {area.parent ? (
            <section className="card">
              <AreaMap
                county={area.parent}
                focus={area.key}
                colourOf={(k) => (k.startsWith(`${area.key}/`) ? FOCUS : null)}
                onPick={(k) => onArea(k.startsWith(`${area.key}/`) ? k : k.split("/").slice(0, 2).join("/"))}
                label={`${area.name}'s wards`}
              />
            </section>
          ) : null}
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Its wards</h2>
          <span className="mono">{wards.length} wards</span>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ward</th>
                <th style={{ textAlign: "right" }}>Registered 2022</th>
                <th style={{ textAlign: "right" }}>Adults (estimate)</th>
                <th style={{ textAlign: "right" }}>Aged 18–34</th>
                <th style={{ textAlign: "right" }}>Not registered (estimate)</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => (
                <tr key={w.key}>
                  <td>
                    <button type="button" className="vt-link" onClick={() => onArea(w.key)}>
                      {w.name}
                    </button>
                  </td>
                  <td className="num">{w.registered === null ? "—" : votes(w.registered)}</td>
                  <td className="num">{w.population ? votes(w.population.adults) : "—"}</td>
                  <td className="num">
                    {w.population && w.population.adults ? whole(w.population.youngAdults / w.population.adults) : "—"}
                  </td>
                  <td className="num">
                    {w.notRegistered ? votes(w.notRegistered.adults) : w.estimateBelowRegister ? "below the register" : "—"}
                  </td>
                  <td className="meta">{d.notes[w.key] ? "yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <NoteBox area={area.key} name={area.name} note={d.notes[area.key] ?? null} canEdit={canEdit} />
    </>
  );
}
```

  `src/components/gw/elections/WardView.tsx`:

```tsx
import { AreaMap } from "@/components/gw/elections/AreaMap";
import { NoteBox } from "@/components/gw/elections/NoteBox";
import { PeopleCard } from "@/components/gw/elections/PeopleCard";
import { RACE_NAMES, ResultList } from "@/components/gw/elections/ResultList";
import type { Race } from "@/lib/atlas";
import { figuresFor, resultBlocks, type AtlasArea, type AtlasData } from "@/lib/atlas-view";

/** A ward: who lives here, its constituency's result (labelled as such), and the team's note. */
export function WardView({
  d,
  area,
  race,
  year,
  canEdit,
}: {
  d: AtlasData;
  area: AtlasArea;
  race: Race;
  year: number;
  canEdit: boolean;
}) {
  const f = figuresFor(d, area.key, race, year);
  const parent = d.areas.find((a) => a.key === area.parent);
  const blocks = parent ? resultBlocks(d, parent.key, [race]) : [];
  const county = area.key.split("/")[0] ?? "";
  return (
    <>
      <div className="el-grid">
        <PeopleCard f={f} />
        <section className="card">
          <div className="card-head">
            <h2>
              {parent?.name ?? "Its constituency"}: {RACE_NAMES[race]}
            </h2>
            <span className="mono">constituency figure</span>
          </div>
          {blocks.map((b) => (
            <ResultList key={b.year} block={b} caption="constituency figure" />
          ))}
          {blocks.length ? null : (
            <p className="f-note">
              No {RACE_NAMES[race].toLowerCase()} result found for {parent?.name ?? "its constituency"} yet.
            </p>
          )}
          <p className="meta">Results for the ward itself come with the station data.</p>
        </section>
      </div>
      <section className="card">
        <AreaMap
          county={county}
          focus={area.key}
          colourOf={(k) => (k === area.key ? "hsl(158 40% 40%)" : null)}
          label={`${area.name} ward`}
        />
      </section>
      <NoteBox area={area.key} name={`${area.name} ward`} note={d.notes[area.key] ?? null} canEdit={canEdit} />
    </>
  );
}
```

- [ ] **Step 4: The route** `src/routes/_authenticated/elections.tsx`:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";

import { ConstituencyView } from "@/components/gw/elections/ConstituencyView";
import { CountyView } from "@/components/gw/elections/CountyView";
import { RACE_NAMES } from "@/components/gw/elections/ResultList";
import { SetupPanel } from "@/components/gw/elections/SetupPanel";
import { WardView } from "@/components/gw/elections/WardView";
import { useAccess } from "@/hooks/useAccess";
import { RACES, YEARS, type Race } from "@/lib/atlas";
import { getAtlas } from "@/lib/atlas.functions";
import {
  crumbsTo,
  defaultRace,
  homeAreaFor,
  nextElectionsSearch,
  SHADES,
  validateElectionsSearch,
  type ElectionsChanges,
  type Shade,
} from "@/lib/elections-view";

const ABOUT = "Three elections down to the constituency, who lives where, and where votes can move.";

export const Route = createFileRoute("/_authenticated/elections")({
  component: Elections,
  // ?area=nairobi/westlands&race=mp&year=2017&shade=swing: the place and race on show, so a link opens it.
  validateSearch: validateElectionsSearch,
  head: () => ({
    meta: [
      { title: "Elections · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Elections · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SHADE_NAMES: Record<Shade, string> = { todo: "What to do", lean: "Lean", turnout: "Turnout", swing: "Swing" };

function Elections() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { campaign, isPrincipal } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data, isError, refetch } = useQuery({ queryKey: ["atlas"], queryFn: () => fetchAtlas() });
  const [setup, setSetup] = useState(false);

  const go = (changes: ElectionsChanges) =>
    void navigate({
      search: (prev) => nextElectionsSearch(prev, changes),
      // A new place is a step Back can undo, and starts at the top; a switch is neither.
      replace: !("area" in changes),
      resetScroll: "area" in changes,
    });

  if (isError)
    return (
      <section className="view active" aria-label="Elections">
        <div className="card">
          <h2>Couldn't load the election atlas.</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </section>
    );
  if (!data)
    return (
      <section className="view active" aria-label="Elections">
        <div className="vh">
          <div>
            <span className="eyebrow">Elections</span>
            <h1>Loading the atlas…</h1>
          </div>
        </div>
      </section>
    );

  const home = homeAreaFor(campaign, data.homeArea, data.areas);
  const key = search.area ?? home;
  const area = data.areas.find((a) => a.key === key);
  const race: Race = search.race ?? defaultRace(campaign?.level);
  const year = search.year ?? 2022;
  const shade: Shade = search.shade ?? "todo";

  if (!area) {
    const counties = data.areas.filter((a) => a.level === "county");
    return (
      <section className="view active" aria-label="Elections">
        <div className="card">
          <h2>Not loaded yet</h2>
          <p>
            The atlas doesn't hold “{key}” yet. It holds{" "}
            {counties.map((c, i) => (
              <Fragment key={c.key}>
                {i ? ", " : ""}
                <button type="button" className="vt-link" onClick={() => go({ area: c.key })}>
                  {c.name}
                </button>
              </Fragment>
            ))}{" "}
            and Kenya's national totals.
          </p>
        </div>
      </section>
    );
  }

  const crumbs = crumbsTo(data.areas, key);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <section className="view active el" aria-label="Elections">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Elections · 2013, 2017 and 2022</span>
          <h1>{area.name}</h1>
          {crumbs.length > 1 ? (
            <nav className="crumbs" aria-label="Area">
              {crumbs.slice(0, -1).map((c) => (
                <Fragment key={c.key}>
                  <button type="button" onClick={() => go({ area: c.key })}>
                    {c.name}
                  </button>
                  <span className="sep">/</span>
                </Fragment>
              ))}
              <b aria-current="page">{area.name}</b>
            </nav>
          ) : null}
        </div>
        <div className="vh-side el-actions">
          {area.level === "constituency" ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>
              Print brief
            </button>
          ) : null}
          {isPrincipal ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSetup(true)}>
              Home area and sides
            </button>
          ) : null}
        </div>
      </div>
      <div className="el-switches">
        <div className="seg" role="group" aria-label="Race">
          {RACES.map((r) => (
            <button key={r} type="button" aria-pressed={race === r} onClick={() => go({ race: r })}>
              {RACE_NAMES[r]}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Year">
          {YEARS.map((y) => (
            <button key={y} type="button" aria-pressed={year === y} onClick={() => go({ year: y })}>
              {y}
            </button>
          ))}
        </div>
        {area.level === "county" ? (
          <div className="seg" role="group" aria-label="Shade the map by">
            {SHADES.map((s) => (
              <button key={s} type="button" aria-pressed={shade === s} onClick={() => go({ shade: s })}>
                {SHADE_NAMES[s]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {area.level === "constituency" ? (
        <ConstituencyView
          d={data}
          area={area}
          race={race}
          year={year}
          canEdit={isPrincipal}
          onArea={(k) => go({ area: k })}
          onSetup={() => setSetup(true)}
        />
      ) : area.level === "ward" ? (
        <WardView d={data} area={area} race={race} year={year} canEdit={isPrincipal} />
      ) : (
        <CountyView
          d={data}
          area={area}
          race={race}
          year={year}
          shade={shade}
          canEdit={isPrincipal}
          onArea={(k) => go({ area: k })}
          onSetup={() => setSetup(true)}
        />
      )}
      <p className="el-print-only">
        Prepared with Groundwork on {today}. Every figure names its document; estimates are labelled.
      </p>
      {setup ? <SetupPanel d={data} home={home} onClose={() => setSetup(false)} /> : null}
    </section>
  );
}
```

  If TypeScript rejects the function form of `search` in `navigate`, use
  `search: nextElectionsSearch(search, changes)`.

- [ ] **Step 5: Styles.** Append to `src/styles/groundwork.css`:

```css
/* Elections: the switches, what to do, the results, the map, notes, and the printed brief */
.el-switches { display:flex; flex-wrap:wrap; gap:10px; margin:6px 0 16px; }
.el-actions { flex-direction:row; flex-wrap:wrap; justify-content:flex-end; align-items:center; }
.el-grid { display:grid; grid-template-columns:minmax(0, 1.2fr) minmax(0, 1fr); gap:14px; margin:14px 0; }
.el-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
.el-todo { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px 14px; border:1px solid var(--border); border-left-width:4px; border-radius:12px; background:var(--card); margin-bottom:14px; }
.el-chip { display:inline-block; padding:2px 9px; border-radius:999px; color:#fff; font-size:11.5px; font-weight:600; }
.el-src { font-size:11.5px; color:var(--muted-foreground); margin:8px 0 0; }
.el-result + .el-result { margin-top:16px; padding-top:14px; border-top:1px solid var(--border); }
.el-result-h { margin:0 0 8px; }
.el-map { width:100%; height:auto; display:block; }
.el-note textarea { width:100%; font:inherit; padding:10px; border:1px solid var(--border); border-radius:10px; background:var(--card); color:inherit; }
.el-note-body { white-space:pre-wrap; margin:0 0 6px; }
.el-print-only { display:none; }
@media (max-width:1100px) {
  .el-grid { grid-template-columns:1fr; }
  .el-actions { justify-content:flex-start; }
}
@media print {
  .sb, .topbar, .el-actions, .el-switches, .el-note .mb-actions, .el-map + .meta { display:none !important; }
  .main { margin-left:0 !important; padding:0 !important; }
  .el-print-only { display:block; font-size:11px; color:#555; }
  .card { break-inside:avoid; box-shadow:none; }
}
```

- [ ] **Step 6: Run** `npm test`, typecheck, build. Lint the new files (`--fix`).
- [ ] **Step 7: Commit** `Elections: county, constituency and ward pages, setup, notes and a printable brief`.

---

### Task 6: In the menu, for the team

**Files:**
- Modify: `src/components/gw/ConsoleShell.tsx`, `tests/access.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `tests/access.test.ts` (before its summary
      line):

```ts
eq("the team opens Elections; agents don't", [canOpen("organiser", "/elections"), canOpen("manager", "/elections"), canOpen("agent", "/elections")], [
  true,
  true,
  false,
]);
```

- [ ] **Step 2: Run** it. Expected: PASS already (agents are kept to their field pages and the team
      opens any other page) — a test that guards the rule rather than drives new code; note that
      in the ledger.
- [ ] **Step 3: The menu.** In `ConsoleShell.tsx` GROUPS, Operate, after Voters:
      `{ to: "/elections", label: "Elections", faint: "ATLAS" },`.
- [ ] **Step 4: Run** `npm test`, typecheck, build; lint the changed files (counts must not rise).
- [ ] **Step 5: Commit** `Elections in the menu, for the team`.

---

### Task 7: Look at it

**Files:** none in the repository (the harness lives in the scratchpad).

- [ ] **Step 1: The harness.** In the scratchpad harness (rebuild it if the scratchpad was
      cleared): register `/elections`; a stand-in `atlas.functions` whose `getAtlas` returns the
      repository's real figures (convert `data/atlas` with `readAtlas` into the `AtlasData`
      shape once, into a JSON file the mock imports) and whose saves update that in memory;
      `useAccess` switchable between Sakaja (governor, manager) and Mathira (MP, candidate) and an
      organiser.
- [ ] **Step 2: Check, at desktop width and at 375px:**
  1. Sakaja opens on Nairobi with the governor race and 2022: the county result, the map
     shaded by what to do (after setting sides), the ranking with reasons, tags and the
     "candidates listed" asterisk on press figures.
  2. Before any side is set, what to do says "Set your side in 2022 first"; the manager sets
     Kenya Kwanza for 2022 governor and the page fills in.
  3. Westlands: the 2022 MP result (The Star), the 2022 governor result, who lives here, its
     wards with registers and estimates (and "below the register" where it is), the note box.
  4. A ward (Kangemi): people and register, Westlands' governor result labelled "constituency
     figure".
  5. Mathira's candidate opens on Mathira with the MP race; the MP result says not found yet;
     the presidential result shows The Star's figures.
  6. Switching race and year keeps the scroll; picking a place goes to the top; a reload keeps
     the place.
  7. `?area=mombasa` says "Not loaded yet" and links Nairobi and Nyeri.
  8. An organiser sees no setup button and no note editing.
  9. Print preview of a constituency hides the menu and buttons (check with the browser's
     print emulation or the stylesheet).
  10. No console errors; no sideways scroll at 375px.
- [ ] **Step 3:** Fix anything found (each fix with its own test where it is a rule); reset the
      viewport and stop the preview.
