# Listening: voices, spread, Replay and the Pulse brief — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Tick a box in this file and commit it as each task finishes**: sessions on this project get cut off by usage limits, and this file is where the next one resumes.

**Goal:** Keep Listening's history, then show the campaign its big voices by seat, county and country, where a story started and how it spread, a Replay of any past week or month, and a brief for recruiting a voice.

**Architecture:** Plain code decides everything (grouping, ranking, moves, "so what" lines) in pure modules under `src/lib`, tested with `tsx` scripts. Postgres keeps the history (readings per sweep, a record per day, saved stories, shared public follower counts, outreach). Server functions read with the caller's RLS-scoped client; only the hourly job writes, with the service role. UI follows the existing Listening tabs (`src/routes/_authenticated/listening.tsx`, `src/components/gw/listening/*`, styles in `src/styles/groundwork.css`).

**Tech Stack:** TypeScript, React 19, TanStack Start (`createServerFn`, `requireSupabaseAuth`), Supabase Postgres, tests run by `bash tests/run.sh` (`tsx` scripts + `tests/sql/*.test.sql` on a throwaway Postgres 16).

**Spec:** `docs/superpowers/specs/2026-10-30-listening-voices-and-spread-design.md`

## Global Constraints

- Days are Kenyan days (`Africa/Nairobi`, UTC+3). Weeks run Monday to Sunday.
- Migrations: new files must sort after `20261104090000_door_checks.sql`; schema numbers 46 (history), 47 (accounts), 48 (stories), 49 (outreach); each migration redefines `groundwork_schema_version()` and, if it adds a table, the **full** latest `prune_old_records()` body plus its new delete.
- Every new table except `listening_accounts` has `campaign_id` with the restrictive `"own campaign only"` policy (as `rapid_responses`). Office roles (super, candidate, manager, organiser) read; principals (super, candidate, manager) write; field agents see nothing. Fixtures: Sakaja is campaign `…0002` (candidate `a1`, agent `b2`, manager `c3`), Mathira `…0003` (candidate `e5`, agent `f6`).
- Readings: saved when the post has none yet, when its counts differ from its latest reading, or when its latest is at least 6 hours old; kept 180 days. The post's own `reach`/`shares` stay "highest seen" and a null takes its first count.
- Big voices floor: an account is listed with **at least 2,000 followers or 5,000 views seen** in the window; outlets always. Mood shares count only posts found by `campaign`, `issue`, `county` and `national` keywords (never `rival`). Moves, first match wins: **Press** (an outlet), **Respond** (at least 2 read posts, at least half angry), **Recruit** (at least 2 read posts, at least half warm), else **Win over**.
- Follower lookups: budget `profiles`, env `SCRAPECREATORS_PROFILE_DAILY_CREDITS`, default 20 a day; a count is refreshed after 7 days; a failed lookup is retried after 7 days.
- Stories: posts within 72 hours; match on a shared link that is not a front page, or Jaccard ≥ 0.35 with ≥ 4 shared words, or an X quote or reply; a story has ≥ 2 posts from ≥ 2 voices; the AI only names it (≤ 8 words; fallback the first post's headline cut to 60 characters). Trend: "Still climbing" when total views at the two latest readings grew ≥ 10% and the latest is under 12 hours old; "Settled" otherwise; "Not checked since …" when older.
- No AI for any number, grouping, ranking, move or "so what" line. Places, never people: nothing records or guesses anyone's community.
- Fixtures use invented accounts and posts only.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **Nothing is pushed, migrated on the live database or published without the user's OK.**

## Review Focus

Inputs the spec implies but a happy-path test would miss, with the task that pins each:

- A post found at 00:30 Nairobi (21:30 UTC the day before) lands on the Nairobi day, in the daily record and in Replay's week edges. → Task 1, Task 3, Task 13
- Every new screen with no data: no posts, no readings, no previous period, a campaign with no county or national keywords. No `NaN`, no empty chart frame. → Tasks 4, 9, 13 and the render checks in Tasks 8, 12, 14, 16
- Two unrelated posts that share only a site's front page or generic words must not become one story, and a link match across more than 72 hours must not either. → Task 9
- A Mathira user, and a Sakaja field agent, read nothing from any new table; the follower table holds no campaign data. → Tasks 1, 5, 10, 15
- A post stored with no count that later gets one, and a lower count after a higher one. → Task 1

---

## Part 1 — Keep history (schema 46)

### Task 1: Readings, the daily record and their functions

**Files:**
- Create: `supabase/migrations/20261105090000_listening_history.sql`
- Test: `tests/sql/history.test.sql` (model: `tests/sql/rapid.test.sql`; uses `\ir fixtures.sql`)

**Interfaces — Produces:**
- Tables `listening_readings(id, campaign_id, mention_id → listening_mentions on delete cascade, at timestamptz default now(), reach int ≥ 0 null, shares int ≥ 0 null)` indexed `(mention_id, at)`; `listening_days(campaign_id, day date, posts, warm, neutral, angry, unread int default 0, sweeps int null, last_sweep_at timestamptz null, backfilled bool default false, updated_at)` primary key `(campaign_id, day)`.
- `record_post_counts(_rows jsonb) returns integer` — `_rows` is `[{campaign_id, url, reach, shares}]`; returns readings saved.
- `refresh_listening_days(_campaign uuid, _from date, _to date) returns void` — recounts from `listening_mentions` by `found_at` Nairobi day; leaves out posts with `rival_id` and `issue = 'off-topic'`; sets counts only (keeps `sweeps`).
- `record_sweep_days() returns integer` — for every campaign with an active keyword: refreshes the last 7 days and adds 1 to today's `sweeps` (sets `last_sweep_at`); returns campaigns touched.
- `backfill_listening_days() returns integer` — one row per campaign-day that has posts and no row, `backfilled = true`, `sweeps` null; called once by the migration; safe to call again.
- All four functions are `security definer`, executable by `service_role` only.

- [x] **Step 1: Write `tests/sql/history.test.sql`** (each block begins/rolls back as `rapid.test.sql` does):
  - schema ≥ 46.
  - a post with null `reach` takes its first count (100) and gets one reading; a second call with 150 raises the post to 150 and adds a reading; a third with 120 adds a reading but the post keeps 150; the same counts again within 6 hours add none; after setting the latest reading's `at` back 7 hours, the same counts add one; `shares` rises on its own; a row with both counts null, or an unknown url, saves nothing.
  - `refresh_listening_days`: a post found `2026-10-28 21:30+00` counts on `2026-10-29`; an off-topic post and a rival's own post are left out; `unread` counts posts with no mood.
  - `record_sweep_days` bumps today's `sweeps` once per call and skips a campaign with no active keyword; `backfill_listening_days` marks `backfilled = true` and `sweeps` null and does nothing the second time.
  - RLS: manager `c3` reads Sakaja's rows; agent `b2` and Mathira candidate `e5` read none; `authenticated` cannot execute the four functions (`has_function_privilege`) and cannot insert into either table.
  - `prune_old_records()` deletes a reading 181 days old and keeps one 179 days old.
- [x] **Step 2: Run** `bash tests/sql/run.sh` — expect the new file to FAIL (tables missing).
- [x] **Step 3: Write the migration.** RLS as `rapid_responses` (restrictive own-campaign, office-role select; no insert/update for `authenticated`). Call `backfill_listening_days()` at the end. Extend `prune_old_records()` (full body from `20261029090000_roadmap.sql` + readings > 180 days + `listening_days` rows with `day` older than 3 years; add `'readings'` to the returned jsonb).
- [x] **Step 4: Run** `bash tests/sql/run.sh` — expect all PASS.
- [x] **Step 5: Commit** `Listening history: a views reading per sweep and a record of each day`.

### Task 2: The sweeps save readings; the hourly run records its day

**Files:**
- Create: `src/lib/readings.server.ts`, `tests/readings.test.ts`
- Modify: `src/lib/listening.server.ts` (the ScrapeCreators block after the upsert, about lines 522-542), `src/lib/x-sweep.server.ts` (the update loop), `src/lib/race-sweep.server.ts` (after the post upsert), `src/routes/api/public/listening/scan.ts`

**Interfaces — Produces:**
```ts
export type Counted = { campaign_id: string; url: string; reach: number | null; shares: number | null };
export function withCounts(rows: Counted[]): Counted[]; // drops rows with neither count; merges duplicate campaign+url keeping the highest of each
export async function recordCounts(sb: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }, rows: Counted[]): Promise<number>; // chunks of 200 → rpc("record_post_counts", { _rows }); returns readings saved; an rpc error is swallowed after being returned as 0 (a sweep never fails on history)
```

- [x] **Step 1: Write `tests/readings.test.ts`** (style of `tests/voices.test.ts`): `withCounts` drops a row with both counts null, merges two rows for one url keeping reach 150 and shares 7, keeps rows for two campaigns separate; `recordCounts` with 450 counted rows calls the fake rpc 3 times with `_rows` lengths 200, 200, 50; an rpc `error` returns 0 and does not throw; no rows means no call.
- [x] **Step 2: Run** `npx tsx --tsconfig tsconfig.json tests/readings.test.ts` — FAIL (module missing).
- [x] **Step 3: Implement** `src/lib/readings.server.ts`.
- [x] **Step 4: Run** the test — PASS.
- [x] **Step 5: Wire.** In `runListeningScan`'s social block replace the `.update({reach, shares}).lt("reach", …)` loop with `recordCounts(sb, rows.map(r => ({ campaign_id: topic.campaign_id, url: r.url, reach: r.reach, shares: r.shares })))`; in `runXSweep` replace its update loop the same way; in the rival sweep call `recordCounts` after the upsert (leave its upsert, and so `reach` overwriting, as it is). In the scan route, after `runListeningScan`, if `result.ran === true` call `sb.rpc("record_sweep_days")` and include its outcome as `days` in the JSON.
- [x] **Step 6: Run** `npx tsx --tsconfig tsconfig.json tests/listening.test.ts` and `tests/race-sweep.test.ts` (existing fakes may need an `rpc` stub; keep their assertions) — PASS; then `npm run typecheck`.
- [x] **Step 7: Commit** `Sweeps save a reading for every counted post and record their day`.

### Task 3: Posts by date

**Files:**
- **As built:** the day helpers went into the existing `src/lib/nairobi-date.ts` (`nairobiDay`, `dayRange`, beside `nairobiToday` and `addDays`; the Monday is `mondayOf` in `field-plan.ts`), and the query validator and cursors into `src/lib/posts-query.ts` (`parsePostsQuery`, `encodeCursor`, `decodeCursor`) with `tests/posts-query.test.ts`. The first plan below names `nairobi-days.ts` and a `weekStart`; read those as these.
- Create: `src/lib/listening-mention.ts`, `src/lib/listening-history.functions.ts`, `tests/nairobi-date.test.ts`, `tests/listening-mention.test.ts`
- Modify: `src/lib/listening.functions.ts` (use `toMention`; no change in behaviour)

**Interfaces — Produces:**
```ts
// nairobi-days.ts
export const nairobiDay: (when: string | number | Date) => string;       // "2026-10-29"
export const addDays: (day: string, n: number) => string;
export const weekStart: (day: string) => string;                          // the Monday
export const dayRange: (from: string, to: string) => { gte: string; lt: string }; // ISO instants, 00:00 Nairobi to 00:00 Nairobi the day after `to`
// listening-mention.ts
export function toMention(row: Record<string, unknown>, topicById: Map<string, { label: string; kind: string }>, rivalById: Map<string, { name: string; is_us: boolean }>): Mention; // exactly the mapping getListening does inline today
// listening-history.functions.ts
export type PostsQuery = { ids: string[] } | { from: string; to: string; cursor?: string };
export type PostsPage = { posts: Mention[]; next: string | null };
export const getListeningPosts; // createServerFn GET, requireSupabaseAuth; office roles only; ids ≤ 200; a range returns 300 a page, newest found first, cursor = `${found_at}|${id}`; leaves out issue = OFF_TOPIC like getListening
```

- [x] **Step 1: Write the two tests.** `nairobi-days`: `nairobiDay("2026-10-28T21:30:00Z") === "2026-10-29"`; `nairobiDay("2026-10-28T20:59:59Z") === "2026-10-28"`; `weekStart("2026-10-29") === "2026-10-26"` and `weekStart("2026-11-01") === "2026-10-26"`; `dayRange("2026-10-29","2026-10-29")` is `{ gte: "2026-10-28T21:00:00.000Z", lt: "2026-10-29T21:00:00.000Z" }`; `addDays("2026-10-31", 1) === "2026-11-01"`. `toMention`: numeric strings in `reach`/`sentiment_score` become numbers, null stays null, a rival row sets `rival`, `rivalIsUs`; an unknown topic id gives `topic: null, topicKind: null`.
- [x] **Step 2: Run both** — FAIL.
- [x] **Step 3: Implement** the helpers; move the inline mapping out of `getListening` into `toMention` and call it; add the server function.
- [x] **Step 4: Run** both tests, `tests/listening.test.ts`, `npm run typecheck` — PASS.
- [x] **Step 5: Commit** `Posts by date, and one place that turns a row into a post`.

---

## Part 2 — Big voices (schema 47)

### Task 4: The ranking, as plain code

**Files:** Create `src/lib/big-voices.ts`, `tests/big-voices.test.ts`. Reuses `voiceOf`, `VoicePost` from `src/lib/voices.ts`.

**Interfaces — Produces:**
```ts
export type Level = "seat" | "county" | "country";
export type Move = "recruit" | "win-over" | "respond" | "press";
export const FLOOR = { followers: 2000, seen: 5000 } as const;
export type BigVoice = { key: string; platform: string; name: string; url: string | null; kind: "account" | "outlet"; followers: number | null; posts: number; seen: number | null; topIssues: string[]; read: number; warm: number; angry: number; towardsWarm: number | null; towardsAngry: number | null; move: Move; angryPostId: string | null; postIds: string[]; last: string };
export type Column = { level: Level; label: string; accounts: BigVoice[]; outlets: BigVoice[]; smaller: number };
export type BigVoicesOpts = { now?: number; days?: number; followers: Map<string, number | null>; rivalKeys: Set<string>; labels: Record<Level, string>; accounts?: number; outlets?: number; floor?: boolean };
export function levelOf(topicKind: string | null): Level | null;           // campaign|rival|issue → seat; county → county; national → country; null → null
export function moveFor(v: { kind: "account" | "outlet"; read: number; warm: number; angry: number }): Move;
export function rivalVoiceKeys(rivals: { x?: string | null; tiktok?: string | null; facebook?: string | null }[]): Set<string>; // "x:@name", "tiktok:@name", "facebook:name", lower-cased as voiceOf keys are
export function bigVoices(posts: VoicePost[], opts: BigVoicesOpts): Column[]; // defaults: 30 days, 10 accounts, 5 outlets, floor on
```

- [x] **Step 1: Write `tests/big-voices.test.ts`** (invented accounts; post factory as in `tests/voices.test.ts`):
  - `levelOf` for each kind and null.
  - a `county`-keyword post appears only in the county column; a voice with posts in two kinds appears in both columns; a post with no topic kind or with `rivalId` appears in none.
  - ranking: accounts rank by `seen ?? followers ?? 0`, ties by posts then name; outlets rank by posts.
  - floor: 2,000 followers listed, 1,999 followers with 4,999 seen not; 5,000 seen listed with unknown followers; neither known → not listed and counted in `smaller`; `floor: false` lists everyone; outlets listed with no numbers.
  - moves: outlet → press; 2 read, 1 angry → respond; 2 read, 1 warm → recruit; 1 read post → win-over; 2 read, 1 angry and 1 warm → respond (angry checked first).
  - mood leaves out a `rival`-keyword post (it adds to `seen` and `posts` only) so a voice with 5 angry rival-keyword posts and none else is `win-over`.
  - `rivalKeys` removes a rival's own handle, and `rivalVoiceKeys([{x:"Rival_One"}])` contains `"x:@rival_one"`.
  - `angryPostId` is that voice's most-seen angry post; `topIssues` holds at most two and skips `general`, `campaign`, `off-topic`.
  - empty input returns no columns and does not throw; a campaign with posts only under `county` keywords returns one column.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.** Window and dating as `voices()` does (`publishedAt ?? foundAt`, `days` default 30).
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `Big voices by seat, county and country, as plain code`.

### Task 5: The shared follower table and the lookup planner

**Files:**
- Create: `supabase/migrations/20261106090000_listening_accounts.sql`, `tests/sql/accounts.test.sql`, `src/lib/profiles.ts`, `tests/profiles.test.ts`
- Modify: `src/lib/social-credits.ts` (add budget `profiles`), tests that list budgets if any

**Interfaces — Produces:**
```sql
listening_accounts(voice_key text primary key, platform text, name text, url text null, followers integer null check (>= 0), checked_at timestamptz null, failed_at timestamptz null)
-- readable by any authenticated user; written by the service role only; social_credits_budget_check also allows 'profiles'
```
```ts
// profiles.ts
export const PROFILE_ENDPOINTS: Record<string, (handle: string) => { path: string; params: Record<string, string> } | null>; // tiktok /v1/tiktok/profile {handle}; x /v1/twitter/profile {handle}; instagram /v1/instagram/profile {handle}; youtube /v1/youtube/channel {handle: "@…"}; facebook /v1/facebook/profile {url: "https://www.facebook.com/<page>"}; reddit and sites → null
export function profileRequest(voiceKey: string): { path: string; params: Record<string, string> } | null;
export function readFollowers(platform: string, answer: unknown): number | null; // tolerant: stats.followerCount, followers, follower_count, followers_count, legacy.followers_count, subscriberCount, subscribers, edge_followed_by.count (numbers or digit strings); null when none
export type Known = { followers: number | null; checkedAt: string | null; failedAt: string | null };
export function lookupCandidates(columns: Column[], known: Map<string, Known>, now: number, limit: number): string[]; // voice keys: per column the top 10 accounts by seen (from bigVoices with floor false) and the top 10 by posts among those with seen null; skips outlets, platforms with no endpoint, counts fresher than 7 days and failures newer than 7 days; unique; at most `limit`
```

- [x] **Step 1: Write the tests.** SQL: `authenticated` can select, cannot insert or update; negative followers rejected; `take_social_credits('profiles', 1, 20)` returns true; schema ≥ 47. TS: `profileRequest("tiktok:@some_creator")` → path `/v1/tiktok/profile`, `{handle:"some_creator"}`; `"x:@abc"` → `/v1/twitter/profile`; `"facebook:somepage"` → url param; `"reddit:u/x"` and `"site:nation.africa"` → null; `readFollowers` reads `{stats:{followerCount:4100000}}`, `{followers_count:"880000"}`, `{legacy:{followers_count:12}}`, returns null for `{}` and for a negative; `lookupCandidates` skips a count 6 days old, includes one 8 days old, skips a failure 3 days old, includes a missing one, respects `limit`, never returns an outlet.
- [x] **Step 2: Run** (`bash tests/sql/run.sh`, `npx tsx … tests/profiles.test.ts`) — FAIL.
- [x] **Step 3: Implement** the migration (schema 47, redefine the budget constraint to `('rivals','keywords','trends','x','profiles')`; extend `prune_old_records()` to drop accounts with `coalesce(checked_at, failed_at)` older than 180 days) and `profiles.ts`; add `profiles` to `Budget`, `ENV` (`SCRAPECREATORS_PROFILE_DAILY_CREDITS`) and `DEFAULTS` (20).
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `Follower counts: a shared public table and the planner for looking them up`.

### Task 6: Looking followers up, and taking the free ones

**Files:**
- Create: `src/lib/profiles.server.ts`, `tests/profiles-server.test.ts`
- Modify: `src/lib/x-read.ts` (`XHit.followers: number | null`, read from the author object in both providers' shapes), `src/lib/x-sweep.server.ts` (upsert accounts it saw), `src/routes/api/public/listening/scan.ts`, `tests/x-read.test.ts` (or the existing X reader test)

**Interfaces — Produces:**
```ts
export async function runProfileLookups(sb: AnyClient): Promise<{ ran: boolean; looked: number; failed: number; notes: string[] }>; // per campaign: last 30 days of posts → voices → bigVoices(floor:false) → lookupCandidates → one ScrapeCreators call each (scGet) from the "profiles" budget; saves followers + checked_at, or failed_at; stops at the first credit refusal
export async function saveAccounts(sb: AnyClient, rows: { voice_key: string; platform: string; name: string; url: string | null; followers: number | null }[]): Promise<void>; // service-role upsert on voice_key, only rows with followers, sets checked_at
```

- [x] **Step 1: Write the tests.** `x-read`: a TwitterAPI.io-shaped tweet with `author.followers: 31000` yields `followers: 31000`; a ScrapeCreators GraphQL-shaped tweet with `core.user_results.result.legacy.followers_count` yields it; none yields null. `profiles-server` with a fake client and a stubbed fetch: two candidates → two requests with the right paths, rows saved with followers; a 402 answer stops the loop and notes it; an unreadable answer sets `failed_at`; with the `profiles` budget refused, nothing is requested.
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.** Reuse `scGet` (export it from `src/lib/scrapecreators.server.ts` if it is private), `takeCredits(sb, "profiles", 1)`. In the scan route run it after the X sweep, with the usual `.catch`.
- [x] **Step 4: Run** those tests, `tests/x-sweep` tests if present, `npm run typecheck` — PASS.
- [x] **Step 5: Commit** `Follower counts looked up each hour from a small daily budget, and taken free from X posts`.

### Task 7: The Big voices data

**Files:** Create `src/lib/big-voices.functions.ts`.

**Interfaces — Produces:**
```ts
export type BigVoicesData = { columns: Column[]; days: number; canBrief: boolean; approaches: Record<string, { status: string; at: string }> /* empty until Task 16 */ };
export const getBigVoices; // GET; input { days: 7 | 30 | 90 }; requireSupabaseAuth; office roles only (requireRole OFFICE_ROLES); loads posts for the window via the same query as getListeningPosts (all pages), topics (kind), rivals (names and handles for rivalVoiceKeys), accounts; labels: seat = campaigns.seat, county = the atlas county name for the first part of campaigns.map_area else "County news", country = "Kenya"
```

- [x] **Step 1:** No pure logic is new here; cover it by typecheck and the render check in Task 8.
- [x] **Step 2: Implement.** A window is capped at 4,000 posts; if more exist, say so in `columns` via a `truncated` flag on the data.
- [x] **Step 3: Run** `npm run typecheck && npx eslint src/lib/big-voices.functions.ts`.
- [x] **Step 4: Commit** `Big voices: the data for a window`.

### Task 8: The Big voices screen

**Files:**
- Create: `src/components/gw/listening/BigVoices.tsx`, `tests/big-voices-render.test.ts`
- Modify: `src/components/gw/listening/Voices.tsx` (panel on top; the "Who shapes the conversation" table moves inside a `<details><summary>See all voices</summary>`), `src/styles/groundwork.css` (a `bv-` block next to `vx-`)

**Interfaces — Produces:** `BigVoicesView({ data, setDays, open, brief? })` presentational (no hooks), and `BigVoicesPanel({ openVoice })` which does `useQuery(["big-voices", days])`.

- [x] **Step 1: Write `tests/big-voices-render.test.ts`** using `react-dom/server` `renderToStaticMarkup` on `BigVoicesView` with invented columns: renders one block per column with its label, the top 3 accounts and the top outlet, "See more" when there are more, followers as "38k", the move as a word, the sentence "and N posts from smaller accounts"; with no columns it renders the empty note, with no `NaN`.
- [x] **Step 2: Run** — FAIL. **Step 3: Implement** (phone width: columns stack under 720px; each row tappable with `open(voice)`). **Step 4:** the Voices tab calls `getListeningPosts({ ids: voice.postIds })` to show a voice's posts through the existing `Drill`. **Step 5: Run** the render test, `npm run typecheck`, `npx eslint` on touched files — PASS. **Step 6: Commit** `Big voices: three columns on the Voices tab`.

---

## Part 3 — Where a post started and how it spread (schema 48)

### Task 9: Story grouping, curve and lines, as plain code

**Files:** Create `src/lib/stories.ts`, `tests/stories.test.ts`.

**Interfaces — Produces:**
```ts
export const MATCH = { hours: 72, jaccard: 0.35, shared: 4 } as const;
export type StoryPost = { id: string; url: string; source: string; voiceKey: string | null; title: string | null; snippet: string | null; publishedAt: string | null; foundAt: string; refersTo: string | null; storyId: string | null; reach: number | null; sentiment: string | null; issue: string | null; topicKind: string | null; rivalId: string | null };
export function wordsOf(text: string): Set<string>;                      // lower-case; links, @handles, punctuation out; stop words (English, Kiswahili, common Sheng) out; ≥ 3 letters; hashtags kept
export function linksOf(p: Pick<StoryPost, "url" | "title" | "snippet">): string[]; // own address plus links in the text, with no t.co/bit.ly-style shorteners and no bare front pages (path "/" and no query)
export function sameStory(a: StoryPost, b: StoryPost): boolean;
export type Group = { postIds: string[]; firstId: string; savedId: string | null };
export function groupStories(posts: StoryPost[], saved: { id: string; postIds: string[] }[]): Group[]; // union-find; keeps groups with ≥ 2 posts from ≥ 2 voices (a post with no voice counts as its own); first = earliest published/found; savedId = the oldest saved story among its posts
export type Reading = { mentionId: string; at: string; reach: number | null };
export function viewsCurve(readings: Reading[], postIds: string[]): { at: string; views: number }[]; // at each reading time, the sum of every post's latest reading so far
export function trendOf(curve: { at: string; views: number }[], now: number): { kind: "climbing" | "settled" | "unchecked"; since: string | null };
export function platformSplit(posts: { source: string; reach: number | null }[]): { source: string; share: number }[];
export function soWhat(s: { mood: "angry" | "warm" | "mixed"; place: "local" | "county" | "national"; trend: "climbing" | "settled" | "unchecked"; views: number; days: number; outlets: number }): string; // ends with: First seen means the first post we found, not proof of who started it.
```

- [ ] **Step 1: Write the tests.**
  - `sameStory`: two posts sharing an article address 5 hours apart → true; the same link 80 hours apart → false; two posts sharing only `https://www.example.co.ke/` → false; two sharing `t.co` links only → false; overlap 0.35 with 4 shared words → true, with 3 shared words → false; an X reply whose `refersTo` is the other post's url → true.
  - `groupStories`: a chain A–B and B–C joins all three; a group of two posts from one voice is dropped; the saved story id is kept when a saved story's post is in the group and the oldest id wins when two meet; the first post is the earliest.
  - `viewsCurve`: two posts with readings interleaved give a non-decreasing sum at each time; a post without readings adds 0; empty input gives `[]`.
  - `trendOf`: 10% growth between the two latest readings with the latest 2 hours old → climbing; 5% growth → settled; latest 13 hours old → unchecked with `since`; fewer than 2 readings → settled when one exists, unchecked when none.
  - `platformSplit` shares sum to 1 over posts with views and give `[]` when none has views; `soWhat` ends with the caveat sentence and names the number of outlets.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `Stories: grouping, the views curve and the so-what line, as plain code`.

### Task 10: Stories in the database

**Files:** Create `supabase/migrations/20261107090000_listening_stories.sql`, `tests/sql/stories.test.sql`.

**Interfaces — Produces:** `listening_stories(id uuid pk, campaign_id, title text, issue text null, first_mention_id uuid null → listening_mentions on delete set null, first_seen_at timestamptz, last_post_at timestamptz, posts int, voices int, views bigint null, status text check in ('new','handled') default 'new', handled_by uuid null, handled_at timestamptz null, created_at, updated_at)`; `listening_mentions.story_id uuid null → listening_stories on delete set null`; `listening_mentions.refers_to text null`; `rapid_responses.story_id uuid null → listening_stories on delete set null`. RLS: restrictive own-campaign; office roles select; principals update `status`, `handled_by`, `handled_at`; no insert for `authenticated`. `set_story_handled(_story uuid) returns void` (security invoker, principals only via the policy) sets the story handled and its posts' `status` to `actioned`.

- [ ] **Step 1: Write the test:** a manager marks a story handled and its posts become `actioned`; an agent cannot; Mathira's candidate cannot see or update it; deleting a story clears `story_id` on its posts; `refers_to` accepts text; schema ≥ 48; `prune_old_records()` removes a story with no posts older than 30 days (and keeps a younger empty one).
- [ ] **Step 2: Run** — FAIL. **Step 3: Write the migration** (schema 48; full `prune_old_records()` body + stories). **Step 4: Run** — PASS. **Step 5: Commit** `Stories: the tables, who may mark one handled`.

### Task 11: The hourly job forms and names stories; X posts keep what they answer

**Files:**
- Create: `src/lib/stories.server.ts`, `tests/stories-server.test.ts`
- Modify: `src/lib/x-read.ts` (`XHit.refersTo: string | null`: the quoted or replied-to post's address when the answer carries it), `src/lib/x-sweep.server.ts` (store `refers_to`), `src/routes/api/public/listening/scan.ts`

**Interfaces — Produces:** `runStories(sb: AnyClient): Promise<{ ran: boolean; campaigns: number; stories: number; named: number; notes: string[] }>` — per campaign with posts in the last 7 days: loads posts with voice keys, `groupStories`, upserts stories (title kept for an existing story whose first post is unchanged), sets `story_id` on member posts and clears it on posts that left, recomputes `posts`, `voices`, `views`, `first_seen_at`, `last_post_at`; names new stories with `askAiJson` (`tier: "read"`, first three posts) and falls back to the first headline cut to 60 characters when the AI is off or fails.

- [ ] **Step 1: Write the tests** with a fake client holding in-memory tables: two campaigns' posts never share a story; a new group creates a story with the fallback title when `askAiJson` throws; an existing story keeps its title and id when a third post joins; a post that no longer matches is cleared; `x-read` returns `refersTo` for a tweet with `inReplyToId`/`quoted_tweet` (TwitterAPI.io) and for `legacy.in_reply_to_status_id_str`/`quoted_status_id_str` (GraphQL), as `https://x.com/<handle-or-i>/status/<id>`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; run `runStories` in the scan route after the mood reading, with the usual `.catch`. **Step 4: Run** — PASS, plus `npm run typecheck`. **Step 5: Commit** `Stories: formed and named each hour, and X posts keep what they answer`.

### Task 12: The story screen

**Files:**
- Create: `src/lib/stories.functions.ts` (`getStory`, `markStoryHandled`), `src/components/gw/listening/StoryView.tsx`, `tests/story-render.test.ts`
- Modify: `src/lib/rapid.functions.ts` (`draftReaction` accepts optional `storyId`; with it the draft starts from the story's most-seen post and saves `story_id`), `src/routes/_authenticated/listening.tsx` (`validateSearch` also takes `story`; opens the story view), `src/components/gw/listening/Overview.tsx` ("Spreading now" shows the story name and opens the story when a post belongs to one), `src/components/gw/listening/Voices.tsx` and `PostList` (a "Story" link on posts that belong to one), `src/styles/groundwork.css`

**Interfaces — Produces:** `getStory({ id })` → `{ story, posts: Mention[], readings: Reading[], canAct: boolean }` (office roles; the caller's campaign only); `markStoryHandled({ id })` (principals; calls `set_story_handled`); `StoryView({ data, now, react?, brief?, handle? })` presentational: header (name, issue, mood, trend), an SVG views-against-time chart with numbered pick-up marks, the pick-up list ("1 · First seen …"), platform split and top three amplifiers (rivals' own posts labelled "<Rival>'s own post"), the so-what paragraph, and React / Brief voices / Mark handled.

- [ ] **Step 1: Write `tests/story-render.test.ts`:** renders the name, "First seen", the numbered pick-ups in time order, the caveat sentence, the platform split; with no readings at all it shows the list and "No view counts for these posts" and no chart; with one post it does not throw.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the test, `npm run typecheck`, `npx eslint` on touched files — PASS. **Step 5: Commit** `Stories: the screen, from first seen to how far it travelled`.

---

## Part 4 — Replay (no schema change)

### Task 13: Periods, bars and the five lines, as plain code

**Files:** Create `src/lib/replay.ts`, `tests/replay.test.ts`.

**Interfaces — Produces:**
```ts
export type Period = { kind: "week" | "month" | "dates"; from: string; to: string }; // Nairobi days, inclusive
export function periodFor(kind: "week" | "month", anchorDay: string): Period;      // week: Monday to Sunday; month: 1st to last
export function stepPeriod(p: Period, dir: -1 | 1): Period;
export function periodBefore(p: Period): Period;                                    // the same length, ending the day before
export type DayRow = { day: string; posts: number; warm: number; neutral: number; angry: number; unread: number; sweeps: number | null; backfilled: boolean };
export type Bar = { day: string; state: "gathered" | "paused" | "nothing"; posts: number; warm: number; neutral: number; angry: number; unread: number; late: number };
export function bars(p: Period, rows: DayRow[], late: Map<string, number>): Bar[];  // "paused": no row on a day after the first non-backfilled day; "nothing": no row before it; a backfilled row is "gathered"
export type PeriodStats = { posts: number; warm: number; neutral: number; angry: number; topIssue: { issue: string; share: number } | null; voices: string[]; stories: { title: string; views: number; outlets: number }[]; reactions: number; briefed: number; pausedDays: number };
export function fiveLines(cur: PeriodStats, prev: PeriodStats | null): string[]; // exactly five lines; "was" figures only when `prev` has posts
export function replaySoWhat(cur: PeriodStats, prev: PeriodStats | null): string;    // the biggest change in mood or issue share; a second sentence when pausedDays > 0 in either period
```

- [ ] **Step 1: Write the tests:** `periodFor("week","2026-10-29")` is 2026-10-26 to 2026-11-01; `periodFor("month","2026-02-10")` ends 2026-02-28; `stepPeriod` and `periodBefore` of a week; `bars` marks a missing day after the record began "paused", a missing day before it "nothing", a backfilled day "gathered"; `late` is passed through; `fiveLines` of a period with 200 posts against 152 says "up 32%"; with `prev` null or empty it prints no "was" figures and no `NaN`/`Infinity`; with zero posts it still returns five lines; `replaySoWhat` adds the paused sentence only when `pausedDays > 0`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `Replay: periods, bars and the five lines, as plain code`.

### Task 14: The Replay tab

**Files:**
- Create: `src/lib/replay.functions.ts`, `src/components/gw/listening/Replay.tsx`, `tests/replay-render.test.ts`
- Modify: `src/routes/_authenticated/listening.tsx` (a "Replay" tab after Reactions), `src/styles/groundwork.css`

**Interfaces — Produces:** `getReplay({ from, to })` → `{ period, previous, days: DayRow[], late: Record<string, number>, stats: PeriodStats, prevStats: PeriodStats }` (office roles; `listening_days` for both periods; the period's posts through the same loader as `getListeningPosts` for issues, voices (listed ones only, the Part 2 floor), stories, reactions, briefed); `Replay({ data, setPeriod, openDay })` presentational with a bar chart, the five lines, the so-what, a Week / Month / Pick dates control with arrows and "Compare with the period before" on; a day's bar opens that day's posts.

- [ ] **Step 1: Write `tests/replay-render.test.ts`:** renders five lines and the so-what; a paused day shows "Sweeping paused"; a day before the record shows "Nothing gathered"; an empty period renders without `NaN`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the test, `npm run typecheck`, `npx eslint` on touched files — PASS. **Step 5: Commit** `Replay: any past week or month, set against the one before`.

---

## Part 5 — Brief a voice (schema 49)

### Task 15: The invitation, the standing lines and the outreach record

**Files:** Create `supabase/migrations/20261108090000_voice_outreach.sql`, `tests/sql/outreach.test.sql`, `src/lib/outreach.ts`, `tests/outreach.test.ts`.

**Interfaces — Produces:** `voice_outreach(id uuid pk, campaign_id, voice_key text, platform text, name text, url text null, invitation text check (length ≤ 2000), channel text check in ('copied','pulse'), status text check in ('approached','invited','on_roster','declined') default 'approached', pulse_prospect_id text null, created_by uuid default auth.uid(), created_at, updated_at, unique (campaign_id, voice_key))`; RLS: restrictive own-campaign; office roles select; principals insert and update. TS:
```ts
export const STANDING_LINES: readonly string[]; // 1 every post is labelled as a paid partnership with the campaign's "Paid for by" line; 2 no appeals to, or targeting of, anyone by tribe or community; 3 the creator approves a draft before anything posts
export function whyThem(v: BigVoice, level: Level, days: number): string[]; // posts in the window and the column; views seen; warm and angry shares towards you; top issues; only facts from the voice's own posts
export function invitation(c: { candidate: string | null; seat: string }, v: Pick<BigVoice, "name" | "platform" | "topIssues">): string; // a plain template, no AI; names the issue only when there is one
```

- [ ] **Step 1: Write the tests.** SQL: a manager upserts an approach and updates its status; an organiser reads but cannot insert; an agent and Mathira see nothing; a second approach to the same voice conflicts; schema ≥ 49; `prune_old_records()` drops approaches older than 3 years. TS: `STANDING_LINES.length === 3` and the first mentions "Paid for by"; `invitation` contains the candidate, the seat and the issue, and with no issue omits that sentence cleanly; `whyThem` never contains a community word list item (assert none of "tribe", "community", "ethnic" appear apart from the standing lines) and states counts that match the voice.
- [ ] **Step 2: Run** — FAIL. **Step 3: Write the migration** (schema 49; full `prune_old_records()` body + approaches > 3 years) **and the module.** **Step 4: Run** — PASS. **Step 5: Commit** `Briefing a voice: the invitation, the standing lines and a record of who was approached`.

### Task 16: The brief panel

**Files:**
- Create: `src/lib/outreach.functions.ts` (`getApproaches`, `saveApproach`, `setApproachStatus`), `src/components/gw/listening/BriefVoice.tsx`, `tests/brief-render.test.ts`
- Modify: `src/lib/big-voices.functions.ts` (fill `approaches`), `src/components/gw/listening/BigVoices.tsx` (a Brief button on accounts for principals; "Approached 3 Nov" on a voice already approached), `src/styles/groundwork.css`

**Interfaces — Produces:** `saveApproach({ voice: { key, platform, name, url }, invitation, channel })` upserts on `(campaign_id, voice_key)` (principals); `BriefVoice({ voice, level, days, campaign, close, copy, pulseConnected })` presentational: why-them lines, the three standing lines (always shown), the editable invitation, "Copy for WhatsApp or DM" (writes to the clipboard and calls `copy`), and "Send to Daraja Pulse" disabled with "Daraja Pulse isn't connected to Groundwork yet" unless `pulseConnected` (read with the existing `pulse.server.ts` configured check).

- [ ] **Step 1: Write `tests/brief-render.test.ts`:** renders the three standing lines, the editable invitation text and a disabled Send with its note; with `pulseConnected` true Send is enabled; no render path shows an outlet's Brief.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** the test, `npm run typecheck`, `npx eslint` — PASS. **Step 5: Commit** `Briefing a voice: the panel, and who has been approached`.

---

## Finish

### Task 17: The whole check, and the notes

- [ ] **Step 1:** `bash tests/run.sh` — every TypeScript file and every SQL file passes (the baseline was green at origin/main 006b572).
- [ ] **Step 2:** `npm run typecheck`, `npm run lint`, `npx prettier --check` on the files touched, `npm run build` — all clean.
- [ ] **Step 3:** Update the spec's "Calls I made" with anything decided while building (the rival sweep keeps overwriting `reach`; the last seven days of the daily record are rewritten each run; the daily record leaves out rivals' own posts and off-topic posts), tick this plan, commit.
- [ ] **Step 4:** Write the Groundwork memory note (what is built on which branch and commit, what is verified, what needs the user's OK: push, applying schemas 46 to 49 through the Lovable database tool, publishing, the Pulse side, the profile endpoints that were not run against the live API).
- [ ] **Step 5:** Report to the user. Do not push, apply migrations or publish without their OK.
