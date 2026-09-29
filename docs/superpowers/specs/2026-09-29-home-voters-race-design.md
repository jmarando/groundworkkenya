# One Home, one Voters screen, and real race data

Status: designed with the user on 2026-09-29. Decisions: one Home page; sample data
shown with a clear tag; map-first Voters screen; race data kept up to date
automatically where it can be; Listening keywords made easy to find, with Google
Alert feeds. Lovable already holds the ScrapeCreators key.

## Why

Overview and Briefing each had their own greeting, their own Demo/Live tabs and
their own President/Governor/MP switcher, and covered overlapping ground. People,
Know your voters and Canvassing are three views of the same wards and people. The
data is good; the flow is not. And the briefing for Sakaja should be about his real
race, not an invented one.

## 1. Home

One page replaces Overview and Briefing. It reads in the order a campaign asks its
questions each morning.

1. **Header.** "Good morning, <first name of the person signed in>", the date, the
   campaign and seat, and one verdict line from the race (for Sakaja: third, behind
   Babu Owino and Agnes Kagure).
2. **Today.** At most three items, each with one button to where the work is done:
   decisions waiting (expenses and broadcasts to approve), the top issue this week
   (the issue with the most news and social mentions in seven days), and the biggest
   rival move (the largest change between a pollster's last two polls, or a rival's
   post with at least twice their usual engagement). This replaces "today's three",
   "needs you" and the day plan.
3. **The race.** Polls over time, the rivals (party, base, what they posted and how
   it landed), what people are saying (issues by volume, with example lines), and
   the last election's result. This replaces Race, Polls, Opponent watch, the story
   block and Last time.
4. **Our campaign.** The six vital signs, path to victory, pace, ground game by
   ward, polling-day readiness and money. This replaces Overview's engine room.

Every number opens the screen it comes from: supporters → Voters filtered to strong
support; doors → Voters, doors view; a ward in the ground game → Voters with that
ward selected; readiness → Agents; money → Finance; an issue → Listening filtered to
it; a poll line → its source.

Gone: the Demo/Live tabs, the scenario switcher and the `?c=` parameter. The menu has
"Home" first under Operate; Overview and Briefing leave the menu, and `/overview` and
`/briefing` forward to `/home`. Agents still land on the Field app.

### Real and sample

Each section decides for itself and says which it is:

- **The race** is real when the campaign has at least one rival or poll on record;
  otherwise it shows its race's sample.
- **Our campaign** is real when the campaign has people records that are not
  samples; otherwise sample. The 1,200 people seeded into Sakaja's workspace become
  tagged `sample` (their phone numbers come from a fixed formula, so a migration can
  find exactly those rows).
- **Today** takes real items first and fills with sample ones, each tagged.

A sample section carries a small "Sample" tag and one line on making it real
("Import your supporters", "Add a poll"). Samples come from the campaign's own race
(`scenarioForLevel(campaign.level)`, named for its candidate as now): Kalonzo sees
the presidential sample, Mathira the MP sample, Sakaja the governor sample only
where his data is not yet real.

## 2. Voters

One map-first screen replaces People, Know your voters and Canvassing. `/people` and
`/canvassing` forward to it.

- **Area.** A breadcrumb (Nairobi › Dagoretti North › Kileleshwa) sets the area for
  everything on the screen. Picking a ward on the map or drawing an area changes it.
- **Headline numbers** for the area: registered, on file, supporters, doors knocked,
  coverage. Each filters or scrolls to what it counts.
- **The map**, as on Know your voters now (colour by support, doors, issue,
  registered; draw an area).
- **One panel for the area** with three views: People (the list, with support,
  consent and last-contact filters), Doors (turf coverage, what came up at the door,
  latest doors) and Wards (every ward by the numbers; shown above ward level).
- **Actions for the area:** "Message these people" opens Broadcast with that
  audience chosen; "Walk list" exports the area's list; "Add a person".
- **Manage records** (button): import, where records come in, possible duplicates,
  consent.
- The state lives in the address (`?area=`, `?view=`, filters), so a link from Home
  opens the right slice.

Access stays as now: agents see the map and the Doors view, not the People list or
Manage records. The Field app is unchanged.

## 3. Real race data

### Rivals and polls

- `race_rivals`: campaign, name, party, office, whether it is the campaign's own
  candidate, colour, order, and their public handles (Facebook, X, TikTok).
- `race_polls`: campaign, pollster, fieldwork dates, published date, sample size,
  margin of error, source link, each named candidate's share, undecided, and job
  approval where reported.
- Both follow the campaign rules: `campaign_id`, the restrictive own-campaign policy,
  the team reads, the candidate or manager writes. Edited from the race section on
  Home ("Edit rivals", "Add a poll").

Sakaja's starting data, from public sources:

| Poll | Babu Owino | Agnes Kagure | Sakaja | James Gakuya | Other |
|---|---|---|---|---|---|
| CAP, 14–19 Apr 2026, 6,000 voters, ±1.94 ([Citizen](https://citizen.digital/article/nairobi-governor-race-babu-owino-leads-agnes-kagure-follows-as-sakaja-trails-in-new-poll-n381233)) | 37% | 34% | 10% | 7% | Nyakera 1, Karauri 1, undecided 9; Sakaja approval 10%, disapproval 80% |
| Mizani, published 1 Jul 2026 ([Streamlinefeed](https://streamlinefeed.co.ke/news/babu-owino-and-agnes-kagure-overtake-sakaja-in-latest-nairobi-gubernatorial-poll)) | 27.1% | 23.7% | 19.9% | 11.2% | Waweru 1.5, Aladwa 1.4, undecided 13.3 |
| ISS Africa, Sep 2025, 1,063 voters ([Kenyans.co.ke](https://www.kenyans.co.ke/news/116303-babu-owino-leads-sakajas-popularity-plummets-ahead-nairobi-2027-governor-race-new-poll)) | 28.1% | — | 16.4% | 11.2% | Nyakera 19.2 |

A Mizani poll of 21–28 Aug 2026 (1,820 voters, ±2.3: Babu 28.4, Kagure 27.2,
Sakaja 17.0, Gakuya 15.0) appears in search summaries; it goes in only once its
article is found and read.

Rivals: Babu Owino (Embakasi East MP, The Mwananchi Party), Agnes Kagure (Kenya
Patriots Party), James Gakuya (Embakasi North MP, DCP) and Ronald Karauri (Kasarani
MP), per [Citizen, 25 Sep 2026](https://citizen.digital/article/city-hall-chessboard-sakaja-babu-gakuya-karauri-gear-up-for-2027-nairobi-battle-n390883).
Handles are confirmed from each official page while building. The 2022 result comes
from the IEBC declaration, checked against a second source.

### Social posts

- A daily sweep reads each rival's and the candidate's recent public posts on
  Facebook, X and TikTok through ScrapeCreators (`api.scrapecreators.com/v1`,
  `x-api-key` header), using the key Lovable already holds. The server reads it from
  the project secret; its exact name is confirmed before building.
- Each post is stored in `listening_mentions` like a news item: source
  (`facebook`, `x`, `tiktok`), author (the rival), link, text, time, reach
  (reactions + comments + shares). The existing classifier gives it a mood and an
  issue.
- For each rival's two most-engaged new posts, up to 50 comments are read and
  classified in one batch; only the counts are kept (comments read, positive,
  negative, top issue). Commenters' names, IDs and text are never stored.
- A daily credit cap (`SCRAPECREATORS_DAILY_CREDITS`, default 60, about 40–60 used
  for five candidates) stops the sweep when reached. With no key, the sweep skips
  social and Listening says so.
- News keeps coming from Listening's Firecrawl sweep, with topics for each rival and
  Nairobi's issues (floods, garbage, drainage, water, hawkers, transport, revenue).

### Listening: keywords and Google Alerts

- Keywords were there but hard to find (the Watchlist tab). The tab becomes
  **Keywords**, and Pulse shows the current keywords at the top with "Add keywords".
- Google Alerts has no API, but each alert can be delivered as an RSS feed. A keyword
  can take a Google Alert feed link (`listening_topics.alert_feed_url`); the hourly
  sweep reads it next to Firecrawl, turns each entry into a mention (source
  `google_alerts`, the real article link taken out of Google's redirect), and the
  classifier tags mood and issue. No credits are used.
- Only `https://www.google.com/alerts/feeds/…` links are accepted, checked in the
  database and again before fetching, so the server cannot be pointed anywhere else.
- How to get the link, shown next to the field: google.com/alerts → create the alert
  → Show options → Deliver to: RSS feed → copy the feed icon's link.

## Build order

1. **Home** on today's data: the structure, real/sample tags, links, redirects and
   menu, plus the `sample` tag on seeded people.
2. **Race data**: rivals and polls with their editor, Sakaja's starting data, the
   Keywords tab and Google Alert feeds, then the social sweep.
3. **Voters**: the map-first screen, forwards and access.

Each ships on its own after the user's OK: tests, a guarded migration where there is
one, then publish.

## Testing

- Home: which sections are real or sample for a campaign with no data, with race data
  only, and with real people; every metric's link; the forwards from `/overview` and
  `/briefing`.
- Race tables: SQL tests for read, write and cross-campaign isolation, like the
  others.
- Social sweep, against a stand-in for ScrapeCreators: posts become mentions; comment
  counts are stored and comment text and names are not; the credit cap stops the
  run; no key means a skipped run, not an error.
- Voters: the area and view survive a reload; agents see only the map and doors;
  "Message these people" carries the audience into Broadcast.
- Visual check of Home (all three campaigns) and Voters at phone and laptop widths.
