# Election atlas, part 2: hand-over notes from part 1

Part 1 (`docs/superpowers/plans/2026-10-07-election-atlas-1.md`) built the tables, the rules in
`src/lib/atlas/` and the county data pipeline. Part 2 is the Elections section (spec sections 5 and
6, build steps 4 to 6). These are the things the part 1 reviews found that part 2's screens and
queries must handle. They are collected here because the controller's working ledger is not
committed.

## Turning database rows into the rules' inputs

- **Undefined is not null.** `turnoutPct` and its neighbours test `=== null`. Where database rows
  become `Turnout` or `Vote`, normalise `undefined` to `null` (a missing key would otherwise come out
  as `NaN`).
- **Pass siblings' turnouts correctly.** `votesWithinReach` needs `siblingTurnouts` to include the
  area itself and to leave out siblings that have no turnout figure (it needs at least four).
- **A partial reach is partial.** When one part of `Reach` is missing, `total` equals the other part
  alone. Show the parts, or mark the total as partial, so it does not read as a smaller reach.
- **A false register flag is not "registered enough".** `registerFlag` answers `false` for missing
  inputs. Wherever it is shown, "not found yet" must come from the null figures
  (`notYetRegistered` is null), never from the flag.
- **Absent bloc is 0, so rows must be complete.** `ourShare` and `margin` read a bloc that is absent
  from a non-empty list of shares as 0. The checker now refuses an area where some candidates have
  votes and another has none, so the data it passes is complete; keep it that way (do not build a
  partial `Vote[]` from a query that can drop rows).

## What every screen must say

- **Level beside the tag.** `estimateTag` carries no level. Wherever a population estimate is shown,
  show the area's level (ward, county) beside the tag, so every number says at what level it was
  counted.
- **Ward results are the constituency's.** Until polling-station data, a ward shows its
  constituency's results, labelled "constituency figure" (`resultsArea`, `figureLabel`). For an MP
  campaign (Mathira, whose home area is a constituency) there are no ward-level "where to campaign"
  results until station data exists; say so rather than showing a blank.
- **Constituency population is a sum of a complete set of wards.** Nyeri's five constituencies
  without a ward map have no ward population; a partial sum would understate adults and the
  not-yet-registered estimate. Sum a constituency's wards only when all of them are present.

## Setting a side

- `atlas_sides.bloc` is free text in the database. A typo, or a bloc that no candidate stood for in
  that election, reads as 0% everywhere. The setup screen must offer only the blocs that some
  candidate stood for in that election (from `atlas_candidates`), never a free text box.

## Barrel, names and keys

- `@/lib/atlas` re-exports types (`export * from "./types"`, and advice's types); the surface test
  reads `Object.keys`, which cannot see types. The first `src/` screen that imports a type from
  `@/lib/atlas` pins them under the type check.
- Ward slugs must be unique across every county's ward map (`loadWardMaps` throws on a clash); a
  county-scoped ward key is the real fix if a later county repeats a ward name.
- The ward-population band rule assumes WorldPop's older series layout (ages 0, 1, then every five
  years up to 80). Check it against the real file list (part 1, Task 12 Step 8).

## Open decision

- **Who reads area notes.** Today any team member, including field agents, can read every area note
  through the API (`area_notes` has a team-read policy; the spec says "the team reads them"). No
  planned screen shows notes to agents. The final review recommends reading by candidate, manager and
  organiser only, enforced in the database. If the user decides yes, edit the migration in place
  before the release (it is unapplied): in the `area_notes` select policy use
  `public.my_campaign_role() in ('super', 'candidate', 'manager', 'organiser')`, and flip the
  agent assertion in `tests/sql/atlas.test.sql` to expect 0 notes.
