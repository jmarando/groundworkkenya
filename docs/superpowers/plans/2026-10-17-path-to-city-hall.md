# Path to City Hall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A governor's campaign gets the same kind of path the presidential one has: "Path to City Hall" (Nairobi) or "Path to County Hall" (any other county) on the Strategy page. It starts from the 2022 governor result constituency by constituency, lets the team move a constituency's share or turnout, and says at once whether the side still has more votes than anyone else, with plain readings whose every number is a figure. It works for any county whose 2022 governor result by constituency is in the atlas (today only Nairobi); every other governor campaign sees what is missing.

**Architecture:** No database change and no new data file: the section reads the atlas the Strategy page already loads (`getAtlas`). A pure reader, `src/lib/seat.ts`, turns the atlas rows into a `Seat` (the two main candidates' votes in each constituency, the register, the county's totals). A pure engine, `src/lib/seat-path.ts`, applies moves per constituency. A pure module, `src/lib/seat-lines.ts`, writes the readings with the findings engine's `Figure` and `unaccounted` check. The screen is one component beside `PathToStateHouse`, sharing its small parts.

**Tech Stack:** TanStack Start and Router, React 19, tsx test scripts. No new libraries.

**Spec:** none separate. The user opted out of the design conversation on 17 October 2026 for the insights and asked on the same day for this extension ("include the path strategy bits for everyone else, what's Sakaja's path to victory in Nairobi"); the Goal, Global Constraints and Decisions below stand in. The method is the one of `docs/superpowers/plans/2026-10-17-path-to-state-house.md`.

**Not in this plan:** the 2027 simulator (candidates, parties and situations; designed next); MP and MCA paths (the atlas has no results by ward); results for counties other than Nairobi and Nyeri; saving a path.

## Global Constraints

- **The rule:** a governor is elected in one round by the most votes (the research pack's reading of the Constitution, to be checked against Kenya Law). There is no second bar. "Leads" means more votes than every other candidate.
- **2022 reproduces exactly.** With no change the engine returns the atlas's own figures. Nairobi: Sakaja 699,392, Igathe 573,516, every other candidate 51,501, valid 1,324,409; Sakaja ahead by 125,876; 11 of the 13 constituencies reported separately; the four Embakasi seats together Sakaja +25,314 (165,801 to 140,487); 62,939 votes would have to change sides to turn the county.
- **What the atlas holds for a constituency is the two main candidates' votes** (as printed by the press) and the register; not valid or cast votes. So a constituency's share is the **two-way share** (a candidate's votes over the two main candidates' together), and its "turnout" is **the two main candidates' votes over the register**. Every other candidate is held as they were, county-wide.
- **Seats the figures don't separate** are one bucket: the county's total less the constituencies reported, with their registers added. It is never treated as a seat in "carried" or "closest".
- **A move** is in points: of the two-way share (−100 to +100) and of that turnout. Shares stay between 0 and 100; turnout between 0 and 100% of the register.
- **Places, not people.** The section names constituencies and says nothing of anyone's community.
- **Every number in a reading is a figure** (`Figure` with label, value, text, source, period); `unaccounted(line)` is empty for every reading.
- **Who sees it:** everyone who can open Strategy, on a governor campaign, open. A governor campaign whose county has no result by constituency sees one card that says so. Other campaigns see nothing new.
- **Words on screen, exactly:** "Path to City Hall" (Nairobi), "Path to County Hall", "Start from", "<name>'s 2022 vote", "Ahead by", "Behind by", "Constituencies carried", "Votes to turn the county", "Reset to 2022", "Figures and sources".
- **Tests** are tsx files in `tests/` with the `eq()` helper, ending with ``console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);``. One at a time from the repository root: `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`; everything: `npm test`. `tsc` covers `src/` only.
- **Repository rules:** never run Prettier on `src/styles/groundwork.css` (add rules by hand); never name TransTally; the repository is public (no secrets, no voter data); commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nothing is pushed, applied or published without the user's OK; never rewrite pushed history.

## Decisions to confirm

1. **Nairobi only, for now.** The code works for any county the atlas holds by constituency; only Nairobi has it (13 of 17 constituencies; Nyeri has the county total only). Opening another county is a data job (IEBC's constituency forms), not a code one.
2. **The figures are the atlas's own,** The Star's printed top two for each constituency and the provisional county totals, not yet checked against IEBC's Form 37C. The four Embakasi seats are shown together because the press figures for them could not be placed.
3. **Two-way share and "main-two turnout"** because that is all the figures give; the county's other candidates (3.9% in Nairobi) are held fixed.
4. **MPs and MCAs get nothing new here:** the atlas has no results by ward, so a path by ward would be made up.
5. **The ticket reading** (what the governor candidate polled against the presidential candidate of the same bloc in the county) compares totals of votes, not voters.

## Review Focus

1. **A constituency pushed to the ends.** +100, −100, or turnout past 100%: no NaN, no negative votes, shares inside 0 to 100. Pinned: Task 2.
2. **A tie.** Equal votes: nobody leads, and one vote changing sides settles it. Pinned: Task 2.
3. **The seats shown together.** Their total is the county's less the constituencies reported; never counted as a seat; a remainder below zero refuses the seat. Pinned: Task 1 and Task 2.
4. **A county with the total only (Nyeri) or nothing.** A sentence, not a crash. Pinned: Task 1.
5. **A phone.** The rows read at 390 px with no sideways scroll. Seen in Task 4's harness steps.

---

### Task 1: The seat reader

**Files:**
- Create: `src/lib/seat.ts`, `tests/atlas-csv.ts` (a test helper: the atlas CSVs of one folder as `AtlasData`)
- Test: `tests/seat.test.ts`

**Interfaces:**
- Consumes: `AtlasData` from `src/lib/atlas-view.ts` (`areas`, `candidates`, `results`, `register`, `sources`).
- Produces: in `src/lib/seat.ts`
  - `type Contender = { name: string; bloc: string }`
  - `type SeatBucket = { key: string; name: string; seats: number; together: boolean; yours: number; rival: number; registered: number }`
  - `type Seat = { county: string; countyName: string; election: string; yours: Contender; rival: Contender; defaulted: boolean; others: number; topOther: number; total: { yours: number; rival: number; valid: number }; buckets: SeatBucket[]; president: { yours: number; rival: number } | null; source: { constituencies: string; county: string } }` (`defaulted`: no bloc was given or none matched, so the county's winner is "yours")
  - `type SeatResult = { ok: true; seat: Seat } | { ok: false; why: string }`
  - `seatFromAtlas(d: AtlasData, county: string, bloc: string | null, year?: number): SeatResult` (year 2022)
  - `flipSeat(s: Seat): Seat` (the rival's side as "yours"; `defaulted` false, `president` swapped)
  - `togetherName(names: string[]): string` ("Embakasi Central, East, North and South")

- [ ] **Step 1: Write the failing test**, `tests/seat.test.ts`, on the real Nairobi atlas (`tests/atlas-csv.ts` reads `data/atlas/nairobi/*.csv` into `AtlasData`: candidate id = `election|seat|name`) and on small made-up atlases:
  - "Nairobi, 2022 governor": county totals Sakaja 699,392, Igathe 573,516, others 51,501, valid 1,324,409, `topOther` 10,521; the 13 constituencies reported (Dagoretti North … Westlands, in the atlas's order) and one `together` bucket of 4 seats named "Embakasi Central, East, North and South" with yours 165,801, rival 140,487, registered 581,788; Kasarani's registered is 155,250 and its votes 60,578 and 27,862; the buckets' votes add up to the county's.
  - "yours from the campaign's bloc": "Kenya Kwanza" → Sakaja; "Azimio" → Igathe (`defaulted` false); null or an unknown bloc → Sakaja, `defaulted` true.
  - "the presidential candidate of the same bloc": `president` = Ruto's 561,775 for yours and Raila's 767,395 for the rival; null when no presidential candidate shares the bloc.
  - "the sources are named": the constituency figures' and the county's sources read as "publisher: title".
  - "Nyeri": the 2022 governor is on file for the county only → `ok: false`, the sentence says by constituency; a county with no governor candidates → `ok: false`.
  - made-up atlases: the register read from a constituency's own row, else the sum of its wards; a remainder below zero → `ok: false`; no register for a bucket → `ok: false`; a seat with nothing missing has no `together` bucket.
  - "flipSeat": yours and rival swap in the seat, in every bucket and in `president`; flipping twice is the seat.
  - "togetherName": one name; two names; the same first word → "Embakasi Central, East, North and South"; different first words → joined in full.
- [ ] **Step 2: Run it.** `npx tsx --tsconfig tsconfig.json tests/seat.test.ts` — Expected: FAIL (cannot find `@/lib/seat`).
- [ ] **Step 3: Implement** the reader. Candidates of the election whose `seat` is the county; their county votes; yours is the one whose bloc is `bloc`, else the winner; the rival is the best of the rest; a constituency is a bucket when both have a row there; the seats without become one `together` bucket (county total less the buckets, registers added); the register is the constituency's own 2022 row, else its wards' sum.
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add src/lib/seat.ts tests/atlas-csv.ts tests/seat.test.ts && git commit -m "Path to City Hall: the seat reader"`.

### Task 2: The engine

**Files:**
- Create: `src/lib/seat-path.ts`
- Test: `tests/seat-path.test.ts`

**Interfaces:**
- Consumes: `Seat`, `SeatBucket` from Task 1; `Move`, `Scenario` from `src/lib/path.ts` (keyed by bucket key).
- Produces: in `src/lib/seat-path.ts`
  - `type BucketNow = { key: string; name: string; seats: number; together: boolean; yours: number; rival: number; margin: number; share: number; turnout: number; registered: number; was: { yours: number; rival: number; margin: number; share: number; turnout: number } }` (`share` is the two-way share, `turnout` the two main candidates' votes over the register; `was` is 2022)
  - `type SeatTotals = { yours: number; rival: number; others: number; valid: number; share: number; margin: number; leads: boolean; toTurn: number; carried: number; reported: number; together: { seats: number; margin: number } | null; turnout: number }` (`leads`: more than the rival and than the biggest other candidate; `toTurn`: votes that would have to change sides to change who leads, `floor(|margin| / 2) + 1`; `carried` of `reported` single-seat buckets with a positive margin; `turnout` the two main candidates' over the whole register)
  - `type SeatRun = { totals: SeatTotals; buckets: BucketNow[] }`
  - `runSeat(seat: Seat, sc?: Scenario): SeatRun`
  - `worthSeat(seat: Seat, key: string, points?: number): { votes: number; margin: number }` (five points by default: votes gained and the change in margin)
  - `seatTurnoutLever(seat: Seat): { key: string; name: string; turnout: number; county: number; extra: number; net: number } | null` (the bucket where your side leads and lifting main-two turnout to the county's adds the most net votes)
  - `closestSeats(seat: Seat, sc?: Scenario, n?: number): BucketNow[]` (single-seat buckets by smallest |margin|, ties by name; `n` is 4)

- [ ] **Step 1: Write the failing test**, `tests/seat-path.test.ts`, with figures worked out separately from the definitions (a scratch reference model on the same rows). On Nairobi through `seatFromAtlas`:
  - "2022 as the atlas has it": yours 699,392, rival 573,516, others 51,501, valid 1,324,409, margin 125,876, share 52.81%, `leads` true, `toTurn` 62,939, `carried` 11 of `reported` 13, `together` {4, +25,314}, county main-two turnout 52.70%.
  - "a move of zero changes nothing" (deep equal, exactly).
  - "five points": Kasarani's 5 points = 4,422 votes, +8,844 on the margin; Roysambu's 4,408 and 8,816.
  - "−10 in Kasarani": margin 108,188, still leads.
  - "the rival's side": `runSeat(flipSeat(seat))` has margin −125,876, `leads` false, `toTurn` 62,939, `carried` 2.
  - "turnout lever": Kamukunji (main-two turnout 43.6% against 52.7%), extra about 11,655 votes, net about 1,747.
  - "closest": Langata 728, Dagoretti North 729, Mathare 1,334, Westlands 1,389; the together bucket is never listed.
  - made-up seats: "shares stop at 0 and 100" (+100, −100, no NaN); "turnout stops at 100% of the register"; "a tie: nobody leads, `toTurn` 1"; "a rival one vote ahead leads, `toTurn` 1"; "the biggest other candidate counts: a seat where yours beats the rival but not a third candidate does not lead"; "a bucket with no votes between the two" does not divide by zero.
- [ ] **Step 2: Run it.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `runSeat` and the rest. Per bucket: two = yours + rival; share `s = yours / two`; moved share `clamp(s + d)` (yours exactly as it was when `d` is 0); turnout `t = two / registered`, moved `clamp(t + e)`, every vote count × `t1 / t`; a bucket with `two` of 0 stays at 0. Totals add the buckets; others are held.
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add src/lib/seat-path.ts tests/seat-path.test.ts && git commit -m "Path to City Hall: the engine"`.

### Task 3: The readings

**Files:**
- Create: `src/lib/seat-lines.ts`
- Test: `tests/seat-lines.test.ts`

**Interfaces:**
- Consumes: `Seat`, `runSeat`, `worthSeat`, `seatTurnoutLever`, `closestSeats`; `Figure`, `count`, `percent` from `src/lib/findings/core.ts`; `lead` from `src/lib/path-view.ts`; `sharePercent`, `PathLine` from `src/lib/path-lines.ts` (the id type widens to a string union both modules use).
- Produces: in `src/lib/seat-lines.ts`: `seatLines(seat: Seat, sc?: Scenario): PathLine[]` with ids `"standing" | "turn" | "closest" | "lever" | "turnout" | "ticket"`; `hallName(countyName: string): string` ("City Hall" for Nairobi, else "County Hall").

- [ ] **Step 1: Write the failing test**, `tests/seat-lines.test.ts` (every line also through `unaccounted`):
  - "standing on 2022's map": "On 2022's map your side has 52.8% of the valid votes and is ahead by 125,876 votes. It carried 11 of the 13 constituencies reported separately, and the 4 seats reported together." Behind: "is behind by …"; level: "is level"; after a change "With your changes …"; one constituency reads "1 constituency".
  - "turn": "62,939 votes would have to change sides to turn the county." (and for a level county "1 vote").
  - "closest": "The closest constituencies: Langata (ahead by 728), Dagoretti North (ahead by 729), Mathare (ahead by 1,334) and Westlands (ahead by 1,389)." and "behind by" where the rival leads; fewer than four seats names those.
  - "lever": "Kasarani is the biggest constituency reported separately, with 88,440 votes between the two main candidates. Five points of share there is worth about 8,800 votes on the margin."
  - "turnout": "The two main candidates together took 44% of Kamukunji's register against 53% across Nairobi in 2022. Lifting it to the county's level would add about 11,700 votes, about 1,700 net for your side." (rounded to the hundred); none when no bucket qualifies.
  - "ticket": "Johnson Sakaja polled 137,617 more votes than William Ruto did in Nairobi in 2022; Polycarp Igathe polled 193,879 fewer than Raila Odinga." and the "fewer"/"more" turned round when the signs are; none when `president` is null.
  - "the rival's side" reads the same lines from the other side (their `ticket` is "…193,879 fewer…" first).
  - `hallName("Nairobi")` is "City Hall"; any other is "County Hall".
  - "every figure names its source and period"; "every number is a figure" for each line above.
- [ ] **Step 2: Run it.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `seatLines` and `hallName`. Figures cite the atlas's own sources (from `seat.source`), "Your changes on the 2022 map" for scenario figures; round "about" votes to the nearest hundred.
- [ ] **Step 4: Run it.** Expected: PASS, 0 failed.
- [ ] **Step 5: Commit** — `git add src/lib/seat-lines.ts tests/seat-lines.test.ts && git commit -m "Path to City Hall: the readings"`.

### Task 4: The screen, the notes, and a look at it

**Files:**
- Create: `src/components/gw/strategy/PathToCityHall.tsx`, `src/components/gw/strategy/PathParts.tsx` (the shared `Reading` and `Tile`, moved out of `PathToStateHouse.tsx`)
- Modify: `src/components/gw/strategy/PathToStateHouse.tsx` (imports the shared parts), `src/routes/_authenticated/strategy.tsx`, `src/styles/groundwork.css` (by hand), `AGENTS.md`

**Interfaces:**
- Consumes: Tasks 1 to 3; `setMove`, `signed`, `lead`, `RANGE` from `src/lib/path-view.ts`.
- Produces: `PathToCityHall({ seat }: { seat: Seat })`; `PathParts` exports `Reading`, `Tile`.

- [ ] **Step 1: Move `Reading` and `Tile`** into `PathParts.tsx` and import them in `PathToStateHouse.tsx`; `npx tsc --noEmit -p tsconfig.json` and `npx tsx --tsconfig tsconfig.json tests/path-view.test.ts` still pass; the president's section looks as before in the harness.
- [ ] **Step 2: Build `PathToCityHall`.** Open by default. "Start from" two buttons ("<yours>'s 2022 vote", "<rival>'s 2022 vote", `flipSeat` for the second; changing side starts the moves again). Three tiles: "Ahead by" / "Behind by" (votes), "Constituencies carried" (`11 of 13`, with "plus the 4 seats reported together" when there are), "Votes to turn the county". The readings. One row for each bucket in the order of the county's size: name (the together bucket says how many seats), its two-way share in 2022 and now, the main-two turnout in 2022 and now, a share slider (−20 to +20) and a turnout slider (−15 to +15), the margin now. "Reset to 2022". Fine print: where the figures come from (`seat.source`), the seats shown together, what share and turnout mean here, that other candidates are held, the rule (the most votes wins, in one round), "Constituencies are places; nothing here records or guesses anyone's community". CSS `.pth-*` reused, new ones `.pch-*` by hand.
- [ ] **Step 3: Wire it into the Strategy page** for `campaign.level === "governor"`: `seatFromAtlas(atlas, home, atlas.sides["2022-governor"] ?? null)`; when `ok` the section; when not, one card "Path to County Hall" with the sentence `why`. Nothing for other levels.
- [ ] **Step 4: Check it.** `npx tsc --noEmit -p tsconfig.json`, `npx eslint` and `npx prettier --check` on the changed ts/tsx (never the CSS), `npm run build`; then in the preview harness with the real Nairobi atlas: the section at 1000 px and 390 px (no sideways scroll), both sides, +10 in Kasarani, a −10, Reset, a county with the total only showing its sentence, a presidential campaign unchanged, the 2022 numbers against the declared ones.
- [ ] **Step 5: AGENTS.md** — a short bullet: the section reads the atlas, which counties it works for, what share and turnout mean, places not people.
- [ ] **Step 6: Run everything.** `npm test` — Expected: exit 0.
- [ ] **Step 7: Commit** — `git add -A src tests AGENTS.md docs && git commit -m "Path to City Hall: the Strategy section"` (stage by name; leave the untracked `schema-*.sql` files alone).
