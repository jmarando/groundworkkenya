# Listening and the rival sweep (part 2b of the Home, Voters and race data spec): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listening stores what it finds again, keywords are easy to find and can carry a
Google Alert feed, and a daily sweep reads each candidate's own TikTok, X and Facebook
posts (with how their comments landed) inside a ScrapeCreators credit budget, so Home can
show what rivals posted and flag an unusual one.

**Architecture:** The hourly sweep (`runListeningScan`) keeps its shape: it stores with the
per-campaign conflict key, reads a keyword's Google Alert feed beside the web search, and
takes keyword-search credits from a daily budget. A new daily sweep (`runRivalSweep`) rides
on the same hourly call and keeps its own clock in `listening_jobs`. Posts are mentions tied
to a rival; comment moods are counted in memory and only the counts are stored. Credits are
counted per budget per Nairobi day in the database, because every campaign shares the key.

**Tech stack:** TanStack Start, Supabase (RLS, service role for the scheduled sweep), the
Lovable AI gateway, ScrapeCreators, tsx tests, the SQL harness.

**Spec:** `docs/superpowers/specs/2026-09-29-home-voters-race-design.md`, section 3 (social
posts; Listening: keywords and Google Alerts). Part 2a (race data) is built.

## Global constraints

- Every campaign table keeps `campaign_id` and the restrictive own-campaign policy; the
  scheduled sweeps use the service role and set `campaign_id` from the topic or the rival.
- "Commenters' names, IDs and text are never stored." Only counts: comments read,
  positive, negative, top issue.
- ScrapeCreators: key `SCRAPECREATORS_API_KEY`; daily budgets `SCRAPECREATORS_DAILY_CREDITS`
  (rival sweep, default 60) and `SCRAPECREATORS_KEYWORD_DAILY_CREDITS` (keyword search,
  default 60), each request 1 credit, the day in Africa/Nairobi. "With no key, the sweep
  skips social and Listening says so."
- Google Alerts: "Only `https://www.google.com/alerts/feeds/…` links are accepted, checked in
  the database and again before fetching." No credits used.
- A sample section always shows its Sample tag; real data is never labelled sample.
- Don't reformat whole files; lint only the new lines. Nothing is pushed or published until
  part 3 is built; migrations 18 and 19 reach production only with the user's OK.

## Review focus

1. A feed link that is not Google's (typed straight into the database): never fetched
   (Task 4 test "a feed link that isn't Google's is never fetched").
2. ScrapeCreators out of credits or the budget spent mid-sweep: the sweep stops cleanly,
   says why, and the web search carries on (Task 5 and Task 6 budget tests).
3. A rival whose platform answers with nothing, or an error: the other platforms and rivals
   still run (Task 6 test "one platform failing doesn't stop the rest").
4. The same post seen on two days: stored once, its reach refreshed, its comment counts kept
   (Task 6 test "a post seen again keeps its counts").
5. A post with fewer than three earlier posts to compare with: no "twice the usual" claim
   (Task 8 test "no baseline, no spike").

## Rulings made while planning

- X replies cannot be read through ScrapeCreators (its tweet endpoint returns no replies), so
  X posts get their reach but no comment counts. TikTok and Facebook get both.
- ScrapeCreators' X endpoint returns an account's ~100 most popular tweets, not the newest;
  the sweep keeps those from the last three days, so a quiet recent tweet can be missed.
- The rival sweep runs from the existing hourly scheduled call and keeps its own 20-hour
  clock, so no new schedule has to be set up.
- Handles confirmed on 30 September 2026 (Task 7 lists each page). Gakuya's X is left empty
  (two accounts claim him, neither linked from an official page); no TikTok account could
  be confirmed except Babu Owino's @he.babuowino.

## Files

- Modify `tests/fake-supabase.ts` (upsert with conflict keys, `is`, `not … is null`, numeric
  ordering, topic parents); create `tests/listening.test.ts`.
- Modify `src/lib/listening.server.ts` (conflict key, feeds, keyword budget, `askAiJson`).
- Create `supabase/migrations/20260930090000_social_listening.sql` (schema 18),
  `supabase/migrations/20260930091000_sakaja_handles.sql` (schema 19), `tests/sql/listening.test.sql`;
  modify `tests/sql/race.test.sql`, `src/integrations/supabase/types.ts`.
- Create `src/lib/alerts-feed.ts`, `tests/alerts-feed.test.ts`, `src/lib/social-credits.ts`,
  `src/lib/rival-posts.ts`, `tests/rival-posts.test.ts`, `src/lib/race-sweep.server.ts`,
  `tests/race-sweep.test.ts`.
- Modify `src/lib/scrapecreators.server.ts` (profile posts and comment pages),
  `src/routes/api/public/listening/scan.ts`, `src/lib/listening.functions.ts`,
  `src/routes/_authenticated/listening.tsx`, `src/lib/race-data.ts`, `src/lib/home.ts`,
  `src/lib/home.functions.ts`, `src/components/gw/home/RaceReal.tsx`, `src/styles/groundwork.css`,
  `tests/race-data.test.ts`, `tests/home.test.ts`.

---

### Task 1: The sweep stores what it finds again

Since the multi-campaign migration (28 Sep) mentions are unique on `(campaign_id, url)`, but
the sweep upserts `onConflict: "url"`; Postgres refuses that (42P10) and the sweep ignores the
error, so nothing is stored.

**Files:** Modify `tests/fake-supabase.ts`, `src/lib/listening.server.ts:334-340`; create
`tests/listening.test.ts`.

**Interfaces:** Produces the fake's `upsert(rows, { onConflict, ignoreDuplicates })` (checks
`onConflict` against the table's unique keys, like Postgres), `is(col, v)`, and
`not(col, "is", null)`.

- [ ] **Step 1: Teach the fake what Postgres checks.** In `tests/fake-supabase.ts`:

```ts
/** Unique keys an upsert may name in onConflict, as the database has them. */
const KEYS: Record<string, string[][]> = {
  people: [["campaign_id", "phone"]],
  listening_mentions: [["campaign_id", "url"]],
  listening_jobs: [["key"]],
};
```

  add `["topic_id", "listening_topics"]` to `PARENTS`; add `"upsert"` to `op`'s type with
  `let conflict: string[] = []; let ignoreDup = false;`; in `run()`, before the update and
  delete handling:

```ts
      if (op === "upsert") {
        const known = [...(KEYS[table] ?? []), ["id"]];
        if (!known.some((k) => k.length === conflict.length && k.every((c) => conflict.includes(c)))) {
          return {
            data: null,
            error: {
              code: "42P10",
              message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
            },
          };
        }
        const out: Row[] = [];
        for (const p of payload) {
          const r: Row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...p };
          if (table !== "campaigns") r["campaign_id"] = stamp(r);
          const same = rows(table).find((x) => conflict.every((c) => x[c] === r[c]));
          if (same) {
            if (!ignoreDup) {
              Object.assign(same, p);
              out.push(same);
            }
            continue;
          }
          rows(table).push(r);
          out.push(r);
        }
        return returning ? shape(out) : { data: null, error: null };
      }
```

  and the query methods:

```ts
      upsert(v: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert";
        payload = Array.isArray(v) ? v : [v];
        conflict = (o.onConflict ?? "id").split(",").map((c) => c.trim());
        ignoreDup = o.ignoreDuplicates === true;
        return q;
      },
      is(c: string, v: unknown) {
        filters.push((r) => (r[c] ?? null) === v);
        return q;
      },
```

  In `not`, before the `cs` check: `if (op2 === "is") { filters.push((r) => (r[c] ?? null) !== v); return q; }`
  (with the operator parameter named `op2`, or whatever the existing parameter is called).
  In the ordering comparator, compare numbers as numbers:
  `const x = a[o.col]; const y = b[o.col]; const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "") < String(y ?? "") ? -1 : String(x ?? "") > String(y ?? "") ? 1 : 0;`.

- [ ] **Step 2: Write the failing test** `tests/listening.test.ts`:

```ts
// Checks for the listening sweep: what it stores, what it reads and what it
// spends. Uses a stand-in database and stand-ins for web search, the AI and
// ScrapeCreators; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/listening.test.ts

import { runListeningScan } from "@/lib/listening.server";

import { fakeSupabase } from "./fake-supabase";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

/** The AI, answering with no verdicts: moods aren't what these checks are about. */
const NO_MOODS = `data: ${JSON.stringify({
  type: "response.output_text.delta",
  delta: JSON.stringify({ results: [] }),
})}\n\n`;

function stubFetch(route: (url: string) => { status?: number; body: string }) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    const r = route(String(url));
    return new Response(r.body, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}

const search = (urls: string[]) =>
  JSON.stringify({
    data: urls.map((u, i) => ({ url: u, title: `Story ${i + 1}`, description: "About water in Nairobi." })),
  });

const TOPIC = {
  id: "t1",
  campaign_id: "c1",
  label: "Water",
  query: "Nairobi water",
  kind: "issue",
  active: true,
  keywords: [],
  exclude_terms: [],
  last_scanned_at: null,
  alert_feed_url: null,
};

function world(extra: Record<string, Record<string, unknown>[]> = {}, rpcs = {}) {
  return fakeSupabase(
    { listening_topics: [TOPIC], listening_mentions: [], listening_jobs: [], listening_alerts: [], ...extra },
    rpcs,
  );
}

async function main() {
  process.env["LOVABLE_API_KEY"] = "test-key";
  process.env["FIRECRAWL_API_KEY"] = "test-key";
  delete process.env["SCRAPECREATORS_API_KEY"];

  {
    const sb = world();
    stubFetch((u) =>
      u.includes("firecrawl") ? { body: search(["https://news.test/a", "https://news.test/b"]) } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("what the sweep finds is stored", r.stored, 2);
    eq("under the topic's campaign", sb.tables["listening_mentions"]?.map((m) => m["campaign_id"]), ["c1", "c1"]);
    const again = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40, force: true });
    eq("the same stories again are not stored twice", [again.stored, sb.tables["listening_mentions"]?.length], [0, 2]);
  }
  {
    const sb = world({ listening_mentions: [{ id: "m0", campaign_id: "c2", url: "https://news.test/a", source: "news" }] });
    stubFetch((u) => (u.includes("firecrawl") ? { body: search(["https://news.test/a"]) } : { body: NO_MOODS }));
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("a story another campaign has is still stored for this one", r.stored, 1);
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 3: Run** it. Expected: FAIL "what the sweep finds is stored" (got 0: the fake now
      refuses `onConflict: "url"`). Run `tests/home.test.ts`, `tests/race.test.ts` (they use the
      fake): still pass.
- [ ] **Step 4: Fix** `src/lib/listening.server.ts`:

```ts
      if (rows.length) {
        // Unique per campaign: the same story can matter to two campaigns.
        const { data: ins, error: insErr } = await sb
          .from("listening_mentions")
          .upsert(rows, { onConflict: "campaign_id,url", ignoreDuplicates: true })
          .select("id");
        if (insErr) notes.push(`${topic.label}: what was found could not be stored (${insErr.message}).`);
        stored += ins?.length ?? 0;
      }
```

- [ ] **Step 5: Run** all tests. Expected: pass. **Commit**
      `Listening stores what it finds again (the per-campaign key since 28 Sep)`.

### Task 2: Schema 18: feeds on keywords, rivals' posts, the credit budget

**Files:** Create `supabase/migrations/20260930090000_social_listening.sql`,
`tests/sql/listening.test.sql`; modify `src/integrations/supabase/types.ts`.

**Interfaces:** Produces `listening_topics.alert_feed_url`; `listening_mentions.rival_id,
comments_read, comments_positive, comments_negative, comments_issue`; table
`social_credits(budget, day, used)`; `take_social_credits(_budget text, _n integer, _cap integer) → boolean`
(service role, or staff; false for anyone else); `groundwork_schema_version()` = 18.

- [ ] **Step 1: Failing SQL tests** `tests/sql/listening.test.sql`:

```sql
-- Listening, part 2: Google Alert feeds on keywords, rivals' posts and how
-- they landed, and the daily ScrapeCreators budget. Run with tests/sql/run.sh;
-- each test rolls back.

\ir fixtures.sql

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: a keyword takes a Google Alert feed and nothing else
begin;
insert into public.listening_topics (campaign_id, label, query)
values ('ca000000-0000-4000-8000-000000000003', 'Water', 'Mathira water');
do $$ begin
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://www.google.com/alerts/feeds/01234567890123456789/12345678901234567890' where label = 'Water'$q$) is null,
    'a Google Alert feed is refused';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'http://www.google.com/alerts/feeds/0123/4567' where label = 'Water'$q$) = '23514', 'a plain http feed is accepted';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://evil.test/alerts/feeds/0123/4567' where label = 'Water'$q$) = '23514', 'another site is accepted';
  assert pg_temp.state_of($q$update public.listening_topics set alert_feed_url =
    'https://www.google.com/alerts/feeds/0123/4567?next=https://evil.test' where label = 'Water'$q$) = '23514',
    'a feed link with extras is accepted';
end $$;
rollback;

-- test: the daily budget stops at its limit, and each budget is its own
begin;
do $$ begin
  assert public.take_social_credits('rivals', 50, 60), 'the first 50 of 60';
  assert not public.take_social_credits('rivals', 11, 60), 'past the limit';
  assert public.take_social_credits('rivals', 10, 60), 'up to the limit';
  assert public.take_social_credits('keywords', 60, 60), 'keywords have their own budget';
  assert (select used from public.social_credits where budget = 'rivals') = 60, 'rivals used 60';
end $$;
rollback;

-- test: staff may spend from the budget, the rest of the team may not
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin assert public.take_social_credits('keywords', 3, 60), 'a manager''s sweep spends'; end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert not public.take_social_credits('keywords', 3, 60), 'an agent spends'; end $$;
reset role;
set local role anon;
do $$
begin
  perform public.take_social_credits('keywords', 1, 60);
  assert false, 'anon spends';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: a post keeps its rival until the rival is removed
begin;
insert into public.race_rivals (id, campaign_id, name, tone)
values ('71000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000003', 'Some Rival', 'a');
insert into public.listening_mentions
  (campaign_id, url, source, rival_id, comments_read, comments_positive, comments_negative, comments_issue)
values ('ca000000-0000-4000-8000-000000000003', 'https://www.tiktok.com/@x/video/1', 'tiktok',
        '71000000-0000-4000-8000-000000000001', 50, 12, 31, 'water');
delete from public.race_rivals where id = '71000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select rival_id from public.listening_mentions where url = 'https://www.tiktok.com/@x/video/1') is null,
    'the post still points at a removed rival';
end $$;
rollback;
```

- [ ] **Step 2: Run** `bash tests/sql/run.sh`. Expected: FAIL (column "alert_feed_url" does not exist).
- [ ] **Step 3: Migration** `supabase/migrations/20260930090000_social_listening.sql`:

```sql
-- Listening, part 2. Schema version 18.
--
-- A keyword may carry a Google Alert feed, read by the hourly sweep. Rivals'
-- own posts are kept as mentions tied to the rival, with how they landed:
-- counts only, never a comment, a name or an id. ScrapeCreators credits are
-- counted per budget per Nairobi day, for every campaign at once because the
-- key is shared.

alter table public.listening_topics
  add column alert_feed_url text
  constraint listening_topics_alert_feed_url_check
  check (alert_feed_url is null or alert_feed_url ~ '^https://www\.google\.com/alerts/feeds/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$');

alter table public.listening_mentions
  add column rival_id uuid references public.race_rivals(id) on delete set null,
  add column comments_read integer check (comments_read is null or comments_read >= 0),
  add column comments_positive integer check (comments_positive is null or comments_positive >= 0),
  add column comments_negative integer check (comments_negative is null or comments_negative >= 0),
  add column comments_issue text check (comments_issue is null or length(comments_issue) <= 40);
create index listening_mentions_rival_idx on public.listening_mentions (rival_id, published_at desc)
  where rival_id is not null;

create table public.social_credits (
  budget text not null check (budget in ('rivals', 'keywords')),
  day    date not null,
  used   integer not null default 0 check (used >= 0),
  primary key (budget, day)
);
alter table public.social_credits enable row level security;
revoke all on public.social_credits from anon, authenticated;
grant all on public.social_credits to service_role;

-- Take _n credits from today's _budget if that stays within _cap: true when
-- taken. The scheduled sweep (no user) and a manager's "Sweep now" may spend.
create or replace function public.take_social_credits(_budget text, _n integer, _cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _day date := (now() at time zone 'Africa/Nairobi')::date;
  _ok boolean;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then
    return false;
  end if;
  if _n <= 0 then
    return true;
  end if;
  insert into public.social_credits (budget, day) values (_budget, _day)
  on conflict (budget, day) do nothing;
  update public.social_credits
     set used = used + _n
   where budget = _budget and day = _day and used + _n <= _cap
  returning true into _ok;
  return coalesce(_ok, false);
end $$;

revoke all on function public.take_social_credits(text, integer, integer) from public, anon;
grant execute on function public.take_social_credits(text, integer, integer) to authenticated, service_role;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 18 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Run** the SQL tests. Expected: `ok   33 migrations apply cleanly`,
      `ok   tests/sql/listening.test.sql (4 tests)`.
- [ ] **Step 5: Types.** In `src/integrations/supabase/types.ts` add `alert_feed_url: string | null`
      (Row), `alert_feed_url?: string | null` (Insert, Update) to `listening_topics`; the five
      mention columns (`rival_id: string | null`, `comments_read/positive/negative: number | null`,
      `comments_issue: string | null`, optional in Insert/Update) with a `rival_id` relationship to
      `race_rivals`; a `social_credits` table entry; and under `Functions`:
      `take_social_credits: { Args: { _budget: string; _n: number; _cap: number }; Returns: boolean }`.
      Typecheck. **Commit** `Listening, part 2: feeds on keywords, rivals' posts, a credit budget (schema 18)`.

### Task 3: Keywords, easy to find, with a Google Alert feed

**Files:** Create `src/lib/alerts-feed.ts` (the link rule here; the parser in Task 4),
`tests/alerts-feed.test.ts`; modify `src/lib/listening.functions.ts`,
`src/routes/_authenticated/listening.tsx`.

**Interfaces:** Produces `ALERT_FEED: RegExp`, `cleanAlertFeed(raw: unknown): string | null`.

- [ ] **Step 1: Failing tests** `tests/alerts-feed.test.ts` (same `eq`/`refuses` helpers as
      `tests/race-data.test.ts`):

```ts
import { cleanAlertFeed } from "@/lib/alerts-feed";

const FEED = "https://www.google.com/alerts/feeds/01234567890123456789/12345678901234567890";
eq("a Google Alert feed", cleanAlertFeed(`  ${FEED} `), FEED);
eq("blank is none", cleanAlertFeed(" "), null);
const HOW = "Paste the feed link from Google Alerts: it starts with https://www.google.com/alerts/feeds/.";
refuses("plain http", () => cleanAlertFeed(FEED.replace("https", "http")), HOW);
refuses("another site", () => cleanAlertFeed("https://evil.test/alerts/feeds/1/2"), HOW);
refuses("extras after the link", () => cleanAlertFeed(`${FEED}?next=https://evil.test`), HOW);
refuses("Google's page, not the feed", () => cleanAlertFeed("https://www.google.com/alerts"), HOW);
```

- [ ] **Step 2: Run.** Expected: FAIL (no module).
- [ ] **Step 3: Implement** `src/lib/alerts-feed.ts`:

```ts
// Google Alerts has no API, but each alert can be delivered as an Atom feed. A
// keyword may carry its feed link, and the hourly sweep reads it beside the web
// search. Only Google's own feed links are accepted, here and in the database.

/** https://www.google.com/alerts/feeds/<user>/<alert>, nothing more. */
export const ALERT_FEED = /^https:\/\/www\.google\.com\/alerts\/feeds\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export function cleanAlertFeed(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!ALERT_FEED.test(v))
    throw new Error("Paste the feed link from Google Alerts: it starts with https://www.google.com/alerts/feeds/.");
  return v;
}
```

- [ ] **Step 4: Save and show it.** `saveTopic`'s input gains `alertFeedUrl?: string` and its
      validator returns `alertFeedUrl: cleanAlertFeed(input.alertFeedUrl)`; the patch gains
      `alert_feed_url: data.alertFeedUrl`. `getListening` maps `alertFeedUrl: t.alert_feed_url ?? null`
      (add it to the `topics` type).
- [ ] **Step 5: The screen.** In `listening.tsx`: the tab `{ key: "watchlist", label: "Watchlist" }`
      becomes `{ key: "keywords", label: "Keywords" }` (rename every `"watchlist"` use and the
      `Watchlist` component to `Keywords`). In `Keywords`: the list card's title "What we watch" →
      "Keywords", its line → "Each keyword is searched across news, blogs and public posts every
      hour, and its Google Alert feed read when it has one."; each row's meta line gains
      `{tp.alertFeedUrl ? " · Google Alert" : ""}`; the form state gains `alertFeedUrl: ""` and,
      after "Words to exclude":

```tsx
          <label className="auth-field">
            <span>Google Alert feed (optional)</span>
            <input
              value={form.alertFeedUrl}
              onChange={(e) => setForm({ ...form, alertFeedUrl: e.target.value })}
              placeholder="https://www.google.com/alerts/feeds/…"
            />
          </label>
          <p className="f-note">
            On google.com/alerts, create the alert, open Show options and set Deliver to: RSS feed.
            Copy the feed icon's link and paste it here. It costs no credits.
          </p>
```

      At the top of the Pulse tab:

```tsx
          <div className="card lk-keywords">
            <div>
              <span className="eyebrow">Keywords</span>
              <p>
                {(data?.topics ?? []).filter((t) => t.active).map((t) => t.label).join(" · ") ||
                  "No keywords yet."}
              </p>
            </div>
            <button type="button" className="btn btn--sm" onClick={() => setTab("keywords")}>
              Add keywords
            </button>
          </div>
```

      with `.lk-keywords { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-top:14px; }`.
- [ ] **Step 6: Run** tests, typecheck, lint the new lines. **Commit**
      `Keywords are easy to find, and a keyword can carry a Google Alert feed`.

### Task 4: The sweep reads Google Alert feeds

**Files:** Modify `src/lib/alerts-feed.ts`, `tests/alerts-feed.test.ts`,
`src/lib/listening.server.ts`, `tests/listening.test.ts`.

**Interfaces:** Produces `realLink(href: string): string | null`,
`parseAlertFeed(xml: string): { url: string; title: string | null; snippet: string | null; publishedAt: string | null }[]`;
`Found` gains `source?: string`.

- [ ] **Step 1: Failing tests.** In `tests/alerts-feed.test.ts`:

```ts
const XML = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Google Alert - Nairobi water</title>
<entry><id>tag:google.com,2013:googlealerts/feed:1</id><title type="html">&lt;b&gt;Nairobi water&lt;/b&gt; rationing extended in Eastlands</title>
<link href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://www.the-star.co.ke/news/2026-09-29-water/&amp;ct=ga&amp;cd=CAIyGjA&amp;usg=AOvVaw"></link>
<published>2026-09-29T08:00:00Z</published><content type="html">Residents of &lt;b&gt;Nairobi&lt;/b&gt; will wait &amp;quot;three more weeks&amp;quot;.</content></entry>
<entry><title type="html">A bad link</title><link href="javascript:alert(1)"></link><published>2026-09-29T09:00:00Z</published></entry>
</feed>`;
eq("each entry, with the article behind Google's link", parseAlertFeed(XML), [
  {
    url: "https://www.the-star.co.ke/news/2026-09-29-water/",
    title: "Nairobi water rationing extended in Eastlands",
    snippet: 'Residents of Nairobi will wait "three more weeks".',
    publishedAt: "2026-09-29T08:00:00.000Z",
  },
]);
eq("a plain link is kept", realLink("https://www.the-star.co.ke/a"), "https://www.the-star.co.ke/a");
eq("not a web link, nothing", realLink("javascript:alert(1)"), null);
```

  In `tests/listening.test.ts`:

```ts
  {
    const FEED = "https://www.google.com/alerts/feeds/0123/4567";
    const sb = world({ listening_topics: [{ ...TOPIC, alert_feed_url: FEED }] });
    const calls = stubFetch((u) =>
      u === FEED ? { body: ALERT_XML } : u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("the keyword's Google Alert feed is read", calls.includes(FEED), true);
    eq(
      "its stories are stored as Google Alerts, at the article's own address",
      sb.tables["listening_mentions"]?.map((m) => [m["source"], m["url"]]),
      [["google_alerts", "https://www.the-star.co.ke/news/2026-09-29-water/"]],
    );
  }
  {
    const sb = world({ listening_topics: [{ ...TOPIC, alert_feed_url: "https://evil.test/feed" }] });
    const calls = stubFetch((u) => (u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS }));
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("a feed link that isn't Google's is never fetched", calls.some((c) => c.includes("evil.test")), false);
    eq("and the sweep says so", r.notes.some((n) => n.includes("not a Google Alerts feed")), true);
  }
```

  (`ALERT_XML` is the same fixture as above, one good entry.)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `src/lib/alerts-feed.ts`:

```ts
export type AlertEntry = { url: string; title: string | null; snippet: string | null; publishedAt: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Text from the feed's HTML: entities decoded (twice, as Google nests them) and tags dropped. */
const plain = (html: string) =>
  decode(decode(html).replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** The article behind Google's redirect link; null when it is not a web link. */
export function realLink(href: string): string | null {
  try {
    const u = new URL(href);
    const target = u.hostname === "www.google.com" && u.pathname === "/url" ? u.searchParams.get("url") : href;
    if (!target) return null;
    const t = new URL(target);
    return t.protocol === "https:" || t.protocol === "http:" ? t.toString() : null;
  } catch {
    return null;
  }
}

/** The entries of a Google Alerts feed, as mentions to store. */
export function parseAlertFeed(xml: string): AlertEntry[] {
  const out: AlertEntry[] = [];
  for (const [, body = ""] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const href = /<link[^>]*href="([^"]+)"/.exec(body)?.[1];
    const url = href ? realLink(decode(href)) : null;
    if (!url) continue;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1];
    const content = /<content[^>]*>([\s\S]*?)<\/content>/.exec(body)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(body)?.[1];
    out.push({
      url,
      title: title ? plain(title).slice(0, 300) || null : null,
      snippet: content ? plain(content).slice(0, 1200) || null : null,
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
    });
  }
  return out;
}
```

  and in `runListeningScan`, after the web search's hits for a topic:

```ts
      // The keyword's Google Alert feed, when it has one: no credits used.
      const feed = typeof topic.alert_feed_url === "string" ? topic.alert_feed_url : "";
      if (feed && !ALERT_FEED.test(feed)) {
        notes.push(`${topic.label}: its alert link is not a Google Alerts feed, so it was not read.`);
      } else if (feed) {
        try {
          const res = await fetch(feed, { headers: { Accept: "application/atom+xml, application/xml" } });
          if (!res.ok) throw new Error(`the feed answered ${res.status}`);
          const entries = parseAlertFeed(await res.text());
          hits.push(...entries.map((e) => ({ ...e, source: "google_alerts" })));
          found += entries.length;
        } catch (err) {
          notes.push(`${topic.label} Google Alert: ${(err as Error).message}`);
        }
      }
```

  with `Found` gaining `source?: string` and the rows using `source: h.source ?? sourceOf(h.url)`.
- [ ] **Step 4: Run** all tests. **Commit** `The hourly sweep reads each keyword's Google Alert feed`.

### Task 5: A daily budget for ScrapeCreators keyword search

**Files:** Create `src/lib/social-credits.ts`; modify `src/lib/listening.server.ts`,
`tests/listening.test.ts`.

**Interfaces:** Produces `type Budget = "rivals" | "keywords"`, `DEFAULT_DAILY_CREDITS = 60`,
`dailyCredits(budget): number`, `takeCredits(sb, budget, n): Promise<boolean>`.

- [ ] **Step 1: Failing tests** in `tests/listening.test.ts`:

```ts
  {
    process.env["SCRAPECREATORS_API_KEY"] = "test-key";
    const spent: number[] = [];
    const sb = world({}, { take_social_credits: (a: Record<string, unknown>) => (spent.push(Number(a["_n"])), false) });
    const calls = stubFetch((u) => (u.includes("firecrawl") ? { body: search([]) } : { body: NO_MOODS }));
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("no credits left: ScrapeCreators is not asked", calls.some((c) => c.includes("scrapecreators")), false);
    eq("the three searches were asked for together", spent, [3]);
    eq("and the sweep says why", r.notes.some((n) => n.includes("today's ScrapeCreators credits")), true);
  }
  {
    const sb = world({}, { take_social_credits: () => true });
    const calls = stubFetch((u) =>
      u.includes("firecrawl") ? { body: search([]) } : u.includes("scrapecreators") ? { body: "{}" } : { body: NO_MOODS },
    );
    await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq("with credits: TikTok, Reddit and YouTube", calls.filter((c) => c.includes("scrapecreators")).length, 3);
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "25";
    eq("the limit comes from the environment", dailyCredits("keywords"), 25);
    process.env["SCRAPECREATORS_KEYWORD_DAILY_CREDITS"] = "lots";
    eq("an unreadable limit falls back to 60", dailyCredits("keywords"), 60);
    delete process.env["SCRAPECREATORS_API_KEY"];
  }
```

  (import `dailyCredits` from `@/lib/social-credits`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/social-credits.ts`:

```ts
// ScrapeCreators credits are shared by every campaign, because the key is.
// Each request comes out of a daily budget: "rivals" for the daily rival sweep,
// "keywords" for the hourly keyword search. The database keeps the count.

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export type Budget = "rivals" | "keywords";
export const DEFAULT_DAILY_CREDITS = 60;

const ENV: Record<Budget, string> = {
  rivals: "SCRAPECREATORS_DAILY_CREDITS",
  keywords: "SCRAPECREATORS_KEYWORD_DAILY_CREDITS",
};

/** The day's limit for a budget, from its environment variable, else 60. */
export function dailyCredits(budget: Budget): number {
  const raw = process.env[ENV[budget]];
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CREDITS;
}

/** Take n credits from today's budget; false past the limit or when the count can't be kept. */
export async function takeCredits(sb: Rpc, budget: Budget, n: number): Promise<boolean> {
  const { data, error } = await sb.rpc("take_social_credits", {
    _budget: budget,
    _n: n,
    _cap: dailyCredits(budget),
  });
  return !error && data === true;
}
```

  In `listening.server.ts`: `AnyClient` gains `rpc: (fn: string, args?: Record<string, unknown>) => any`;
  before the three ScrapeCreators searches, `if (!(await takeCredits(sb, "keywords", 3)))` notes
  once per sweep "Social keyword search stopped: today's ScrapeCreators credits for it are used."
  and skips them.
- [ ] **Step 4: Run** all tests. **Commit** `Keyword search on TikTok, Reddit and YouTube keeps to a daily limit`.

### Task 6: The daily rival sweep

**Files:** Create `src/lib/rival-posts.ts`, `tests/rival-posts.test.ts`,
`src/lib/race-sweep.server.ts`, `tests/race-sweep.test.ts`; modify
`src/lib/scrapecreators.server.ts`, `src/lib/listening.server.ts` (export `askAiJson`),
`src/routes/api/public/listening/scan.ts`.

**Interfaces:**
- `src/lib/rival-posts.ts`: `type Platform = "tiktok" | "x" | "facebook"`;
  `type SocialPost = { platform: Platform; url: string; text: string; publishedAt: string | null; reach: number }`;
  `tiktokPosts(json, handle)`, `xPosts(json, handle)`, `facebookPosts(json)`, `commentTexts(json): string[]`,
  `tally(verdicts: { sentiment: string; issue: string }[]): { positive: number; negative: number; issue: string | null }`.
- `scrapecreators.server.ts`: `scRivalPosts(platform, handle): Promise<SocialPost[]>`,
  `scCommentPage(platform: "tiktok" | "facebook", url, cursor?): Promise<{ texts: string[]; next: string | null }>`.
- `listening.server.ts`: `askAiJson<T>(prompt: string, name: string, schema: object): Promise<T>`
  (the streaming call `readMoods` makes, shared).
- `race-sweep.server.ts`: `runRivalSweep(sb, opts?: { now?: Date; force?: boolean }): Promise<{ ran: boolean; requests: number; posts: number; commentsRead: number; notes: string[] }>`.

- [ ] **Step 1: Failing parser tests** `tests/rival-posts.test.ts` (fixtures follow the
      documented response shapes):

```ts
const TIKTOK = { aweme_list: [
  { aweme_id: "7560000000000000001", desc: "Maji kwa kila mtaa", create_time: 1790640000,
    statistics: { play_count: 90000, digg_count: 12000, comment_count: 800, share_count: 400 } },
  { desc: "no id" },
] };
eq("TikTok videos", tiktokPosts(TIKTOK, "he.babuowino"), [{
  platform: "tiktok", url: "https://www.tiktok.com/@he.babuowino/video/7560000000000000001",
  text: "Maji kwa kila mtaa", publishedAt: "2026-09-29T00:00:00.000Z", reach: 13200,
}]);
const X = { tweets: [{ rest_id: "1970000000000000001", legacy: {
  full_text: "Nairobi deserves better.", created_at: "Mon Sep 28 09:30:00 +0000 2026",
  favorite_count: 1500, reply_count: 300, retweet_count: 200, quote_count: 20 } }] };
eq("tweets", xPosts(X, "HEBabuOwino"), [{
  platform: "x", url: "https://x.com/HEBabuOwino/status/1970000000000000001",
  text: "Nairobi deserves better.", publishedAt: "2026-09-28T09:30:00.000Z", reach: 2020,
}]);
const FB = { posts: [
  { id: "p1", text: "Drainage works in Githogoro", url: "https://www.facebook.com/sakaja/posts/p1",
    publishTime: 1790640000, reactionCount: 900, commentCount: 120 },
  { id: "p2", text: "no link", url: "javascript:alert(1)", publishTime: 1790640000 },
] };
eq("Facebook posts, web links only", facebookPosts(FB), [{
  platform: "facebook", url: "https://www.facebook.com/sakaja/posts/p1",
  text: "Drainage works in Githogoro", publishedAt: "2026-09-29T00:00:00.000Z", reach: 1020,
}]);
eq("comment words only", commentTexts({ comments: [
  { text: " Maji hakuna! ", user: { nickname: "someone", uid: "1" } }, { text: "" }, { user: {} },
] }), ["Maji hakuna!"]);
eq("how comments landed", tally([
  { sentiment: "negative", issue: "water" }, { sentiment: "negative", issue: "Water" },
  { sentiment: "positive", issue: "general" }, { sentiment: "neutral", issue: "roads" },
]), { positive: 1, negative: 2, issue: "water" });
eq("no issue among catch-alls", tally([{ sentiment: "neutral", issue: "general" }]).issue, null);
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/rival-posts.ts`:

```ts
// Rivals' posts from ScrapeCreators' answers, and how their comments landed.
// Pure; only the words of a comment are read here, never who wrote it.

export type Platform = "tiktok" | "x" | "facebook";
export type SocialPost = { platform: Platform; url: string; text: string; publishedAt: string | null; reach: number };

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

/** A TikTok profile's videos (GET /v3/tiktok/profile/videos). */
export function tiktokPosts(json: unknown, handle: string): SocialPost[] {
  return arr(obj(json)["aweme_list"]).flatMap((raw): SocialPost[] => {
    const v = obj(raw);
    const id = str(v["aweme_id"]);
    if (!id) return [];
    const s = obj(v["statistics"]);
    return [
      {
        platform: "tiktok",
        url: `https://www.tiktok.com/@${handle}/video/${id}`,
        text: str(v["desc"]),
        publishedAt: iso(num(v["create_time"]) * 1000),
        reach: num(s["digg_count"]) + num(s["comment_count"]) + num(s["share_count"]),
      },
    ];
  });
}

/** An X account's tweets (GET /v1/twitter/user-tweets). */
export function xPosts(json: unknown, handle: string): SocialPost[] {
  return arr(obj(json)["tweets"]).flatMap((raw): SocialPost[] => {
    const t = obj(raw);
    const id = str(t["rest_id"]);
    if (!id) return [];
    const l = obj(t["legacy"]);
    return [
      {
        platform: "x",
        url: `https://x.com/${handle}/status/${id}`,
        text: str(l["full_text"]),
        publishedAt: iso(Date.parse(str(l["created_at"]))),
        reach: num(l["favorite_count"]) + num(l["reply_count"]) + num(l["retweet_count"]) + num(l["quote_count"]),
      },
    ];
  });
}

/** A Facebook page's posts (GET /v1/facebook/profile/posts). */
export function facebookPosts(json: unknown): SocialPost[] {
  return arr(obj(json)["posts"]).flatMap((raw): SocialPost[] => {
    const p = obj(raw);
    const url = str(p["url"]) || str(p["permalink"]);
    if (!/^https:\/\//.test(url)) return [];
    return [
      {
        platform: "facebook",
        url,
        text: str(p["text"]),
        publishedAt: iso(num(p["publishTime"]) * 1000),
        reach: num(p["reactionCount"]) + num(p["commentCount"]) + num(p["shareCount"]),
      },
    ];
  });
}

/** The words of each comment on a page of comments; nothing about who wrote it. */
export function commentTexts(json: unknown): string[] {
  return arr(obj(json)["comments"])
    .map((c) => str(obj(c)["text"]).trim())
    .filter(Boolean);
}

const NOT_ISSUES = new Set(["general", "campaign"]);

/** Positive and negative counts, and the issue raised most (catch-alls aside). */
export function tally(verdicts: { sentiment: string; issue: string }[]): {
  positive: number;
  negative: number;
  issue: string | null;
} {
  const issues = new Map<string, number>();
  let positive = 0;
  let negative = 0;
  for (const v of verdicts) {
    if (v.sentiment === "positive") positive++;
    if (v.sentiment === "negative") negative++;
    const k = v.issue.trim().toLowerCase();
    if (k && !NOT_ISSUES.has(k)) issues.set(k, (issues.get(k) ?? 0) + 1);
  }
  const top = [...issues].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { positive, negative, issue: top ? top[0].slice(0, 40) : null };
}
```

- [ ] **Step 4: Run** the parser tests. Expected: PASS.
- [ ] **Step 5: Fetchers** in `src/lib/scrapecreators.server.ts` (each request is one credit;
      the caller takes it first):

```ts
/* ------------------------------------------------------- rivals' posts */

/** A rival's recent posts on one platform. */
export async function scRivalPosts(platform: Platform, handle: string): Promise<SocialPost[]> {
  if (platform === "tiktok")
    return tiktokPosts(await scGet("/v3/tiktok/profile/videos", { handle, sort_by: "latest", trim: "true" }), handle);
  if (platform === "x") return xPosts(await scGet("/v1/twitter/user-tweets", { handle, trim: "true" }), handle);
  return facebookPosts(await scGet("/v1/facebook/profile/posts", { url: `https://www.facebook.com/${handle}` }));
}

/** One page of comments on a TikTok or Facebook post, and where the next page starts. */
export async function scCommentPage(
  platform: "tiktok" | "facebook",
  url: string,
  cursor?: string,
): Promise<{ texts: string[]; next: string | null }> {
  const path = platform === "tiktok" ? "/v1/tiktok/video/comments" : "/v1/facebook/post/comments";
  const json = (await scGet(path, { url, ...(cursor ? { cursor } : {}) })) as Record<string, unknown>;
  const more = platform === "tiktok" ? Boolean(json["has_more"]) : Boolean(json["has_next_page"]);
  const c = json["cursor"];
  return { texts: commentTexts(json), next: more && c !== undefined && c !== null && c !== "" ? String(c) : null };
}
```

  (import the parsers and types from `@/lib/rival-posts`).
- [ ] **Step 6: Share the AI call.** In `listening.server.ts`, move the body of `readMoods`'s
      fetch-and-stream into

```ts
/** One structured answer from the AI gateway, read from its stream and parsed. */
export async function askAiJson<T>(prompt: string, name: string, schema: object): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new PauseError("AI is not configured.");
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input: prompt,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  // … the existing status check and stream reading, unchanged …
  return JSON.parse(text) as T;
}
```

  and `readMoods` becomes `const parsed = await askAiJson<{ results?: Verdict[] }>(prompt, "mood_batch", MOOD_SCHEMA); return parsed.results ?? [];`
  with `MOOD_SCHEMA` the schema object it used inline. The Task 1–5 tests cover it.
- [ ] **Step 7: Failing sweep tests** `tests/race-sweep.test.ts`. Stubs: `fetch` answers
      `/v3/tiktok/profile/videos` with two videos (one from a day ago with 1,000 likes, 200
      comments, 50 shares; one from ten days ago), `/v1/twitter/user-tweets` with one tweet
      from a day ago, `/v1/tiktok/video/comments` with two comments (`"Maji hakuna!"`,
      `"Great work"`) and `has_more: false`, and the AI gateway with verdicts
      `[{ i: 0, sentiment: "negative", issue: "water" }, { i: 1, sentiment: "positive", issue: "general" }]`;
      `take_social_credits` is a counter with a cap. Rivals: Babu Owino (campaign c2, TikTok
      `he.babuowino`, X `HEBabuOwino`) and one more in campaign c3 with only an X handle. Checks:

```ts
eq("posts become mentions of the rival, in the rival's campaign", mentions.map((m) => [m.source, m.rival_id, m.campaign_id, m.author, m.reach]), [...]);
eq("a ten-day-old video is left out", mentions.some((m) => m.url.endsWith("…old")), false);
eq("how the video landed, counted", [m.comments_read, m.comments_positive, m.comments_negative, m.comments_issue], [2, 1, 1, "water"]);
eq("no comment is kept anywhere", JSON.stringify(sb.tables).includes("Maji hakuna"), false);
eq("no replies are asked of X", calls.some((c) => c.includes("/v1/twitter/tweet")), false);
eq("once a day: a second run does nothing", (await runRivalSweep(sb, { now })).ran, false);
eq("a post seen again keeps its counts", …after a forced second run, the video's comments_read is still 2 and its reach is the new figure…);
eq("the day's limit stops it", …with a cap of 1, exactly one ScrapeCreators request, and a note naming the limit…);
eq("one platform failing doesn't stop the rest", …TikTok answering 500, the tweet is still stored…);
eq("no key: nothing asked, Listening told", …ran true, requests 0, the race_social job's detail says ScrapeCreators is not connected…);
```

  (write each with its literal expected values; the stub's request list is `calls`).
- [ ] **Step 8: Implement** `src/lib/race-sweep.server.ts`:

```ts
// The daily read of each candidate's own posts on TikTok, X and Facebook
// (server only). Posts become mentions tied to the rival. For each rival's two
// most-engaged new TikTok or Facebook posts, up to 50 comments are read and
// their moods counted; the comments, and who wrote them, are never kept. Every
// ScrapeCreators request comes out of the day's "rivals" budget.

import { askAiJson } from "@/lib/listening.server";
import { tally, type Platform, type SocialPost } from "@/lib/rival-posts";
import { scCommentPage, scConfigured, scRivalPosts, ScrapeCreatorsCreditError } from "@/lib/scrapecreators.server";
import { takeCredits } from "@/lib/social-credits";

type Client = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

const JOB_KEY = "race_social";
const EVERY_HOURS = 20;
const NEW_POST_DAYS = 3;
const POSTS_TO_READ = 2;
const COMMENT_PAGES = 3;
const COMMENTS = 50;

export type RivalSweep = { ran: boolean; requests: number; posts: number; commentsRead: number; notes: string[] };

const LANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "sentiment", "issue"],
        properties: {
          i: { type: "integer" },
          sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
          issue: { type: "string" },
        },
      },
    },
  },
};

/** How comments on one of the rival's posts landed: counts only. */
async function landing(texts: string[], rival: string) {
  const prompt = [
    `These are public comments on a post by ${rival}, a candidate for office in Kenya.`,
    "Text may mix English, Kiswahili and Sheng. For each comment say whether it is positive,",
    `neutral or negative towards ${rival}, and give a short lowercase issue label (roads, water,`,
    "garbage, jobs, bursaries, security, health, housing, corruption, transport, land, general).",
    "Keep each comment's number as i.",
    "",
    JSON.stringify(texts.map((t, i) => ({ i, text: t.slice(0, 300) }))),
  ].join("\n");
  const answer = await askAiJson<{ results?: { i: number; sentiment: string; issue: string }[] }>(
    prompt,
    "comment_moods",
    LANDING_SCHEMA,
  );
  const seen = new Set<number>();
  const verdicts = (answer.results ?? []).filter((v) => v.i >= 0 && v.i < texts.length && !seen.has(v.i) && seen.add(v.i));
  return tally(verdicts);
}

export async function runRivalSweep(sb: Client, opts: { now?: Date; force?: boolean } = {}): Promise<RivalSweep> {
  const now = opts.now ?? new Date();
  const out: RivalSweep = { ran: false, requests: 0, posts: 0, commentsRead: 0, notes: [] };
  const job = (await sb.from("listening_jobs").select("*").eq("key", JOB_KEY).maybeSingle()).data;
  if (!opts.force && job?.last_run_at && now.getTime() - Date.parse(job.last_run_at) < EVERY_HOURS * 3600_000)
    return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;

  const finish = async () => {
    const detail =
      out.notes.join(" · ").slice(0, 400) || `Read ${out.posts} posts and ${out.commentsRead} comments.`;
    await sb
      .from("listening_jobs")
      .upsert(
        { key: JOB_KEY, status: "idle", locked_until: null, last_run_at: now.toISOString(), detail, updated_at: now.toISOString() },
        { onConflict: "key" },
      );
    return out;
  };

  if (!scConfigured()) {
    out.notes.push("ScrapeCreators is not connected, so rivals' posts are not being read.");
    return finish();
  }
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 15 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  let stop = false;
  const spend = async () => {
    if (stop) return false;
    if (!(await takeCredits(sb, "rivals", 1))) {
      stop = true;
      out.notes.push("Stopped at today's ScrapeCreators limit for rivals.");
      return false;
    }
    out.requests++;
    return true;
  };
  const since = now.getTime() - NEW_POST_DAYS * 864e5;
  const { data: rivals } = await sb.from("race_rivals").select("id, campaign_id, name, facebook, x, tiktok");

  for (const r of rivals ?? []) {
    for (const platform of ["tiktok", "x", "facebook"] as Platform[]) {
      const handle: string | null = r[platform];
      if (!handle || !(await spend())) continue;
      let posts: SocialPost[];
      try {
        posts = await scRivalPosts(platform, handle);
      } catch (err) {
        if (err instanceof ScrapeCreatorsCreditError) {
          stop = true;
          out.notes.push("ScrapeCreators is out of credits.");
        } else out.notes.push(`${r.name} on ${platform}: ${(err as Error).message}`);
        continue;
      }
      const fresh = posts.filter((p) => p.publishedAt && Date.parse(p.publishedAt) >= since);
      if (!fresh.length) continue;
      const { data: saved, error } = await sb
        .from("listening_mentions")
        .upsert(
          fresh.map((p) => ({
            campaign_id: r.campaign_id,
            rival_id: r.id,
            source: p.platform,
            author: r.name,
            url: p.url,
            title: p.text.slice(0, 300) || null,
            snippet: p.text.slice(0, 1200) || null,
            published_at: p.publishedAt,
            reach: p.reach,
          })),
          { onConflict: "campaign_id,url" },
        )
        .select("id");
      if (error) out.notes.push(`${r.name}: posts could not be stored (${error.message}).`);
      out.posts += saved?.length ?? 0;
    }

    // How the rival's two most-engaged new posts landed (X replies can't be read).
    const { data: toRead } = await sb
      .from("listening_mentions")
      .select("id, url, source")
      .eq("rival_id", r.id)
      .in("source", ["tiktok", "facebook"])
      .is("comments_read", null)
      .gte("published_at", new Date(since).toISOString())
      .order("reach", { ascending: false })
      .limit(POSTS_TO_READ);
    for (const m of toRead ?? []) {
      const texts: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < COMMENT_PAGES && texts.length < COMMENTS; page++) {
        if (!(await spend())) break;
        try {
          const got = await scCommentPage(m.source, m.url, cursor);
          texts.push(...got.texts);
          if (!got.next) break;
          cursor = got.next;
        } catch (err) {
          out.notes.push(`${r.name}'s comments: ${(err as Error).message}`);
          break;
        }
      }
      const read = texts.slice(0, COMMENTS);
      let moods: { positive: number | null; negative: number | null; issue: string | null } = {
        positive: null,
        negative: null,
        issue: null,
      };
      if (read.length) {
        try {
          moods = await landing(read, r.name);
        } catch (err) {
          out.notes.push(`${r.name}'s comments could not be read for mood: ${(err as Error).message}`);
        }
      }
      await sb
        .from("listening_mentions")
        .update({
          comments_read: read.length,
          comments_positive: moods.positive,
          comments_negative: moods.negative,
          comments_issue: moods.issue,
        })
        .eq("id", m.id);
      out.commentsRead += read.length;
    }
  }
  return finish();
}
```

- [ ] **Step 9: Ride on the hourly call.** In `src/routes/api/public/listening/scan.ts`, after
      `runListeningScan`:

```ts
        // Once a day the same call reads rivals' own posts (it keeps its own clock).
        const rivals = await runRivalSweep(sb as never).catch((e: Error) => ({ ran: false, error: e.message }));
        return Response.json({ ...result, rivals });
```

- [ ] **Step 10: Run** all tests, typecheck, lint the new lines. **Commit**
      `A daily read of each candidate's own posts and how their comments landed, within a credit limit`.

### Task 7: Sakaja's candidates' accounts (schema 19)

**Files:** Create `supabase/migrations/20260930091000_sakaja_handles.sql`; modify
`tests/sql/race.test.sql`.

**Sources (read on 30 September 2026):** x.com/SakajaJohnson and facebook.com/sakaja ("The
Governor of Nairobi, Kenya"); x.com/HEBabuOwino ("the official Twitter handle for Hon
Dr.Babu Owino Embakasi East MP", linking facebook.com/babuowinongili); tiktok.com/@he.babuowino
(642K followers, linking facebook.com/babuowinongili); facebook.com/itsagneskagure ("Leader -
Kenya Patriots Party", listing itsagneskagure, which is x.com/itsagneskagure);
facebook.com/hon.james.gakuya ("MP, Embakasi North. DCP Nairobi Governor Candidate 2027");
x.com/KarauriR ("Member of Parliament - Kasarani") and facebook.com/CaptainRonaldKarauri.

- [ ] **Step 1: Failing tests** appended to `tests/sql/race.test.sql`:

```sql
-- test: Sakaja's candidates' confirmed accounts, and a team's own edit is kept
do $$ begin
  assert (select x from public.race_rivals where name = 'Babu Owino') = 'HEBabuOwino', 'Babu''s X';
  assert (select tiktok from public.race_rivals where name = 'Babu Owino') = 'he.babuowino', 'Babu''s TikTok';
  assert (select facebook from public.race_rivals where name = 'James Gakuya') = 'hon.james.gakuya', 'Gakuya''s Facebook';
  assert (select x from public.race_rivals where name = 'James Gakuya') is null, 'an unconfirmed X for Gakuya';
  assert (select count(*) from public.race_rivals where tiktok is not null) = 1, 'an unconfirmed TikTok';
  assert (select count(*) from public.listening_topics
           where campaign_id = 'ca000000-0000-4000-8000-000000000002'
             and label in ('Babu Owino', 'Agnes Kagure', 'James Gakuya', 'Ronald Karauri', 'Floods', 'Garbage',
                           'Drainage', 'Water', 'Hawkers', 'Transport', 'Revenue')) = 11,
    'a keyword for each rival and each Nairobi issue';
end $$;
begin;
update public.race_rivals set x = 'SomeoneElse' where name = 'Babu Owino';
\ir ../../supabase/migrations/20260930091000_sakaja_handles.sql
do $$ begin
  assert (select x from public.race_rivals where name = 'Babu Owino') = 'SomeoneElse', 'an edit was overwritten';
  assert (select count(*) from public.listening_topics where label = 'Water'
           and campaign_id = 'ca000000-0000-4000-8000-000000000002') = 1, 'a keyword added twice';
  assert public.groundwork_schema_version() = 19, 'schema version';
end $$;
rollback;
```

- [ ] **Step 2: Run.** Expected: FAIL (Babu's X is null).
- [ ] **Step 3: Migration** `supabase/migrations/20260930091000_sakaja_handles.sql`:

```sql
-- Sakaja's race: the candidates' public accounts. Schema version 19.
--
-- Each was confirmed on the candidate's own page on 30 September 2026 (see
-- docs/superpowers/plans/2026-09-30-listening-social.md, Task 7). Two X accounts
-- claim James Gakuya and neither is linked from an official page, so his X is
-- left for the team; no TikTok could be confirmed but Babu Owino's. Only empty
-- handles are filled, so a team's own edits stay.

update public.race_rivals r
   set x        = coalesce(r.x, v.x),
       facebook = coalesce(r.facebook, v.facebook),
       tiktok   = coalesce(r.tiktok, v.tiktok)
  from (values
    ('Johnson Sakaja', 'SakajaJohnson', 'sakaja', null::text),
    ('Babu Owino', 'HEBabuOwino', 'babuowinongili', 'he.babuowino'),
    ('Agnes Kagure', 'itsagneskagure', 'itsagneskagure', null),
    ('James Gakuya', null, 'hon.james.gakuya', null),
    ('Ronald Karauri', 'KarauriR', 'CaptainRonaldKarauri', null)
  ) as v(name, x, facebook, tiktok)
 where r.campaign_id = 'ca000000-0000-4000-8000-000000000002'
   and r.name = v.name;

-- News keeps coming from the web search: a keyword for each rival and for
-- Nairobi's issues, added only where the workspace has no keyword of that name.
insert into public.listening_topics (campaign_id, label, query, kind)
select 'ca000000-0000-4000-8000-000000000002', v.label, v.query, v.kind
  from (values
    ('Babu Owino', 'Babu Owino Nairobi governor', 'rival'),
    ('Agnes Kagure', 'Agnes Kagure Nairobi governor', 'rival'),
    ('James Gakuya', 'James Gakuya Nairobi governor', 'rival'),
    ('Ronald Karauri', 'Ronald Karauri Nairobi governor', 'rival'),
    ('Floods', 'Nairobi floods', 'issue'),
    ('Garbage', 'Nairobi garbage collection', 'issue'),
    ('Drainage', 'Nairobi drainage', 'issue'),
    ('Water', 'Nairobi water shortage', 'issue'),
    ('Hawkers', 'Nairobi hawkers', 'issue'),
    ('Transport', 'Nairobi matatu transport', 'issue'),
    ('Revenue', 'Nairobi county revenue', 'issue')
  ) as v(label, query, kind)
 where exists (select 1 from public.campaigns where id = 'ca000000-0000-4000-8000-000000000002')
   and not exists (
     select 1 from public.listening_topics t
      where t.campaign_id = 'ca000000-0000-4000-8000-000000000002'
        and lower(btrim(t.label)) = lower(v.label)
   );

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 19 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Run.** Expected: `ok   34 migrations apply cleanly`, race tests pass. **Commit**
      `Sakaja's candidates' public accounts, each confirmed on their own page (schema 19)`.

### Task 8: Home shows what rivals posted, and an unusual post

**Files:** Modify `src/lib/race-data.ts`, `tests/race-data.test.ts`, `src/lib/home.ts`,
`src/lib/home.functions.ts`, `tests/home.test.ts`, `src/components/gw/home/RaceReal.tsx`,
`src/styles/groundwork.css`.

**Interfaces:** Produces in `race-data.ts`:
`type RivalPost = { rivalId: string; platform: "tiktok" | "x" | "facebook"; url: string; text: string | null; publishedAt: string | null; reach: number | null; landed: { read: number; positive: number | null; negative: number | null; issue: string | null } | null }`,
`postFromRow(row): RivalPost | null`, `landedLine(p: RivalPost): string`,
`postSpike(rivals, posts, now: Date): RivalMove | null`; `RaceView.posts: RivalPost[]`.

- [ ] **Step 1: Failing tests** in `tests/race-data.test.ts`:

```ts
const post = (rivalId: string, daysAgo: number, reach: number, extra: Partial<RivalPost> = {}): RivalPost => ({
  rivalId, platform: "tiktok", url: `https://www.tiktok.com/@x/video/${rivalId}${daysAgo}`, text: "Post",
  publishedAt: new Date(Date.UTC(2026, 8, 29) - daysAgo * 864e5).toISOString(), reach, landed: null, ...extra,
});
const NOW = new Date(Date.UTC(2026, 8, 29, 12));
eq("a post drawing twice the usual", postSpike(RIVALS, [post("b", 0.5, 18400), post("b", 5, 8000), post("b", 9, 7900), post("b", 14, 7000)], NOW), {
  title: "Babu Owino's TikTok post is drawing 2.3 times the usual response",
  detail: "18,400 reactions, comments and shares, against about 7,900 usually.",
});
eq("no baseline, no spike", postSpike(RIVALS, [post("b", 0.5, 18400), post("b", 5, 8000)], NOW), null);
eq("an old post is not news", postSpike(RIVALS, [post("b", 3, 18400), post("b", 5, 8000), post("b", 9, 7900), post("b", 14, 7000)], NOW), null);
eq("our own post is not a rival's move", postSpike(RIVALS, [post("s", 0.5, 18400), post("s", 5, 8000), post("s", 9, 7900), post("s", 14, 7000)], NOW), null);
eq("how it landed, in words", landedLine(post("b", 1, 13200, { landed: { read: 50, positive: 12, negative: 31, issue: "water" } })),
  "13,200 reactions, comments and shares. Of 50 comments read, 31 negative and 12 positive; mostly about water.");
eq("reach only", landedLine(post("b", 1, 13200)), "13,200 reactions, comments and shares.");
eq("a post row", postFromRow({ rival_id: "b", source: "x", url: "https://x.com/a/status/1", title: "Hi", published_at: "2026-09-28T09:30:00Z", reach: 2020, comments_read: null, comments_positive: null, comments_negative: null, comments_issue: null }),
  { rivalId: "b", platform: "x", url: "https://x.com/a/status/1", text: "Hi", publishedAt: "2026-09-28T09:30:00Z", reach: 2020, landed: null });
eq("not a rival's post", postFromRow({ rival_id: null, source: "news", url: "https://a.test", title: null, published_at: null, reach: null, comments_read: null, comments_positive: null, comments_negative: null, comments_issue: null }), null);
```

  and in `tests/home.test.ts`, the loading test seeds a rival's posts in `listening_mentions`
  (with `rival_id`) and checks `h.race.posts` and that a spike, when present, is the rival move.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `race-data.ts`:

```ts
export type RivalPost = {
  rivalId: string;
  platform: "tiktok" | "x" | "facebook";
  url: string;
  text: string | null;
  publishedAt: string | null;
  reach: number | null;
  /** How its comments landed, counted; null until read (never for X). */
  landed: { read: number; positive: number | null; negative: number | null; issue: string | null } | null;
};

export type PostRow = {
  rival_id: string | null;
  source: string;
  url: string;
  title: string | null;
  published_at: string | null;
  reach: number | null;
  comments_read: number | null;
  comments_positive: number | null;
  comments_negative: number | null;
  comments_issue: string | null;
};

const PLATFORMS = { tiktok: "TikTok", x: "X", facebook: "Facebook" } as const;
export const platformName = (p: RivalPost["platform"]) => PLATFORMS[p];

export function postFromRow(r: PostRow): RivalPost | null {
  if (!r.rival_id || !(r.source in PLATFORMS)) return null;
  return {
    rivalId: r.rival_id,
    platform: r.source as RivalPost["platform"],
    url: r.url,
    text: r.title,
    publishedAt: r.published_at,
    reach: r.reach,
    landed:
      r.comments_read === null
        ? null
        : { read: r.comments_read, positive: r.comments_positive, negative: r.comments_negative, issue: r.comments_issue },
  };
}

const nf = new Intl.NumberFormat("en-KE");

/** A post's reach and, when read, how its comments landed. */
export function landedLine(p: RivalPost): string {
  const reach = p.reach === null ? "" : `${nf.format(p.reach)} reactions, comments and shares.`;
  const l = p.landed;
  if (!l || !l.read) return reach;
  const moods =
    l.negative === null || l.positive === null ? "" : `, ${nf.format(l.negative)} negative and ${nf.format(l.positive)} positive`;
  const about = l.issue ? `; mostly about ${l.issue}` : "";
  return `${reach} Of ${nf.format(l.read)} comments read${moods}${about}.`.trim();
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * A rival's post from the last two days drawing at least twice the response of
 * their other posts this month (at least three to compare with).
 */
export function postSpike(rivals: RaceRival[], posts: RivalPost[], now: Date): RivalMove | null {
  let best: { r: RaceRival; p: RivalPost; base: number; ratio: number } | null = null;
  for (const r of rivals) {
    if (r.isUs) continue;
    const mine = posts
      .filter((p) => p.rivalId === r.id && p.reach !== null && p.publishedAt)
      .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
    const [latest, ...rest] = mine;
    if (!latest || now.getTime() - Date.parse(latest.publishedAt!) > 2 * 864e5) continue;
    const month = rest.filter((p) => now.getTime() - Date.parse(p.publishedAt!) <= 30 * 864e5).map((p) => p.reach!);
    if (month.length < 3) continue;
    const base = median(month);
    if (base <= 0) continue;
    const ratio = latest.reach! / base;
    if (ratio >= 2 && (!best || ratio > best.ratio)) best = { r, p: latest, base, ratio };
  }
  if (!best) return null;
  return {
    title: `${best.r.name}'s ${platformName(best.p.platform)} post is drawing ${best.ratio.toFixed(1)} times the usual response`,
    detail: `${nf.format(best.p.reach!)} reactions, comments and shares, against about ${nf.format(Math.round(best.base))} usually.`,
  };
}
```

  In `home.ts`, `RaceView` gains `posts: RivalPost[]`. In `loadHome`, add the query
  `sb.from("listening_mentions").select("rival_id, source, url, title, published_at, reach, comments_read, comments_positive, comments_negative, comments_issue").not("rival_id", "is", null).gte("published_at", since30).order("published_at", { ascending: false }).limit(300)`,
  map with `postFromRow` (dropping nulls) into `race.posts`, and set
  `rivalMove: postSpike(rivals, posts, new Date()) ?? rivalMove(rivals, polls, todayIso)` (a fresh
  post beats a poll change that can be up to 30 days old). `Home`'s `NOTHING_YET.race` gains
  `posts: []`.
- [ ] **Step 4: Show it.** In `RivalsCard`, under each rival's name block, their newest post:

```tsx
                {post ? (
                  <div className="home-rival-post">
                    <a href={post.url} target="_blank" rel="noopener noreferrer">
                      {platformName(post.platform)}
                      {post.publishedAt ? ` · ${new Date(post.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </a>
                    {post.text ? <p>{post.text.slice(0, 140)}</p> : null}
                    <small className="dim">{landedLine(post)}</small>
                  </div>
                ) : null}
```

  with `const post = race.posts.find((p) => p.rivalId === r.id)` (posts are newest first) and
  `.home-rival-post { grid-column:2 / -1; font-size:13px; } .home-rival-post p { margin:4px 0; overflow-wrap:anywhere; }`.
- [ ] **Step 5: Run** all tests, typecheck, build, lint the new lines. **Commit**
      `Home shows each rival's latest post and how it landed, and an unusual post on Today`.

### Task 9: Listening says what the rival sweep did

**Files:** Modify `src/lib/listening.functions.ts`, `src/routes/_authenticated/listening.tsx`.

- [ ] `getListening` also reads `listening_jobs` where `key = "race_social"` and returns
      `rivalJob: { lastRunAt: string | null; detail: string | null } | null`. In Pulse, under
      the keywords card:

```tsx
          <p className="meta" style={{ marginTop: 8 }}>
            Rivals&apos; own posts:{" "}
            {data?.rivalJob?.lastRunAt
              ? `read ${stamp(data.rivalJob.lastRunAt)}. ${data.rivalJob.detail ?? ""}`
              : "not read yet; the first read happens with the next hourly sweep."}
          </p>
```

- [ ] Typecheck, lint the new lines, run all tests. **Commit** `Listening says what the rival sweep did`.

### Task 10: Look at it

- [ ] In the harness, Home for Sakaja with posts in `HOME_DATA` (a TikTok with counts, a tweet
      without): the rivals card shows each latest post, its link and how it landed; with a
      spike, Today leads with it. A Listening page in the harness (mock `getListening`) shows the
      Keywords tab, the feed field and its how-to line, and Pulse's keywords line with "Add
      keywords" and the rival sweep line. 1280 and 375 wide, no horizontal scroll, no console
      errors. Fix what looks wrong (test first where a rule is involved), run all tests, commit.

### Release (with part 3)

Migrations 18 and 19 are applied before the code; `SCRAPECREATORS_DAILY_CREDITS` and
`SCRAPECREATORS_KEYWORD_DAILY_CREDITS` can be set in Lovable's secrets (both default to 60).
