# Path to State House Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first version of Kenyan-literate Strategy insights: a "Path to State House" section that starts from the 2022 presidential result, county by county, groups the 47 counties into 13 regions, lets the team move a region's share or turnout, and shows at once whether the two bars of Article 138 are cleared (more than half of valid votes, and 25% in at least 24 of 47 counties), with plain-language readings whose every number is a figure.

**Architecture:** No database change. Two small CSV files in `data/kenya/` (IEBC Form 34C county rows for 2022 with the diaspora kept apart, August 2017 for context, and a region table anyone can edit) are read by a pure parser, `src/lib/kenya.ts`. A pure engine, `src/lib/path.ts`, applies per-region moves to the 2022 map. A second pure module, `src/lib/path-lines.ts`, writes the readings with the findings engine's `Figure` and `unaccounted` check. The screen is one component on the Strategy page; it keeps its state in the browser. It ships with a push and a publish; there is no migration.

**Tech Stack:** TanStack Start and Router, React 19, tsx test scripts. No new libraries.

**Spec:** none separate. The user opted out of the design conversation (17 October 2026); the Goal, Global Constraints and Decisions below stand in. The method and the 2022 region table are in the research pack, `~/Documents/Groundwork-research/kenya-politics/04-arithmetic.md` (outside the repository); `data/kenya/README.md` carries its sources into the repository.

**Not in this plan:** an AI brief written from the readings; governor, MP and ward versions of the same grammar; polls and coalition pacts as inputs; saving or sharing a path; editing the county-to-region table on screen (it is a CSV today).

## Global Constraints

- **The rule (Article 138):** a winner has more than half of the valid votes and at least 25% of the valid votes in each of at least 24 of the 47 counties. Counted on valid votes, as IEBC declared 2022 (Ruto 50.49%). If nobody does, the top two go to a runoff within 30 days. The diaspora's votes count in the national total and in no county.
- **2022 reproduces exactly.** With no change, the engine returns IEBC's declared totals: 14,213,137 valid, Ruto 7,176,141, Raila 6,942,930, 22,120,458 registered, 14,326,751 cast; Ruto at 25% or more in 39 counties, Raila in 34 (the research pack's check).
- **Regions are sets of counties, never people.** Nothing records or guesses anyone's community, and no line sets communities against each other (NCIC Act). Region names are the conventional ones; the screen lists each region's counties and says so in its fine print.
- **Every number in a reading is a figure** (`Figure` with label, value, text, source, period); `unaccounted(line)` is empty for every reading.
- **A move** is in points: of the side's share in a county (−100 to +100) and of turnout (the county's cast votes over its registered voters). Shares stay between 0 and 100; turnout stays between 0 and 100%. The rival and the others give way in proportion; extra voters split like the county's own vote.
- **Who sees it:** everyone who can open Strategy (the team; agents are already kept out). It starts open on a presidential campaign and folded away on any other.
- **Words on screen, exactly:** "Path to State House", "Start from", "Kenya Kwanza's 2022 vote", "Azimio's 2022 vote", "Share of valid votes", "Counties at 25%", "Ahead by", "Behind by", "Reset to 2022", "Both bars are cleared."
- **Tests** are tsx files in `tests/` with the `eq()` helper, ending with ``console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);``. One at a time from the repository root: `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`; everything: `npm test`. `tsc` covers `src/` only. The app reads the CSVs with Vite's `?raw`, which tsx cannot; tests read them with `fs`.
- **Repository rules:** never run Prettier on `src/styles/groundwork.css` (add rules by hand); never name TransTally; the repository is public (no secrets, no voter data; these are published election results); commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nothing is pushed, applied or published without the user's OK; never rewrite pushed history.

## Decisions to confirm

1. **Shown to every campaign, folded away unless it is a presidential one.** The user did not say whether a governor's or MP's team should see the national map; the arithmetic is public and it is the race above theirs, so it is there but out of the way.
2. **Two sides only: Kenya Kwanza's 2022 vote and Azimio's.** The 2027 field is not set. The side defaults from the campaign's side in Elections (`atlas.sides["2022-president"]`), else Kenya Kwanza.
3. **Kilifi and West Pokot's rows carry 10 and 100 more valid votes than their candidates' rows add up to,** as IEBC published them (the declared national figures have the same 110-vote gap). The engine keeps IEBC's valid votes; the difference sits in "others".
4. **August 2017 is context only** (the 2017→2022 swing in each region), from Wikipedia's county table, which sums within 1% of the declared totals, to whole points. It was the annulled count; it is the last time every county voted for the two sides.
5. **Region names are the research pack's** ("Nyanza (Luo counties)", "North & South Rift (Kalenjin counties)", "Gusii"), because that is how Kenyan analysts talk. They name places.

## Review Focus

1. **A region pushed to the ends.** +100 or −100 in share, or turnout past 100%: no negative votes, no share outside 0 to 100, no NaN. Pinned: Task 2 ("shares stop at 0 and 100", "turnout stops at 100%").
2. **A tie or a hair under.** Exactly 25.0% counts; 24.99% does not; exactly half of the valid votes is not more than half; a share just under half never prints as "50.0%". Pinned: Task 2 ("the bars are exact"), Task 3 ("a share just under half").
3. **The diaspora.** In the national total, in no county's bar, and never moved by a region's change. Pinned: Task 2 ("the diaspora stays put").
4. **A reading with no story.** A side with no turnout lever (Kenya Kwanza: none helps) or a cleared county bar writes no such line rather than an empty one. Pinned: Task 3.
5. **A phone.** The region table reads at 390 px with no sideways scroll. Seen in Task 4's harness steps.

---

### Task 1: The data, and the reader that refuses a bad file

**Files:**
- Create: `data/kenya/counties.csv`, `data/kenya/regions.csv`, `data/kenya/README.md`, `src/lib/kenya.ts`
- Test: `tests/kenya-data.test.ts`

**Interfaces:**
- Produces: in `src/lib/kenya.ts`
  - `type Region = { id: string; name: string; note: string }`
  - `type County = { code: string; name: string; region: string; registered: number; valid: number; rejected: number; raila: number; ruto: number; uhuru2017: number; raila2017: number; valid2017: number }`
  - `type Outside = Pick<County, "registered" | "valid" | "rejected" | "raila" | "ruto">` (the diaspora)
  - `type Kenya = { regions: Region[]; counties: County[]; outside: Outside }`
  - `parseKenya(regionsCsv: string, countiesCsv: string): Kenya` — throws one `Error` naming every problem.
- Consumes: `parseCSV` from `src/lib/csv.ts`.

- [ ] **Step 1: Write the failing test**, `tests/kenya-data.test.ts`, reading the two files with `fs` (they do not exist yet) and the repository's own `data/atlas/kenya/results.csv` and `turnout.csv`:
  - "47 counties in 13 regions, in the CSV's order"; "each region's county count": nairobi 1, mt-kenya-west 6, mt-kenya-east 3, ukambani 3, coast 6, north-eastern 3, northern 4, rift-kalenjin 7, rift-cosmopolitan 2, maa-lands 2, nyanza-luo 4, gusii 2, western 4.
  - "the rows add up to IEBC's declared 2022 totals": counties plus `outside` give valid 14,213,137, Raila 6,942,930, Ruto 7,176,141, registered 22,120,458, rejected 113,614 (cast 14,326,751); and the same figures read from the atlas files.
  - "Ruto is at 25% or more in 39 counties and Raila in 34".
  - "one spelling for each county": `Tharaka-Nithi`, `Murang'a`, `Elgeyo-Marakwet`, `Nairobi` are present; `Nairobi City`, `Tharaka - Nithi`, `Murang'A` are not.
  - "no county has more Raila and Ruto votes than valid votes, or more valid and rejected than registered".
  - "a bad file is refused with every problem named": 46 counties; a county in a region that does not exist; a negative number; a missing column → `parseKenya` throws and the message names each.
- [ ] **Step 2: Run it.** `npx tsx --tsconfig tsconfig.json tests/kenya-data.test.ts` — Expected: FAIL (cannot find `@/lib/kenya` or the data files).
- [ ] **Step 3: Add the data and the reader.** `counties.csv` columns `code,county,region,registered,valid,rejected,raila,ruto,uhuru_2017,raila_2017,valid_2017`, 47 county rows plus one `DIA,Diaspora` row with a blank region and blank 2017 columns; `regions.csv` columns `id,name,note` (the research pack's 13 names; notes only for grouping caveats: Laikipia, Turkana and Samburu, West Pokot, Nakuru and Trans Nzoia, Migori). `README.md` lists the sources (IEBC Form 34C for 2022; Wikipedia's county table for August 2017; the research pack for the grouping), the 110-vote note and how to change a county's region. `parseKenya` checks the header, whole non-negative numbers, 47 counties each in a listed region, every region used, one outside row.
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add data/kenya src/lib/kenya.ts tests/kenya-data.test.ts && git commit -m "Path to State House: the 2022 county data and its reader"`.

### Task 2: The engine

**Files:**
- Create: `src/lib/path.ts`
- Test: `tests/path.test.ts`

**Interfaces:**
- Consumes: `Kenya`, `County` from Task 1.
- Produces: in `src/lib/path.ts`
  - `RULE = { counties: 47, countiesNeeded: 24, countyShare: 0.25, runoffDays: 30 } as const`
  - `type Side = "ruto" | "raila"`; `SIDES: Record<Side, { bloc: string; candidate: string; rival: Side }>` (`ruto`: Kenya Kwanza, William Ruto; `raila`: Azimio, Raila Odinga)
  - `type Move = { share: number; turnout: number }` (points); `type Scenario = Record<string, Move>` keyed by region id
  - `type CountyNow = { code: string; name: string; region: string; valid: number; yours: number; rival: number; others: number; share: number }`
  - `type RegionNow = { id: string; name: string; counties: number; valid: number; weight: number; turnout: number; share: number; swing: { from: number; to: number }; now: { valid: number; yours: number; share: number; turnout: number }; votesAdded: number }` (2022 figures, then with the scenario; `weight` is the region's share of all valid votes; `swing` is the side's share in August 2017 and in 2022)
  - `type Totals = { valid: number; yours: number; rival: number; others: number; share: number; margin: number; toHalf: number; clearsHalf: boolean; counties: number; clearsCounties: boolean; won: boolean; turnout: number }`
  - `type Path = { totals: Totals; regions: RegionNow[]; counties: CountyNow[] }`
  - `runPath(k: Kenya, side: Side, sc?: Scenario): Path`
  - `isBaseline(sc: Scenario): boolean`
  - `worth(k: Kenya, side: Side, region: string, points?: number): { votes: number; points: number }` (default 5 points of share on 2022's map: votes gained, national share points gained)
  - `turnoutLever(k: Kenya, side: Side): { region: string; name: string; turnout: number; national: number; extra: number; net: number } | null`
  - `nearLine(k: Kenya, side: Side, sc?: Scenario, band?: number): CountyNow[]` (counties under 25% by no more than `band`, default 0.05, closest first)

- [ ] **Step 1: Write the failing test**, `tests/path.test.ts`, with figures worked out separately from the definitions (a scratch reference model, not the module). Read the CSVs with `fs` and `parseKenya`:
  - "2022 as declared": `runPath(k, "ruto")` → valid 14,213,137, yours 7,176,141, rival 6,942,930, margin 233,211, share 50.4895%, `toHalf` 0, `counties` 39, `won` true; `"raila"` → yours 6,942,930, margin −233,211, `toHalf` 163,639, `counties` 34, `clearsHalf` false, `clearsCounties` true, `won` false. National turnout 64.77%.
  - "region weights and turnout": Mt Kenya West 6 counties, valid 2,243,014, weight 15.78%, turnout 66.84%; Coast 51.33%; Nairobi 55.96%; weights add to 1 minus the diaspora's 5,988; `swing` for Raila in Mt Kenya West 4.08% → 21.05%.
  - "five points in a region": `worth(k, "ruto", "mt-kenya-west")` → votes 112,151 (rounded), points 0.789; the same for `"raila"`; Raila in Nyanza (Luo counties) is 37,987 (the 100% ceiling stops it short).
  - "a share moves yours, and the rival and others give way in proportion" (one county in a synthetic `Kenya` built in the test).
  - "shares stop at 0 and 100": +100 in a region leaves every county at 100% for the side and 0 for the rest; −100 leaves 0; no NaN.
  - "turnout moves votes with the county's own split": +4 in Nairobi scales Nairobi's votes by (t+0.04)/t and its split is unchanged.
  - "turnout stops at 100%": +100 in a region makes every county's turnout 100%, no more.
  - "the diaspora stays put": a move in every region leaves 5,988 valid in the total outside the counties.
  - "the bars are exact": a synthetic `Kenya`: yours exactly 25% counts, 24.99% does not; yours exactly half of the valid is not more than half; one vote over is; `toHalf` of a tie is 1.
  - "turnout lever": Raila → Coast, turnout 51.33%, national 64.77%, extra about 260,978, net about 81,439; Ruto → `null`.
  - "nearLine": on 2022's map, Kenya Kwanza's nearest under the line are Machakos, Mandera, Makueni and Azimio's Uasin Gishu, Meru, Nyandarua (closest first; counties already over the line, like Kiambu at 25.5%, are not listed); a band of 0.01 lists only Machakos; with Azimio at −28 in every region the five nearest are Trans Nzoia, Lamu, Narok, Kajiado, Marsabit.
  - "Azimio at +10 in Western": share 49.81%, ahead by 36,980, `toHalf` 26,646, `counties` 34, `won` false (the others' votes keep it under half).
  - "a move of zero changes nothing": every number equals the baseline's, exactly.
- [ ] **Step 2: Run it.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `runPath` and the rest in `src/lib/path.ts`.** For each county: your share `s = yours/valid`; `s1 = clamp(s + d, 0, 1)` with your votes `valid × s1` (unchanged exactly when `d` is 0); the rest `valid − yours1` is split rival : others as they were (all to the rival if both were 0); turnout `t = (valid + rejected)/registered`, `t1 = clamp(t + e, 0, 1)`, every vote count × `t1/t`. Totals add the diaspora once. `toHalf = max(0, floor(valid/2 − yours) + 1)`; a county counts when `yours × 4 ≥ valid` within 1e-9; `won` is both bars.
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add src/lib/path.ts tests/path.test.ts && git commit -m "Path to State House: the engine"`.

### Task 3: The readings

**Files:**
- Create: `src/lib/path-lines.ts`
- Test: `tests/path-lines.test.ts`

**Interfaces:**
- Consumes: `runPath`, `worth`, `turnoutLever`, `nearLine`, `isBaseline`, `RULE`, `Side`, `Scenario` from Task 2; `Figure`, `count` from `src/lib/findings/core.ts`.
- Produces: `type PathLine = { id: "standing" | "biggest" | "turnout" | "counties"; line: string; figures: Figure[] }`; `pathLines(k: Kenya, side: Side, sc?: Scenario): PathLine[]`; `sharePercent(x: number): string` (one decimal; two when one decimal would print 50.0% for a share not above half).

- [ ] **Step 1: Write the failing test**, `tests/path-lines.test.ts`, every line also run through `unaccounted` (empty):
  - "standing, Kenya Kwanza on 2022's map": "On 2022's map your side has 50.5% of valid votes and 25% or more in 39 of 47 counties. Both bars are cleared."
  - "standing, Azimio on 2022's map": "…has 48.8% of valid votes and 25% or more in 34 of 47 counties. It is 163,639 votes short of more than half."
  - "standing after a change" starts "With your changes your side has" and names the new share, counties and shortfall; a county bar missed reads "It needs 3 more counties at 25%." and both missed joins with "and needs".
  - "a share just under half": `sharePercent(0.49996)` is "49.996%"… two decimals ("50.00%" is never printed for a share not above half); 0.5049 → "50.5%".
  - "biggest": "Mt Kenya West is the biggest region, 16% of valid votes. Five points of your side's share there is worth about 112,000 votes, 0.8 points nationally." (same for both sides).
  - "turnout": Azimio → "Coast turned out at 51% in 2022 against 65% nationally. Lifting it to the national level would add about 261,000 votes, about 81,000 net for your side."; Kenya Kwanza has no turnout line.
  - "counties" appears only when the county bar is missed, with the nearest under-the-line counties named; none when it is cleared.
  - "every figure names its source and period"; "every number is a figure" for each line above.
- [ ] **Step 2: Run it.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `pathLines` and `sharePercent` in `src/lib/path-lines.ts`.** Figures: sources "IEBC Form 34C, 2022 president, county rows" (period "August 2022"), "Constitution, Article 138" (period "in force"), "Your changes on the 2022 map" (period "scenario"). Round votes to the nearest thousand for "about".
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add src/lib/path-lines.ts tests/path-lines.test.ts && git commit -m "Path to State House: the readings"`.

### Task 4: The screen, the notes, and a look at it

**Files:**
- Create: `src/lib/path-view.ts`, `src/lib/kenya-data.ts`, `src/components/gw/strategy/PathToStateHouse.tsx`
- Modify: `src/routes/_authenticated/strategy.tsx`, `src/styles/groundwork.css` (by hand), `AGENTS.md`
- Test: `tests/path-view.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: in `src/lib/path-view.ts`: `sideFromBloc(bloc: string | null | undefined): Side | null` ("Kenya Kwanza" → `ruto`, "Azimio" → `raila`, ignoring case and spaces); `setMove(sc: Scenario, region: string, patch: Partial<Move>): Scenario` (drops a region whose two points are 0); `signed(n: number, unit?: string): string` ("+5", "−3" with a true minus, "0"); in `src/lib/kenya-data.ts`: `kenya: Kenya` (the CSVs through `?raw`).

- [ ] **Step 1: Write the failing test**, `tests/path-view.test.ts`: `sideFromBloc` for both blocs, other names, null; `setMove` adds, merges, drops at zero and never mutates its input; `signed` for positive, negative, zero and a unit.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `path-view.ts` and `kenya-data.ts`.**
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Build `PathToStateHouse`** on the Strategy page, after the findings. The side switch ("Start from": "Kenya Kwanza's 2022 vote" / "Azimio's 2022 vote"; default from `atlas.sides["2022-president"]`); the scoreboard ("Share of valid votes" with "needs more than half", "Counties at 25%" with "of 47, 24 needed", "Ahead by" or "Behind by" the rival, and "Both bars are cleared." when won); the readings; one row per region sorted by size (name, counties, share of the vote, the side's 2022 share → now, 2017 → 2022 in small type, a share slider −20 to +20 and a turnout slider −15 to +15 in steps of 1, votes added or lost, the counties listed with their share in a fold-out); "Reset to 2022"; the fine print (sources and method; "Regions are sets of counties. They describe places; nothing here records or guesses anyone's community"; the runoff rule; "the extra voters split like the county's own vote"; the 2017 count was annulled and is context only). Folded away (`<details>`) unless `campaign.level === "president"`. CSS `.pth-*` by hand.
- [ ] **Step 6: Check it.** `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on the changed files, `npx prettier --check` on the changed ts/tsx (never the CSS), `npm run build`; then in the preview harness (the walk lists harness with a presidential campaign): the page at 1200 px and 390 px (no sideways scroll), both sides, a +10 in Western, Reset, a non-presidential campaign folded away, the hand check of the 2022 numbers against the declared totals.
- [ ] **Step 7: AGENTS.md** — a short paragraph: where the data lives, how to change a region, that the page is computed in the browser with no database, the guardrails (places not people).
- [ ] **Step 8: Run everything.** `npm test` — Expected: exit 0.
- [ ] **Step 9: Commit** — `git add -A src tests AGENTS.md data docs && git commit -m "Path to State House: the Strategy section"` (stage by name; leave the untracked `schema-*.sql` files alone).
