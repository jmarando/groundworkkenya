# Insights minors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the minors deferred from the reviews of Path to State House and Path to City Hall that can be fixed: the readings round small effects sensibly, say which map they are worked out on, list only close constituencies as close, stop showing a stale note and carry the ticket reading's limit; the governor's screen gets an "every constituency" control; both scoreboards are announced to screen readers; a failed findings load no longer hides the paths; the county fold-out lines up.

**Architecture:** Changes to the pure modules `src/lib/path-lines.ts`, `src/lib/seat-lines.ts`, `src/lib/seat-path.ts`, `src/lib/path-view.ts` (each test-first), then to the two path components, the Strategy route and a few hand-written CSS rules. No data, no database.

**Tech Stack:** TanStack Start and Router, React 19, tsx test scripts. No new libraries.

**Spec:** the two earlier plans (`2026-10-17-path-to-state-house.md`, `2026-10-17-path-to-city-hall.md`) and the minors listed in their reviews; the user asked on 18 October 2026 to "fix the deferred minors".

**Not fixed, and why:** the four Embakasi seats can't be moved apart (the atlas's figures don't separate them); only Strategy shows the governor's path (a choice, not a defect); the turnout lever's `>=` against `>` (an equivalent mutant: no gap, no net); the votes short of half reading 1 when nobody voted (right: one vote would be more than half of none, and the sliders can't reach it). The walk lists' own deferred minors are a separate list.

## Global Constraints

- Every number in a reading is a figure (`unaccounted(line)` empty); words on screen change only where this plan says.
- Tests are tsx files in `tests/` with the `eq()` helper; one at a time `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`; everything `npm test`. `tsc` covers `src/` only.
- Repository rules: never run Prettier on `src/styles/groundwork.css` (add rules by hand); never name TransTally; the repository is public; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nothing is published or applied without the user's OK.

## Review Focus

1. A small effect no longer reads "about 0": under 1,000 votes it rounds to ten, under 10,000 to a hundred.
2. A county with no constituency within five points of a tie writes no "closest" line, not a line of far-off ones.
3. Starting from the other side shows no note about the campaign's own side.
4. The "every constituency" control sets every row, never touches rows it was not given, and shows "mixed" rather than a wrong value.

---

### Task 1: The sentences

**Files:**
- Modify: `src/lib/path-lines.ts`, `src/lib/seat-lines.ts`, `src/lib/seat-path.ts`
- Test: `tests/path-lines.test.ts`, `tests/seat-lines.test.ts`, `tests/seat-path.test.ts`

**Interfaces:**
- Produces: `thousands(n: number): string` exported from `path-lines.ts` (under 1,000: nearest 10; under 10,000: nearest 100; else nearest 1,000); `hundreds(n: number): string` exported from `seat-lines.ts` (under 1,000: nearest 10; else nearest 100); `seatIntro(seat: Seat, flipped: boolean): string` in `seat-lines.ts`; `closestSeats(seat, sc?, n?, within?)` gains `within` (default 0.05: a seat is close when its margin is at most that share of the votes between the two main candidates), and the "closest" reading is left out when none is.

- [ ] **Step 1: Write the failing tests.** `path-lines`: `thousands` of 112,151 / 8,844 / 640 / 0.4 is "112,000" / "8,800" / "640" / "0"; the president's "biggest" reading now starts "On 2022's map, Mt Kenya West is the biggest region, 16% of valid votes." and carries the year as a figure. `seat-lines`: `hundreds` of 11,655 / 1,746.5 / 640 / 34 is "11,700" / "1,700" / "640" / "30"; the governor's "lever" reading starts "On 2022's map, Kasarani is the biggest constituency reported separately"; `seatIntro` says nothing about a default once flipped and carries the sentence otherwise; the "closest" reading is absent for a seat whose nearest constituency is 6% apart, lists only the close ones when some are not, and still lists Langata, Dagoretti North, Mathare and Westlands for Nairobi. `seat-path`: `closestSeats(seat, {}, 4, 0.01)` is Langata and Dagoretti North only; `within` 0 is none.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run them.** Expected: PASS; mutation-check the new lines.
- [ ] **Step 5: Commit** — `git add src/lib tests && git commit -m "Insights minors: the sentences"`.

### Task 2: The screens

**Files:**
- Modify: `src/lib/path-view.ts`, `src/components/gw/strategy/PathToCityHall.tsx`, `src/components/gw/strategy/PathToStateHouse.tsx`, `src/routes/_authenticated/strategy.tsx`, `src/styles/groundwork.css` (by hand)
- Test: `tests/path-view.test.ts`

**Interfaces:**
- Produces in `path-view.ts`: `setAll(sc: Scenario, keys: string[], patch: Partial<Move>): Scenario`; `commonMove(sc: Scenario, keys: string[]): { share: number | null; turnout: number | null }` (what every listed key has in common, null where they differ).

- [ ] **Step 1: Write the failing tests** for `setAll` (adds to every key; merges; drops a key left at zero and zero; leaves keys not listed alone; never changes its input) and `commonMove` (nothing set: 0 and 0; all alike: that value; differing: null; a subset of keys; no keys: 0 and 0).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** both, then the screens: the governor's "Every constituency" row with the two sliders (share and turnout) above the rows, showing "mixed" where rows differ; the intro from `seatIntro`; the ticket's limit in the fine print ("The comparison with the presidential vote is of two totals of votes. It says nothing about how many people voted for one party's candidate for governor and another's for president."); `aria-live="polite"` on both scoreboards; the Strategy page keeps the path sections when the findings fail to load; the county fold-out's columns made fixed-width so they line up from row to row.
- [ ] **Step 4: Check it.** tsc, eslint, prettier (never the CSS), `npm run build`; in the preview: the "every constituency" slider moves all 14 rows and Reset clears it; starting from Igathe's side hides the default note; a forced findings failure still shows both sections; the fold-out lines up.
- [ ] **Step 5: Run everything.** `npm test` — Expected: exit 0.
- [ ] **Step 6: Commit** — `git add -A src tests docs && git commit -m "Insights minors: the screens"` (stage by name; leave the untracked `schema-*.sql` files alone).
