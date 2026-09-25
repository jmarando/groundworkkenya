# Morning briefing and election-night war room · implementation plan

> For agentic workers: executed inline in this session (the user did not ask for sub-agents).
> Steps use checkbox syntax for tracking.

**Goal:** Build the office-aware morning briefing and the simulated election-night war room
described in `docs/superpowers/specs/2026-09-25-briefing-warroom-design.md`.

**Architecture:** Three typed demo scenarios (`src/lib/demo/scenarios/*`) feed pure helpers
(`insights.ts`, `election-night.ts`, `spoken.ts`) and React sections. Maps are SVG drawn from
GeoJSON in `public/geo`. The existing data-driven screens move into `LiveBriefing` and
`LiveWarRoom` components behind a tab and a toggle.

**Tech stack:** TanStack Start + Router (search params), React Query (geo files), plain SVG,
the Groundwork CSS system (`src/styles/groundwork.css`). Tests: `npx tsx tests/demo.test.ts`.

## Global constraints

- Demo content rules: rivals are placeholders ("the incumbent", "Challenger A/B"); no invented
  quotes from or wrongdoing by real people; outside polls are "Pollster A/B"; a DEMO badge is
  always visible; only the 2022 presidential totals and the 2022 Nairobi governor top two are
  marked "IEBC 2022".
- Mathira candidate is fictional: Njeri Mwangi.
- No database change, no migration, no new npm dependency.
- Candidate in the URL: `?c=kalonzo|sakaja|mathira`, default `sakaja`.
- Result forms: President 34A/34B/34C, Governor 37A/37B/37C, MP 35A/35B.
- Election day: Tuesday 10 August 2027; polls close 17:00; the simulated night runs to 06:00.
- Prettier width 100; ESLint clean on every new or changed file; `npx tsc --noEmit -p .` clean.

## Files

| File                                                       | Responsibility                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `scripts/geo/demo_maps.py`                                 | Build the two geo files below from geoBoundaries ADM1/ADM3      |
| `public/geo/kenya-counties.json`                           | 47 counties `{slug, name}`                                      |
| `public/geo/mathira-wards.json`                            | Mathira's 6 wards `{slug, name}`                                |
| `src/lib/demo/types.ts`                                    | Scenario, area, action, news, poll and night-script types       |
| `src/lib/demo/scenarios/{kalonzo,sakaja,mathira}.ts`       | One scenario per office                                         |
| `src/lib/demo/index.ts`                                    | `SCENARIOS`, `scenarioKey()`, `getScenario()`                   |
| `src/lib/demo/insights.ts`                                 | Weighted shares, 25% count, turnout what-if, days to polls      |
| `src/lib/demo/election-night.ts`                           | Seeded simulator: `buildNight()`, `frameAt()`                   |
| `src/lib/demo/spoken.ts`                                   | The "Listen" script                                             |
| `src/components/gw/demo/*`                                 | Candidate switcher, SVG map, charts                             |
| `src/components/gw/briefing/*`                             | Briefing sections, and `LiveBriefing` (today's tables)          |
| `src/components/gw/warroom/*`                              | `ElectionNight` (simulation) and `LiveWarRoom` (today's screen) |
| `src/routes/_authenticated/{briefing,warroom}.tsx`         | Tab/mode and candidate from the URL                             |
| `src/routes/_authenticated/polling.tsx`, `PollBuilder.tsx` | `?ask=` opens the builder pre-filled                            |
| `src/styles/groundwork.css`                                | `mb-*` (briefing) and `en-*` (election night) styles            |
| `tests/demo.test.ts`                                       | Scenario, insight, simulator and script tests                   |

## Tasks

1. Geo files: script, outputs, slug checks.
2. Types, scenarios, insights, registry; tests.
3. Election-night simulator; tests (determinism, monotone counts, shares add to 100, band
   narrows, no call before 19:30, ≥97% in by 06:00, each scenario won on the night, portal
   mismatch, flags, incidents on time).
4. Shared UI: switcher, map, charts.
5. Morning briefing sections, route tabs, `?ask=` for polls.
6. Election-night war room, route toggle.
7. Styles, checks (tsc, ESLint, Prettier, tests, build), harness visual check at desktop and
   phone width, commit; ask before pushing and publishing.
