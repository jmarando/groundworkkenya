# Real mornings: the day's story, the diary, top of mind and search interest

Date: 30 September 2026. Builds on `2026-09-29-home-voters-race-design.md` (Home, race data,
Listening part 2). Built before part 3 (Voters); everything still goes to GitHub in one push.

## Why

The user, 30 September: instead of the invented "Sample" story, Home should carry the actual
stories shaping the governor's race that morning, updated every day; the campaign manager
should be able to add to the diary and plan it a week at a time; the "Sample" labels go; Home
should show what is top of mind for Nairobians; and Google Trends should compare searches for
Sakaja, Babu Owino and the others.

Decided with the user:

- The story is written each morning from Listening's real news and posts by a daily step
  (approach A), shown straight away, and the candidate or manager can edit it.
- Google Trends data comes from SerpApi's free plan (250 searches a month); there is no public
  Google Trends API (Google's own is an invite-only alpha) and ScrapeCreators has none.
- No invented content on a campaign's Home. A section with nothing real yet says what is
  missing and offers the way to fill it.

Assumed, open to correction: the diary is written by the candidate and manager and read by
the whole team; the story step runs at 06:00 Nairobi time.

## Success

On any morning, everything on Sakaja's Home is real: a story written from that day's news
with its sources, the team's own diary for the day, the week's top issues across four
sources, and 30 days of search interest in the candidates. Nobody has to do anything for it
to be there; the candidate or manager can change the story and the diary. Nothing on Home is
invented and nothing is labelled "Sample".

## 1. The diary

A diary entry: day, start time (optional: some entries are all day), a title (where, or what),
a kind (`visit`, `meeting`, `media`, `rally`, `watch`), an optional ward, and an optional
note on what it is for. "Watch" entries are things to keep an eye on rather than attend, such
as a rival's rally.

- The candidate and manager add, edit and remove entries; the whole team reads them (agents
  do not open the diary: they get field pages only). The database enforces this, as for the
  race: `is_team_member` reads, `is_staff` writes, own campaign only.
- A **Diary** page (`/diary`, under Operate after Home) shows one week, Monday to Sunday, with
  the previous and next week a click away, so a week can be planned at once. Each day lists
  its entries by time; the candidate and manager get "Add" on each day and edit or remove on
  each entry. On a phone the days stack.
- Home: "Where to be today" lists today's entries other than "watch"; the "Watch list" shows
  "watch" entries for today and the next two days, and is hidden when there are none. Today's
  list gains the next stop ("Next: Kayole water point, 10:30").
- Checks (in the app and the database): a title of 2–120 characters; a note of at most 300; a
  kind from the list; a ward from the campaign's own wards.

## 2. This morning's story

**When.** Once a day, on the hourly Listening call, at its first run at or after 06:00 Nairobi
time. It keeps its own clock, like the rival sweep, and writes one story per campaign that
has news.

**What it reads.** For each campaign: the mentions Listening found in the last 24 hours
(rivals' own posts aside), newest first, up to 40, each numbered; the rivals' own posts from
the last 48 hours with the rival's name; and the race's candidates. News that another
campaign found stays with that campaign.

**What the AI returns** (a strict JSON schema, one request per campaign):

- the lead story: headline; a summary of two or three sentences; why it matters for the race;
  how rivals are playing it, only from the rivals' posts given ("Rivals haven't spoken on it"
  when none do); a suggested line; up to three figures, each with the item it comes from; the
  items it rests on;
- "Also this morning": three to five other items, each with one line on why it matters;
- or "no story", when nothing in the day's news bears on the race.

**Checks before saving.** Every item number must be one of the items given, and the lead must
rest on at least one. A figure is kept only when its value appears word for word in the
title or text of the item it cites; otherwise it is dropped. Text fields are trimmed and
capped. The source links are copied into the story, so they survive the mention being
removed. If the AI fails, answers badly or says "no story", the story is the day's top five
headlines with their links and no written summary (approach C).

**Kept** as one row per campaign per day (`morning_stories`), with who wrote it: Groundwork, or
the team member who edited it and when.

**Editing.** The candidate or manager can change any written field, choose "Use another story"
(pick one of the morning's items; one more AI request, the same checks), or write the day's
story themselves (headline, summary, line, and web links only). When the team has already
written or edited the day's story, the 06:00 step leaves it alone.

**On Home**, in place of the invented story: the kicker says "Written by Groundwork at 06:04
from 12 sources" or "Edited by Njeri Kamau at 07:10"; the headline, summary, why it matters,
"How rivals are playing it", "Suggested line", the checked figures, the sources as links, and
"Also this morning" with links. Before 06:00 it shows "This morning's story is written at
6:00 from the news Listening finds"; with no news, "No news about the race in the last day",
and the candidate or manager gets "Write today's story".

## 3. Search interest (Google Trends through SerpApi)

**When.** Once a day on the hourly call, at its first run at or after 06:00 Nairobi time, with
its own clock. With no `SERPAPI_API_KEY` nothing is asked and Home says search interest isn't
connected.

**What it asks.** Per campaign, at most two searches a day:

- the candidates: up to five of the race's candidates, ours first then in the race's order,
  past 30 days (`today 1-m`), interest over time. Each is searched as the name people use,
  which the candidate or manager can change in "Edit rivals" ("Searched as"; the full name
  when blank). Sakaja's race starts with Sakaja, Babu Owino, Kagure, Gakuya and Karauri, the
  names the user and the papers use; the chart says what was searched;
- the issues: the week's top five issues from the other three sources (section 4) that have
  a search phrase: water "water shortage", garbage "garbage", floods "floods", drainage
  "drainage", roads "roads", transport "matatu", hawkers "hawkers", security "insecurity",
  jobs "jobs", health "hospital", housing "housing", bursaries "bursary", corruption
  "corruption", land "land", revenue "county revenue", lighting "street lights"; past 30
  days.

Both ask for Nairobi (Google's region `KE-110`). When the answer is missing or thin (most
points zero), it asks once more for all of Kenya (`KE`), and Home says which it shows.
SerpApi's time zone is set to Nairobi's.

**Budget.** SerpApi searches come out of a daily budget, `trends`, counted by the server like
the ScrapeCreators budgets (`SERPAPI_DAILY_SEARCHES`, default 8, so a month stays under the
free 250). Past the limit the day's reads stop and the job says so.

**Kept** as one row per campaign, day and kind (`search_interest`): which place it covers and
each term's daily points (0–100, relative: 100 is the busiest moment of any term in the
set).

**On Home**, in the race section: "Search interest, last 30 days": a line chart in the
candidates' colours, with a sentence that says the same ("Babu Owino drew the most searches
in Nairobi this month, then Johnson Sakaja"), where it covers, and "Google Trends via SerpApi,
read 06:05". A rival whose searches in the last 7 days are at least twice their previous
three weeks' average is a rival move on Today ("Searches for Babu Owino doubled this week"),
after an unusual post or a poll change.

## 4. Top of mind this week

Four sources over the last seven days, each counted by issue:

- **News and social**: Listening's mentions, rivals' own posts aside;
- **Messages to us**: inbox conversations by their issue;
- **At the door**: canvassing visits where the person spoke, by the issue they raised;
- **Searches**: each issue's average search interest (section 3).

Issue names are brought together first, in lower case: rubbish, trash, waste and "garbage
and cleanliness" are garbage; "water and sanitation", sanitation, sewer and sewerage are
water; flooding is floods; road is roads; insecurity and crime are security; bursary is
bursaries; job and unemployment are jobs; hospital is health; matatu and matatus are
transport; hawker is hawkers; "street lights" and streetlights are lighting. "General" and
"campaign" are not issues. A source counts only when it has at least five items that week
(or, for searches, any interest). An issue's score is its average share across the sources
that count, so no single source decides.

**On Home**, "What people are saying" becomes **"Top of mind this week"**: the top five issues,
each with its score, a small bar for each source's share (or "no data"), its latest one or
two headlines as links, and "See what's said" into Listening. A line under it says what it
rests on ("Across 214 news and social items, 38 messages, 120 door conversations and Google
searches, the last 7 days"). Today's "loudest issue" becomes the top of this list.

## 5. No samples on Home

The "Sample" chips, the footnote about invented figures, and every invented section leave a
campaign's Home: the story, "Also this morning", the day's plan, the watch list, invented
Today items, and the sample race and campaign figures. The 2022 IEBC results stay: they are
real. With nothing real yet, each section says so in a line and offers what fills it:

- Today: "Nothing needs you yet this morning."
- Story: as in section 2.
- Diary: "Nothing in the diary for today", and "Plan the week" for the candidate and manager.
- Race: "No race on record yet", and "Add the candidates" and "Add a poll" for them.
- Campaign: "No supporters on record yet", with "Import people".

The demo scenarios stay in the code for other pages that use them; Home no longer does.

## Data (schema 20)

- `diary_entries`: `campaign_id`, `day`, `starts_at` (time, null for all day), `title`,
  `kind`, `ward_id`, `note`, `created_by`, timestamps.
- `morning_stories`: `campaign_id`, `day`, `story` (jsonb, shaped by the app's cleaning
  function), `written_by` (`groundwork` or `team`), `edited_by`, `edited_at`; one per
  campaign and day.
- `search_interest`: `campaign_id`, `day`, `kind` (`candidates` or `issues`), `geo`, `series`
  (jsonb); one per campaign, day and kind.
- `race_rivals` takes `search_as` (the name searched for; 2–60 characters, or empty for the
  full name).
- `social_credits` takes a third budget, `trends`.

Each is a campaign table like the others: `campaign_id` defaults to `my_campaign()`, the stamp
trigger, the restrictive own-campaign policy; the team reads; staff write the diary and edit
the story; only the server writes stories and search interest.

## Privacy

Only public text leaves Groundwork: news and posts to the AI, candidates' names and issue
words to SerpApi. No voter data, and no names from the inbox or the door. The shared job rows
(`listening_jobs`) say what happened in counts only, never a campaign's names or issues,
since every campaign's team can read them.

## Errors

The AI failing gives the headline list (section 2). SerpApi failing or out of budget keeps the
last good read, and the card says when it was read. Any step failing never stops Listening's
own sweep: each is caught and noted, as the rival sweep is.

## Testing

Test first throughout, as before: the story checks (item numbers, figures word for word, the
fallback) with a stand-in AI; the Trends reading with SerpApi's documented answer as a
fixture, the thin-data fallback and the budget; the issue merging and the four-source score;
the diary's cleaning; row level security for all three tables in `tests/sql`; Home without
samples in `tests/home.test.ts`. Then a look in the harness at 1280 and 375 wide.

## Build order

Planned as two plans, built one after the other: steps 1–2, then 3–5.

1. The diary (schema 20's diary table, the page, Home's day plan and watch list).
2. This morning's story (table, the daily step, editing, Home).
3. Search interest and top of mind (table and budget, the daily step, the chart, the card).
4. No samples on Home.
5. Look at it.

## Not now

A campaign SMS or WhatsApp poll asking people their biggest problem (the most direct measure;
the poll engine can already run one); related searches and interest by county; copying last
week's diary forward; alerts when the story changes.

## Release

With the push: migrations 15–20 applied before the code, with the user's OK. The user adds
`SERPAPI_API_KEY` in Lovable's secrets (free plan at serpapi.com); `SERPAPI_DAILY_SEARCHES` is
optional.
