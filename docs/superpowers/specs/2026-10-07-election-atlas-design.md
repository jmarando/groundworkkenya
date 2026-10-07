# Election atlas: three elections, who lives where, and where votes can move

Date: 7 October 2026. Builds on `2026-09-29-home-voters-race-design.md` (Home, race data,
Voters) and `2026-09-30-real-mornings-design.md`. Built on the same local branch, after
Voters; the release plan (one push, migrations first, with the user's OK) is unchanged.

## Why

The user, 7 October: add something much more analytical, in its own section and woven
through the site: the last three elections down to the polling station, community (tribe)
dynamics, who lives where, and the youth factor. On 7 October they added that constituency
views matter as much as county ones: Groundwork will sell hard to MPs, and the constituency is
the detail a campaign plans in.

Decided with the user:

- **First use: where to campaign.** Strongholds to hold, swing areas to win, low-turnout
  friendly areas to mobilise, and places where many adults aren't registered.
- **Data: published totals now, stations next.** IEBC publishes constituency totals for every
  race; ward totals for the presidential, governor and MP races exist only by adding up
  stations. This spec loads the published totals plus registers and population estimates. A
  Form 34A reader for 2022's station results is its own, later spec, writing into the same
  tables.
- **Communities: results plus area notes.** How each area voted shows its political lean
  without labelling anyone. The team writes notes about places (communities, languages used
  locally, churches, associations, local leaders). Nothing is ever recorded about a person's
  tribe, and nothing is guessed from names: Kenya's Data Protection Act 2019 makes ethnicity
  sensitive personal data, the NCIC Act 2008 bears on ethnic targeting, and KNBS published 2019
  ethnicity for Kenya as a whole only, so no official breakdown exists below that.
- **One shared atlas.** Public facts (results, registers, population estimates) are loaded
  once into tables every campaign reads; each campaign keeps its own notes and settings.
- **Constituency pages are the centrepiece**, built to work for any constituency loaded, with
  a printable brief.

Assumed, open to correction: the races are president, governor and MP (MCA, senator and
women representative later); the elections are 2013, 2017 and 2022, using the 8 August 2017
vote for the presidential race; the first counties are Nairobi (Sakaja) and Nyeri (Mathira);
Groundwork gathers and loads the data, nothing updates live.

## Success

For any loaded constituency, one page shows: its MP, governor and presidential results in
2013, 2017 and 2022; turnout, register and swing; what to do there and why; the votes within
reach; its wards with register growth, population and the young share; the team's notes; and
a printable brief to hand an MP. Every number says where it came from and at what level, and
estimates say they are estimates. Home shows where votes can move; Voters, the diary and the
War room carry the same numbers. Nothing is invented: a figure that wasn't found shows as
missing.

## 1. The shared atlas (public facts)

Terms: in the atlas an *election* is one race in one general election, so `2022-president` is
an election; the three general elections (2013, 2017, 2022) with three races each make nine.

Areas are keyed by a path of slugs, so a key reads as a place and joins the ward maps:
`kenya`, `nairobi`, `nairobi/dagoretti-north`, `nairobi/dagoretti-north/kileleshwa`. County and
constituency slugs are the IEBC name lower-cased, spaces as hyphens, punctuation dropped
(`Lang'ata` becomes `langata`). A ward's slug is the one in `public/geo/*-wards.json` and in
each campaign's `wards.slug`. Nairobi's ward map names each ward's constituency; Mathira's
doesn't, so `areas.csv` is what says which constituency a ward is in.

- `atlas_areas`: `key` (primary), `level` (`country`, `county`, `constituency`, `ward`), `name`,
  `parent` (a key; null for `kenya`), `iebc_code` (when known).
- `atlas_elections`: `id` (`2022-president`, `2017-governor`, `2013-mp`, …), `year`, `race`
  (`president`, `governor`, `mp`), `held_on`, `note`. The 2017 presidential note says it is the
  8 August vote, annulled by the Supreme Court; the 26 October re-run was boycotted in
  opposition areas, so it says little about lean and is not loaded.
- `atlas_candidates`: `id`, `election_id`, `seat` (the area contested: `kenya`, a county or a
  constituency), `name`, `party`, `bloc` (the coalition, or the party where there was none:
  e.g. 2013 Jubilee and CORD, 2017 Jubilee and NASA, 2022 Kenya Kwanza and Azimio). Unique by
  election, seat and name.
- `atlas_results`: `candidate_id`, `area_key` (where the votes were counted: a county or a
  constituency now; wards and polling centres later), `votes`. Primary key: candidate and area.
- `atlas_turnout`: `election_id`, `area_key`, `registered`, `cast`, `rejected`, `valid` (each
  may be missing), `source` (the document), `source_url`. Checks: cast ≤ registered, valid ≤
  cast.
- `atlas_register`: `year`, `area_key`, `registered`, `source`, `source_url`: registered voters
  by ward (and above) for each election year, where IEBC published them.
- `atlas_population`: `area_key`, `year`, `total`, `adults` (18+), `young_adults` (18–34),
  `source`, `method`: estimates, never presented as counts.

Every team member of any campaign reads the atlas; no campaign writes it (only migrations
and the service role do). This is a deliberate exception to "every campaign table has a
campaign_id": the atlas holds only public facts that are the same for everyone. The seven
atlas tables join the list of tables with no campaign in `tests/sql/access.test.sql`, which
otherwise fails on them, and each has row level security on.

## 2. Each campaign's own

- `atlas_settings`: the campaign's home area (an atlas key: a constituency for an MP, a county
  for a governor, `kenya` for a presidential campaign).
- `atlas_sides`: for each past election (a year and a race, nine in all), the bloc the
  campaign counts as "our side" (for Sakaja, probably Jubilee in 2013 and 2017 and Kenya Kwanza
  in 2022; politics has reshuffled since, so the campaign decides).
- `area_notes`: one note per area per campaign, up to 2,000 characters, with who changed it
  and when. The note box says notes are about places, never about a person's tribe.

All three carry `campaign_id` with the usual "own campaign only" policy. The team reads them;
the candidate or manager sets the home area and sides; staff write notes.

## 3. Data: sources, files and loading

- **Files.** `data/atlas/<county>/` holds `areas.csv`, `candidates.csv`, `results.csv`,
  `turnout.csv`, `register.csv` and `population.csv`. `data/atlas/SOURCES.md` lists every
  document used (title, publisher, URL, what was taken from it) and every gap. The repository
  is public: only public figures go in.
- **Loading.** `scripts/atlas/build_sql.py` turns a county's files into a migration of
  idempotent upserts, so each new county is one more migration, applied before the code that
  needs it, with the user's OK.
- **Checks.** `tests/atlas-data.test.ts` reads every county's files and fails when:
  constituency results don't add up to the county's, for president and governor (an MP race
  has no county total), beyond a difference recorded in `data/atlas/known-differences.csv`
  for IEBC's own inconsistencies; a share passes 100%;
  cast passes registered; valid plus rejected differs from cast when all three are given; an
  area's parent is missing; a ward slug isn't in its ward map.
- **Population.** `scripts/atlas/ward_population.py` sums WorldPop's open age-and-sex
  population grid (100 m squares) inside each ward's boundary, for the latest year WorldPop
  publishes, and records the method. WorldPop's age bands are five years wide, so 18–34 is
  two fifths of 15–19 plus 20–24, 25–29 and 30–34; adults likewise. The screens call these
  estimates.
- **First load.** Nairobi (county, 17 constituencies, 85 wards) and Nyeri (county, 6
  constituencies, Mathira's 6 wards): president, governor and MP results by constituency and
  county for 2013, 2017 and 2022; registered voters by ward for each year IEBC published
  them; population estimates per ward. Groundwork gathers the figures from IEBC's published
  results documents and the Kenya Gazette. What isn't found stays missing and is listed in
  `SOURCES.md`; before any screen work, the user gets a report of what was found and where.

## 4. Calculations (`src/lib/atlas.ts`)

Pure and tested. For an area, an election and the campaign's side:

- **Turnout:** cast ÷ registered; missing when either is.
- **Share** of a bloc: its votes ÷ valid votes (valid is the sum of candidates' votes when the
  document doesn't give it). **Our share** uses the campaign's side for that election.
- **Margin:** our share minus the strongest other bloc's share.
- **Lean:** the margin read as a side: ahead leans ours, behind leans theirs. The map shades
  it from theirs to ours.
- **Swing:** our share in one election minus our share in the same race at the previous general
  election, in points; missing unless both are there (so never for 2013).
- **Register growth:** registered voters now minus at the last election, and as a share.
- **Not yet registered (estimate):** adults minus registered voters (never below zero). It
  uses the latest register and the latest population estimate, which can be from different
  years, so the screens name both years.
- **Young share (estimate):** 18–34 as a share of the area's adults. It describes the area's
  adults, not who is unregistered: nothing says how old the unregistered are.
- **What to do**, first match wins, each with a one-line reason built from the numbers:
  1. **Mobilise:** our share is 50% or more and turnout is more than 3 points below the parent
     area's (constituency against county; ward against constituency once wards have results of
     their own). Skipped when either turnout is missing.
  2. **Hold:** our share is 60% or more.
  3. **Cut the gap:** we trail the strongest other bloc by more than 10 points.
  4. **Persuade:** the margin is within 10 points either way (10 included), or the last swing
     was 10 points or more either way.
  5. **Lean ours:** anything else: we are ahead by more than 10 points, short of Hold.
  The rules follow who is ahead, not the share alone, so a crowded race (45% to 30%) reads
  Lean ours and a narrow lead on a small share (38% to 30%) reads Persuade. Being behind has
  no rule of its own: within 10 points is Persuade and beyond that is Cut the gap.
  Without a side for that election the answer is "Set your side first".
- **Register flag:** an estimated quarter or more of the area's adults aren't registered.
- **Votes within reach**, shown as two parts with their sums:
  - *Turnout:* (the 75th-percentile turnout among the area's siblings, itself included, by
    nearest rank, − its turnout) × registered × our share, when positive; missing with fewer
    than four siblings that have a turnout.
  - *Persuasion:* 5% of valid votes (a 5-point swing to us).
- **Race:** the campaign's own race by default (MP, governor or president), switchable.
- **Wards before station data** have no results of their own: they show their
  constituency's figures, labelled "constituency figure", and their own register, population
  and notes.

Shares show to one decimal place, turnout as a whole percentage, votes with thousands
separators, and every figure carries a tag such as "IEBC · constituency total · 2022" or
"WorldPop estimate · 2025".

## 5. The Elections section (`/elections`)

- **Menu:** "Elections" in Operate, after Voters. The team opens it; agents don't (their pages
  stay the field ones).
- **Address:** `?area=` an atlas key (default: the campaign's home area), `race=`
  (`president`, `governor`, `mp`; default from the campaign's level), `year=` (2013, 2017,
  2022; default 2022), `shade=` (`todo`, `lean`, `turnout`, `swing`; default `todo`). Unknown
  values are dropped. Links between Voters and Elections open the same place.
- **Picking an area:** a breadcrumb (Kenya › Nairobi › Dagoretti North › Kileleshwa) and the
  list of the area's children; an area that isn't loaded says "Not loaded yet" and names what
  is.
- **Country page (`kenya`):** the loaded counties, each with the chosen race's result, turnout
  and register, and what is loaded. No national total or ranking until every county is loaded
  for that race: two counties are not the country.
- **County page:** the race's result in each year (our share, turnout, the register); a map
  of the county with each constituency's wards shaded by the chosen measure (constituency
  shapes are their wards, from the existing ward maps; a constituency with no ward map, five
  of Nyeri's six for now, is listed and ranked but not drawn, and the map says which are
  missing); constituencies ranked by votes within reach, each with what to do and why.
- **Constituency page:** the results of all three races in all three years (candidates,
  party, bloc, votes, share), the chosen race's turnout, register, swing, margin, what to do
  and votes within reach; its wards (register in each year, growth, population, the young
  share, not yet registered, a note marker); the notes; "Print brief" (a print stylesheet
  gives a clean one- or two-page brief with sources).
- **Ward page:** its register over the years, population, the young share, not yet
  registered, its note (editable by staff), and its constituency's results labelled as such.
- **Setup** (candidate or manager, a panel like the race editor): the home area, and our side
  in each of the nine past elections. Until a side is set, lean and what to do say so.

## 6. Across the app

- **Voters:** a "How it voted" choice for the county map, shading wards by their
  constituency's (later their own) what to do, lean, turnout or swing; under the numbers, a
  "Last time here" line (race, our share, turnout, what to do) linking to the same place in
  Elections.
- **Home:** in the race section, "Where votes can move": the top three areas by votes within
  reach, with what to do and the reason. The areas are those one level below the home area
  that have results of their own: counties for `kenya`, constituencies for a county. A
  constituency's wards have none until station data, so an MP's Home shows the constituency's
  own what to do and votes within reach, and says ward results come with station data. "Last
  time" comes from the atlas (the campaign's race in its home area) instead of the `lastTime`
  hard-coded in the campaign's scenario file (`src/lib/demo/scenarios`); the Briefing's Polls
  card reads the same value, so it follows.
- **Diary:** each stop in a ward carries a one-line brief, e.g. "Persuade: 48% to us in 2022,
  turnout 41%".
- **War room:** each constituency's tally shows its 2022 turnout beside today's.

## Data (schema 22, then one migration per county's figures)

Schema 22 creates the atlas tables and the campaign tables with their policies and the
version bump. Each county's figures are a separate migration produced by the script.

## Privacy and the law

- No field anywhere holds a person's ethnicity; nothing infers it from names or anything
  else. Communities appear only in the team's notes about places.
- The atlas holds public figures only; the repository carries only public figures.
- Notes and settings are campaign-private like every campaign table.

## Errors

- An area that isn't loaded: "Not loaded yet", with the loaded areas listed.
- A missing figure: shown as missing with "not published" or "not found yet", never as zero.
- No side set: lean and what to do say "Set your side first" (a link for the candidate or
  manager; "ask the candidate or manager" for others).
- A failed load of the section: the page says it couldn't load the atlas and offers a retry.

## Testing

- `tests/atlas.test.ts`: every calculation, every what-to-do rule and its precedence, missing
  data, and the reason lines.
- `tests/atlas-data.test.ts`: the data checks in section 3.
- `tests/sql/atlas.test.sql`: teams read the atlas but can't write it; notes, settings and
  sides stay inside their campaign; only the candidate or manager sets the home area and
  sides.
- The section's address rules (defaults, unknown values) as pure functions with tests.
- A look in the preview with stand-in data at desktop and phone width, including the print
  brief.

## Build order

1. Schema 22 and its SQL tests.
2. The data for Nairobi and Nyeri: gathering, files, checks, the report to the user, then
   the county migrations.
3. The calculations, test first.
4. The Elections section: county, constituency and ward pages, the brief, the setup.
5. Across the app: Voters, Home, the diary, the War room.
6. A look at it.

Two plans: the first covers steps 1–3 and ends with the data report; the second covers steps
4–6, once the user has seen what was found.

## Not now

- The Form 34A reader for 2022 station results (the next spec), and station-level history in
  the War room that depends on it.
- MCA, senator and women representative races; counties beyond Nairobi and Nyeri.
- Live updates; turnout by age (IEBC doesn't publish it).
- Anything about an individual's ethnicity, ever.
