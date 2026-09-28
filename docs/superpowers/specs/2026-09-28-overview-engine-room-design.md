# Overview: the campaign's engine room, by office

Status: approved 2026-09-28. Demo build: every figure is invented. Spending limits are
demo figures, not the official ones.

## Why

The Briefing is the outside world: news, the race, rivals, voters, polls. The Overview
today is five numbers and a sparkline, and its heading ("The morning, briefed") repeats
the Briefing's job. It should answer the campaign manager's question instead: are we on
course to win, and what is slipping? And, like the Briefing, it has to show how that
differs for a presidential, a governor and an MP campaign.

## Shape

Same as the Briefing: `/overview` shows the demo campaigns with the office switcher
(`?c=kalonzo|sakaja|mathira`); `/overview?view=live` shows the live campaign data (the
current screen, moved into its own component, heading changed to "The campaign, at a
glance").

Top to bottom:

1. **Masthead**: seat, office switcher, demo badge, days to polling day, and one verdict
   sentence worked out from the numbers (on pace or behind, by how much, where the
   biggest gap is).
2. **Vital signs**: six tiles, each a number, a bar against its target, and one line.
   - Governor and MP: supporters found against the win number; wards on pace; doors
     this week against the plan; polling-day agents recruited; weeks of money left;
     the opted-in contact list.
   - President: modelled national share against 50%+1; counties at 25% or more against
     the 24 needed; supporters found against the target; agents recruited; weeks of
     money; the contact list.
3. **Path to victory**: registered voters, expected to vote, the win number, found,
   sure (support 4-5), still to find, and the weekly pace needed against the pace now.
   President: the two constitutional tests (national share meter with the 50% line, and
   47 counties marked at 25%+ against 24 needed) above the same list funnel.
4. **Pace**: supporters found each week for the last 12 weeks, the projection to polling
   day at the recent rate, and the straight line of what is needed.
5. **Ground game**: map coloured by each area's found-against-target, and a table sorted
   by projected shortfall: area, group, target, found, last week, doors this week,
   coordinator, weeks to close at the current rate. Twelve rows, then "show all".
6. **Polling day**: streams, agents recruited, trained, confirmed, overall and for the
   areas furthest behind; links to Agents and the War room.
7. **Money**: raised, spent, the spending limit, cash on hand, burn per week, weeks of
   runway against weeks to polling day, spend by category, pledges outstanding.
8. **Needs you**: three to five items with one tap to where they are handled (expenses
   to approve, a drafted broadcast, stations without agents, unread replies).

## Data

A new `ops` block on each demo scenario holds what is hand-written: the president's
supporter target and count, last week's finds and doors, the doors plan, volunteers,
the contact list, money, agent recruitment rates, and the "needs you" items. Everything
per area is derived from the scenario's existing areas with the seeded generator, so
47 counties and 85 wards need no hand-written rows:

- target: the win number shared out by each area's expected votes times our share;
- found: target times a seeded progress around the campaign's overall ratio, then scaled
  so the areas add up to the campaign's total exactly;
- last week's finds and doors: the campaign totals shared out the same way;
- streams: registered voters over 600, rounded up; recruited, trained and confirmed are
  seeded fractions around the campaign's rates;
- coordinator: a fictional first name and initial, chosen by the area's hash;
- history: twelve weeks of cumulative finds ending at today's total, rising as the
  campaign ramps up.

Definitions used throughout:

- an area is **on pace** when its finds so far plus last week's rate for every week left
  reach its target;
- **sure** supporters are the share of those found who rated their support 4 or 5 at the
  door, a campaign-level figure in `ops`;
- the **recent rate** is the average of the last four weeks of finds;
- **runway** is cash on hand over the weekly burn.

The arithmetic (targets, projection, shortfall, needed pace, runway, verdict) lives in
`src/lib/demo/ops.ts` as pure functions and is tested like `insights.ts`.

## Rules carried over from the Briefing

Rivals stay placeholders. The MP candidate is fictional. Coordinators are fictional
names. A demo badge is always on screen. No official figures are claimed; the spending
limits are labelled as demo figures.

## Testing

`tests/ops.test.ts`: area targets and finds add up to the campaign totals; every area
matches a map shape; the projection, shortfall and needed pace for each scenario; the
verdict for each office (Mathira behind, Nairobi on pace with lagging wards, the
president short of 50%+1 nationally but past 24 counties); runway; determinism. A visual
check of each office in the preview harness at desktop and phone widths.
