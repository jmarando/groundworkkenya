# Crowd events: where the crowds are

A big part of Kenyan campaigning happens where people already gather: funerals and burials, church
services and harambees, football tournaments, school prize-givings, agricultural shows and market
days. Groundwork looks for these in each campaign's area every day and suggests them. The team adds
an event to the diary or sets it aside with one tap. Nothing goes into the diary on its own.

Decided 20 November 2026: Groundwork suggests and the team adds. Suggestions show on the Diary,
on Home and on Strategy.

## What the team sees

- **Diary**: a card called "Where the crowds are" lists the next three weeks. Each event shows its
  day and time, kind, place and ward, what the notice says about the crowd, and a link to where it
  was found. "Add to the diary" puts it in the diary. "Not for us" sets it aside, and it does not
  come back. The office sees the card, and staff can add or set aside.
- **Home**: "Today, in order" gets one item when events are coming in the next seven days. It reads
  "3 crowd events in the next 7 days", says how many are in the campaign's wards, and links to the
  Diary.
- **Strategy**: the findings engine has a new rule, `crowd-coming` (decision "time"). It fires for
  an event in one of the campaign's mapped wards in the next seven days that is not yet in the
  diary. The line gives the ward's registered voters (IEBC 2022), biggest wards first, at most five.
  Every number in the line is a figure with a source, as the engine requires.

## How events are found

`runCrowdEvents` (src/lib/crowd-events.server.ts) runs from the hourly Listening sweep on its own
clock, once every 20 hours (`listening_jobs` key `crowd_events`, locked for 20 minutes while it
runs). For each campaign:

1. **Area** (`areaOf`): a county seat searches its county, an MP's seat its constituency, and an
   MCA's seat its ward together with its constituency. A presidential campaign is skipped because
   the whole country is no place to look for a funeral. So is a campaign with no map area.
2. **Four news searches** (`crowdQueries`, Serper, the past week, Kenya): funerals and burials;
   harambees, fundraisers, crusades and church events; tournaments, football, sports days and
   marathons; shows, festivals, graduations, prize-givings and open days. Each names the area's
   places.
3. **Results** (`crowdHits`): https links only, each once, newest first, at most 30.
4. **One AI read** (`askAiJson` with `CROWD_SCHEMA`; Gemini, with Claude Haiku as the backup). The
   prompt (`crowdPrompt`) asks only for gatherings that will happen between today and three weeks
   ahead in the area, each with the exact link of the result that states it. It must leave out past
   events, events outside the county, statements and court cases. For a funeral it gives only the
   name as the public notice prints it.
5. **Checks** (`cleanCrowdEvents`): the event is kept only if its kind is known, it has a title, its
   link is one of the search's own results, and its date is real and falls between today and three
   weeks ahead. The AI also copies the words that state the date (`date_text`); they must appear in
   that result's title or summary and state that very day (`statesDay`: a month with the day's
   number, the day and month as numbers, or the day's weekday; a year, if given, must match). The
   result must also name a place in the area (`placeTerms`: the places searched, the county and the
   wards, less ward names that are everyday words such as Municipality or Harambee). A time must be
   HH:MM. A ward must match one of the campaign's wards by name. The same event (title folded with
   its day, `dedupeKey`) is kept once. Added 20 November 2026 after the first live run: of 3 events
   kept, one had a date the AI guessed and one was in another county.
6. **Saved** to `crowd_events` with `ignoreDuplicates`, so an event found again keeps its status,
   and one set aside is not brought back.

Events are pruned 30 days after their day.

**What each run records** (`checkCrowdEvents`, `checkSummary`): the job's note says how many events
the AI named, how many were kept or already saved, and how many were left out for each reason (a
kind not known, no title, a link not among the results, no real date, a date outside the window, no
date in the result's own words, no place in the area named, the same event twice). It names no
campaign. The sweep's own response (read by the scheduler only) also lists up to three left-out
events per campaign, with title, link and reason, to tune the checks.

**Cost**: four Serper credits and one AI answer per campaign per day. With seven campaigns that
have an area, that is 28 credits a day.

**When something fails**: with no Serper key, the job's note says crowd events are not being looked
for. A refused search (credits run out) stops all searching for that run and is said once. Neither
counts as a run (`nextLastRun` keeps the last run's time), so the next hour tries again. If the AI
cannot answer, that campaign waits for the next run. Every campaign's team can read
`listening_jobs`, so its note names no campaign; per-campaign problems go only to the scheduler's
response.

## Data (schema 50)

`crowd_events`: campaign, kind (funeral, church, sports, harambee, market, school, community,
other), title, day and optional time, place, ward (one of the campaign's own, by the composite key),
crowd, why, source link (https), source title and outlet, status (new, added, dismissed), the diary
entry it became, who decided and when, when it was found, and the dedupe key (unique per campaign).

- Row level security: each campaign sees only its own. The office (super, candidate, manager,
  organiser) reads. Staff (`is_staff`) may change only status and decision columns. The browser
  never inserts, renames or deletes an event; only the server, as the service role, finds them.
- `add_crowd_event(_event)` runs as the caller, so the policies on both tables decide who may. It
  writes the diary entry (a funeral as a funeral, church as church, a market as market, the rest
  as a visit; the note carries the place, the outlet and the link) and marks the event added.
  Adding twice gives back the same entry. If that diary entry was deleted, adding again writes a
  new one.
- `dismiss_crowd_event(_event)` sets a new event aside. Anything else is refused with 42501.

## Places, never people

An event is what was published, and nothing more. Groundwork records nothing about a family or
anyone's community, and never picks events by community. A funeral is kept as the notice names it.
Whether the candidate attends, and how, is the team's call.

## Limits

Serper's news search finds what news sites publish: prominent burials, big harambees, county shows
and tournaments with sponsors. It misses most village funerals, parish calendars, and what is
announced on local radio, in WhatsApp groups and on Facebook pages. The team still adds those in
the Diary. Facebook pages and radio announcements could be searched later.

## Tests

- tests/crowd-events.test.ts: areas, searches, results, the prompt, every check in
  `cleanCrowdEvents`, dedupe, diary kinds, upcoming, Home's item and order, and the Strategy
  finding, with every number accounted for.
- tests/sql/crowd-events.test.sql: isolation between campaigns, office-only reading, add and set
  aside by staff only, adding twice, re-adding after the diary entry was deleted, no browser
  writes, dedupe, https only, and wards from another campaign refused.
