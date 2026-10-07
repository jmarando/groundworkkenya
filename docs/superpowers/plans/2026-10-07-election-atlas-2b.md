# Election atlas, part 2b: the atlas across the app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The same election figures where the team already works: Home's race section shows the
last result from the atlas and the places where votes can move; Voters shades its county map by
how places voted and says what happened last time in the area on show; each diary stop in a ward
carries a one-line brief; the war room puts each constituency's 2022 turnout beside today's.

**Architecture:** One pure module, `src/lib/atlas-app.ts`, holds every rule the screens share:
where a campaign ward or a Voters area sits in the atlas, the last count of the campaign's race
there, a diary brief, Home's top places, 2022 turnout, and turnout at the stations reported so
far. The map key (`shadeLegend`) joins `shadeOf` in `src/lib/atlas-view.ts`. Screens read the
atlas through the same React Query key as Elections (`["atlas"]`, `getAtlas`), so a visit to one
fills the others.

**Tech Stack:** TanStack Router and Start, React Query, MapLibre (Voters' map), tsx tests with
the fake Supabase.

**Spec:** `docs/superpowers/specs/2026-10-07-election-atlas-design.md`, section 6 (Across the
app), Errors, Testing. Builds on part 2a (`2026-10-07-election-atlas-2a.md`).

## Global Constraints

- Work on `election-atlas`; nothing is pushed or merged without the user's OK; migrations before
  code; never rewrite pushed history (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint only new or changed lines; in files with older lint errors the count must not rise. Test
  first for every rule; `npm test` runs every `tests/*.test.ts`, then the SQL tests.
- No new tables or migrations: everything here reads the atlas (schema 22) and existing tables.
- A ward has no results of its own until station data: it shows its constituency's figures,
  labelled with the constituency's name. A missing figure shows "—" or "not found yet", never 0.
- Until the campaign sets its side for an election, nothing says "to us": lines show the leading
  bloc instead, and Home says where to set the side.
- Nothing records or infers a person's ethnicity.
- Copy is plain English.

## Review Focus

1. A diary stop in a ward the atlas doesn't hold (a typo'd constituency, or another county): no
   brief, no crash. Test: Task 1 ("a place the atlas doesn't hold").
2. A Mathira (MP) campaign, whose 2022 MP result isn't loaded: Home says so and links to
   Elections; Voters' line says not found; no "to us" anywhere. Test: Task 1 ("no count here").
3. A constituency where the 2022 governor turnout isn't loaded but the presidential one is: the
   war room shows the presidential figure and says so. Test: Task 1 ("the same day's other race").
4. A war room before any station reports: today's turnout is "—", not 0%. Test: Task 1
   ("before any station reports").

---

### Task 1: The rules the screens share

**Files:**
- Create: `src/lib/atlas-app.ts`
- Modify: `src/lib/atlas-view.ts` (`shadeLegend`, shared colour stops)
- Test: `tests/atlas-app.test.ts`

**Interfaces:** Produces `wardKey`, `votersKey`, `latestYear`, `lastHere` (`LastHere`),
`briefLine`, `topMoves`, `turnout2022`, `reportedTurnout`, and `shadeLegend` (atlas-view).

- [ ] **Step 1: Write the failing test** `tests/atlas-app.test.ts`:

```ts
// Checks for the atlas across the app: where a campaign's ward or a Voters
// area sits in the atlas, the last count there, a diary stop's brief, Home's
// places where votes can move, 2022 turnout, today's turnout so far, and the
// map key. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-app.test.ts

import {
  briefLine,
  lastHere,
  reportedTurnout,
  topMoves,
  turnout2022,
  votersKey,
  wardKey,
} from "@/lib/atlas-app";
import { shadeLegend, type AtlasData } from "@/lib/atlas-view";

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

const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/westlands", level: "constituency", name: "Westlands", parent: "nairobi" },
    { key: "nairobi/kibra", level: "constituency", name: "Kibra", parent: "nairobi" },
    { key: "nairobi/westlands/kangemi", level: "ward", name: "Kangemi", parent: "nairobi/westlands" },
    { key: "nyeri", level: "county", name: "Nyeri", parent: "kenya" },
    { key: "nyeri/mathira", level: "constituency", name: "Mathira", parent: "nyeri" },
    { key: "nyeri/mathira/iriaini", level: "ward", name: "Iriaini", parent: "nyeri/mathira" },
  ],
  candidates: [
    { id: "g-s", election: "2022-governor", seat: "nairobi", name: "Sakaja", party: "UDA", bloc: "Kenya Kwanza" },
    { id: "g-i", election: "2022-governor", seat: "nairobi", name: "Igathe", party: "Jubilee", bloc: "Azimio" },
  ],
  results: [
    { candidate: "g-s", area: "nairobi/westlands", votes: 240, source: "iebc" },
    { candidate: "g-i", area: "nairobi/westlands", votes: 225, source: "iebc" },
    { candidate: "g-s", area: "nairobi/kibra", votes: 280, source: "star" },
    { candidate: "g-i", area: "nairobi/kibra", votes: 120, source: "star" },
  ],
  turnout: [
    { election: "2022-governor", area: "nairobi/westlands", registered: 1000, cast: 505, rejected: 5, valid: 500, source: "iebc" },
    { election: "2022-president", area: "nairobi/kibra", registered: 800, cast: 410, rejected: 10, valid: 400, source: "iebc" },
  ],
  register: [],
  population: [],
  sources: [
    { id: "iebc", title: "Form 37B (test)", publisher: "IEBC", url: null, note: null },
    { id: "star", title: "A tally", publisher: "The Star", url: null, note: null },
  ],
  homeArea: null,
  sides: { "2022-governor": "Kenya Kwanza" },
  notes: {},
};
const NO_SIDE: AtlasData = { ...D, sides: {} };

eq(
  "a campaign ward's place: the ward, else its constituency, else nothing",
  [wardKey(D, "Westlands", "kangemi"), wardKey(D, "Westlands", "parklands"), wardKey(D, "Nowhere", "kangemi"), wardKey(D, null, "kangemi")],
  ["nairobi/westlands/kangemi", "nairobi/westlands", null, null],
);
const wards = [{ slug: "kangemi", constituency: "Westlands" }];
eq(
  "a Voters area's place: the top is the home area",
  [
    votersKey(D, { level: "county" }, wards, "nairobi"),
    votersKey(D, { level: "constituency", name: "Westlands" }, wards, "nairobi"),
    votersKey(D, { level: "ward", slug: "kangemi" }, wards, "nairobi"),
    votersKey(D, { level: "ward", slug: "unknown" }, wards, "nairobi"),
  ],
  ["nairobi", "nairobi/westlands", "nairobi/westlands/kangemi", null],
);
const k = lastHere(D, "nairobi/westlands/kangemi", "governor");
eq(
  "a ward's last count is its constituency's",
  [k?.at, k?.year, k?.share, k?.todo, k?.constituencyFigure],
  ["nairobi/westlands", 2022, "48.0% to us", "persuade", true],
);
eq("without a side, the leading bloc", lastHere(NO_SIDE, "nairobi/westlands", "governor")?.share, "Kenya Kwanza 48.0%");
eq("no count here", [lastHere(D, "nyeri/mathira", "mp"), lastHere(D, "nyeri/mathira/iriaini", "governor")], [null, null]);
eq(
  "a diary stop's brief",
  [
    briefLine(D, "nairobi/westlands/kangemi", "governor"),
    briefLine(NO_SIDE, "nairobi/westlands", "governor"),
    briefLine(D, "nairobi/kibra", "governor"),
  ],
  [
    "Persuade: 48.0% to us in 2022, turnout 51% (Westlands)",
    "Kenya Kwanza 48.0% in 2022, turnout 51%",
    "Hold: 70.0% to us in 2022",
  ],
);
eq("a place the atlas doesn't hold", [briefLine(D, null, "governor"), briefLine(D, "mombasa/x", "governor")], [null, null]);
eq(
  "where votes can move: most within reach first, a side set",
  [topMoves(D, "nairobi", "governor").map((f) => f.key), topMoves(D, "nairobi", "governor", 1).map((f) => f.key), topMoves(NO_SIDE, "nairobi", "governor")],
  [["nairobi/westlands", "nairobi/kibra"], ["nairobi/westlands"], []],
);
eq(
  "2022 turnout: the campaign's race, else the same day's other race",
  [turnout2022(D, "nairobi/westlands", "governor"), turnout2022(D, "nairobi/kibra", "governor"), turnout2022(D, "nairobi", "governor"), turnout2022(D, null, "governor")],
  [{ turnout: 0.505, race: "governor" }, { turnout: 0.5125, race: "president" }, null, null],
);
eq(
  "turnout at the stations reported so far",
  [
    reportedTurnout([
      { registered: 500, cast: 300, reported: true },
      { registered: 400, cast: 0, reported: false },
      { registered: 0, cast: 5, reported: true },
    ]),
    reportedTurnout([{ registered: 500, cast: 0, reported: false }]),
  ],
  [0.6, null],
);
eq("before any station reports", reportedTurnout([]), null);
eq(
  "the map key",
  [shadeLegend("todo").map((l) => l.label), shadeLegend("lean").map((l) => l.colour), shadeLegend("swing").map((l) => l.label)],
  [
    ["Mobilise", "Hold", "Persuade", "Cut the gap", "Lean ours", "Lean theirs"],
    ["hsl(0 70% 52%)", "hsl(40 90% 52%)", "hsl(142 60% 38%)"],
    ["15 points or more away", "No change", "15 points or more our way"],
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/atlas-app.ts`:

```ts
// The atlas across the app: where a campaign's ward or a Voters area sits in
// the atlas, the last count of the campaign's race there, the one-line brief
// on a diary stop, Home's places where votes can move, 2022 turnout beside
// the war room's, and turnout at the stations reported so far. Pure.

import { blocShares, RACES, TODO_NAMES, YEARS, type Race, type Todo } from "@/lib/atlas";
import { slugify } from "@/lib/atlas-files";
import {
  countAt,
  electionOf,
  figuresFor,
  rankChildren,
  share1,
  whole,
  type AreaFigures,
  type AtlasData,
} from "@/lib/atlas-view";

type Areas = Pick<AtlasData, "areas">;

/** A campaign ward's place in the atlas: the ward, else its constituency; null when neither is loaded. */
export function wardKey(d: Areas, constituency: string | null, slug: string | null): string | null {
  const c = constituency ? slugify(constituency) : "";
  if (!c) return null;
  const ward = slug
    ? d.areas.find((a) => a.level === "ward" && a.key.endsWith(`/${c}/${slug}`))
    : undefined;
  return (
    ward?.key ??
    d.areas.find((a) => a.level === "constituency" && a.key.endsWith(`/${c}`))?.key ??
    null
  );
}

export type VotersPlace =
  | { level: "county" }
  | { level: "constituency"; name: string }
  | { level: "ward"; slug: string };

/** Where a Voters area sits in the atlas; Voters' top level is the campaign's home area. */
export function votersKey(
  d: Areas,
  place: VotersPlace,
  wards: { slug: string; constituency: string }[],
  home: string,
): string | null {
  if (place.level === "county") return home;
  if (place.level === "constituency") return wardKey(d, place.name, null);
  const w = wards.find((x) => x.slug === place.slug);
  return w ? wardKey(d, w.constituency, w.slug) : null;
}

/** The latest year with a count of the race at the area; null when none. */
export function latestYear(d: AtlasData, key: string, race: Race): number | null {
  return (
    [...YEARS].reverse().find((y) => countAt(d, electionOf(race, y), key)?.candidates.length) ??
    null
  );
}

export type LastHere = {
  /** Where the figures are from: the place, or a ward's constituency. */
  at: string;
  year: number;
  f: AreaFigures;
  /** "48.0% to us" with a side set, else the leading bloc's share. */
  share: string;
  todo: Todo | null;
  /** A ward showing its constituency's figures. */
  constituencyFigure: boolean;
};

/** The last count of the campaign's race at a place: its own, or a ward's constituency's. */
export function lastHere(d: AtlasData, key: string, race: Race): LastHere | null {
  const area = d.areas.find((a) => a.key === key);
  if (!area) return null;
  const at = area.level === "ward" && area.parent ? area.parent : key;
  const year = latestYear(d, at, race);
  if (year === null) return null;
  const f = figuresFor(d, at, race, year);
  const top = f.count ? blocShares(f.count)[0] : undefined;
  const sided = f.ourShare !== null && f.todo?.todo !== "no-side";
  return {
    at,
    year,
    f,
    share: sided
      ? `${share1(f.ourShare!)} to us`
      : top
        ? `${top.bloc} ${share1(top.share)}`
        : "—",
    todo: f.todo?.todo ?? null,
    constituencyFigure: at !== key,
  };
}

/** A diary stop's line: "Persuade: 48.0% to us in 2022, turnout 51% (Westlands)". */
export function briefLine(d: AtlasData, key: string | null, race: Race): string | null {
  const l = key ? lastHere(d, key, race) : null;
  if (!l) return null;
  const head = l.todo && l.todo !== "no-side" ? `${TODO_NAMES[l.todo]}: ` : "";
  const turnout = l.f.turnout === null ? "" : `, turnout ${whole(l.f.turnout)}`;
  const where = l.constituencyFigure
    ? ` (${d.areas.find((a) => a.key === l.at)?.name ?? "its constituency"})`
    : "";
  return `${head}${l.share} in ${l.year}${turnout}${where}`;
}

/** Home's places where votes can move: the home area's parts with the most within reach, a side set. */
export function topMoves(d: AtlasData, home: string, race: Race, n = 3): AreaFigures[] {
  return rankChildren(d, home, race, 2022)
    .filter((f) => f.reach && f.todo && f.todo.todo !== "no-side")
    .slice(0, n);
}

/** 2022 turnout at a place: the campaign's race, else the same day's other races (one register). */
export function turnout2022(
  d: AtlasData,
  key: string | null,
  race: Race,
): { turnout: number; race: Race } | null {
  if (!key) return null;
  for (const r of [race, ...RACES.filter((x) => x !== race)]) {
    const t = figuresFor(d, key, r, 2022).turnout;
    if (t !== null) return { turnout: t, race: r };
  }
  return null;
}

/** Turnout at the stations that have reported: votes cast there over their register; null before any. */
export function reportedTurnout(
  stations: { registered: number; cast: number; reported: boolean }[],
): number | null {
  let registered = 0;
  let cast = 0;
  for (const s of stations)
    if (s.reported && s.registered > 0) {
      registered += s.registered;
      cast += s.cast;
    }
  return registered ? cast / registered : null;
}
```

  In `src/lib/atlas-view.ts`, name the three ramps `shadeOf` uses (`LEAN`, `TURNOUT`, `SWING`
  stop lists) and add, after `shadeOf`:

```ts
/** The key under a map shaded by `shade`, in the same colours. */
export function shadeLegend(
  shade: "todo" | "lean" | "turnout" | "swing",
): { label: string; colour: string }[] {
  if (shade === "todo")
    return (["mobilise", "hold", "persuade", "cut", "lean-ours", "lean-theirs"] as Todo[]).map(
      (t) => ({ label: TODO_NAMES[t], colour: TODO_COLOURS[t] }),
    );
  const key = (stops: [number, Hsl][], labels: string[]) =>
    stops.map(([x], i) => ({ label: labels[i]!, colour: ramp(x, stops) }));
  if (shade === "lean") return key(LEAN, ["30% or less to us", "Even", "70% or more to us"]);
  if (shade === "turnout") return key(TURNOUT, ["30% turnout", "75% turnout"]);
  return key(SWING, ["15 points or more away", "No change", "15 points or more our way"]);
}
```

  Run the test. Expected: all pass. Run `tests/atlas-view.test.ts` too (unchanged colours).

- [ ] **Step 4: Lint** (`--fix`) and typecheck. **Commit** `The atlas across the app: places, last counts, briefs, top places, turnout and the map key`.

---

### Task 2: Home — the last result and where votes can move

**Files:**
- Create: `src/components/gw/home/AtlasCards.tsx` (`LastResultCard`, `MovesCard`)
- Modify: `src/components/gw/home/RaceSection.tsx`, `src/components/gw/home/RaceReal.tsx`

**Interfaces:** Consumes Task 1 and 2a's `getAtlas`, `resultBlocks`, `homeAreaFor`,
`defaultRace`, `ResultList`.

- [ ] **Step 1:** `AtlasCards.tsx` reads the atlas with `useQuery({ queryKey: ["atlas"], queryFn: () => fetchAtlas(), staleTime: 5 * 60_000 })` and `useAccess()` for the campaign. Home area
  = `homeAreaFor(campaign, data.homeArea, data.areas)`, race = `defaultRace(campaign?.level)`.
  - `LastResultCard`: the newest `resultBlocks(d, home, [race])` block in a card titled "Last
    time" with `<ResultList block={...} />` (its tag says where the figures came from). With no
    block: "The last {raceInText(race)} result for {home's name} isn't in the atlas yet." and a
    link "Open Elections" (`/elections`). While loading: nothing (no layout jump in the
    section above it). On a load error: nothing (Elections has the retry).
  - `MovesCard`: "Where votes can move" with up to three `topMoves(d, home, race)` rows: the
    place (a link to `/elections?area=<key>`), the what-to-do chip (`TODO_COLOURS`), the reason
    line and votes within reach. With no side set for 2022 (`d.sides[electionOf(race, 2022)]`
    missing): "Set your side in 2022 in Elections to see where votes can move." (a link for
    the candidate or manager, plain text for others). With a side but no parts counted (an MP
    campaign before station data): "Not found yet: {home name}'s parts have no {race} results
    in the atlas." A footer link "All of it in Elections".
- [ ] **Step 2:** `RaceReal` and the sample branch of `RaceSection` replace
  `{s.lastTime.official ? <OfficialResult s={s} /> : null}` with `<MovesCard />` then
  `<LastResultCard />`. Delete `OfficialResult` and its import (the demo story's "Last time"
  no longer shows).
- [ ] **Step 3:** Run `npm test`, typecheck, build; lint the changed files.
- [ ] **Step 4: Commit** `Home: the last result and where votes can move, from the atlas`.

---

### Task 3: Voters — "How it voted" and "Last time here"

**Files:**
- Modify: `src/components/gw/WardMap.tsx` (an optional `wardColours` prop),
  `src/components/gw/VotersMap.tsx` (the shade choice and its key), `src/routes/_authenticated/voters.tsx` (the line under the numbers)
- Create: `src/components/gw/voters/LastTimeHere.tsx`

**Interfaces:** Consumes Task 1 (`votersKey`, `lastHere`, `wardKey`, `shadeLegend`) and 2a
(`figuresFor`, `shadeOf`, `getAtlas`, `homeAreaFor`, `defaultRace`).

- [ ] **Step 1: The map.** `WardMap` takes `wardColours?: Record<string, string>` (by ward slug).
  Its feature state gains `fill: props.wardColours?.[slug] ?? ""`, and the fill colour becomes
  `["case", ["!=", ["coalesce", ["feature-state", "fill"], ""], ""], ["to-color", ["feature-state", "fill"]], <the existing interpolate>]`; the effect that sets feature state depends on
  `props.wardColours` too. With `wardColours` set, wards it doesn't name keep the plain fill
  colour `"hsl(0 0% 80%)"` (pass it in the record) so a missing figure reads as missing.
- [ ] **Step 2: The choice.** In `VotersMap`, on the county view (no ward chosen), a segmented
  control "Shade by" with "Progress" (today's, the default) and "How it voted": "What to do",
  "Lean", "Turnout", "Swing". With a "How it voted" shade, `wardColours` maps every ward slug to
  `shadeOf(figuresFor(d, constituencyKey, race, 2022), shade)?.colour ?? "hsl(0 0% 80%)"`,
  where `constituencyKey = wardKey(d, ward.constituency, null)`; the legend shows
  `shadeLegend(shade)` and a note "By each ward's constituency, 2022 · {RACE_NAMES[race]}". The
  atlas loads only once "How it voted" is picked (`enabled`).
- [ ] **Step 3: The line.** `LastTimeHere({ area, wards })` under the numbers ladder on Voters:
  `key = votersKey(d, area, wards, home)`, `l = key ? lastHere(d, key, race) : null`. With `l`:
  "Last time here · {RACE_NAMES[race]} {l.year}: {l.share}, turnout {whole or "not found"}, {TODO_NAMES or ""}" plus
  "({constituency} figure)" when `l.constituencyFigure`, and a link "See it in Elections"
  to `/elections?area=<key>`. Without: "Last time here: not found yet in the atlas." and the
  same link when `key` is set. Agents don't see the line (their Voters is the doors).
- [ ] **Step 4:** Run `npm test`, typecheck, build; lint the changed files (counts must not rise).
- [ ] **Step 5: Commit** `Voters: the map shaded by how places voted, and the last time here`.

---

### Task 4: The diary's briefs

**Files:**
- Modify: `src/lib/diary.functions.ts` (wards with slug and constituency),
  `src/components/gw/diary/DiaryWeek.tsx`, `tests/diary-functions.test.ts`

- [ ] **Step 1: Write the failing test.** In `tests/diary-functions.test.ts`, seed the wards with
  `slug` and `constituency` and add:
  `eq("the wards say where they are", week.wards.map((w) => [w.slug, w.constituency]), [...])`.
- [ ] **Step 2: Run** it. Expected: FAIL (the fields aren't returned).
- [ ] **Step 3: Implement.** `loadWeek` selects `"id, name, slug, constituency"` and returns
  `{ id, name, slug, constituency }` (strings; `null` for a missing one). `DiaryWeek` loads the
  atlas (`["atlas"]`, as Elections) and, for an entry with a ward, shows under its title
  `briefLine(d, wardKey(d, ward.constituency, ward.slug), race)` in `.diary-brief` (small, dim),
  with `title` "Last election here, from the atlas". No brief without a ward, a place, or a count.
- [ ] **Step 4:** Run the test (pass), `npm test`, typecheck; lint. **Commit** `Diary: a one-line brief from the last election on each stop in a ward`.

---

### Task 5: The war room's turnout, today and in 2022

**Files:**
- Modify: `src/lib/console.functions.ts` (each constituency's turnout so far),
  `src/components/gw/warroom/LiveWarRoom.tsx`

- [ ] **Step 1:** In the war room loader's station loop, keep for each constituency the rows
  `{ registered: reg, cast: s.turnout_reported ?? sum of the station's votes, reported: hasResults }`
  and return `turnout: reportedTurnout(rows)` on each constituency (type: `number | null`).
- [ ] **Step 2:** The constituencies table gains two columns after "Reporting": "Turnout"
  (today's, `whole`, "—" when null) and "2022" (`turnout2022(d, wardKey(d, c.name, null), race)`,
  `whole`, with `title` naming the race when it isn't the campaign's own, e.g. "President's
  race: the governor's 2022 turnout isn't loaded"; "—" when missing). The atlas loads with
  `["atlas"]`.
- [ ] **Step 3:** Run `npm test`, typecheck, build; lint. **Commit** `War room: each constituency's turnout so far beside 2022's`.

---

### Task 6: The Elections map's key

**Files:** Modify `src/components/gw/elections/CountyView.tsx`, `src/styles/groundwork.css`

- [ ] **Step 1:** Under the county map, `shadeLegend(shade)` as a row of swatches (`.el-key`),
  plus "Grey: not found yet or no side set".
- [ ] **Step 2:** Typecheck, lint, build. **Commit** `Elections: a key under the map`.

---

### Task 7: Look at it

**Files:** none in the repository (the scratchpad harness from 2a, extended).

- [ ] **Step 1:** Extend the harness with Home's race section, Voters (its map needs MapLibre
  and the ward map; stand-ins for `getVoters`, `getPeople`, `getCanvassing`, `getMapConfig`,
  `getWardMap`), the diary week and the war room's constituency table, each with the real
  `data/atlas` figures.
- [ ] **Step 2: Check, at desktop width and at 375px:**
  1. Sakaja's Home: "Last time" is the 2022 governor result (The Star), and before a side is
     set "Where votes can move" says to set it; after setting Kenya Kwanza, three Nairobi
     constituencies with what to do, reason and votes within reach, each opening Elections.
  2. Mathira's Home: "Last time" says the MP result isn't in the atlas yet, with the link.
  3. Voters, county: "How it voted · What to do" shades every Nairobi ward by its
     constituency, with the key; "Progress" brings back today's colours.
  4. Voters, Westlands and Kangemi: the "Last time here" line, Kangemi's labelled as
     Westlands' figure, each opening the same place in Elections.
  5. Diary: a stop in Kangemi shows its brief; a stop without a ward shows none.
  6. War room: the 2022 column, with the presidential fallback's title where it applies.
  7. No console errors; no sideways scroll at 375px.
- [ ] **Step 3:** Fix anything found (each fix with its own test where it is a rule); reset the
  viewport and stop the preview.
