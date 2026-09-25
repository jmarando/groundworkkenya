# Morning briefing and election-night war room, by office

Status: approved 2026-09-25. Demo build: every figure is invented unless marked official.

## Why

The Briefing screen today is a set of tables. A candidate will only open it every
morning if it tells them, in a few minutes, what happened, where they stand, what
their rivals did, what voters are saying and what to do today. The same product
also has to show a presidential, a governor and an MP campaign, because what
matters at 7am differs a lot between them. The War room shows an empty tally until
election night, so it cannot be demonstrated.

## Demo candidates

| Key       | Office    | Candidate                | Area                  | Unit on the map             |
| --------- | --------- | ------------------------ | --------------------- | --------------------------- |
| `kalonzo` | President | Kalonzo Musyoka          | Kenya                 | 47 counties                 |
| `sakaja`  | Governor  | Johnson Sakaja           | Nairobi County        | 17 constituencies, 85 wards |
| `mathira` | MP        | Njeri Mwangi (fictional) | Mathira, Nyeri County | 6 wards, polling centres    |

Rules for demo content:

- Rivals are placeholders ("the incumbent", "Challenger A/B"), never named people.
- No invented quotes from real people, no invented wrongdoing by anyone.
- Outside polls are "Pollster A/B", not real firms.
- A DEMO badge is always visible. The few real figures (2022 presidential totals,
  2022 Nairobi governor top two) are marked "IEBC 2022".

## Morning briefing

One scroll, in reading order:

1. Masthead: greeting, date, days to 10 August 2027, candidate switcher, DEMO
   badge, "Listen" (the browser reads a 3-minute script aloud).
2. Today's three: three decisions with one action each.
3. The story: the biggest item near the candidate: what happened, why it
   matters (voters and areas affected, conversation spike), how rivals are
   playing it, a suggested line, actions. Then 4-5 more items, each tagged
   (local, county, national, party, opponent) with a one-line "so what".
4. The race: poll average and 12-week trend, plus the office's win rule:
   - President: more than half the votes and at least 25% in 24 counties.
     Tracker and county map by our share band.
   - Governor: plurality; lead over Challenger A; win-number progress; map by
     ward lead.
   - MP: plurality; ward-by-ward lead.
5. Opponent watch: per rival, yesterday's moves, message, share of voice,
   threat level, what to watch today.
6. Voters: top issues with week-on-week change, groups on the move, voter
   quotes (anonymised, Kiswahili with translation), persuadables.
7. Polls: latest own poll with margin of error, the crosstab worth knowing,
   outside polls, suggested questions. "Ask voters today" opens the poll builder
   pre-filled (`/polling?ask=...`).
8. Last time: previous result for this seat, turnout, lessons, and a turnout
   what-if slider.
9. Where to be today: suggested stops with the reason.
10. Watch list: misinformation, security, IEBC dates, spend against the limit.

The existing tables move, unchanged, to a "Live data" tab on the same screen.

## Election-night war room

A deterministic simulation of 17:00 to 06:00, with play, pause, a scrubber and
speed. For each office: results stream in by area; the tally animates against
the majority line; a coverage-weighted projection band narrows; a call is made
only when the band clears the rule; the map fills by leader with reporting shown
as opacity; turnout against 2022; the form pipeline (photographed, entered twice,
verified, in adjudication); the IEBC portal comparison with one divergence alert;
incidents and flags on a timeline; a feed of the latest station results.

Office specifics: President adds the 24-county tracker and form levels
34A/34B/34C; Governor shows each constituency's swing against 2022 (37A/37B/37C);
MP lists polling centres (35A/35B). Ballots are counted President first and
Governor fifth, so the governor's results arrive latest. The current live war
room stays behind a "Live" toggle.

## Build

- Scenario fixtures in `src/lib/demo/` (typed; one file per candidate).
- `src/lib/demo/election-night.ts`: pure, seeded simulator; tested in
  `tests/demo.test.ts` (run with `npx tsx tests/demo.test.ts`).
- `ChoroplethMap`: SVG map from GeoJSON, no new dependency.
- Geo files: `public/geo/kenya-counties.json` (geoBoundaries ADM1),
  `public/geo/mathira-wards.json` (ADM3); Nairobi wards already exist.
- Candidate choice in the URL (`?c=sakaja`), default `sakaja`.
- No database change, no migration, nothing written to production.

## Out of scope

Generating the briefing from real news feeds and campaign data (the daily job),
real IEBC portal ingestion, and the live war room's own redesign.
