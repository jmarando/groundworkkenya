# Polling centres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every campaign with a map area has its real polling centres, from IEBC's 2022 register: drawn on the Voters map at ward level with the part of the ward nearest each one, opened in the panel with the doors in their area, put on the map by organisers ("Place it") and confirmed by agents standing at them ("I'm here").

**Architecture:** The centres are rows in the existing `polling_stations` table (schema 27: IEBC's code, a position and who gave it, one agent's suggestion waiting). A position is written only by three database functions, never by a direct update. Pure modules in `src/lib/` hold every rule (reading rows, the dots and areas, search, the address, what to tell an agent) and are tested with `eq()` scripts; the map component only draws, and server functions only read and call. The part of a ward nearest each placed centre is a Voronoi cell cut to the ward's outline, worked out in the browser.

**Tech Stack:** TanStack Start and Router, React 19, React Query 5, MapLibre GL 6, Supabase (Postgres 17), `d3-delaunay` 6.0.4 and `polygon-clipping` 0.15.7 (new), tsx test scripts, `pdftotext` (only to re-read IEBC's PDF).

**Spec:** `docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md`, part 1. Walk lists (part 2) get their own plan and release.

**Not in this plan** (part 2, walk lists, or later): a centre's walk lists and "Plan a walk list here"; schema 28; planning and sending lists; "Your walk lists" on the phone and keeping a list offline; retiring the street plans; agents leaving `/voters`; notifications; 2022 results by polling station (part 4).

**How this plan is built.** Each task's code was written test-first in a scratch worktree and checked in the preview harness before this plan was written, as the offline app's was. It sits in nine commits on the local branch `centres-proto`. This plan names those commits instead of retyping about 6,100 lines: each task says which commits to bring in, what they add, the interfaces they leave, and which checks to run with the results to expect. To read the code: `git show <commit>`, or `git diff polling-centres..centres-proto`. Executing the plan means cherry-picking in order and re-running every check. The commits live on `centres-proto` in this clone (`git worktree prune` first if its scratch worktree is gone): keep that branch until Task 8 is done.

**Replayed before writing.** On 14 October 2026 the nine commits were cherry-picked in this order onto `origin/main` (92e11ad, Lovable's WhatsApp templates) on a throwaway branch: no conflicts; `tsc`, ESLint and Prettier clean on the 37 files they touch; `npm test` passed (73 test files report 1,553 checks, 45 migrations apply cleanly, 16 SQL files ok); `npm run build` succeeded.

## Global Constraints

- **Where the centres come from:** IEBC's "Registered voters per polling stations for the 2022 General Election" (`https://www.iebc.or.ke/docs/rov_per_polling_station.pdf`, 712 pages). The PDF is not committed. Positions come from OpenStreetMap's schools (© OpenStreetMap contributors, ODbL): credited in `data/stations/README.md` and in the map's attribution line ("Polling centres: IEBC, positions © OpenStreetMap contributors (ODbL)").
- **The numbers:** Nairobi (county 047) has 378 centres, 3,643 streams and 2,415,310 registered voters; Mathira (county 019, constituency 096) has 109 centres, 201 streams and 104,492. The spec's 376 and 3,636 were wrong; Task 8 corrects them.
- **Who may write a position:** only these functions, and a direct update of the position columns is revoked:
  - `place_station(_station_id, _lat, _lng)`: the candidate, managers and organisers (and the platform owner); no more than 2 km from the box around the centre's ward.
  - `use_station_suggestion(_station_id)`: the same people.
  - `station_here(_station_id, _lat, _lng, _accuracy)`: the whole team; the position becomes the centre's when it is good to 50 m and no more than 300 m outside the ward's box, otherwise it is kept as a suggestion.
- **Schema 27 is two files**, safe to run again, applied after schema 26 (`20261014100000_voters_map_last_score.sql`): `20261015090000_polling_centres.sql` (written by hand) and `20261015090100_polling_centres_data.sql` (written by `scripts/stations/build-sql.ts`: change the CSV files and run it again, never edit the file). The data file sets `groundwork_schema_version()` to 27.
- **Reads fail soft.** Before schema 27 is applied, `readCentres` returns `null` and writes one log line (the error's message, never rows); Voters says "The polling centres aren't in yet" and goes on as before. A push does not run migrations, so this is the state right after a push.
- **The words on screen, exactly:**
  - "Click a centre to open it"
  - "Nearest centre" (the legend)
  - "Polling centres", "Not on the map yet", "Open", "Place it", "Move it", "Use this position", "Save this position", "Cancel"
  - "Drag the pin, or tap the map, to where the centre is"
  - "The polling centres aren't in yet: they appear once the database update is applied."
  - "Polling centres near me", "needs signal", "Find the centres near me", "I'm here"
  - "This needs signal." and "Thank you: the centre is now where you are."
- **New dependencies, pinned exactly** (no `^`): `d3-delaunay` 6.0.4, `polygon-clipping` 0.15.7, `@types/d3-delaunay` 6.0.4 (dev). Installed with `npx -y bun add --exact`; `npx -y bun install --frozen-lockfile` installs what `bun.lock` pins.
- **Tests** are tsx files in `tests/` with the `eq()` helper, ending with ``console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);``.
  - One at a time, from the repository root: `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`.
  - Everything: `npm test` (the SQL tests, `tests/sql/run.sh`, are part of it).
  - `tsc` covers `src/` only; tests and scripts are not type-checked.
- **Do not use `ringAreaM2` to compare a whole with its parts.** It scales each ring by the latitude of its own first vertex, so a ward and its cells differ by a few parts per million (79 m² on Kileleshwa) even when the cells tile it exactly. `tests/centre-areas.test.ts` measures every ring from one origin.
- **Repository rules:**
  - Never run Prettier on `src/styles/groundwork.css` (it already fails on `main`); add rules by hand in its style.
  - Never name TransTally.
  - The repository is public: no secrets, no voter data. The centres are public IEBC data.
  - Commits end with the `Co-Authored-By` line of whoever wrote them (the first three carry Claude Opus 5.5; the rest Claude Sonnet 5.5).
  - Nothing is pushed, applied to the real database or published without the user's OK; keep the branch working (AGENTS.md); never rewrite pushed history.

## Decisions made while building

Please read these; they are choices the spec left open, or where the build differs from it.

1. **Differs from the spec: "Polling centres near me" also lists the ward's centres that are not on the map yet.** The spec lists "the centres within 2 km, nearest first", but a centre with no position can't be within 2 km of anything, and 187 of Nairobi's 378 centres and 101 of Mathira's 109 have no position. Without this, "I'm here" would find nothing at about half the centres. The card finds the ward the phone is in from the ward outlines and offers that ward's unplaced centres under "In <ward>, not on the map yet". Task 8 puts this into the spec.
2. **Added: "Move it"** on a centre already on the map, the same pin flow as "Place it", so an organiser can correct a wrong OpenStreetMap match.
3. **The dots:** a circle for each centre with a position, from zoom 13, sized by the square root of its register (4 to 24 px; Nairobi's centres run from 1 to 40,554 voters, median about 5,600). A close-name position (one word off, or the same name in two places) is drawn hollow until someone confirms it. A name sits under each dot from zoom 14.5. A click, with 8 px of room for a finger, opens the centre; a house under the dot is still reached by clicking beside it.
4. **The areas:** worked out in the browser for the ward on show only, one cool tint, dashed outlines, the open centre's area drawn stronger with an orange outline. Houses take their centre by the same rule. Because only some of a ward's centres have a position, the card says so: "1 of this ward's 5 centres isn't on the map yet, so this area is bigger than it will be once it is placed."
5. **The numbers in a centre's card:** houses knocked, and supporters among doors scored (a last score of 4 or 5), are counted from each house's plus code, which says where it is, so no house file is read. "Houses on the map" in its area needs the house tiles it covers; an area covering more than 100 tiles says "Too big to count here" instead of reading hundreds of tiles.
6. **The address** gains `centre=PS-0042` (the short code, which agents already know). Opening a centre is a step Back undoes. A centre closes when another ward, a house, a place or a zoom out to where centres are not drawn is chosen; one card is open at a time. Placing is not in the address.
7. **Place it:** the pin starts where the centre is, else at the agent's suggestion, else at the middle of the ward; drag it or tap the map. The database says if it is more than 2 km from the ward, and the message is shown.
8. **Agents** (who can still open `/voters` until part 2 takes them off it) see the list and the card but no "Place it", "Move it" or "Use this position".
9. **The field card starts the phone's position only when asked** ("Find the centres near me"), not when the page opens: no permission prompt or battery use for someone who only came for the door list. It needs signal.
10. **Names are shown as IEBC spells them** (upper case: "ST MARTIN S SCHOOL KIBAGARE", "GATHU-INI PRIMARYSCHOOL"). Tidying them is a separate, cosmetic job.
11. **A visible change to existing numbers.** Schema 27's data file sets each ward's `registered_voters` to its centres' sum. Sakaja's and Mathira's were invented seed values (`18000 + (i*7919)%26000`); Kalonzo's were already real. Wherever a ward's registered voters are shown (the Voters panel's "Registered voters", for one), Sakaja's and Mathira's will now be the real ones.
12. **Sakaja's 85 sample stations are replaced** by the 378 real centres. One with a filed result, a form photo or a real agent is kept and renamed `SAMPLE-0001` onwards. Checked in the harness: the war room reads "0 / 378" stations and "3,643" streams to cover, and the agents page "0/378 staffed" and "2,415,310 registered voters unwatched" (the register's total).

## Review Focus

1. **Half the centres have no position** (Nairobi 187 of 378, Mathira 101 of 109). A centre with no position is still listed, searchable and openable, says it isn't on the map yet, and can be placed.
   - Pinned: Task 5's "a row with no position becomes a centre with none", the search hits "not on the map yet" and "a centre with none: ... no camera of its own"; Task 6's `wardCentres` lists.
   - Seen in the harness: Jomo Kenyatta University's card and its "Place it".
2. **The code is live before schema 27 is applied.** The panel says the centres aren't in yet, no dots are drawn, and nothing else changes.
   - Pinned: Task 5's refused-read test (`null`, one log line, no rows).
   - Seen in the harness with the read refused: the panel's message, the default hint and legend, and exactly one console line.
3. **An agent at a centre with a vague fix, far from the ward, with location blocked, or with no signal.** Each gets a sentence saying what happened and what to do; a position that fails the checks is kept as a suggestion, never lost.
   - Pinned: Task 7's `hereMessage` for every answer; Task 3's SQL tests for the 50 m and 300 m limits.
   - Seen in the harness: a good fix, an 80 m fix, location blocked, and "This needs signal."
4. **Wards where only some centres are placed**: one placed centre has the whole ward, none has no areas, and the card says the area is bigger than it will be.
   - Pinned: Task 4's "one centre has the whole ward" and "no centres, no areas"; Task 6's door counts (an area's houses are counted only where they stand).
5. **The war room and agents pages now read 378 stations instead of 85.** Their totals follow the register.
   - Pinned: Task 3's `access.test.sql` counts other campaigns' stations only, plus Mathira's own 109.
   - Seen in the harness: the figures in decision 12.

## Files

| File | What it does |
|---|---|
| `src/lib/stations/register.ts` | Reads IEBC's register (`pdftotext -tsv`) by where each word is on the page: streams, then centres |
| `src/lib/stations/match.ts` | Places a centre from OpenStreetMap's schools: names, distance, exact or close |
| `src/lib/stations/sql.ts` | Writes `data/stations` as the data migration |
| `src/lib/stations/areas.ts` | The part of a ward nearest each centre, and the area a point is in |
| `src/lib/centres.ts` | Everything pure about centres: rows to centres, dots, area shapes, door counts, lists, notes, who may place, who is near |
| `src/lib/centres.functions.ts` | The read, and the three calls that place a centre; server functions on top |
| `src/lib/voters-view.ts`, `src/lib/voters-map.ts` | The address's `centre`, search, camera, hint, and when a centre closes |
| `src/lib/house-tiles.ts`, `src/lib/geo.ts` | `tilesCovering` (a box's tiles); `distanceOutsideM` (to a ward's edge) |
| `src/hooks/useWardCentres.ts`, `useAreaHouses.ts`, `useDoorPlace.ts` | A ward's lists and areas; counting an area's houses; `useFix` exported |
| `src/components/gw/voters/VotersCanvas.tsx`, `MapSearch.tsx`, `MapPanel.tsx` | Dots, areas, pin, click; search box; a slot for the ward's centres |
| `src/components/gw/voters/CentresList.tsx`, `CentreCard.tsx`, `PlaceIt.tsx` | The ward's list; a centre's card; placing one |
| `src/components/gw/CentresNearMe.tsx`, `src/routes/_authenticated/field.tsx` | The field page's card |
| `src/routes/_authenticated/voters.tsx` | The ward, its centres and areas worked out once; the card shown; placing |
| `scripts/stations/*.ts`, `data/stations/*` | Reading the register, finding positions, writing the migration; the data and its README |
| `supabase/migrations/20261015090000_polling_centres.sql`, `...090100_polling_centres_data.sql` | Schema 27 |
| `tests/stations-*.test.ts`, `centre-areas`, `centres`, `centres-functions`, `voters-map`, `voters-view`, `house-tiles`, `tests/sql/centres.test.sql`, `access.test.sql` | The checks |

---

### Task 1: IEBC's register, read into data/stations

**Commit:** `d1b5a23`

**Files:**
- Create: `src/lib/stations/register.ts`, `scripts/stations/areas.ts`, `scripts/stations/read.ts`, `scripts/stations/register.ts`
- Create: `data/stations/nairobi.csv`, `data/stations/mathira.csv`, `data/stations/README.md`
- Test: `tests/stations-register.test.ts`, `tests/stations-data.test.ts`

**Interfaces:**
- Consumes: `parseCSV` and `toCSV` (`src/lib/csv.ts`), `slugify` (`src/lib/atlas-files.ts`), `data/atlas/<county>/register.csv` (each ward's registered voters), `public/geo/<area>-wards.json`.
- Produces:
  - `registerStreams(tsv: string, prefix: string): RegisterStream[]`, where `RegisterStream = { code: string; registered: number | null; ward: string; centre: string }` (`code` is 15 digits: county 3, constituency 3, ward 4, centre 3, stream 2).
  - `registerCentres(streams, ours: Set<string>): { centres: RegisterCentre[]; problems: string[] }`, where `RegisterCentre = { iebcCode: string; code: string; name: string; ward: string; streams: number; registered: number }` (`iebcCode` is the first 13 digits; `code` runs `PS-0001` upwards in IEBC's order; `ward` is our slug).
  - `checkRegistered(centres, atlas: Map<string, number>): string[]` (the problems; empty when every ward's centres add up to the atlas's figure), `wardSlugFor(iebcName: string, ours: Set<string>): string | null`, `WARD_ALIASES` (`mugumu-ini` is our `mugumo-ini`).
  - `STATION_AREAS: StationArea[]` (`{ id, mapArea, prefix, wards, atlas }`), `areaShapes(a)`, `atlasRegistered(a)` in `scripts/stations/areas.ts`; `readCentres(area)`, `readPositions(area)`, `hasCentres(area)`, `stationAreasData()` in `scripts/stations/read.ts`.
  - `data/stations/<area>.csv` with the columns `iebc_code,code,name,ward,streams,registered`.

- [ ] **Step 1: Bring the commit in**

```bash
git cherry-pick d1b5a23
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/stations-register.test.ts
npx tsx --tsconfig tsconfig.json tests/stations-data.test.ts
```

Expected: `15 passed, 0 failed` and `10 passed, 0 failed`.

What they pin: rows are found by their 15 digits, including the ones that wrap onto a second line; a count is the digits ending the word at the count column; an unknown ward name stops the reader; every ward's centres add up to the atlas's registered voters; Nairobi is 378 centres, 3,643 streams and 2,415,310 voters, and Mathira 109, 201 and 104,492; codes run `PS-0001` upwards.

- [ ] **Step 3: Format and lint what it added**

```bash
npx prettier --check src/lib/stations/register.ts scripts/stations/*.ts tests/stations-register.test.ts tests/stations-data.test.ts
npx eslint src/lib/stations/register.ts scripts/stations tests/stations-register.test.ts tests/stations-data.test.ts
```

Expected: no complaints.

---

### Task 2: Positions from OpenStreetMap's schools

**Commit:** `d3aeae5`

**Files:**
- Create: `src/lib/stations/match.ts`, `scripts/stations/positions.ts`, `data/stations/nairobi-positions.csv`, `data/stations/mathira-positions.csv`
- Modify: `src/lib/geo.ts` (adds `distanceOutsideM`), `scripts/stations/read.ts`, `data/stations/README.md`, `tests/stations-data.test.ts`
- Test: `tests/stations-match.test.ts`

**Interfaces:**
- Consumes: Task 1's `RegisterCentre` and `readCentres`; `WardShape` and `Ring` (`src/lib/geo.ts`).
- Produces:
  - `placeCentre(name: string, ward: Ring[][], schools: School[]): Placed | null`, where `School = { id: string; name: string; at: LngLat; area: boolean }` and `Placed = { at: LngLat; placedBy: "osm" | "osm-close"; osmId: string; osmName: string }`.
  - `nameMatch(centre: string, school: string): "exact" | "close" | null`, `nameWords`, `coreWords`, `schoolKind(name): "primary" | "secondary" | null`, `overpassSchools(json: unknown): School[]`.
  - `CentrePosition = { iebcCode: string; lat: number; lng: number; placedBy: "osm" | "osm-close"; osmId: string; osmName: string }`.
  - `distanceOutsideM(p: LngLat, polygons: Ring[][]): number` in `src/lib/geo.ts` (metres to the nearest edge; 0 inside).
  - `data/stations/<area>-positions.csv` with `iebc_code,lat,lng,placed_by,osm_id,osm_name`: Nairobi 164 placed and 27 close names (191 of 378), Mathira 8 of 109.

- [ ] **Step 1: Bring the commit in**

```bash
git cherry-pick d3aeae5
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/stations-match.test.ts
npx tsx --tsconfig tsconfig.json tests/stations-data.test.ts
```

Expected: `24 passed, 0 failed` and `14 passed, 0 failed`.

What they pin: "primary school"-style words are ignored when names are compared; the school must be inside the centre's ward or within 2 km of it; a primary is never matched to a secondary; a name one word off is `osm-close` (drawn hollow), and so is the same name in two places more than 500 m apart.

- [ ] **Step 3: Format and lint**

```bash
npx prettier --check src/lib/stations/match.ts src/lib/geo.ts scripts/stations/*.ts tests/stations-match.test.ts tests/stations-data.test.ts
npx eslint src/lib/stations/match.ts src/lib/geo.ts scripts/stations tests/stations-match.test.ts tests/stations-data.test.ts
```

Expected: no complaints.

---

### Task 3: Schema 27, the centres in the database

**Commit:** `c9d670c`

**Files:**
- Create: `supabase/migrations/20261015090000_polling_centres.sql`, `supabase/migrations/20261015090100_polling_centres_data.sql`
- Create: `src/lib/stations/sql.ts`, `scripts/stations/build-sql.ts`
- Modify: `scripts/stations/read.ts`, `src/lib/stations/match.ts`, `tests/stations-data.test.ts`, `tests/sql/access.test.sql`
- Test: `tests/stations-sql.test.ts`, `tests/sql/centres.test.sql`

**Interfaces:**
- Consumes: Tasks 1 and 2's data; `my_campaign()` and `my_campaign_role()`; the multi-campaign tables (`campaign_id`, `unique (campaign_id, code)`).
- Produces:
  - `polling_stations` gains `iebc_code`, `lat`, `lng`, `placed_by` (`osm`, `osm-close`, `organiser`, `agent`), `placed_accuracy_m`, `placed_at`, `placed_actor`, and one suggestion waiting: `suggested_lat`, `suggested_lng`, `suggested_accuracy_m`, `suggested_at`, `suggested_by`. A position is whole (no latitude without a longitude or a source). `iebc_code` is unique within a campaign. Column-level update grants stop direct writes of the new columns.
  - `wards` gains `west`, `south`, `east`, `north` (the box round each outline) and has its `registered_voters` set to its centres' sum.
  - `place_station(uuid, double precision, double precision) returns void`, `use_station_suggestion(uuid) returns void`, `station_here(uuid, double precision, double precision, real) returns jsonb` (`{"moved": true}`, or `{"moved": false, "why": "accuracy" | "distance" | "no-ward"}`), `retire_sample_stations() returns jsonb` (`{"gone": n, "kept": n}`, run once by the migration, owner only).
  - `stationsMigration(areas: StationsArea[]): string` and `stationsSql` in `src/lib/stations/sql.ts`, which `scripts/stations/build-sql.ts` writes to the data migration; `tests/stations-data.test.ts` fails if the file drifts from the CSVs.
  - `groundwork_schema_version()` returns 27.

- [ ] **Step 1: Bring the commit in**

```bash
git cherry-pick c9d670c
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/stations-sql.test.ts
npx tsx --tsconfig tsconfig.json tests/stations-data.test.ts
bash tests/sql/run.sh
```

Expected: `8 passed, 0 failed`; `15 passed, 0 failed`; and from the SQL run `ok   45 migrations apply cleanly`, `ok   tests/sql/centres.test.sql (9 tests)` and `ok   tests/sql/access.test.sql (16 tests)`, every file ok.

What the SQL tests pin: each campaign with a map area gets its register's centres; the wards' boxes and voters are set; Sakaja's samples go except one with a filed result, a form photo or a real agent (kept as `SAMPLE-0001` onwards); "Place it" works for organisers only and refuses a place more than 2 km from the ward; "I'm here" moves a pin within 300 m and 50 m and otherwise keeps a suggestion; another campaign's centres are never touched; running the migration again changes nothing.

- [ ] **Step 3: Nothing is applied to the real database in this task.** Applying schema 27 is Task 8, after the user's OK.

---

### Task 4: The part of a ward nearest each centre

**Commit:** `4429e64`

**Files:**
- Create: `src/lib/stations/areas.ts`
- Modify: `package.json`, `bun.lock`
- Test: `tests/centre-areas.test.ts`

**Interfaces:**
- Consumes: `inPolygon`, `LngLat`, `Ring`, `WardShape` (`src/lib/geo.ts`).
- Produces:
  - `CentreArea = { id: string; polygons: Ring[][] }` (a MultiPolygon's coordinates).
  - `centreAreas(centres: { id: string; at: LngLat }[], ward: WardShape): CentreArea[]`: a Voronoi cell of the centres in local metres, cut to the ward's outline; one centre has the whole ward; none has no areas; a centre at another's very place gets an empty area; a centre outside the ward still has its cell.
  - `centreAt(p: LngLat, areas: CentreArea[]): string | null`: the id of the area a point is in.
  - `d3-delaunay` 6.0.4 and `polygon-clipping` 0.15.7 (its ES build has only a default export, whatever its types say), `@types/d3-delaunay` 6.0.4.

- [ ] **Step 1: Bring the commit in and install what it pins**

```bash
git cherry-pick 4429e64
npx -y bun install --frozen-lockfile
```

- [ ] **Step 2: Run the check**

```bash
npx tsx --tsconfig tsconfig.json tests/centre-areas.test.ts
```

Expected: `10 passed, 0 failed`.

What it pins: every point of a ward is in exactly one area and in its nearest centre's; the cells add up to the ward (a synthetic square and Kileleshwa, on one shared plane: see the `ringAreaM2` note above); outside the ward there is no area. Checked by mutation: cutting 1 m off the cells' edge makes the synthetic sum fail, 11 m fails both.

- [ ] **Step 3: Format and lint**

```bash
npx prettier --check src/lib/stations/areas.ts tests/centre-areas.test.ts
npx eslint src/lib/stations/areas.ts tests/centre-areas.test.ts
```

---

### Task 5: Centres on the map

**Commits:** `5478306`, `f9ffba4`, `856e39c` (apply in this order)

**Files:**
- Create: `src/lib/centres.ts`, `src/lib/centres.functions.ts`, `src/components/gw/voters/CentreCard.tsx` (a first, small version)
- Modify: `src/lib/voters-view.ts`, `src/lib/voters-map.ts`, `src/components/gw/voters/VotersCanvas.tsx`, `src/components/gw/voters/MapSearch.tsx`, `src/routes/_authenticated/voters.tsx`
- Test: `tests/centres.test.ts`, `tests/centres-functions.test.ts`, `tests/voters-map.test.ts`, `tests/voters-view.test.ts`

**Interfaces:**
- Consumes: Task 4's `CentreArea`, `centreAreas`; `Client` (`src/lib/houses.functions.ts`); `pageAll`; `requireSupabaseAuth`; the existing `VotersSearch`, `searchHits`, `cameraFor`, `hintFor`.
- Produces:
  - `src/lib/centres.ts`:
    - `Centre = { id; code; iebc: string | null; name; wardId: string | null; streams: number; voters: number; placed: Placement | null; suggestion: Suggestion | null }`, with `Placement = { at: LngLat; by: "osm" | "osm-close" | "organiser" | "agent"; accuracyM: number | null; when: string | null; who: string | null }` and `Suggestion = { at; accuracyM; when; who }`; `at` is `[longitude, latitude]`.
    - `toCentres(rows: unknown, names: Map<string, string>): Centre[]` (a row without an id, code or name is left out; a position needs both coordinates on Earth and a source it can name).
    - `centreDots(centres): CentreDots`, `dotSize(voters: number): number` (4 to 24), `centreAreaShapes(areas, centres): CentreAreaShapes`, `CENTRE_TINT`, `CENTRE_SWATCH`.
  - `src/lib/centres.functions.ts`:
    - `readCentres(sb: Client): Promise<Centre[] | null>`.
    - `cleanId`, `cleanPin(input): Pin`, `cleanHere(input): Here`.
    - `placeStation(sb, pin)`, `adoptSuggestion(sb, id)`, `stationHere(sb, here): Promise<HereResult>`; messages written for people (`P0001`, `42501`) pass through, anything else says only "Could not ...".
    - Server functions `getCentres` (GET), `placeCentre`, `takeCentreSuggestion`, `confirmCentreHere` (POST).
  - `VotersSearch.centre?: string`, matching `/^[A-Z0-9][A-Z0-9-]{1,19}$/` after upper-casing; `stepFor` makes a centre a step.
  - `voters-map.ts`: `CENTRE_ZOOM = 15.5`; `cameraFor({ area, house?, centre?: LngLat | null }, ...)` (a house outranks a centre; one outside the map area is no centre); `hintFor(level, top, centres = false)`; `centreStays(open, area, level, wards): boolean`; `SearchHit` kind `"centre"` (`{ code, label, sub, wardSlug, at: LngLat | null }`); `searchHits(q, wards, people, top, centres = [], max = 5)` (names that start with what was typed first); `searchGo` closes the other card.
  - `VotersCanvas` props `centres: CentreDots`, `centreAreas: CentreAreaShapes`, `centre: string | null`, `onCentre(code)`.

- [ ] **Step 1: Bring the commits in**

```bash
git cherry-pick 5478306 f9ffba4 856e39c
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/centres.test.ts
npx tsx --tsconfig tsconfig.json tests/centres-functions.test.ts
npx tsx --tsconfig tsconfig.json tests/voters-map.test.ts
npx tsx --tsconfig tsconfig.json tests/voters-view.test.ts
```

Expected: `27 passed, 0 failed`; `24 passed, 0 failed`; `56 passed, 0 failed`; `42 passed, 0 failed`.

What they pin: latitude and longitude are not swapped; a pin needs a source and a place on Earth; a bad row can't take the list down; a bigger register is a bigger dot; the read pages past 1,000 rows, returns `null` for a refused read and logs once; the SQL functions are called with their exact argument names; the database's own words pass through only for our two error codes; a link opens a centre; a ward, constituency, person's house or place closes it; moving into another ward or zooming out closes it.

- [ ] **Step 3: Format, lint and types**

```bash
npx prettier --check src/lib/centres.ts src/lib/centres.functions.ts src/lib/voters-map.ts src/lib/voters-view.ts src/components/gw/voters/VotersCanvas.tsx src/components/gw/voters/MapSearch.tsx src/components/gw/voters/CentreCard.tsx src/routes/_authenticated/voters.tsx tests/centres.test.ts tests/centres-functions.test.ts tests/voters-map.test.ts tests/voters-view.test.ts
npx eslint src/lib/centres.ts src/lib/centres.functions.ts src/lib/voters-map.ts src/lib/voters-view.ts src/components/gw/voters src/routes/_authenticated/voters.tsx tests/centres.test.ts tests/centres-functions.test.ts tests/voters-map.test.ts tests/voters-view.test.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: no complaints.

- [ ] **Step 4: Look at it in the preview harness** (a scratch Vite app with an in-memory database seeded with Nairobi's 378 centres; not committed, rebuilt as `groundwork-lovable-deploys` describes). Open `/voters?area=w:kileleshwa`:
  - dots sized by register, the hint "Click a centre to open it", the legend's "Nearest centre", the search box reading "Search wards, centres, people";
  - a click on a dot opens its card, rings the dot, shades and outlines its area, and writes `centre=PS-0046` to the address, without moving the map;
  - "lavington" in the search finds "LAVINGTON PRIMARY SCHOOL · Kilimani ward · 6,379 voters · not on the map yet", and choosing it opens Kilimani and its card;
  - zoomed to street level, the hint is "Click a house to open it", the dot is still clickable, and a house clicked beside it replaces the centre card;
  - on a phone width the card raises the bottom sheet.

---

### Task 6: The panel: the ward's list, a centre's card, Place it

**Commit:** `03bc747`

**Files:**
- Create: `src/components/gw/voters/CentresList.tsx`, `src/components/gw/voters/PlaceIt.tsx`, `src/hooks/useWardCentres.ts`, `src/hooks/useAreaHouses.ts`
- Modify: `src/components/gw/voters/CentreCard.tsx` (the full card), `src/components/gw/voters/VotersCanvas.tsx` (the pin), `src/components/gw/voters/MapPanel.tsx`, `src/routes/_authenticated/voters.tsx`, `src/lib/centres.ts`, `src/lib/house-tiles.ts`, `src/styles/groundwork.css`, `tests/centres.test.ts`, `tests/house-tiles.test.ts`

**Interfaces:**
- Consumes: Task 5's `Centre`, `readCentres`, `placeCentre`, `takeCentreSuggestion`; Task 4's `CentreArea`, `centreAt`; `HouseState` (`src/lib/houses.ts`), `Building` (`src/lib/geo.ts`), `plusCodeCentre`, `housesInTile` (`src/lib/house-source.ts`), `MyRole` (`src/lib/access.ts`), `useAccess().access.role`.
- Produces:
  - `centres.ts`: `centreDoors(houses: HouseState[], areas: CentreArea[]): Map<string, CentreDoors>` with `CentreDoors = { knocked; rated; supporters }`; `housesIn(buildings: Building[], area): number`; `wardCentres(centres, wardId): { placed: Centre[]; waiting: Centre[] }` (biggest register first, ties by name); `canPlaceCentres(role: MyRole): boolean`; `placementNote(p: Placement): string`; `suggestionNote(s: Suggestion, pin: LngLat | null): string`; `tilesToCount(area): { x: number; y: number }[] | null` (null when there is no outline or more than 100 tiles).
  - `house-tiles.ts`: `tilesCovering(box: Box): { x: number; y: number }[]` (west to east, each north to south); `tilesAround` now uses it.
  - `useWardCentres(wardId: string | null, shape: WardShape | undefined, centres: Centre[]): { placed; waiting; areas: CentreArea[]; areaShapes: CentreAreaShapes }`; `useAreaHouses(mapArea: MapArea | null, area: CentreArea | null | undefined): number | null | undefined` (undefined while counting).
  - Components: `CentresList({ placed, waiting, doors, open, canPlace, state: "reading" | "missing" | "ready", onOpen, onPlace })`; `CentreCard({ centre, wardName, placedInWard, waitingInWard, numbers: { doors; houses } | null, canPlace, onPlace, onClose })`; `PlaceIt({ centre, at, onDone, onCancel })`; `VotersCanvas` props `pin: LngLat | null` and `onPin(at)`; `MapPanel` prop `centres?: ReactNode`.
  - In `voters.tsx` the ward on show, its shapes and its areas are worked out once in `Voters` and handed to `MapScreen` and the panel.

- [ ] **Step 1: Bring the commit in**

```bash
git cherry-pick 03bc747
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/centres.test.ts
npx tsx --tsconfig tsconfig.json tests/house-tiles.test.ts
```

Expected: `37 passed, 0 failed` and `28 passed, 0 failed`. (`voters-map` stays at 56 and `voters-view` at 42.)

What they pin, with real Kileleshwa house codes: each knocked house counts in the area it stands in; a supporter is a last score of 4 or 5; the ward's list and "not on the map yet" list are ordered and never hold another ward's centres; each source of a position says what it is, with a name and a date in Nairobi time; a suggestion says how far it is from the pin ("about 240 m", "about 1.5 km"); agents and people not yet admitted may not place centres; an area's tiles are those its outline covers (numbers worked out by hand), and one too big is not counted.

- [ ] **Step 3: Format, lint and types**

```bash
npx prettier --check src/components/gw/voters/*.tsx src/hooks/useWardCentres.ts src/hooks/useAreaHouses.ts src/lib/centres.ts src/lib/house-tiles.ts src/routes/_authenticated/voters.tsx tests/centres.test.ts tests/house-tiles.test.ts
npx eslint src/components/gw/voters src/hooks/useWardCentres.ts src/hooks/useAreaHouses.ts src/lib/centres.ts src/lib/house-tiles.ts src/routes/_authenticated/voters.tsx tests/centres.test.ts tests/house-tiles.test.ts
npx tsc --noEmit -p tsconfig.json
```

Expected: no complaints. (Do not run Prettier on `src/styles/groundwork.css`.)

- [ ] **Step 4: Look at it in the harness.** Open `/voters?area=w:kileleshwa` as the manager, scroll the panel:
  - "Polling centres · IEBC register of 2022": four placed centres by register size with "N houses knocked" (119, 147, 80, 78), then "Not on the map yet" holding Jomo Kenyatta University with "Open" and "Place it";
  - "Open" on Kileleshwa Primary School: the card says "Placed by Harness Manager on 12 Oct.", its area has 3,069 houses on the map, 119 knocked and 21 of 67 supporters scored, and says that 1 of the ward's 5 centres isn't on the map yet;
  - "Move it": the hint changes, the card becomes "Save this position / Cancel", a tap on the map moves the pin; "Save this position" moves the dot, the card says "Placed by Harness Manager on 14 Oct." and the area's numbers change (3,342 houses);
  - Lavington Primary School (Kilimani, not placed, with a suggestion): the card shows Brian Otieno's suggestion with "Use this position"; "Place it" starts the pin at the suggestion; dragging the pin and saving puts the dot where it was dropped;
  - as `?role=agent`, the same screens show "Open" only: no "Place it", "Move it" or "Use this position".

---

### Task 7: The field page: Polling centres near me

**Commit:** `5159c13`

**Files:**
- Create: `src/components/gw/CentresNearMe.tsx`
- Modify: `src/lib/centres.ts`, `src/lib/centres.functions.ts`, `src/hooks/useDoorPlace.ts` (exports `useFix`), `src/routes/_authenticated/field.tsx`, `tests/centres.test.ts`

**Interfaces:**
- Consumes: `useFix(): Geo` (`{ status: "locating" | "ok" | "off" | "none"; fix: Fix | null; slow: boolean }`), `useOnline`, `wardAt`, `wardShapes`, `getJson`, `getMapConfig`, Task 5's `getCentres` and `confirmCentreHere`, Task 6's `wardCentres`.
- Produces:
  - `centresNear(centres, at: LngLat, wardId: string | null, radiusM = NEAR_M): { near: { centre: Centre; metres: number }[]; waiting: Centre[] }` (those on the map within 2 km, nearest first, metres rounded; the ward's unplaced centres, biggest register first).
  - `hereMessage(r: HereResult, accuracyM: number | null): string`, `HereResult = { moved: boolean; why: "accuracy" | "distance" | "no-ward" | null }` (now defined in `centres.ts`; `centres.functions.ts` re-exports it), `NEAR_M = 2000`, `HERE_ACCURACY_M = 50`, `HERE_OUTSIDE_M = 300`.
  - `CentresNearMe({ wards })`: offline, "This needs signal."; asked, it watches the phone's position, and shows "Your position is good to 15 m." (in red with advice when it is over 50 m), the centres, and "I'm here" on each.

- [ ] **Step 1: Bring the commit in**

```bash
git cherry-pick 5159c13
```

- [ ] **Step 2: Run the checks**

```bash
npx tsx --tsconfig tsconfig.json tests/centres.test.ts
npx tsx --tsconfig tsconfig.json tests/centres-functions.test.ts
npx tsx --tsconfig tsconfig.json tests/door-place.test.ts
```

Expected: `42 passed, 0 failed`; `24 passed, 0 failed`; `34 passed, 0 failed`.

What they pin: within 2 km, nearest first, with metres (167 m and 1,501 m for centres 0.0015° and 0.0135° north); a wider reach finds more; with no ward known none is offered to place; every answer of "I'm here" in words (good, 80 m, no accuracy, far, no ward, unreadable).

- [ ] **Step 3: Format, lint and types**

```bash
npx prettier --check src/components/gw/CentresNearMe.tsx src/routes/_authenticated/field.tsx src/hooks/useDoorPlace.ts src/lib/centres.ts src/lib/centres.functions.ts tests/centres.test.ts
npx eslint src/components/gw/CentresNearMe.tsx src/routes/_authenticated/field.tsx src/hooks/useDoorPlace.ts src/lib/centres.ts src/lib/centres.functions.ts tests/centres.test.ts
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Look at it in the harness at a phone's width** (`/field`; the browser pane can't give a real fix, so stub `navigator.geolocation.watchPosition` in the console to stand at Kileleshwa Primary School):
  - before the button is pressed, no position is watched and the card explains itself; after "Find the centres near me": "Your position is good to 15 m.", the centres nearest first (17 m, 911 m, 1,128 m...), then "In Kileleshwa, not on the map yet";
  - "I'm here" on the nearest: "Thank you: the centre is now where you are." and the list shows it 0 m away;
  - with `?here=vague` and an 80 m fix: the line turns red and the answer says the position is kept for an organiser to check;
  - with location blocked: "The phone's location is off for this page. Allow it in the browser's settings to find the centres near you."; with the connection dropped: "This needs signal.".

---

### Task 8: Put it together, check it, and (with the user's OK) release it

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md`, `AGENTS.md`

**Interfaces:**
- Consumes: Tasks 1 to 7 on `polling-centres`.
- Produces: `main` with the centres, schema 27 applied and verified, and the site published; the notes a later session needs.

- [ ] **Step 1: Start from the latest `main`**

```bash
git fetch origin
git log --oneline polling-centres..origin/main
git ls-tree --name-only origin/main supabase/migrations/ | tail -3
```

Read what is new. If `origin/main` has added a migration, schema 27 may have to take the next number: rename both migration files and `select 27` in the data file, regenerate with `scripts/stations/build-sql.ts`, and tell the user. If it has not (today it is only Lovable's WhatsApp templates, `03ff702` and `92e11ad`), rebase the local `polling-centres` (spec and plan only; nothing of it is pushed) onto it:

```bash
git rebase origin/main
```

- [ ] **Step 2: Do Tasks 1 to 7 above, in order,** each task's checks after its commits. Where a task's check fails, stop and say so.

- [ ] **Step 3: The whole check**

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx eslint $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
npx prettier --check $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
npm run build
```

Expected: `npm test` ends with `ok   45 migrations apply cleanly` (more if `main` added any) and every SQL file ok, with no `FAIL` line anywhere and about 1,550 checks passing across 74 test files; `tsc`, ESLint and Prettier print nothing; the build ends with `✔ You can preview this build`. (The repository's ESLint reports about 3,800 Prettier errors in 85 files this branch does not touch; they are not new.)

- [ ] **Step 4: Look at it all once more in the harness:** Tasks 5 to 7's harness steps; the war room (`/warroom?mode=live`) and agents page (`/agents`); `/voters?centres=off`, which mimics schema 27 not being applied: the panel says "The polling centres aren't in yet", the default hint and legend show, and the console has exactly one line, `Could not read the polling centres: column polling_stations.lat does not exist`.

- [ ] **Step 5: Tell the next person what this is.** Edit the spec to say what was built (378 and 3,643 in place of 376 and 3,636, in all three places; the "Polling centres near me" bullet gains "and the ward's centres that are not on the map yet"; "Move it" is added to "Place it"; the status line says built), and add to `AGENTS.md`:

```
- Polling centres: polling_stations holds IEBC's 2022 register (data/stations, schema 27); a position is written only by place_station, use_station_suggestion and station_here, never by a direct update. The map draws the part of the ward nearest each placed centre, worked out in the browser (src/lib/stations/areas.ts), and counts a centre's doors from the houses' plus codes. Why: IEBC publishes no station boundaries, and a position anyone could overwrite would make every number built on it unreliable.
```

```bash
git add docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md AGENTS.md
git commit -m "Docs: what polling centres turned out to be, in the spec and AGENTS.md" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Stop and ask.** Report the results of Steps 2 to 4, and ask for the user's OK to push. Nothing below happens without it. In particular, say again that schema 27 changes Sakaja's and Mathira's ward voter numbers (decision 11) and replaces Sakaja's 85 sample stations (decision 12).

- [ ] **Step 7: With the OK, release.**
  - Fast-forward `main` and push it: `git switch main && git merge --ff-only polling-centres && git push origin main`. Lovable syncs the code; it does not run migrations or publish.
  - Apply schema 27 the way schema 26 was: through the Lovable connector's `query_database`, in one transaction that stops unless the database is at 26, with both files in order:

    ```sql
    begin;
    do $$
    begin
      if public.groundwork_schema_version() <> 26 then
        raise exception 'Expected schema 26, found %', public.groundwork_schema_version();
      end if;
    end $$;
    -- the whole of supabase/migrations/20261015090000_polling_centres.sql
    -- the whole of supabase/migrations/20261015090100_polling_centres_data.sql
    commit;
    ```

    Then check `groundwork_schema_version()` is 27, `select count(*) from polling_stations where iebc_code is not null` is 378 for Sakaja and Kalonzo and 109 for Mathira, and compare a fingerprint of the four functions (`md5(regexp_replace(prosrc, '\s+', ' ', 'g'))`) and the column grants with a local Postgres built from the migrations.
  - Publish with the connector's `deploy_project` (name `groundworkkenya`, after checking `get_project`'s `latest_commit_sha`), then check the live build: `/api/public/health` says 27 and the live chunks name the new strings.
  - If the connector is not available in the session, say so and leave applying and publishing to the user: do not look for another route.

- [ ] **Step 8: Hand over the phone test.** The spec leaves this to the user, after release: open Voters on a laptop and check a few wards' dots against what they know; stand at a real polling centre with the phone, open the field app, press "Find the centres near me" and "I'm here", then see the dot move on the Voters map.
