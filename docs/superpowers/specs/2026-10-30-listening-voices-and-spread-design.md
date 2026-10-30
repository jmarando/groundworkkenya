# Listening: big voices, where a post started, Replay, and briefing voices through Daraja Pulse

Status: designed with the user on 29–30 October 2026. They chose from the mockups (three levels
side by side for big voices, a timeline for spread) and agreed the order of the parts. They then
asked for it to be finished, so building starts in the order below, on a local branch off
origin/main 006b572. Nothing is pushed, migrated or published without their OK. This spec awaits
their review, and any call in it can still change.

## Why

Social media is where Kenyan political news circulates. The user wants Listening to stop being a
pile of posts and answer questions a campaign team acts on:

- "There's no clear place in Listening where I see the big voices", in the constituency, the
  county or the country, and "the biggest voices for and against you".
- "An option to then take them to Daraja Pulse and brief them to join your campaign": who the
  campaign should speak to and recruit to speak for it.
- "The source of a tweet or something, and then it spreads": where a story started and how it
  travelled.
- Whether what Listening gathers is kept, and whether they can play back last week or last month.

## What exists today (origin/main 41e4eb9, live on groundwork.ke)

- `listening_mentions` keeps each post once per campaign and address. It holds the source,
  domain, author, headline, text, `published_at`, `found_at`, the keyword (`topic_id`), a mood
  (`sentiment`), an `issue`, `reach` (views) and `shares` (reposts and quotes, or TikTok shares).
  `reach` and `shares` hold the highest value seen; no history is kept. Rivals' own posts and the
  campaign's own posts carry `rival_id`.
- **The mood is already "towards you".** The AI is asked for "the mood towards that campaign
  (positive, neutral or negative)" (`readMoods` in `src/lib/listening.server.ts`). Warm means for
  you and angry means against you. No new reading is needed to tell the two sides apart.
- Keywords (`listening_topics.kind`) are `campaign`, `rival`, `issue`, `county` or `national`.
- The **Voices & platforms** tab (`src/lib/voices.ts`, `src/components/gw/listening/Voices.tsx`)
  has platform cards, a voices map and a top-30 table. It pools every place together and ranks
  voices by views on the posts we caught. It holds no follower counts, and it leaves out rivals'
  and the campaign's own accounts.
- **Overview** has "Spreading now": posts seen at least 5,000 times within two days.
- **Reactions** (`rapid_responses`) drafts a reaction to a post, copies it for WhatsApp, and can
  send it to Daraja Pulse.
- **Daraja Pulse:** Groundwork's side of the link is built (spec
  `2026-10-20-daraja-pulse-link-design.md`). On 30 October, Pulse's GitHub main had no
  `groundwork-*` functions, so nothing on Pulse receives from Groundwork yet.
- The Listening page loads the latest 600 posts. On a busy campaign that reaches back two to three
  weeks, and there is no date picker. Posts are kept for three years (`prune_old_records`, 29 Oct
  version).
- Sweeping was off from 26 October. The hourly job is switched back on separately, and history
  starts the day it is. The news-gathering work is merged (PR #7, origin/main 006b572): Kenyan
  outlet feeds and Google Alerts replace web search, and the AI reading runs on the user's own
  Gemini key through the same `askAiJson`, which now takes a `tier` ("read" or "write"). The mood
  read keeps its fields and meaning. Outlet posts are saved without view counts.
- Every sweep keys a post by `(campaign_id, url)`: the keyword scan (outlets, Alerts, then
  ScrapeCreators for TikTok, YouTube and Reddit), the X sweep, and the daily rival sweep. The
  keyword scan's rows carry no `campaign_id`; the `stamp_campaign()` trigger fills it in.

## Goals

1. Keep history: a views reading at every sweep, and a record of each day's gathering.
2. **Big voices** by seat, county and country: for or against you, how big they are, and a
   suggested move.
3. **One story, followed:** the first post we found, who picked it up and when, views over time,
   which platforms carried it, and what to do.
4. **Replay** any past week or month, set against the period before.
5. **Brief a voice:** why them, an invitation to edit, and Copy for WhatsApp or DM from day one.
   Send to Daraja Pulse once Pulse can receive.

## Non-goals

- Proving who started a story. "First seen" is the first post we found, and the screens say so.
- The family tree of who quoted whom (option B in the mockups, not chosen; only X has the data).
- Changing how posts are gathered or how moods are read. That work is merged and stays as it is.
- Reading ward or constituency names out of posts for a finer split than seat, county and
  country.
- Changes to Daraja Pulse's own code. The contract it would need is written down here (Part 5).
  It gets built only if the user says so.
- Private accounts, direct messages and closed groups. Listening sees only public posts that its
  keyword searches find.
- Anything that goes out by itself. Every invitation and reaction is read and sent by a person.

## Anti-goals (a failure even if it works)

- **A target list.** A voice is only what it published. Nothing records or guesses anyone's
  community, tribe, religion, home or private life. The rule stays: places, never people.
  "Respond" means answer the claim, never the person. No screen offers to report, block or
  follow up on an account.
- **Listing ordinary people.** Only outlets and accounts above a size floor appear as big voices
  (Part 2). A resident with 300 followers who complains about water never shows up by name.
- **Certainty we don't have.** "First seen" carries its caveat. Every number says where it comes
  from. A blank day is shown as blank, never as a quiet day.
- **Undisclosed paid posts.** Pulse's standing lines (paid-partnership label, no appeals by tribe
  or community, the creator approves a draft) show on every brief and cannot be removed.
- **A busier Listening.** On 23 October the user found Listening too busy. Every new screen leads
  with its answer, and the long lists sit behind "See more".

## Constraints

- **Campaign isolation.** Every new table carries `campaign_id` with the restrictive "own campaign
  only" policy, and every query filters by the caller's campaign. The one exception is
  `listening_accounts` (Part 2), which holds only public profile facts and no campaign data.
- **Roles.** These follow `rapid_responses`. Office roles (super, candidate, manager, organiser)
  can see everything. Only principals (super, candidate, manager) can brief a voice, change an
  approach's status or mark a story handled. Field agents see none of it.
- **Plain code, no AI**, for every number, grouping, suggested move and "so what" line, as in the
  findings engine (`2026-10-13-findings-engine-design.md`). The AI only gives a story a short
  name, through `askAiJson`, which the other work moves to Gemini.
- **Cost.** Follower lookups come out of a new daily ScrapeCreators budget (Part 2), with a
  default of 20 a day.
- **Days are Kenyan days** (Africa/Nairobi).
- **Schema.** Use the next free number (46, unless something lands first). Migrations are named
  `YYYYMMDDHHMMSS_<name>.sql`. The newest is `20261104090000_door_checks.sql` (file names run
  ahead of the calendar), so a new file must sort after it. Bump `groundwork_schema_version`, and
  extend the latest `prune_old_records`.
- **Tests.** Logic goes in pure modules under `src/lib` with tests in `tests/*.test.ts`. Policies
  and database functions get tests in `tests/sql/`. Everything runs with `bash tests/run.sh`.
  Fixtures use invented accounts and posts only, never claims about real politicians.
- **Where to build.** Build on a fresh branch off origin/main (006b572 or later). Never build in
  the working tree of `~/Documents/groundworkkenya`: its local main is far behind.
- **Release.** Push, apply migrations and publish only with the user's OK, one step at a time.

## The parts, in the agreed order

Each part ships on its own. Part 1 goes out as soon as sweeping is back on, because history only
builds from the day it starts.

### Part 1: Keeping history

**1a. A views reading at every sweep.** New table `listening_readings`, one row per reading:
`campaign_id`, `mention_id` (deleted along with its post), `at`, `reach`, `shares`, indexed on
`(mention_id, at)`.

- Saved whenever a sweep sees a post that has a views or shares count: the X sweep
  (`x-sweep.server.ts`), the ScrapeCreators keyword search in `runListeningScan` (TikTok,
  YouTube, Reddit) and the rival sweep (`race-sweep.server.ts`). This covers a new post and a
  post found again.
- A reading is saved when the post has none yet, when its counts differ from its latest reading,
  or when its latest reading is at least 6 hours old. Flat stretches still show as checked,
  without a row every hour.
- The post's own `reach` and `shares` keep meaning "the highest seen". Nothing that reads them
  changes.
- Suggested mechanism (the builder decides): one database function, called by all three sweeps,
  that keeps the highest count on the post and adds the reading in a single round trip. It
  replaces the "update when higher" loops.
- Two things the function must get right that the loops today do not: a post saved with no
  count must still take its first count (the keyword scan's `.lt("reach", …)` update skips a null
  `reach`); and `shares` must rise with `reach` and on its own. The rival sweep, which today
  overwrites `reach` with the latest value on every upsert, is left as it is; its readings still
  capture the series.
- Written by the service role, read by office roles. Kept for 180 days.

**1b. A record of each day's gathering.** New table `listening_days`, one row per campaign and
Kenyan day, with primary key `(campaign_id, day)`. Columns:

- `posts`: posts found that day, counted by `found_at`. Posts from the candidates' own accounts
  (`rival_id` set) and off-topic posts are left out, as the Voices tab leaves them out.
- `warm`, `neutral`, `angry`, `unread`: their moods.
- `sweeps`: the hourly runs that day.
- `last_sweep_at`, `backfilled`, `updated_at`.

Every hourly run that gathers rewrites today's row for every campaign with an active keyword,
even when nothing was found. A run that is paused, or that finds another run holding the lease,
writes nothing. The same run recounts the last seven days' rows (older days are left as they were), so
moods read late still land on the right day. So after the record begins, a day with
no row means nothing ran: "Sweeping paused". On release, rows are backfilled once from the posts
already kept, with `backfilled = true` and `sweeps = null`. A day before the record began that
has no posts reads "Nothing gathered", not "paused", because we can't tell which it was.

**1c. Posts by date.** A server function that returns the caller's campaign's posts found
between two dates, in the same shape as today's posts and a page at a time. It can narrow to one
day, one voice or one story. Big voices, stories and Replay use it, so none of them is capped by
the latest 600. Today's `getListening` stays as it is for the live tabs.

**Done when:** after a day of sweeps, the campaign has a `listening_days` row with its counts and
`sweeps >= 1`. A post seen by three sweeps with growing views has three readings. A day with no
sweep has no row. A past month's posts can be read a page at a time.

### Part 2: Big voices (option A: three levels side by side)

**Where.** At the top of the Voices & platforms tab, above the platform cards. Today's top-30
table moves behind "See all voices". The voices map stays where it is.

**Columns.** Each column counts only the posts found by keywords of its kind:

- **Your seat** ("Githunguri · your race", from `campaigns.seat`): `campaign`, `rival` and
  `issue` keywords.
- **Your county** ("Kiambu · county news"): `county` keywords. The county's name comes from the
  first part of `campaigns.map_area` through the atlas, else the column is called "County news".
- **The country** ("Kenya · national"): `national` keywords.

A column shows only when the campaign has active keywords of its kind. A voice can appear in more
than one column. Posts with no keyword (rivals' and the campaign's own posts) are left out, as
today. Accounts that belong to a rival or to the campaign itself are left out too: any voice
whose handle matches a `race_rivals` row's `x`, `tiktok` or `facebook` on that platform,
`is_us` rows included.

**Window.** Last 30 days by default, with 7 days and 90 days as choices. A post is dated by when
it was published, or by when it was found if the date is unknown, as in `voices.ts` today.

**Each column shows** the top 3 accounts and the top outlet. "See more" opens up to 10 accounts
and 5 outlets. Each row has:

- the voice's name and platform;
- its size: followers when known (outlets show their number of posts);
- "seen": views summed over its posts in the column, where the platform counts them;
- its top one or two issues;
- **towards you**: the share of its read posts that are warm and the share that are angry. This
  answers "for and against". Only posts found by your own, issue, county and national keywords
  count here. A post found by a rival's keyword counts towards "seen" but not towards the mood,
  because the mood read asks how a post feels about you, and for a post about a rival that answer
  is the least reliable;
- its suggested move.

Tapping a name opens a list of that voice's posts in the column. The list is read through 1c,
so posts older than the latest 600 show too.

**Ranking.** Accounts are ranked by views seen in the column. Accounts on platforms that give no
views (Facebook, Instagram, Reddit) are ranked by followers instead, and posts count breaks ties.
Outlets are ranked by number of posts.

**Size floor (anti-goal).** An account is listed only with at least 2,000 followers or 5,000
views seen in the window. Outlets are always listed. An account below the floor, or with neither
number known yet, is never named, not even under "See more". The column says how many posts came
from smaller accounts ("and 41 posts from smaller accounts").

**Suggested move.** Plain code, first match wins. "Read posts" are the voice's posts in the
column whose mood was read, counted the same way as "towards you" (rival-keyword posts left out).

1. **Press:** an outlet (a news site), not an account.
2. **Respond:** at least 2 read posts, and at least half of them angry towards you. The button
   opens a reaction to its most-seen angry post: answer the claim.
3. **Recruit:** at least 2 read posts, and at least half of them warm.
4. **Win over:** everyone else. That covers big and undecided voices, mixed voices, and voices
   with too few read posts.

**Followers.** New table `listening_accounts`, keyed on `(platform, lower(handle))`, with
`name`, `url`, `followers`, `checked_at` and `failed_at`. It is shared by all campaigns: only
public facts about public accounts, and no campaign data. Authenticated users can read it; only
the service role writes. Each hour the job looks up accounts that could make a column and whose
count is missing or more than 7 days old. For each campaign and column, those are the top 10
accounts by views seen, plus the top 10 by posts among accounts on platforms that give no views.
Lookups come out of a new `profiles` budget in `src/lib/social-credits.ts`
(`SCRAPECREATORS_PROFILE_DAILY_CREDITS`, default 20). The `social_credits_budget_check`
constraint has to allow the new name, so this part needs a migration.

- Providers: ScrapeCreators' profile endpoints, which its index lists for all five platforms
  (checked 30 October): `/v1/tiktok/profile`, `/v1/twitter/profile`, `/v1/instagram/profile`,
  `/v1/youtube/channel` and `/v1/facebook/profile`. Only TikTok's is confirmed beyond its path:
  it takes `handle`, and the count is `stats.followerCount`. The builder confirms the other four
  parameters and fields, and their credit cost.
- **Free first.** Where a search answer already carries the author's follower count (X's author
  object does in both X providers' answers; TikTok's may), keep it as the account's count and
  skip the lookup. The builder confirms the fields.
- Reddit accounts and news sites get no lookup.
- A failed lookup sets `failed_at` and is tried again after 7 days.

**Done when:** the tab shows up to three columns, each with its top 3 accounts and top outlet,
followers where looked up, and no account under the floor, no rival's account and no campaign
account. Tests show the moves follow the rules above.

### Part 3: Where a post started and how it spread (option A: timeline)

**Grouping posts into stories.** Plain code, run by the hourly job over the campaign's posts
found in the last 7 days. Off-topic posts are left out. Rivals' own posts are included, because a
rival's attack spreading is exactly what to follow.

- **Words.** The headline and text are lowercased. Links, @handles and punctuation are stripped,
  stop words are dropped (English, Kiswahili and common Sheng), and words of three or more letters
  are kept, plus hashtags.
- **Links.** A post's links are its own address plus the links in its text. Use the expanded
  link where the provider gives one. A shortened link alone (X's `t.co`) never counts, because
  every post gets a different one. So a post linking to a news article matches the article
  itself.
- **Matching.** Two posts belong together when both are true:
  - they were published within 72 hours of each other (dated by `published_at`, else
    `found_at`);
  - at least one of these holds: they share a link that isn't just a site's front page; their
    word sets overlap (Jaccard) by at least 0.35 with at least 4 shared words; or, on X, one
    quotes or replies to the other.
- **Groups.** Posts that match are joined, including through each other (union-find). These
  thresholds are starting values. The builder tunes them on fixtures, and tests lock them in.
- A **story** is a group with at least 2 posts from at least 2 different voices. A post whose
  voice can't be named counts as a voice of its own.
- **Stable ids.** A new group that contains posts of a saved story keeps that story's id; if it
  contains several stories, it keeps the oldest.
- **Saved** in a new table `listening_stories`: `id`, `campaign_id`, `title`, `issue`,
  `first_mention_id`, `first_seen_at`, `last_post_at`, `posts`, `voices`, `views`,
  `status (new | handled)`, `handled_by`, `handled_at`, `created_at`, `updated_at`. Plus
  `listening_mentions.story_id`, set to null when its story is deleted.
- **Naming.** The AI names each story once, in 8 words or fewer, from its first three posts
  (`askAiJson`). If that fails, the name is the first post's headline cut to 60 characters. A
  story is renamed only when its first post changes.
- **Quotes and replies on X.** For the X match above, the X reader keeps the address of the post
  a post quotes or replies to (`listening_mentions.refers_to`) when the provider gives it.
  TwitterAPI.io's search answer has these fields. ScrapeCreators' may not; without it, grouping
  falls back to words and links.

**The story view.** It opens from Spreading now, from a post in All posts or a voice's posts
(posts in a story carry a "Story" link), and from Replay. Its address is `/listening?story=<id>`.

- **Header:** the name, the issue, the most common read mood, and the trend. Readings are sparse:
  each keyword is searched every 6 to 11 hours. So the trend compares the story's total views at
  its two latest readings. It is "Still climbing" when the total grew by at least 10% and the
  latest reading is under 12 hours old, and "Settled" when it grew by less. When the latest
  reading is older than that, it reads "Not checked since <time>".
- **Chart:** total views against time, from first seen to now (at most 7 days). At each moment,
  every post adds its latest reading so far, and posts without readings add nothing. Numbered
  marks show each pick-up. When no post in the story has view counts (all news, say), the chart
  is replaced by the list alone, with "No view counts for these posts".
- **Pick-ups:** "1 · First seen", with the time, the voice and platform, and the views at its
  first reading. Then every later post in time order: the voice, the platform, whether it is a
  post or an outlet running it, and its views so far.
- **Split:** the share of views by platform, and the top 3 amplifiers (voices by views within
  the story) with their mood.
- **So what** (plain code): "<Mood>, <local | county | national>, <trend>: N views in D days, K
  outlets have run it." The place word comes from the keyword kinds of most of the story's posts
  (seat keywords mean local). It always ends: "First seen means the first post we found, not
  proof of who started it."
- **Actions:**
  - **React** opens Reactions, drafted from the story's most-seen post. `rapid_responses` gets a
    `story_id`, and `draftReaction` takes an optional story.
  - **Brief voices** opens Big voices at the story's level, filtered to Recruit voices who
    posted about the story's issue. Their Brief buttons arrive with Part 5.
  - **Mark handled** is for principals only. It sets the story to handled and marks its posts
    `actioned`, the same as Overview's handled button does for a post today.
- Rivals' own posts in a story are labelled "<Rival>'s own post", including among the
  amplifiers.

**Spreading now** on Overview: a post that belongs to a story shows the story's name instead of
its own headline, and opens the story.

**Done when:** two posts from different accounts that share a link 5 hours apart become one
story. Its view shows the first post we found, the pick-ups, a views curve from the readings, the
platform split, the top amplifiers and the so-what line. Mark handled sticks, and React carries
the story.

### Part 4: Replay

**A new tab, "Replay"**, after Reactions.

- **Period:** Week (Monday to Sunday), Month, or Pick dates, with arrows to step back and
  forward. "Compare with the period before" is on by default.
- **Bars:** posts found each day, split angry, neutral and warm (unread is a light band), drawn
  from `listening_days`. A day with no row after the record began shows "Sweeping paused ·
  nothing gathered". Before the record, a day with no row shows "Nothing gathered". When a day's
  posts include older posts found late (published more than a day earlier), the day says so:
  "12 were older posts found late".
- **The period in five lines** (plain code, worked out from the period's posts through 1c):
  1. Posts found, and the change on the period before; the mood split, with the period before.
  2. The top issue's share, with the period before.
  3. The three loudest voices: listed voices only, the same floor as Part 2.
  4. The stories that spread, by views, with the number of outlets that ran each.
  5. What the office did: reactions drafted (`rapid_responses`), and voices briefed once Part 5
     exists (`voice_outreach`).
- **So what:** one line naming the biggest change. A second line is added when any day in
  either period was paused: "Sweeping was paused for N days, so this comparison is uneven."
- Tapping a day lists that day's posts (1c).

**Done when:** any past week or month opens with its bars, the period before, paused days shown
as blank, the five lines and the so-what, and a day's posts open from its bar.

### Part 5: Brief a voice (Daraja Pulse)

**Where.** "Brief" appears on any account in Big voices (not on outlets), and through Brief
voices on a story. It opens a panel with:

- **Why them** (from their public posts only):
  - their posts in the window and the column they were found in;
  - views seen;
  - the warm and angry shares towards you;
  - their top issues;
  - the column they were found in (your seat, your county or the country), which is how the panel
    says whether they are local.
- **Daraja Pulse's standing lines**, always shown and not removable:
  - every post is labelled as a paid partnership, with the campaign's "Paid for by" line;
  - no appeals to, or targeting of, anyone by tribe or community;
  - the creator approves a draft before anything posts.
- **The invitation**, editable. A plain template fills in the campaign, the candidate, the seat
  and the voice's top issue, with no AI. For example: "Hello, we are the campaign team for
  <candidate> in <seat>. We follow your <page|account> and like how you cover <issue>. We would
  like to brief you on paid, clearly labelled posts for the campaign. If you are open to it,
  reply here and we will send the brief and the rate through Daraja Pulse."
- **Copy for WhatsApp or DM**, which works today.
- **Send to Daraja Pulse**, greyed out with "Daraja Pulse isn't connected to Groundwork yet"
  until Pulse can receive.

**Keeping track.** Copy or Send records an approach in a new table `voice_outreach`, one row per
campaign and voice. Columns: `voice_key`, `platform`, `name`, `url`, `invitation`,
`channel (copied | pulse)`, `status (approached | invited | on_roster | declined)`,
`pulse_prospect_id`, `created_by`, `created_at`, `updated_at`. Big voices then shows "Approached
3 Nov" on that voice. Principals can set the status by hand until Pulse reports it.

**What Pulse would need** (built only with the user's OK, and only after Pulse has the receiving
side from the 20 October design):

- `POST groundwork-prospect`, with the same key and scope as the other `groundwork-*`
  functions. It takes `{ groundwork_campaign_id, prospect: { platform, handle, name, url,
  followers }, invitation, why: [..], paid_for_by }` and answers `{ prospect_id, status }`.
- `groundwork-report` gains `prospects: [{ prospect_id, status }]`.

**Done when:** Brief opens for an account. Copy puts the edited invitation on the clipboard and
records the approach. Send is greyed out with its note. Big voices shows the approach.

## Tables and columns added (one migration per part)

| Part | Added |
|---|---|
| 1 | `listening_readings`; `listening_days`; the readings function; backfill of `listening_days` |
| 2 | `listening_accounts`; `profiles` added to `social_credits_budget_check` |
| 3 | `listening_stories`; `listening_mentions.story_id`, `listening_mentions.refers_to`; `rapid_responses.story_id` |
| 4 | none |
| 5 | `voice_outreach` |

`prune_old_records` also removes:

- readings older than 180 days;
- accounts not checked for 180 days;
- `listening_days` rows older than 3 years;
- stories left with no posts;
- approaches older than 3 years.

## Left to the builder

- A database trigger or explicit calls for the readings; the exact shapes of the new functions.
- Components, layout and chart drawing (inline SVG like the voices map), at phone width too.
- The stop-word list, and the grouping thresholds, tuned on fixtures.
- How the follower lookups spread over the hours; function and file names; page sizes.
- Whether Big voices and stories are worked out in TypeScript from 1c's posts or counted in the
  database, provided the 600-post limit never caps them.

## Calls I made (for the user to check)

1. **The size floor:** 2,000 followers or 5,000 views seen; outlets always.
2. **Suggested moves:** half or more of at least 2 read posts angry gives Respond, warm gives
   Recruit.
3. **Columns** count only their own keywords, and a voice can sit in more than one.
4. Each column shows **the top 3 accounts plus the top outlet**, as in the mockup.
5. **Readings** are saved when counts change or every 6 hours, and kept for 180 days.
6. **Follower lookups:** up to 20 a day, each count refreshed weekly, shared across campaigns.
7. **Grouping:** within 72 hours, with a shared link, or 0.35 word overlap and 4 shared words.
8. **Replay counts posts by the day they were found**, so its blank days match sweeping. Late
   finds are flagged on the day they arrived.
9. **Briefing and marking handled** are for principals only; organisers can look.
10. **Rivals' own posts** are part of stories but are never big voices.
11. **Mood shares leave out posts found by a rival's keyword**, because the mood read is least
    reliable for them. Those posts still count towards "seen".
12. **The Daraja Pulse side is not built.** Send stays greyed out until Pulse can receive. That
    is a change in Pulse's own repository and the user's call.
13. **Building began before the user read this document**, on their instruction to finish. Each
    part is its own commit on a local branch, so any call above can change cheaply.
