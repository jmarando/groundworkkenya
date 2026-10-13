# The findings engine (insights, part 2)

Status: designed with the user on 13 October 2026; this spec awaits their review.

## Why

The candidate needs the "so what" behind Groundwork's figures for four decisions (see
`2026-10-09-area-profiles-design.md`):

- where to spend time
- what to say where
- where to put field work and money
- how to respond to rivals and polls

Part 1 gave each place its measured signals and the team's profile. Part 2 turns what
Groundwork holds into findings: one plain line each, with its figures and their sources, and
one next step. Plain code writes them; no AI is involved. Part 3's weekly brief and ask box
will write only from these findings, so each one carries its exact figures in a form a checker
can read.

## Decisions

- **All four decisions** get rules in this part.
- **Findings come and go with the data.** Nobody answers or dismisses them; a finding goes
  when its numbers move (doors get knocked, a stop goes in the diary). Ranking and a cap on
  each screen keep the noise down.
- **A Strategy page** lists every finding. Home, Elections, Voters and the Diary show the few
  that belong there. Part 3 adds the weekly brief and the ask box to the same page.
- **Counting happens in the database.** New functions return counts per ward for the caller's
  own campaign; the rules are pure code over those counts. Only counts leave the database.
- **Who:** the super admin, candidate, manager and organisers. Never field agents.
- **The War room is left out.** It comes alive on election night, and findings from forms
  arriving on the night belong with the Voters map's results part.

## 1. What a finding is

```ts
type Decision = "time" | "message" | "field" | "rivals";
type Figure = {
  label: string; // "Houses in the ward"
  value: number; // 8830
  text: string; // "8,830": exactly as the line prints it
  source: string; // "Google Open Buildings v3", "Your door visits", "IEBC"
  period: string; // "2023", "30 days to 13 Oct 2026"
};
type Finding = {
  id: string; // stable: rule and place, e.g. "doors-behind:nairobi/dagoretti-north/kawangware"
  rule: RuleId;
  decision: Decision;
  place: string | null; // an atlas key, or null for the whole campaign
  line: string; // the one-line "so what", led by the place
  figures: Figure[];
  next: { label: string; to: string; search?: Record<string, string> };
  weight: number; // the rule's own measure, for ordering within the rule
};
```

- **Every number in a line is one of its figures,** printed the same way. Part 3's checker
  relies on it, and a test holds every rule to it.
- **A line names places, and rivals as the team entered them.** Never a voter, never an agent.
  It never quotes a profile's free text and never mentions communities or languages: that
  context stays on the Elections page, in the team's own words.
- **Order:** findings are grouped by decision. Within a decision they follow the rules' order
  below; within a rule, its weight, largest first. Different rules' measures (votes within
  reach, registered voters) are never compared with each other.
- **Numbers:** the Strategy page numbers findings 1, 2, 3… down the page as shown. The `id` is
  what lasts; part 3 cites findings by it.
- **Evidence:** each rule has a minimum below which it stays quiet. Thresholds are named
  constants in one place.

## 2. Terms the rules share

- **Your area:** the campaign's home area in Elections (`homeAreaFor`), and everything inside
  it. **Seats** are the places votes are weighed in, as Home's Moves card does: a county's
  constituencies, and Kenya's counties for a presidential campaign; an MP campaign's seat is
  its home area itself.
- **Your race and side:** the campaign's race (`defaultRace`) and its side in 2022. Rules that
  need a side stay quiet until it is set, and their group says "Set your side in Elections
  first".
- **Your wards:** the campaign's `wards` rows, matched to atlas wards with `wardKey`. A ward
  that doesn't match is left out of ward rules.
- **Registered voters:** the atlas's ward register (IEBC), not the `wards` table's figure.
- **Windows:** "30 days" ends now. "This week" is the last 7 days; "the previous four weeks"
  are the 28 days before it. Days are Nairobi's.
- **Election results stop at constituencies.** What to do (`whatToDo`) and votes within reach
  (`votesWithinReach`) exist for seats; ward rules weigh wards by registered voters.

## 3. The rules (12)

Each rule lists when it fires, an example line and its next step. Its weight is in brackets.
The examples' figures are made up, except the two building densities in rule 5. "Top
quarter" and "top half" round up, so there is always at least one place in them.

### Candidate's time

1. **Not visited** (`not-visited`, a seat; for an MP, a ward). Governor and president
   campaigns: of the seats whose what to do is Persuade, Cut the gap or Mobilise, the top
   quarter by votes within reach. MP campaigns: your wards in the top half by registered
   voters. Fires when the place has had no diary stop in 60 days and has none in the next 14.
   Stops are diary entries with a ward, of any kind but "To watch". [votes within reach, or
   registered voters]

   > Dagoretti North: no diary stop in the last 60 days and none planned, with about 9,400
   > votes within reach.

   Next: plan a visit (`/diary?add=<ward id>`). For those who can change the diary (the
   candidate, manager and super admin) it opens today's form with the place's biggest ward
   chosen; for organisers it opens the diary.

2. **Time in safe seats** (`time-in-safe-seats`, campaign; not for an MP). Over the last 30
   days and the next 14, at least 6 stops with a ward, half or more of them in seats whose what
   to do is Hold or Lean ours, and those seats hold under a quarter of your area's votes within
   reach. [the share of stops in safe seats]

   > 9 of your 14 stops (last 30 days and next 14) are in Hold or Lean ours seats, which hold
   > 12% of the votes within reach.

   Next: the diary.

### What to say where

3. **Top issue in a ward** (`ward-top-issue`, ward). Issues raised in the ward in 30 days: at
   the door and in messages to the campaign (in the ward of the person spoken to), and in news
   and social mentions tagged with the ward, each counted as Home's top of mind counts it and
   named with `issueKey`. Fires at 10 or more issues raised, when one issue takes 30% or more.
   [that issue's count]

   > Kawangware: water is 38% of the 52 issues raised in 30 days (door 31, messages 15, news
   > and social 6).

   The brackets count every issue raised, by where; a source with none is left out. Next:
   write to the ward, Broadcast opened with the ward chosen.

4. **Issue rising** (`issue-rising`, campaign, one per issue). An issue's share in a period is
   its share of each source's issues, averaged over the sources that count, as top of mind
   does: a source counts with at least 5 issues raised this week, or 20 over the previous four
   weeks taken together. Fires when this week's share is 10 points or more above the previous
   four weeks' and the issue was raised 10 or more times this week. Silent when no source
   counts in the previous four weeks. [the rise]

   > Floods rose to 19% of what was raised this week, from 4% over the previous four weeks.

   Next: see what's said, as Home's top of mind line does.

5. **One seat, different places** (`one-seat-different-places`, seat). Every ward of the seat
   is measured, and the densest has at least three times the buildings per km² of the least
   dense. [that ratio]

   > Dagoretti North's wards live differently: Kawangware has 4,739 buildings per km²,
   > Kileleshwa 1,255. One message won't fit both.

   Next: the seat in Elections.

### Field work and money

6. **Votes within reach** (`votes-within-reach`, seat). Every seat in your area with a 2022
   result for your race, once your side is set: its what to do, the rule's reason (whose
   numbers become the finding's figures, from `whatToDoFigures`) and the votes within reach. ("At least" where the turnout part can't be worked out.) [votes within
   reach]

   > Dagoretti North: Persuade. 2022 was close: 46.1% to us against 48.0% for Bloc B. About
   > 9,400 votes within reach.

   Next: the seat in Elections. This replaces Home's Moves card.

7. **Doors behind** (`doors-behind`, ward; needs the campaign's house file). A ward's door
   coverage is the houses knocked in 30 days (`house_doors()`) over its houses (the house
   file's totals). Among your wards that have houses, fires when a ward's coverage is in the
   bottom quarter and its registered voters are in the top half. [registered voters]

   > Kawangware: 2% of its 8,830 houses knocked in 30 days, with 52,114 registered voters.

   When fewer than 100 houses were knocked across your wards in 30 days, the rule gives one
   campaign finding instead: "34 houses knocked across your 85 wards in the last 30 days."
   Next: the Voters map at the ward (or Voters).

8. **Short of target** (`short-of-target`, ward). Wards with a target whose supporters fall
   short: real people, not opted out, agreed to SMS, as the Overview counts them. [the gap]

   > Kawangware: 1,204 supporters found of a 6,000 target, 4,796 short.

   Next: Voters at the ward.

9. **Unregistered adults** (`unregistered-adults`, ward). WorldPop's adults less the IEBC
   register: 5,000 or more, or a fifth of the adults or more. Silent where the estimate is
   below the register. [that number]

   > Kawangware: about 14,200 adults aren't registered (estimate), a registration drive
   > opportunity.

   Next: the ward in Elections.

10. **Spend out of line** (`spend-out-of-line`, ward). Needs KES 10,000 or more of stipends
    across the campaign in 30 days (owed, approved or paid; dated by payment, else by entry).
    Among wards in the top half by registered voters, fires when a ward's share of that spend
    is under half its share of your wards' registered voters. [voter share less spend share]

    > Kawangware: 1% of stipend spend in 30 days, for 4% of your registered voters.

    Next: Agents & stipends, where stipends are kept.

### Rivals and polls

11. **Poll move** (`poll-move`, campaign). `rivalMove`, extended to cover our own candidate
    ("We're down 3.0 points…"): the biggest move between one pollster's last two polls, the
    newer within 30 days, 2 points or more. Says "within the poll's margin of error (±2.5)"
    when the move is no bigger than the newer poll's stated margin. [the move]

    > Challenger A up 4.0 points in Pollster B's latest poll, from 31% to 35%.

    Home's Today line uses the same extended function, so it now shows our own moves too and
    the two never disagree. Next: the race on Home.

12. **Rival in the news** (`rival-in-news`, campaign, one per rival). A rival's share of all
    news and social mentions this week is 10 points or more above its share over the previous
    four weeks taken together, with 20 or more mentions this week. Silent when the previous
    four weeks have fewer than 20 mentions in all. A mention is about a rival when the Listening
    keyword that found it is one of the team's rival keywords, labelled with the rival's name or
    the name they're searched by. Rivals' own posts aren't news about them. [the rise]

    > Challenger A was in 41% of news and social mentions this week, up from 18% over the
    > previous four weeks.

    Next: Listening.

Left for later: the campaign's own SMS polls by ward (their weighting makes them a bigger
piece of work).

## 4. Screens

- **Strategy page (`/strategy`, new):** a "Strategy" menu item for everyone but field agents
  (`canOpen`). Four groups in the order above. Each finding shows its number, its line, a
  "Figures and sources" toggle and its next step. Each rule shows up to 5, then "Show N more".
  A place picker (`?place=<atlas key>`) keeps only findings about that place and the places
  inside it, plus campaign-wide ones. An empty group says what would fill it ("No door
  visits in the last 30 days yet", "Set your side in Elections first"). The page says when
  the findings were worked out, that they change with the data, and, when it applies, that
  some are waiting for a database update.
- **Home:** a "What the numbers say" block right after Today: the first finding of each
  decision (up to four), each with its next step, and "See all findings". The Race section's
  Moves card goes; its seats are rule 6. Today is unchanged; when its rival line is a poll
  move, the block leaves rule 11 out. The spoken briefing is unchanged.
- **Elections:** a "So what here" card under the page's heading, for wards, constituencies
  and counties alike: up to five findings about the place and the places inside it, and "See
  all" to Strategy filtered to the place.
- **Voters:** the map's panel shows up to three field and message findings about the place in
  view and the places inside it.
- **Diary:** the week opens with the time findings (up to three). Each stop in the next seven
  days that has a ward shows that ward's first two message or field findings, in small print.

## 5. Data (schema 25)

One migration adds counting functions and bumps the schema version to 25. Each is `stable`,
`security invoker` (the "own campaign only" policies apply), granted to `authenticated` only,
and returns no rows to a field agent. None returns a name, a phone number or a person's id.

- `ward_issues(_days integer)`: `ward_id, source, issue, n`. Sources `door`, `messages` and
  `news`, each read as top of mind reads it; a mention's ward is matched to the campaign's
  ward by name.
- `issue_weeks(_weeks integer)`: `week, source, issue, n`, week 0 being the last 7 days.
- `rival_mention_weeks(_weeks integer)`: `week, rival_id, n`; a rival's row counts the news
  and social mentions their rival keyword found, and a null `rival_id` row holds all mentions
  that week. Rivals' own posts are left out of both.
- `ward_spend(_days integer)`: `ward_id, kes`, from `agent_stipends`: owed, approved or paid,
  dated by payment, else by entry.
- `ward_supporters()`: `ward_id, supporters`, as the Overview counts them.

Doors come from the existing `house_doors()`. The diary, the race, the campaign's wards and the
atlas (`loadAtlas`) are read as today. The house files' totals (`public/tiles/houses-*.json`)
are small, so the server imports them.

## 6. The engine

- **Pure rules** in `src/lib/findings/`: the types, ordering, place filter and numbering in
  one module, and the rules in one module per decision. Each rule is a function of one
  `FindingsInput` (the atlas, the counts, the diary, the race, the wards, the house totals,
  today's date) to a list of findings.
- **`getFindings`** (server function): refuses field agents; reads everything above in
  parallel; reads each count softly (an error leaves that count empty and names it in
  `waiting`); runs the rules; returns `{ asOf, findings, waiting }`. Every screen shares one
  cached query, kept 5 minutes, and picks out its own.
- **Before Lovable applies schema 25:** the rules that need a missing count stay quiet and the
  Strategy page says some findings are waiting for a database update. Rules 1, 2, 5, 6, 7, 9
  and 11 use only data that exists today; 3, 4, 8, 10 and 12 wait for schema 25.

## Errors

- `getFindings` fails: Home, Elections, Voters and the Diary leave their findings out; Strategy
  says "Couldn't load the findings. Try again."
- A field agent calls it: refused with the same words as other closed pages.
- A rule throws on bad data: the other rules still run, the failing rule is left out, and the
  error is logged.

## Testing

- **Rules:** each one firing and staying quiet at its thresholds, with its exact line.
- **Every number is a figure:** all twelve rules run over one full set of example data, and
  each number in each line must appear among that finding's figures, printed the same way.
- **Ordering:** grouping, rule order, weights, numbering and the place filter.
- **SQL:** each function's counts on known rows; another campaign's rows invisible; nothing
  for a field agent; no personal columns in any result; the schema version.
- **Server:** agents refused; a missing function leaves its rules quiet and is named in
  `waiting`.
- **Preview:** the Strategy page, the Home block, the Elections card, the Voters panel and the
  Diary lines, at desktop and phone width.

## Success

- With seeded data, every rule fires where it should and stays quiet below its threshold.
- With the atlas alone and its side set, a Nairobi campaign sees rules 5, 6 and 9 on day one.
- Field agents can't open Strategy, the server refuses them, and the functions return them
  nothing.
- No line names a voter or an agent, quotes free text, or mentions communities or languages.
- Every number in every line is one of its figures.
- Before schema 25 is applied, every screen loads, and Strategy says what is waiting.

## Build order

1. Schema 25 and its SQL tests.
2. The finding types, ordering, place filter, numbering and the figures check.
3. The rules, a decision at a time, each with its tests (rule 11 extends `rivalMove`).
4. `getFindings`, with its soft reads and tests.
5. The Strategy page and its menu item.
6. Home's block, retiring the Moves card.
7. The Elections card, the Voters panel and the Diary lines.
8. A look in the preview, then the release: Lovable applies schema 25.

## Not now

- Findings in the War room on election night.
- The campaign's own SMS polls by ward.
- Answering findings ("not now", "done").
- The weekly brief, the ask box and any AI (part 3).
- Home's spoken briefing reading findings.
- Alerts when a new finding appears.
- Places outside the atlas (counties not yet loaded).
