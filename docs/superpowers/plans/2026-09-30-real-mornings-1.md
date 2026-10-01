# Real mornings, part 1: the diary and this morning's story — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home's day plan and watch list come from a diary the candidate and manager plan a
week at a time, and Home's story is written every morning at 06:00 from the day's real news
(or by the team), replacing the invented ones.

**Architecture:** Two campaign tables (schema 20): `diary_entries`, written by staff through
server functions with row level security, and `morning_stories`, one per campaign per day,
written by a daily step on the hourly Listening call (service role, own clock) and edited by
staff. Pure modules hold every rule (`src/lib/diary.ts`, `src/lib/morning-story.ts`), so they
are tested without a database; server modules only read and write.

**Tech Stack:** TanStack Start (createServerFn) and Router, React, React Query, Supabase with
RLS, the Lovable AI gateway through `askAiJson`, tsx test scripts, SQL tests on a throwaway
Postgres (`tests/sql/run.sh`).

**Spec:** `docs/superpowers/specs/2026-09-30-real-mornings-design.md` (sections 1, 2, Data,
Privacy, Errors). Part 2 (search interest, top of mind, no samples) is a separate plan.

## Global Constraints

- Nothing is pushed until the release; never rewrite pushed history (AGENTS.md).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint only new or changed lines; in files that already have lint errors, the count must not
  rise (`npx eslint -f json <file>` before and after).
- Test first: every rule gets a failing test before its code. `npm test` runs every
  `tests/*.test.ts`, then `bash tests/sql/run.sh`.
- Campaign tables: `campaign_id default my_campaign()`, the restrictive "own campaign only"
  policy, `is_team_member` reads, `is_staff` writes; a change that reaches no row is refused.
- Days and times are Nairobi's (`nairobiToday()`, `HH:MM`), never the browser's.
- The shared `listening_jobs` rows say what happened in counts only: never a campaign's
  keywords, rivals, issues or names (every campaign's team can read them).
- Only public text leaves Groundwork: news and posts to the AI. No voter data.
- Copy is plain English; nothing on Home says "Sample" once its content is real.

## Review Focus

1. A diary entry or story made late at night: after 21:00 UTC it is already the next day in
   Nairobi, and must land there. Tests: Task 3 ("a late entry lands on Nairobi's day").
2. The AI quotes a figure that is in a different item from the one it cites: dropped. Test:
   Task 7 ("a figure from another item is dropped").
3. The hourly call arrives twice in one morning: one story, not rewritten. Test: Task 8 ("a
   second call that morning writes nothing").
4. The team writes the story before 06:00: the step leaves it. Test: Task 8 ("the team's
   story stays").
5. A link that is not the web (`javascript:`) in a stored story, or a team link without
   https: never shown. Tests: Task 7 ("a stored link that isn't the web is left out", "links
   must be https").

---

### Task 1: The hourly sweep's shared note names no keyword

**Files:**
- Modify: `src/lib/listening.server.ts` (`runListeningScan`, from `const notes: string[] = [];`
  to the final `listening_jobs` update)
- Test: `tests/listening.test.ts`

**Interfaces:** Produces nothing new: `runListeningScan` still returns `notes` naming the
keyword (for the person who pressed Sweep now); only the job row's `detail` changes.

- [ ] **Step 1: Write the failing test.** In `tests/listening.test.ts`, before the line
      `// ScrapeCreators keyword search comes out of a daily budget.`, add:

```ts
  {
    // Every campaign's team can read the sweep's job row, so it names no keyword.
    const sb = world();
    stubFetch((u) =>
      u.includes("firecrawl") ? { status: 500, body: "try later" } : { body: NO_MOODS },
    );
    const r = await runListeningScan(sb as never, { topicLimit: 4, classifyLimit: 40 });
    eq(
      "the shared note says what failed, without the keyword",
      sb.tables["listening_jobs"]?.[0]?.["detail"],
      "1 keyword could not be searched.",
    );
    eq(
      "the one who swept hears which",
      r.notes.some((n) => n.startsWith("Water:")),
      true,
    );
  }
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/listening.test.ts`.
      Expected: FAIL, the detail is `"Water: Firecrawl …"`.

- [ ] **Step 3: Implement.** In `runListeningScan`, after `const notes: string[] = [];` add:

```ts
  // Every campaign's team can read the job row, so what it says names no keyword:
  // shared notes and counts only. The names go back to whoever swept in notes.
  const shared: string[] = [];
  const failed = { searches: 0, feeds: 0, social: 0, stored: 0 };
  const say = (note: string) => {
    notes.push(note);
    shared.push(note);
  };
```

Then change each note inside the `try`:

```ts
      } catch (err) {
        if (err instanceof PauseError) throw err;
        failed.searches++;
        notes.push(`${topic.label}: ${(err as Error).message}`);
        continue;
      }
```

```ts
      if (feed && !ALERT_FEED.test(feed)) {
        failed.feeds++;
        notes.push(`${topic.label}: its alert link is not a Google Alerts feed, so it was not read.`);
      } else if (feed) {
```

```ts
        } catch (err) {
          failed.feeds++;
          notes.push(`${topic.label} Google Alert: ${(err as Error).message}`);
        }
```

```ts
        if (kw && !keywordsSpent && !(await takeCredits(counter, "keywords", 3))) {
          keywordsSpent = true;
          say("Social keyword search stopped: today's ScrapeCreators credits for it are used.");
        }
```

```ts
            if (err instanceof ScrapeCreatorsCreditError) {
              if (!creditNoted) {
                say("Social search skipped — ScrapeCreators is out of credits.");
                creditNoted = true;
              }
            } else {
              failed.social++;
              notes.push(`${topic.label} social: ${err.message}`);
            }
```

```ts
        if (insErr) {
          failed.stored++;
          notes.push(`${topic.label}: what was found could not be stored (${insErr.message}).`);
        }
```

In the outer `catch`, replace `notes.push((err as Error).message);` with:

```ts
    notes.push((err as Error).message);
    shared.push("The sweep stopped early on an error.");
```

And build the detail from `shared` and the counts, replacing
`detail: notes.join(" · ").slice(0, 400) || null,`:

```ts
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counts = [
    failed.searches && `${count(failed.searches, "keyword", "keywords")} could not be searched.`,
    failed.feeds &&
      `${count(failed.feeds, "Google Alert feed", "Google Alert feeds")} could not be read.`,
    failed.social && `${count(failed.social, "social search", "social searches")} failed.`,
    failed.stored && `What ${count(failed.stored, "keyword", "keywords")} found could not be stored.`,
  ].filter((c): c is string => Boolean(c));
```

placed just before the final `await sb.from("listening_jobs").update({...})`, whose detail
becomes `detail: [...shared, ...counts].join(" · ").slice(0, 400) || null,`.

- [ ] **Step 4: Run** the listening tests again. Expected: all pass.
- [ ] **Step 5: Lint** `src/lib/listening.server.ts`: the count must not rise above 17.
- [ ] **Step 6: Commit** `The hourly sweep's shared note names no campaign's keywords`.

---

### Task 2: Schema 20: the diary and the morning's story

**Files:**
- Create: `supabase/migrations/20260930120000_real_mornings.sql`
- Create: `tests/sql/mornings.test.sql`
- Modify: `src/integrations/supabase/types.ts` (two tables, alphabetical)

**Interfaces:** Produces tables `diary_entries (id, campaign_id, day date, starts_at time,
title, kind, ward_id, note, created_by, created_at, updated_at)` and `morning_stories (id,
campaign_id, day date, story jsonb, written_by 'groundwork'|'team', edited_by, edited_at,
created_at, updated_at)`, unique `(campaign_id, day)`; `groundwork_schema_version() = 20`.

- [ ] **Step 1: Write the failing SQL tests** in `tests/sql/mornings.test.sql`:

```sql
-- The diary and this morning's story: who reads and changes them, and the
-- checks they must pass. Run with tests/sql/run.sh; each test rolls back.

\ir fixtures.sql

-- An organiser in Sakaja, beside the fixtures' candidate, manager and agent.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'organiser.sakaja@example.test');
insert into public.campaign_members (campaign_id, user_id, role)
values ('ca000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000000b7', 'organiser');

-- The SQLSTATE a statement fails with, or null when it runs.
create or replace function pg_temp.state_of(_sql text)
returns text language plpgsql as $$
begin
  execute _sql;
  return null;
exception when others then
  return sqlstate;
end $$;

-- test: the team reads its own diary and nobody else does
begin;
insert into public.diary_entries (campaign_id, day, title, kind) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Kayole water point', 'visit'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-05', 'Karatina market', 'market');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.diary_entries) = 1, 'Sakaja''s agent reads one entry';
  assert (select title from public.diary_entries) = 'Kayole water point', 'and it is Sakaja''s';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d4';
do $$ begin
  assert (select count(*) from public.diary_entries) = 0, 'a pending account reads the diary';
end $$;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.diary_entries;
  assert false, 'anon reads a diary';
exception when insufficient_privilege then null;
end $$;
rollback;

-- test: only the candidate or manager changes the diary, and only their own
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.diary_entries (day, starts_at, title, kind) values ('2026-10-05', '10:30', 'Manager added', 'visit');
do $$ begin
  assert (select campaign_id from public.diary_entries where title = 'Manager added')
         = 'ca000000-0000-4000-8000-000000000002', 'filed under the manager''s campaign';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b7';
do $$ begin
  assert pg_temp.state_of($q$insert into public.diary_entries (day, title) values ('2026-10-05', 'Organiser added')$q$) = '42501',
    'an organiser adds to the diary';
  update public.diary_entries set note = 'Changed' where title = 'Manager added';
  assert (select note from public.diary_entries where title = 'Manager added') is null, 'an organiser edits the diary';
  delete from public.diary_entries where title = 'Manager added';
  assert (select count(*) from public.diary_entries where title = 'Manager added') = 1, 'an organiser removes an entry';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert pg_temp.state_of($q$insert into public.diary_entries (campaign_id, day, title)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Cross campaign')$q$) = '42501',
    'Mathira writes into Sakaja''s diary';
end $$;
rollback;

-- test: an entry is well formed, and its ward is the campaign's own
begin;
do $$
declare
  mathira_ward uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000003' limit 1);
  sakaja_ward uuid := (select id from public.wards where campaign_id = 'ca000000-0000-4000-8000-000000000002' limit 1);
  head constant text := $h$insert into public.diary_entries (campaign_id, day, title, kind, note, ward_id)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', $h$;
begin
  assert pg_temp.state_of(head || $q$'K', 'visit', null, null)$q$) = '23514', 'a one-letter title is accepted';
  assert pg_temp.state_of(head || $q$'Kayole', 'picnic', null, null)$q$) = '23514', 'an unknown kind is accepted';
  assert pg_temp.state_of(head || format('%L, %L, %L, null)', 'Kayole', 'visit', repeat('x', 301))) = '23514',
    'a long note is accepted';
  assert pg_temp.state_of(head || format('%L, %L, null, %L)', 'Kayole', 'visit', mathira_ward)) = '23503',
    'another campaign''s ward is accepted';
  assert pg_temp.state_of(head || format('%L, %L, null, %L)', 'Kayole', 'watch', sakaja_ward)) is null,
    'a good entry is refused';
end $$;
rollback;

-- test: removing a ward keeps its entries, without the ward
begin;
insert into public.wards (id, campaign_id, slug, name, constituency)
values ('77000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002', 'diary-test-ward', 'Diary Test', 'Test');
insert into public.diary_entries (campaign_id, day, title, ward_id)
values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', 'Ward visit', '77000000-0000-4000-8000-000000000001');
delete from public.wards where id = '77000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select ward_id from public.diary_entries where title = 'Ward visit') is null, 'the entry keeps the ward';
  assert (select campaign_id from public.diary_entries where title = 'Ward visit')
         = 'ca000000-0000-4000-8000-000000000002', 'the entry loses its campaign';
end $$;
rollback;

-- test: one story a morning, read by the team, changed by the candidate or manager as the team's
begin;
insert into public.morning_stories (campaign_id, day, story, written_by) values
  ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '{"kind": "written", "headline": "Water"}', 'groundwork'),
  ('ca000000-0000-4000-8000-000000000003', '2026-10-05', '{"kind": "headlines"}', 'groundwork');
do $$ begin
  assert pg_temp.state_of($q$insert into public.morning_stories (campaign_id, day, story)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-05', '{}')$q$) = '23505', 'two stories one morning';
  assert pg_temp.state_of($q$insert into public.morning_stories (campaign_id, day, story)
    values ('ca000000-0000-4000-8000-000000000002', '2026-10-06', '[]')$q$) = '23514', 'a story that is not an object';
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.morning_stories) = 1, 'the agent reads Sakaja''s story only';
  update public.morning_stories set story = '{"kind": "written", "headline": "Changed"}';
  assert (select story->>'headline' from public.morning_stories) = 'Water', 'an agent edits the story';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  update public.morning_stories set story = '{"kind": "written", "headline": "Ours"}', written_by = 'team';
  assert (select story->>'headline' from public.morning_stories) = 'Ours', 'the manager can''t edit the story';
  assert pg_temp.state_of($q$update public.morning_stories set written_by = 'groundwork'$q$) = '42501',
    'the team passes its story off as Groundwork''s';
end $$;
rollback;

-- test: schema version
do $$ begin assert public.groundwork_schema_version() = 20, 'schema version'; end $$;
```

- [ ] **Step 2: Run** `bash tests/sql/run.sh`. Expected: `FAIL tests/sql/mornings.test.sql`
      (relation `diary_entries` does not exist).

- [ ] **Step 3: Write the migration** `supabase/migrations/20260930120000_real_mornings.sql`:

```sql
-- Real mornings, part 1. Schema version 20.
--
-- The campaign's diary, planned a week at a time, and one story a morning
-- written from the news Listening found. The team reads both; the candidate or
-- campaign manager writes the diary and edits the story, as the team's; the
-- 06:00 step writes the story with the server's key.

-- A diary entry's ward must be one of the campaign's own wards.
alter table public.wards add constraint wards_id_campaign_key unique (id, campaign_id);

create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  starts_at   time,
  title       text not null check (length(btrim(title)) between 2 and 120),
  kind        text not null default 'visit'
              check (kind in ('visit', 'market', 'church', 'funeral', 'meeting', 'media', 'rally', 'watch')),
  ward_id     uuid,
  note        text check (note is null or length(note) <= 300),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint diary_entries_ward_fkey foreign key (ward_id, campaign_id)
    references public.wards (id, campaign_id) on delete set null (ward_id)
);
create index diary_entries_day_idx on public.diary_entries (campaign_id, day, starts_at);
create trigger diary_entries_touch before update on public.diary_entries
  for each row execute function public.touch_updated_at();

create table public.morning_stories (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null default public.my_campaign()
              references public.campaigns(id) on delete cascade,
  day         date not null,
  story       jsonb not null
              check (jsonb_typeof(story) = 'object' and octet_length(story::text) <= 40000),
  written_by  text not null default 'team' check (written_by in ('groundwork', 'team')),
  edited_by   uuid default auth.uid() references auth.users(id) on delete set null,
  edited_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint morning_stories_day_key unique (campaign_id, day)
);
create trigger morning_stories_touch before update on public.morning_stories
  for each row execute function public.touch_updated_at();

alter table public.diary_entries enable row level security;
alter table public.morning_stories enable row level security;

revoke all on public.diary_entries, public.morning_stories from anon, authenticated;
grant select, insert, update, delete on public.diary_entries to authenticated;
grant select, insert, update on public.morning_stories to authenticated;
grant all on public.diary_entries, public.morning_stories to service_role;

create policy "own campaign only" on public.diary_entries as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "diary readable by team" on public.diary_entries for select to authenticated
  using (public.is_team_member(auth.uid()));
create policy "diary written by staff" on public.diary_entries for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own campaign only" on public.morning_stories as restrictive for all to authenticated
  using (campaign_id = public.my_campaign()) with check (campaign_id = public.my_campaign());
create policy "stories readable by team" on public.morning_stories for select to authenticated
  using (public.is_team_member(auth.uid()));
-- Staff write and edit the day's story as the team's; only the server writes Groundwork's.
create policy "stories written by staff" on public.morning_stories for insert to authenticated
  with check (public.is_staff(auth.uid()) and written_by = 'team');
create policy "stories edited by staff" on public.morning_stories for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()) and written_by = 'team');

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 20 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Types.** In `src/integrations/supabase/types.ts`, after the `demo_leads` table
      add `diary_entries`, and after `messages` add `morning_stories`:

```ts
      diary_entries: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          day: string
          id: string
          kind: string
          note: string | null
          starts_at: string | null
          title: string
          updated_at: string
          ward_id: string | null
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          day: string
          id?: string
          kind?: string
          note?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
          ward_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          day?: string
          id?: string
          kind?: string
          note?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_ward_fkey"
            columns: ["ward_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
```

```ts
      morning_stories: {
        Row: {
          campaign_id: string
          created_at: string
          day: string
          edited_at: string | null
          edited_by: string | null
          id: string
          story: Json
          updated_at: string
          written_by: string
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          day: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          story: Json
          updated_at?: string
          written_by?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          day?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          story?: Json
          updated_at?: string
          written_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "morning_stories_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 5: Run** `bash tests/sql/run.sh`. Expected: `ok   35 migrations apply cleanly`, every
      file passes, including `tests/sql/mornings.test.sql (7 tests)`. Run `npx tsc --noEmit -p
      tsconfig.json`: no errors.
- [ ] **Step 6: Commit** `The diary and the morning's story, each the campaign's own (schema 20)`.

---

### Task 3: The diary's rules

**Files:**
- Create: `src/lib/diary.ts`
- Test: `tests/diary.test.ts`

**Interfaces:** Produces:
`DIARY_KINDS` (`visit, market, church, funeral, meeting, media, rally, watch`),
`type DiaryKind`, `KIND_NAMES: Record<DiaryKind, string>`,
`type DiaryEntry = { id; day; startsAt: string | null; title; kind: DiaryKind; wardId: string | null; wardName: string | null; note: string | null }`,
`type DiaryRow`, `type DiaryInput`, `type CleanEntry`, `cleanEntry(input): CleanEntry` (throws
a sentence), `entryFromRow(row): DiaryEntry`, `addDays(day, n): string`,
`weekOf(day): string[]` (Monday to Sunday), `byTime(a, b)`, `dayPlan(entries, day)`,
`watchList(entries, day, days = 3)`, `nextStop(entries, day, time)`, `dayName(day)`
("Mon 5 Oct"), `timeName(entry)` ("10:30" or "All day"), `nairobiTime(now?)` ("HH:MM").

The kinds follow the ones Home's day plan already used (market, church, funeral are everyday
stops in a Kenyan campaign), plus `watch`.

- [ ] **Step 1: Write the failing tests** in `tests/diary.test.ts`:

```ts
// Checks for the diary's rules: cleaning an entry, the week, the day's plan,
// the watch list and the next stop. Pure; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/diary.test.ts

import { nairobiToday } from "@/lib/demo/insights";
import {
  cleanEntry,
  dayName,
  dayPlan,
  entryFromRow,
  nairobiTime,
  nextStop,
  timeName,
  watchList,
  weekOf,
  type DiaryEntry,
} from "@/lib/diary";

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

function refuses(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const good = { day: "2026-10-05", startsAt: "9:05", title: "  Kayole   water point ", kind: "visit" };
eq("an entry, cleaned", cleanEntry({ ...good, wardId: "w1", note: " Bowsers at noon " }), {
  id: null,
  day: "2026-10-05",
  startsAt: "09:05",
  title: "Kayole water point",
  kind: "visit",
  wardId: "w1",
  note: "Bowsers at noon",
});
eq("no time: all day", cleanEntry({ ...good, startsAt: "" }).startsAt, null);
eq("no ward, no note", [cleanEntry(good).wardId, cleanEntry(good).note], [null, null]);
refuses("a day that doesn't exist", () => cleanEntry({ ...good, day: "2026-02-30" }), "Pick the day.");
refuses(
  "a time that doesn't exist",
  () => cleanEntry({ ...good, startsAt: "24:00" }),
  "Give the time as 10:30, or leave it blank for all day.",
);
refuses("a one-letter title", () => cleanEntry({ ...good, title: "K" }), "Say where, or what it is.");
refuses(
  "a long title",
  () => cleanEntry({ ...good, title: "x".repeat(121) }),
  "Keep the title under 120 characters.",
);
refuses("an unknown kind", () => cleanEntry({ ...good, kind: "picnic" }), "Pick what kind of entry it is.");
refuses(
  "a long note",
  () => cleanEntry({ ...good, note: "x".repeat(301) }),
  "Keep the note under 300 characters.",
);

eq(
  "a Postgres row",
  entryFromRow({
    id: "d1",
    day: "2026-10-05",
    starts_at: "10:30:00",
    title: "Kayole water point",
    kind: "visit",
    ward_id: "w1",
    note: null,
    wards: { name: "Kayole North" },
  }),
  {
    id: "d1",
    day: "2026-10-05",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: "w1",
    wardName: "Kayole North",
    note: null,
  },
);

eq("the week holding a Wednesday", weekOf("2026-09-30"), [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
]);
eq("a Sunday belongs to the week before it", weekOf("2026-10-04")[0], "2026-09-28");
eq("the year's last week", [weekOf("2026-12-31")[0], weekOf("2026-12-31")[6]], [
  "2026-12-28",
  "2027-01-03",
]);

const entry = (id: string, day: string, startsAt: string | null, kind = "visit"): DiaryEntry => ({
  id,
  day,
  startsAt,
  title: id,
  kind: kind as DiaryEntry["kind"],
  wardId: null,
  wardName: null,
  note: null,
});
const DIARY = [
  entry("rally", "2026-10-05", "15:00", "rally"),
  entry("church", "2026-10-05", null, "church"),
  entry("market", "2026-10-05", "10:30", "market"),
  entry("watch-today", "2026-10-05", "12:00", "watch"),
  entry("watch-later", "2026-10-07", null, "watch"),
  entry("watch-too-far", "2026-10-08", null, "watch"),
  entry("tomorrow", "2026-10-06", "09:00"),
];
eq(
  "the day's plan: all-day first, then by time, nothing to watch",
  dayPlan(DIARY, "2026-10-05").map((e) => e.id),
  ["church", "market", "rally"],
);
eq(
  "the watch list: today and the next two days",
  watchList(DIARY, "2026-10-05").map((e) => e.id),
  ["watch-today", "watch-later"],
);
eq("the next stop", nextStop(DIARY, "2026-10-05", "11:00")?.id, "rally");
eq("nothing left today", nextStop(DIARY, "2026-10-05", "16:00"), null);

eq("a day's name", dayName("2026-10-05"), "Mon 5 Oct");
eq("times", [timeName(entry("a", "2026-10-05", "10:30")), timeName(entry("b", "2026-10-05", null))], [
  "10:30",
  "All day",
]);
// After 21:00 UTC it is already tomorrow in Nairobi.
const late = new Date(Date.UTC(2026, 8, 29, 22, 30));
eq("a late entry lands on Nairobi's day", [nairobiToday(late), nairobiTime(late)], [
  "2026-09-30",
  "01:30",
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/diary.test.ts`. Expected: FAIL
      (module `@/lib/diary` not found).

- [ ] **Step 3: Implement** `src/lib/diary.ts`:

```ts
// The campaign's diary: where the candidate will be, planned a week at a time,
// and things to keep an eye on. Pure; the database checks the same rules.

export const DIARY_KINDS = [
  "visit",
  "market",
  "church",
  "funeral",
  "meeting",
  "media",
  "rally",
  "watch",
] as const;
export type DiaryKind = (typeof DIARY_KINDS)[number];

export const KIND_NAMES: Record<DiaryKind, string> = {
  visit: "Visit",
  market: "Market",
  church: "Church",
  funeral: "Funeral",
  meeting: "Meeting",
  media: "Media",
  rally: "Rally",
  watch: "To watch",
};

export type DiaryEntry = {
  id: string;
  /** YYYY-MM-DD, Nairobi's. */
  day: string;
  /** HH:MM; null for all day. */
  startsAt: string | null;
  title: string;
  kind: DiaryKind;
  wardId: string | null;
  wardName: string | null;
  note: string | null;
};

export type DiaryRow = {
  id: string;
  day: string;
  starts_at: string | null;
  title: string;
  kind: string;
  ward_id: string | null;
  note: string | null;
  wards?: { name: string } | null;
};

export type DiaryInput = {
  id?: string | null;
  day?: unknown;
  startsAt?: unknown;
  title?: unknown;
  kind?: unknown;
  wardId?: unknown;
  note?: unknown;
};

export type CleanEntry = Omit<DiaryEntry, "id" | "wardName"> & { id: string | null };

const isKind = (v: string): v is DiaryKind => (DIARY_KINDS as readonly string[]).includes(v);

export function entryFromRow(r: DiaryRow): DiaryEntry {
  return {
    id: r.id,
    day: r.day,
    startsAt: r.starts_at ? r.starts_at.slice(0, 5) : null,
    title: r.title,
    kind: isKind(r.kind) ? r.kind : "visit",
    wardId: r.ward_id,
    wardName: r.wards?.name ?? null,
    note: r.note,
  };
}

/** A day that exists, as YYYY-MM-DD. */
const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** What the diary keeps, or the sentence that says what is wrong. */
export function cleanEntry(input: DiaryInput): CleanEntry {
  const day = String(input.day ?? "").trim();
  if (!isDay(day)) throw new Error("Pick the day.");
  const rawTime = String(input.startsAt ?? "").trim();
  const t = /^(\d{1,2}):(\d{2})$/.exec(rawTime);
  if (rawTime && (!t || Number(t[1]) > 23 || Number(t[2]) > 59))
    throw new Error("Give the time as 10:30, or leave it blank for all day.");
  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 2) throw new Error("Say where, or what it is.");
  if (title.length > 120) throw new Error("Keep the title under 120 characters.");
  const kind = String(input.kind ?? "visit");
  if (!isKind(kind)) throw new Error("Pick what kind of entry it is.");
  const note = String(input.note ?? "").trim();
  if (note.length > 300) throw new Error("Keep the note under 300 characters.");
  const wardId = String(input.wardId ?? "").trim();
  return {
    id: input.id ? String(input.id) : null,
    day,
    startsAt: t ? `${t[1]!.padStart(2, "0")}:${t[2]}` : null,
    title,
    kind,
    wardId: wardId || null,
    note: note || null,
  };
}

export const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Monday to Sunday of the week that holds `day`. */
export function weekOf(day: string): string[] {
  const monday = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** All-day entries first, then by time, then by title. */
export const byTime = (a: DiaryEntry, b: DiaryEntry): number =>
  (a.startsAt ?? "").localeCompare(b.startsAt ?? "") || a.title.localeCompare(b.title);

/** Where to be on `day`: its entries other than things to watch. */
export const dayPlan = (entries: DiaryEntry[], day: string): DiaryEntry[] =>
  entries.filter((e) => e.day === day && e.kind !== "watch").sort(byTime);

/** Things to watch from `day` through the following `days - 1` days. */
export function watchList(entries: DiaryEntry[], day: string, days = 3): DiaryEntry[] {
  const last = addDays(day, days - 1);
  return entries
    .filter((e) => e.kind === "watch" && e.day >= day && e.day <= last)
    .sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
}

/** The next timed stop on `day` at or after `time` (HH:MM). */
export const nextStop = (entries: DiaryEntry[], day: string, time: string): DiaryEntry | null =>
  dayPlan(entries, day).find((e) => e.startsAt !== null && e.startsAt >= time) ?? null;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 5 Oct". */
export function dayName(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const timeName = (e: Pick<DiaryEntry, "startsAt">): string => e.startsAt ?? "All day";

/** Nairobi's time of day, "HH:MM". */
export const nairobiTime = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
```

- [ ] **Step 4: Run** the diary tests. Expected: all pass.
- [ ] **Step 5: Lint** the two new files (`npx eslint --fix` is fine: they are new). **Commit**
      `The diary's rules: an entry, the week, the day's plan and what to watch`.

---

### Task 4: Reading and changing the diary

**Files:**
- Create: `src/lib/diary.functions.ts`
- Modify: `tests/fake-supabase.ts` (add `lte`)
- Test: `tests/diary-functions.test.ts`

**Interfaces:** Consumes Task 3's `cleanEntry`, `entryFromRow`, `weekOf`, `byTime`. Produces:
`DIARY_DENIED`, `loadDiary(sb, from, to): Promise<DiaryEntry[]>`, `diaryError(e): string`,
`writeEntry(sb, e: CleanEntry): Promise<string>`, `removeEntry(sb, id): Promise<void>`,
`type DiaryWeek = { days: string[]; today: string; entries: DiaryEntry[]; wards: { id: string; name: string }[] }`,
`loadWeek(sb, anyDay): Promise<DiaryWeek>`, server functions `getDiaryWeek({ week? })`,
`saveDiaryEntry(DiaryInput)`, `removeDiaryEntry({ id })`.

- [ ] **Step 1: Add `lte` to the fake** (in `tests/fake-supabase.ts`, after `gte`):

```ts
      lte(c: string, v: unknown) {
        filters.push((r) => String(r[c] ?? "") <= String(v));
        return q;
      },
```

- [ ] **Step 2: Write the failing tests** in `tests/diary-functions.test.ts`:

```ts
// Checks for reading and changing the diary as the signed-in person, with a
// stand-in database. Row level security itself is checked in
// tests/sql/mornings.test.sql. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/diary-functions.test.ts

import {
  DIARY_DENIED,
  diaryError,
  loadDiary,
  loadWeek,
  removeEntry,
  writeEntry,
} from "@/lib/diary.functions";

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

async function rejects(name: string, p: Promise<unknown>, message: string) {
  try {
    await p;
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const row = (id: string, day: string, starts: string | null, extra = {}) => ({
  id,
  campaign_id: "c2",
  day,
  starts_at: starts,
  title: id,
  kind: "visit",
  ward_id: null,
  note: null,
  ...extra,
});

async function main() {
  const sb = fakeSupabase({
    diary_entries: [
      row("later", "2026-10-05", "15:00:00"),
      row("first", "2026-10-05", "08:00:00", { ward_id: "w1", wards: { name: "Kayole North" } }),
      row("next-week", "2026-10-12", "08:00:00"),
      row("sunday", "2026-10-11", null),
    ],
    wards: [
      { id: "w2", campaign_id: "c2", name: "Umoja I" },
      { id: "w1", campaign_id: "c2", name: "Kayole North" },
    ],
  });

  eq(
    "a week's entries, by day then time, with ward names",
    (await loadDiary(sb as never, "2026-10-05", "2026-10-11")).map((e) => [e.id, e.startsAt, e.wardName]),
    [
      ["first", "08:00", "Kayole North"],
      ["later", "15:00", null],
      ["sunday", null, null],
    ],
  );

  const week = await loadWeek(sb as never, "2026-10-07");
  eq("the week runs Monday to Sunday", [week.days[0], week.days[6]], ["2026-10-05", "2026-10-11"]);
  eq(
    "the campaign's wards, by name",
    week.wards.map((w) => w.name),
    ["Kayole North", "Umoja I"],
  );

  const id = await writeEntry(sb as never, {
    id: null,
    day: "2026-10-06",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: null,
    note: null,
  });
  eq(
    "an entry is added",
    sb.tables["diary_entries"]?.find((r) => r["id"] === id)?.["starts_at"],
    "10:30",
  );
  await rejects(
    "a change that reaches no entry is refused",
    writeEntry(sb as never, {
      id: "gone",
      day: "2026-10-06",
      startsAt: null,
      title: "Nothing",
      kind: "visit",
      wardId: null,
      note: null,
    }),
    DIARY_DENIED,
  );
  await removeEntry(sb as never, id);
  eq("an entry is removed", sb.tables["diary_entries"]?.some((r) => r["id"] === id), false);
  await rejects("removing what isn't there is refused", removeEntry(sb as never, id), DIARY_DENIED);

  eq(
    "what the database's refusals mean",
    [
      diaryError({ code: "42501" }),
      diaryError({ code: "23503" }),
      diaryError({ code: "23514" }),
    ],
    [
      DIARY_DENIED,
      "That ward isn't one of the campaign's.",
      "The database refused that: check the time, title and note.",
    ],
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 3: Run** it. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/diary.functions.ts`:

```ts
// The diary, read and changed as the signed-in person. Row level security keeps
// each campaign to its own diary and lets only the candidate or campaign
// manager change it; a change that reaches no row is treated as refused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { nairobiToday } from "@/lib/demo/insights";
import {
  byTime,
  cleanEntry,
  entryFromRow,
  weekOf,
  type CleanEntry,
  type DiaryEntry,
  type DiaryInput,
  type DiaryRow,
} from "@/lib/diary";

type Sb = SupabaseClient<Database>;

export const DIARY_DENIED = "Only the candidate or campaign manager can change the diary.";

const COLS = "id, day, starts_at, title, kind, ward_id, note, wards(name)";

/** Entries from `from` to `to`, both YYYY-MM-DD and included, by day then time. */
export async function loadDiary(sb: Sb, from: string, to: string): Promise<DiaryEntry[]> {
  const { data, error } = await sb
    .from("diary_entries")
    .select(COLS)
    .gte("day", from)
    .lte("day", to);
  if (error) throw new Error("Could not read the diary.");
  return ((data ?? []) as unknown as DiaryRow[])
    .map(entryFromRow)
    .sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b));
}

/** What to tell the person when the database says no. */
export function diaryError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return DIARY_DENIED;
  if (e.code === "23503") return "That ward isn't one of the campaign's.";
  if (e.code === "23514") return "The database refused that: check the time, title and note.";
  return "Could not save that. Try again.";
}

export async function writeEntry(sb: Sb, e: CleanEntry): Promise<string> {
  const row = {
    day: e.day,
    starts_at: e.startsAt,
    title: e.title,
    kind: e.kind,
    ward_id: e.wardId,
    note: e.note,
  };
  const { data, error } = e.id
    ? await sb.from("diary_entries").update(row).eq("id", e.id).select("id")
    : await sb.from("diary_entries").insert(row).select("id");
  if (error) throw new Error(diaryError(error));
  if (!data?.length) throw new Error(DIARY_DENIED);
  return String(data[0]!.id);
}

export async function removeEntry(sb: Sb, id: string): Promise<void> {
  const { data, error } = await sb.from("diary_entries").delete().eq("id", id).select("id");
  if (error) throw new Error(diaryError(error));
  if (!data?.length) throw new Error(DIARY_DENIED);
}

export type DiaryWeek = {
  days: string[];
  today: string;
  entries: DiaryEntry[];
  wards: { id: string; name: string }[];
};

/** The week that holds `anyDay`, and the campaign's wards to file entries under. */
export async function loadWeek(sb: Sb, anyDay: string): Promise<DiaryWeek> {
  const days = weekOf(anyDay);
  const [entries, wards] = await Promise.all([
    loadDiary(sb, days[0]!, days[6]!),
    sb.from("wards").select("id, name").order("name"),
  ]);
  return {
    days,
    today: nairobiToday(),
    entries,
    wards: (wards.data ?? []).map((w) => ({ id: String(w.id), name: String(w.name) })),
  };
}

export const getDiaryWeek = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { week?: string } | undefined) => {
    const w = String(input?.week ?? "");
    return { week: /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : nairobiToday() };
  })
  .handler(async ({ data, context }) => loadWeek(context.supabase, data.week));

export const saveDiaryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DiaryInput) => cleanEntry(input))
  .handler(async ({ data, context }) => ({ id: await writeEntry(context.supabase, data) }));

export const removeDiaryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Which one?");
    return { id: String(input.id) };
  })
  .handler(async ({ data, context }) => {
    await removeEntry(context.supabase, data.id);
    return { ok: true };
  });
```

- [ ] **Step 5: Run** the tests. Expected: all pass. Typecheck (`npx tsc --noEmit -p
      tsconfig.json`): no errors.
- [ ] **Step 6: Lint** the new files; `tests/fake-supabase.ts` must not gain errors. **Commit**
      `The diary is read and changed as the signed-in person`.

---

### Task 5: The Diary page

**Files:**
- Create: `src/routes/_authenticated/diary.tsx`
- Create: `src/components/gw/diary/DiaryWeek.tsx`
- Modify: `src/components/gw/ConsoleShell.tsx` (Operate group), `src/lib/demo/types.ts`
  (`ActionRoute` gains `"/diary"`), `src/styles/groundwork.css`, `src/routeTree.gen.ts`
  (regenerated by the build)

**Interfaces:** Consumes Task 3's `cleanEntry`, `dayName`, `timeName`, `addDays`,
`DIARY_KINDS`, `KIND_NAMES`, and Task 4's `getDiaryWeek`, `saveDiaryEntry`,
`removeDiaryEntry`, `DiaryWeek`. Produces the `/diary` page and `?week=YYYY-MM-DD`.

- [ ] **Step 1: The route** `src/routes/_authenticated/diary.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { DiaryWeek } from "@/components/gw/diary/DiaryWeek";
import { useAccess } from "@/hooks/useAccess";
import { addDays, dayName } from "@/lib/diary";
import { getDiaryWeek } from "@/lib/diary.functions";

export const Route = createFileRoute("/_authenticated/diary")({
  // ?week=2026-10-05: the week that holds that day; none: this week.
  validateSearch: (search: Record<string, unknown>): { week?: string } => {
    const w = typeof search["week"] === "string" ? search["week"] : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(w) ? { week: w } : {};
  },
  component: DiaryPage,
  head: () => ({
    meta: [
      { title: "Diary · Groundwork" },
      {
        name: "description",
        content: "Where the candidate will be, planned a week at a time, and what to keep an eye on.",
      },
      { property: "og:title", content: "Diary · Groundwork" },
      {
        property: "og:description",
        content: "Where the candidate will be, planned a week at a time, and what to keep an eye on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function DiaryPage() {
  const { week } = Route.useSearch();
  const { campaign, isPrincipal } = useAccess();
  const fetchWeek = useServerFn(getDiaryWeek);
  const { data, isError } = useQuery({
    queryKey: ["diary", campaign?.id ?? null, week ?? null],
    queryFn: () => fetchWeek({ data: { week } }),
    enabled: Boolean(campaign?.id),
  });
  const first = data?.days[0];
  return (
    <section className="view active" aria-label="Diary">
      <div className="diary">
        <div className="diary-head">
          <div>
            <span className="eyebrow">Operate · Diary</span>
            <h1>{first ? `Week of ${dayName(first)}` : "The diary"}</h1>
            <p className="meta">
              Where the candidate will be, and what to keep an eye on.{" "}
              {isPrincipal ? "Plan the week here; Home shows each day." : "Home shows each day."}
            </p>
          </div>
          {first ? (
            <nav className="diary-nav" aria-label="Weeks">
              <Link to="/diary" search={{ week: addDays(first, -7) }} className="btn btn--ghost btn--sm">
                ‹ Last week
              </Link>
              <Link to="/diary" search={{}} className="btn btn--ghost btn--sm">
                This week
              </Link>
              <Link to="/diary" search={{ week: addDays(first, 7) }} className="btn btn--ghost btn--sm">
                Next week ›
              </Link>
            </nav>
          ) : null}
        </div>
        {data ? (
          <DiaryWeek week={data} canEdit={isPrincipal} />
        ) : (
          <p className="meta">{isError ? "Could not read the diary." : "Reading the diary…"}</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: The week** `src/components/gw/diary/DiaryWeek.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  cleanEntry,
  dayName,
  DIARY_KINDS,
  KIND_NAMES,
  timeName,
  type DiaryEntry,
} from "@/lib/diary";
import { removeDiaryEntry, saveDiaryEntry, type DiaryWeek as Week } from "@/lib/diary.functions";

type Ward = { id: string; name: string };

/** The diary and Home both show entries; read them again after a change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ["diary"] });
    await queryClient.invalidateQueries({ queryKey: ["home"] });
  };
}

/** A week of the diary, Monday to Sunday, each day with its entries by time. */
export function DiaryWeek({ week, canEdit }: { week: Week; canEdit: boolean }) {
  return (
    <div className="diary-days">
      {week.days.map((day) => (
        <DiaryDay
          key={day}
          day={day}
          isToday={day === week.today}
          entries={week.entries.filter((e) => e.day === day)}
          wards={week.wards}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

function DiaryDay({
  day,
  isToday,
  entries,
  wards,
  canEdit,
}: {
  day: string;
  isToday: boolean;
  entries: DiaryEntry[];
  wards: Ward[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className={`card diary-day${isToday ? " is-today" : ""}`} aria-labelledby={`dd-${day}`}>
      <div className="card-head">
        <h2 id={`dd-${day}`}>
          {dayName(day)}
          {isToday ? <span className="diary-today"> · Today</span> : null}
        </h2>
        {canEdit && !adding ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
            Add
          </button>
        ) : null}
      </div>
      {entries.length ? (
        <ol className="mb-time">
          {entries.map((e) =>
            editing === e.id ? (
              <li key={e.id} className="diary-editing">
                <EntryForm day={day} entry={e} wards={wards} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={e.id}>
                <span className="mb-time-at">{timeName(e)}</span>
                <div>
                  <p className="mb-time-place">
                    {e.title}{" "}
                    <span className="mb-kind">
                      {KIND_NAMES[e.kind]}
                      {e.wardName ? ` · ${e.wardName}` : ""}
                    </span>
                  </p>
                  {e.note ? <p className="mb-time-why">{e.note}</p> : null}
                  {canEdit ? (
                    <div className="diary-actions">
                      <button type="button" className="btn btn--sm" onClick={() => setEditing(e.id)}>
                        Edit
                      </button>
                      <RemoveEntry entry={e} />
                    </div>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ol>
      ) : !adding ? (
        <p className="meta">Nothing planned.</p>
      ) : null}
      {adding ? (
        <EntryForm day={day} entry={null} wards={wards} onDone={() => setAdding(false)} />
      ) : null}
    </section>
  );
}

function RemoveEntry({ entry }: { entry: DiaryEntry }) {
  const [sure, setSure] = useState(false);
  const remove = useServerFn(removeDiaryEntry);
  const refresh = useRefresh();
  const removing = useMutation({
    mutationFn: () => remove({ data: { id: entry.id } }),
    onSuccess: async () => {
      toast.success("Removed from the diary.");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm home-remove${sure ? " is-sure" : ""}`}
      onClick={() => (sure ? removing.mutate() : setSure(true))}
      onBlur={() => setSure(false)}
      disabled={removing.isPending}
    >
      {sure ? `Remove ${entry.title}?` : "Remove"}
    </button>
  );
}

function EntryForm({
  day,
  entry,
  wards,
  onDone,
}: {
  day: string;
  entry: DiaryEntry | null;
  wards: Ward[];
  onDone: () => void;
}) {
  const [startsAt, setStartsAt] = useState(entry?.startsAt ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [kind, setKind] = useState<string>(entry?.kind ?? "visit");
  const [wardId, setWardId] = useState(entry?.wardId ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const save = useServerFn(saveDiaryEntry);
  const refresh = useRefresh();

  const input = { id: entry?.id ?? null, day, startsAt, title, kind, wardId, note };
  // The server checks again; this only says what is missing before it is sent.
  let problem: string | null = null;
  try {
    cleanEntry(input);
  } catch (e) {
    problem = (e as Error).message;
  }
  const saving = useMutation({
    mutationFn: () => save({ data: input }),
    onSuccess: async () => {
      toast.success(entry ? "Diary updated." : "Added to the diary.");
      await refresh();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="diary-form"
      aria-label={entry ? `Edit ${entry.title}` : `Add to ${dayName(day)}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) saving.mutate();
      }}
    >
      <div className="pb-row pb-row--2">
        <label className="pb-field">
          <span>Time (blank for all day)</span>
          <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="pb-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {DIARY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="pb-field">
        <span>Where, or what</span>
        <input
          value={title}
          maxLength={120}
          placeholder="Kayole water point"
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="pb-field">
        <span>Ward</span>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          <option value="">No ward</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="pb-field">
        <span>What it&apos;s for</span>
        <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} />
      </label>
      {problem && title.trim() ? <p className="re-problem">{problem}</p> : null}
      <div className="re-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={Boolean(problem) || saving.isPending}
        >
          {entry ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Menu and routes.** In `src/components/gw/ConsoleShell.tsx`, in the Operate
      group, after `{ to: "/home", label: "Home" },` add `{ to: "/diary", label: "Diary" },`. In
      `src/lib/demo/types.ts`, add `| "/diary"` to `ActionRoute`.

- [ ] **Step 4: Styles.** Append to `src/styles/groundwork.css`, and widen the day plan's time
      column so "All day" fits (`.mb-time li { … grid-template-columns:56px 1fr; … }` in place of
      `48px 1fr`):

```css
/* The diary: a week of days, each a card, today marked. */
.diary { display:flex; flex-direction:column; gap:18px; }
.diary-head { display:flex; justify-content:space-between; align-items:flex-end; gap:14px; flex-wrap:wrap; }
.diary-head h1 { font-size:clamp(24px, 2.6vw, 32px); font-weight:700; margin-top:6px; }
.diary-nav { display:flex; gap:8px; flex-wrap:wrap; }
.diary-days { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap:14px; align-items:start; }
.diary-day.is-today { border-color:var(--gw-accent); }
.diary-today { color:var(--gw-accent); font-weight:600; }
.diary-actions { display:flex; gap:6px; margin-top:6px; }
.mb-time li.diary-editing { display:block; }
.diary-form { display:flex; flex-direction:column; gap:10px; margin-top:8px; }
```

- [ ] **Step 5: Build** `npm run build` (regenerates `src/routeTree.gen.ts` with `/diary`).
      Expected: build succeeds. Typecheck: no errors. Lint the new files; `ConsoleShell.tsx`,
      `types.ts` and `groundwork.css` must not gain errors.
- [ ] **Step 6: Commit** `A Diary page to plan the week: add, edit and remove what's on each day`
      (include `src/routeTree.gen.ts`).

---

### Task 6: Home's day plan and watch list come from the diary

**Files:**
- Modify: `src/lib/home.ts` (`nextStopItem`), `src/lib/home.functions.ts` (`HomeData.diary`),
  `src/components/gw/home/Home.tsx`, `src/components/gw/home/TodaySection.tsx`,
  `src/components/gw/briefing/Story.tsx` (remove the invented `DayPlan`)
- Create: `src/components/gw/home/DiaryPlan.tsx`
- Test: `tests/home.test.ts`

**Interfaces:** Consumes Task 3 (`dayPlan`, `watchList`, `nextStop`, `nairobiTime`,
`addDays`, `KIND_NAMES`, `dayName`, `timeName`, `DiaryEntry`) and Task 4 (`loadDiary`).
Produces `nextStopItem(e: DiaryEntry): TodayItem` and `HomeData.diary: DiaryEntry[]` (today
through the next two days).

- [ ] **Step 1: Write the failing tests** in `tests/home.test.ts`. Import `nextStopItem` from
      `@/lib/home`, `nairobiToday` from `@/lib/demo/insights` and `addDays` from `@/lib/diary`,
      then add after the "today" checks:

```ts
eq(
  "the next stop leads Today",
  nextStopItem({
    id: "d1",
    day: "2026-10-05",
    startsAt: "10:30",
    title: "Kayole water point",
    kind: "visit",
    wardId: "w1",
    wardName: "Kayole North",
    note: null,
  }),
  {
    title: "Next: Kayole water point, 10:30",
    detail: "Visit · Kayole North",
    action: { kind: "go", label: "Open the diary", to: "/diary" },
    sample: false,
  },
);
```

  and in `main()`, after the "no profile, no name" block:

```ts
  {
    const today = nairobiToday();
    const diaryRow = (id: string, day: string, kind = "visit") => ({
      id,
      campaign_id: "c2",
      day,
      starts_at: "10:30:00",
      title: id,
      kind,
      ward_id: null,
      note: null,
    });
    const h = await loadHome(
      db({
        diary_entries: [
          diaryRow("today", today),
          diaryRow("in-two-days", addDays(today, 2), "watch"),
          diaryRow("too-far", addDays(today, 5)),
          diaryRow("yesterday", addDays(today, -1)),
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq(
      "the diary from today through the next two days",
      h.diary.map((e) => e.id),
      ["today", "in-two-days"],
    );
  }
```

- [ ] **Step 2: Run** `npx -y tsx --tsconfig tsconfig.json tests/home.test.ts`. Expected: FAIL
      (`nextStopItem` is not exported).

- [ ] **Step 3: Implement.** In `src/lib/home.ts` add (with
      `import { KIND_NAMES, type DiaryEntry } from "@/lib/diary";`):

```ts
/** The diary's next stop today, first on Today's list. */
export function nextStopItem(e: DiaryEntry): TodayItem {
  return {
    title: `Next: ${e.title}, ${e.startsAt}`,
    detail: e.note ?? [KIND_NAMES[e.kind], e.wardName].filter(Boolean).join(" · "),
    action: { kind: "go", label: "Open the diary", to: "/diary" },
    sample: false,
  };
}
```

  In `src/lib/home.functions.ts`: import `loadDiary` from `@/lib/diary.functions`, `addDays`
  and `type DiaryEntry` from `@/lib/diary`; add to `HomeData`:

```ts
  /** The diary from today through the next two days. */
  diary: DiaryEntry[];
```

  add `loadDiary(sb, todayIso, addDays(todayIso, 2)).catch(() => [])` to the `Promise.all`
  (destructured as `diary`), and `diary` to the returned object.

- [ ] **Step 4: Show it.** Create `src/components/gw/home/DiaryPlan.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { dayName, KIND_NAMES, timeName, type DiaryEntry } from "@/lib/diary";

/** Where to be today, and what to watch over the next three days, from the diary. */
export function DiaryPlan({
  plan,
  watch,
  canEdit,
}: {
  plan: DiaryEntry[];
  watch: DiaryEntry[];
  canEdit: boolean;
}) {
  return (
    <>
      <section className="card mb-diary" aria-labelledby="mb-diary-h">
        <div className="card-head">
          <h2 id="mb-diary-h">Where to be today</h2>
          <Link to="/diary" className="btn btn--ghost btn--sm">
            {canEdit ? "Plan the week" : "The week"}
          </Link>
        </div>
        {plan.length ? (
          <ol className="mb-time">
            {plan.map((e) => (
              <li key={e.id}>
                <span className="mb-time-at">{timeName(e)}</span>
                <div>
                  <p className="mb-time-place">
                    {e.title}{" "}
                    <span className="mb-kind">
                      {KIND_NAMES[e.kind]}
                      {e.wardName ? ` · ${e.wardName}` : ""}
                    </span>
                  </p>
                  {e.note ? <p className="mb-time-why">{e.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="meta">Nothing in the diary for today.</p>
        )}
      </section>
      {watch.length ? (
        <section className="card mb-watch" aria-labelledby="mb-watch-h">
          <div className="card-head">
            <h2 id="mb-watch-h">Watch list</h2>
          </div>
          <ul>
            {watch.map((e) => (
              <li key={e.id}>
                <p className="mb-watch-meta">
                  {dayName(e.day)}
                  {e.startsAt ? ` · ${e.startsAt}` : ""}
                  {e.wardName ? ` · ${e.wardName}` : ""}
                </p>
                <p className="mb-watch-t">{e.title}</p>
                {e.note ? <p className="mb-watch-d">{e.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
```

  In `TodaySection.tsx`, take `plan`, `watch` and `canEdit` props, render
  `<DiaryPlan plan={plan} watch={watch} canEdit={canEdit} />` inside the `mb-side` aside in
  place of `<DayPlan s={s} />`, and change the note to
  `<SampleTag /> The story below is invented for a race like yours.` In `Home.tsx`:

```tsx
  const now = nairobiTime();
  const next = nextStop(d.diary, today, now);
  const items = todayItems(
    [...(next ? [nextStopItem(next)] : []), ...realToday(d.signals)],
    s.today,
  );
```

  pass `plan={dayPlan(d.diary, today)}`, `watch={watchList(d.diary, today)}` and
  `canEdit={canEdit}` to `TodaySection`, and add `diary: []` to `NOTHING_YET`. Remove
  `DayPlan` (and any import only it used) from `src/components/gw/briefing/Story.tsx`.

- [ ] **Step 5: Run** all tests, typecheck, build. Lint changed files: counts must not rise.
- [ ] **Step 6: Commit** `Home's day plan and watch list come from the diary, and Today starts with the next stop`.

---

### Task 7: The story's rules

**Files:**
- Create: `src/lib/morning-story.ts`
- Test: `tests/morning-story.test.ts`

**Interfaces:** Produces:
`type StoryLink = { title; url; source; publishedAt: string | null }`,
`type StoryItem = StoryLink & { n: number; text: string }`,
`type MorningStory = { kind: "written" | "headlines"; headline; summary; why; rivals; line: string | null; figures: { value; label }[]; sources: StoryLink[]; also: (StoryLink & { soWhat: string | null })[]; picks: StoryLink[]; from: number }`,
`type MentionRow`, `storyItems(rows, max = 40): StoryItem[]`,
`checkStory(answer: unknown, items): MorningStory | null`, `headlinesStory(items)`,
`type TeamStoryInput`, `cleanTeamStory(input, prev: MorningStory | null): MorningStory`,
`type StoryRow`, `type StoryView = { day; story; writtenBy: "groundwork" | "team"; at: string; editedBy: string | null }`,
`storyFromRow(row, editorName): StoryView | null`, `kicker(view): string`.

- [ ] **Step 1: Write the failing tests** in `tests/morning-story.test.ts`:

```ts
// Checks for this morning's story: what the AI may say, the fallback to
// headlines, the team's own story, and reading a stored story. Pure; nothing
// leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story.test.ts

import {
  checkStory,
  cleanTeamStory,
  headlinesStory,
  kicker,
  storyFromRow,
  storyItems,
  type MentionRow,
} from "@/lib/morning-story";

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

function refuses(name: string, fn: () => unknown, message: string) {
  try {
    fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const mention = (url: string, title: string | null, snippet: string | null = null): MentionRow => ({
  title,
  snippet,
  url,
  source: "news",
  domain: "nation.africa",
  published_at: "2026-09-30T04:00:00Z",
});
const ROWS = [
  mention("https://nation.africa/rationing", "Rationing extended in 14 Eastlands wards", "Supply cut to 1.1 million residents."),
  mention("https://nation.africa/rationing", "The same story again"),
  mention("javascript:alert(1)", "Not a web link"),
  mention("https://the-star.co.ke/drains", "Drains blocked on Jogoo Road", "Rains expected on Friday."),
  mention("https://kenyans.co.ke/no-title", null),
  mention("https://citizen.digital/hawkers", "Hawkers moved from the CBD"),
];
const ITEMS = storyItems(ROWS);
eq(
  "the morning's items: titled web links, each once, numbered",
  ITEMS.map((i) => [i.n, i.url]),
  [
    [1, "https://nation.africa/rationing"],
    [2, "https://the-star.co.ke/drains"],
    [3, "https://citizen.digital/hawkers"],
  ],
);

const ANSWER = {
  noStory: false,
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: "Water is the race's loudest issue.",
  rivals: "Babu Owino blames City Hall.",
  line: "Tankers to every ward this week.",
  figures: [
    { value: "14", label: "wards on rationing", item: 1 },
    { value: "1.1 million", label: "people affected", item: 2 },
    { value: "380k", label: "voters", item: 1 },
  ],
  items: [1, 9],
  also: [
    { item: 2, soWhat: "Floods next." },
    { item: 1, soWhat: "Already the lead." },
    { item: 7, soWhat: "No such item." },
    { item: 3, soWhat: "Traders are angry." },
  ],
};
const story = checkStory(ANSWER, ITEMS);
eq("a story that holds up", [story?.kind, story?.headline, story?.sources.map((s) => s.url)], [
  "written",
  "Rationing hits Eastlands",
  ["https://nation.africa/rationing"],
]);
eq(
  "a figure from another item is dropped, and one in no item",
  story?.figures,
  [{ value: "14", label: "wards on rationing" }],
);
eq(
  "also this morning: real items other than the lead",
  story?.also.map((a) => [a.url, a.soWhat]),
  [
    ["https://the-star.co.ke/drains", "Floods next."],
    ["https://citizen.digital/hawkers", "Traders are angry."],
  ],
);
eq("the story says how much it was written from", [story?.from, story?.picks.length], [3, 3]);
eq("resting on no real item: no story", checkStory({ ...ANSWER, items: [8, 9] }, ITEMS), null);
eq("no headline: no story", checkStory({ ...ANSWER, headline: " " }, ITEMS), null);
eq("the AI says there's no story", checkStory({ ...ANSWER, noStory: true }, ITEMS), null);
eq("an answer that isn't one", checkStory("nonsense", ITEMS), null);

const top = headlinesStory(ITEMS);
eq("no story: the morning's top links", [top.kind, top.headline, top.also.length], [
  "headlines",
  null,
  3,
]);

const own = cleanTeamStory(
  { headline: " Our water plan ", summary: "Tankers go out today.", links: ["https://ours.test/plan"] },
  story,
);
eq(
  "the team's story, with its own link",
  [own.headline, own.sources.map((s) => s.url), own.figures, own.also.length],
  ["Our water plan", ["https://ours.test/plan"], [], 2],
);
eq(
  "an edit without links keeps the story's sources and figures",
  [cleanTeamStory({ headline: "Rationing, again", summary: "Still 14 wards." }, story).sources.length, cleanTeamStory({ headline: "Rationing, again", summary: "Still 14 wards." }, story).figures.length],
  [1, 1],
);
refuses("links must be https", () => cleanTeamStory({ headline: "Our plan", summary: "Soon.", links: ["http://ours.test"] }, null), "Links must start with https://.");
refuses("a headline is needed", () => cleanTeamStory({ headline: "", summary: "Soon." }, null), "Give the story a headline.");
refuses("and a summary", () => cleanTeamStory({ headline: "Our plan", summary: "" }, null), "Say what happened in a line or two.");

const stored = {
  day: "2026-09-30",
  story: {
    ...story,
    sources: [...(story?.sources ?? []), { title: "Bad", url: "javascript:alert(1)", source: "x", publishedAt: null }],
  },
  written_by: "groundwork",
  created_at: "2026-09-30T03:04:00Z",
  edited_at: null,
};
const view = storyFromRow(stored, null);
eq("a stored link that isn't the web is left out", view?.story.sources.length, 1);
eq("Groundwork's story", kicker(view!), "Written by Groundwork at 06:04 from 3 sources");
eq(
  "the team's edit",
  kicker(storyFromRow({ ...stored, written_by: "team", edited_at: "2026-09-30T04:10:00Z" }, "Njeri Kamau")!),
  "Edited by Njeri Kamau at 07:10",
);
eq(
  "the morning's headlines",
  kicker(storyFromRow({ ...stored, story: top }, null)!),
  "This morning's top stories, gathered at 06:04",
);
eq("a malformed story is not shown", storyFromRow({ ...stored, story: { kind: "poem" } }, null), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/morning-story.ts`:

```ts
// This morning's story: written by the 06:00 step from the news Listening
// found, or by the team. Pure: what the AI says is checked here before it is
// kept, and the team's own story is cleaned the same way.

export type StoryLink = { title: string; url: string; source: string; publishedAt: string | null };

/** One of the morning's items, numbered from 1 as the AI sees it. */
export type StoryItem = StoryLink & { n: number; text: string };

export type MorningStory = {
  /** "written": a story; "headlines": the morning's top links, without one. */
  kind: "written" | "headlines";
  headline: string | null;
  summary: string | null;
  why: string | null;
  rivals: string | null;
  line: string | null;
  figures: { value: string; label: string }[];
  sources: StoryLink[];
  also: (StoryLink & { soWhat: string | null })[];
  /** The morning's items, to write another story from. */
  picks: StoryLink[];
  /** How many items it was written from. */
  from: number;
};

export type MentionRow = {
  title: string | null;
  snippet: string | null;
  url: string;
  source: string | null;
  domain: string | null;
  published_at: string | null;
};

const isWeb = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/i.test(u);

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

const linkOf = (i: StoryItem): StoryLink => ({
  title: i.title,
  url: i.url,
  source: i.source,
  publishedAt: i.publishedAt,
});

/** The morning's items: titled web links, each once, numbered from 1. */
export function storyItems(rows: MentionRow[], max = 40): StoryItem[] {
  const seen = new Set<string>();
  const out: StoryItem[] = [];
  for (const r of rows) {
    const title = clip(r.title, 300);
    if (!title || !isWeb(r.url) || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push({
      n: out.length + 1,
      title,
      url: r.url,
      source: r.domain ?? r.source ?? "web",
      publishedAt: r.published_at,
      text: [title, clip(r.snippet, 600)].filter(Boolean).join(" "),
    });
    if (out.length >= max) break;
  }
  return out;
}

type Answer = {
  noStory?: unknown;
  headline?: unknown;
  summary?: unknown;
  why?: unknown;
  rivals?: unknown;
  line?: unknown;
  figures?: unknown;
  items?: unknown;
  also?: unknown;
};
type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] =>
  Array.isArray(v) ? v.filter((x): x is Obj => Boolean(x) && typeof x === "object") : [];
const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

/**
 * The AI's story, if it holds up: it rests on at least one real item, and each
 * figure appears word for word in the item it cites. Null when it doesn't.
 */
export function checkStory(answer: unknown, items: StoryItem[]): MorningStory | null {
  const a = (answer && typeof answer === "object" ? answer : {}) as Answer;
  if (a.noStory === true) return null;
  const byN = new Map(items.map((i) => [i.n, i]));
  const lead = [...new Set(Array.isArray(a.items) ? a.items.map(Number) : [])]
    .map((n) => byN.get(n))
    .filter((i): i is StoryItem => Boolean(i));
  const headline = clip(a.headline, 160);
  const summary = clip(a.summary, 800);
  if (!lead.length || !headline || !summary) return null;

  const figures = list(a.figures)
    .flatMap((f) => {
      const value = clip(f["value"], 24);
      const label = clip(f["label"], 80);
      const from = byN.get(Number(f["item"]));
      return value && label && from && /\d/.test(value) && flat(from.text).includes(flat(value))
        ? [{ value, label }]
        : [];
    })
    .slice(0, 3);

  const used = new Set(lead.map((i) => i.n));
  const also = list(a.also)
    .flatMap((x) => {
      const i = byN.get(Number(x["item"]));
      if (!i || used.has(i.n)) return [];
      used.add(i.n);
      return [{ ...linkOf(i), soWhat: clip(x["soWhat"], 200) }];
    })
    .slice(0, 5);

  return {
    kind: "written",
    headline,
    summary,
    why: clip(a.why, 400),
    rivals: clip(a.rivals, 400),
    line: clip(a.line, 300),
    figures,
    sources: lead.slice(0, 5).map(linkOf),
    also,
    picks: items.slice(0, 12).map(linkOf),
    from: items.length,
  };
}

/** When no story can be written: the morning's top five links. */
export function headlinesStory(items: StoryItem[]): MorningStory {
  return {
    kind: "headlines",
    headline: null,
    summary: null,
    why: null,
    rivals: null,
    line: null,
    figures: [],
    sources: [],
    also: items.slice(0, 5).map((i) => ({ ...linkOf(i), soWhat: null })),
    picks: items.slice(0, 12).map(linkOf),
    from: items.length,
  };
}

export type TeamStoryInput = {
  headline?: unknown;
  summary?: unknown;
  why?: unknown;
  rivals?: unknown;
  line?: unknown;
  /** https links, one per source; none keeps the story's own. */
  links?: unknown;
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** The team's own story, or its edit of the morning's. */
export function cleanTeamStory(input: TeamStoryInput, prev: MorningStory | null): MorningStory {
  const headline = clip(input.headline, 160);
  if (!headline || headline.length < 4) throw new Error("Give the story a headline.");
  const summary = clip(input.summary, 800);
  if (!summary) throw new Error("Say what happened in a line or two.");
  const links = (Array.isArray(input.links) ? input.links : [])
    .map((l) => String(l ?? "").trim())
    .filter(Boolean);
  if (links.some((u) => !/^https:\/\/\S+$/i.test(u))) throw new Error("Links must start with https://.");
  return {
    kind: "written",
    headline,
    summary,
    why: clip(input.why, 400),
    rivals: clip(input.rivals, 400),
    line: clip(input.line, 300),
    // New links replace the sources, and the figures checked against the old ones go.
    figures: links.length ? [] : (prev?.figures ?? []),
    sources: links.length
      ? links.slice(0, 5).map((url) => ({ title: hostOf(url), url, source: hostOf(url), publishedAt: null }))
      : (prev?.sources ?? []),
    also: prev?.also ?? [],
    picks: prev?.picks ?? [],
    from: prev?.from ?? 0,
  };
}

export type StoryRow = {
  day: string;
  story: unknown;
  written_by: string;
  created_at: string;
  edited_at: string | null;
};

export type StoryView = {
  day: string;
  story: MorningStory;
  writtenBy: "groundwork" | "team";
  /** When it was written, or last edited. */
  at: string;
  editedBy: string | null;
};

const links = (v: unknown): StoryLink[] =>
  list(v).flatMap((l) =>
    isWeb(l["url"])
      ? [
          {
            title: clip(l["title"], 300) ?? l["url"],
            url: l["url"],
            source: clip(l["source"], 80) ?? "web",
            publishedAt: typeof l["publishedAt"] === "string" ? l["publishedAt"] : null,
          },
        ]
      : [],
  );

/** A stored story, read with care: a link off the web is left out, a malformed story is null. */
export function storyFromRow(r: StoryRow, editorName: string | null): StoryView | null {
  const s = (r.story && typeof r.story === "object" ? r.story : {}) as Obj;
  if (s["kind"] !== "written" && s["kind"] !== "headlines") return null;
  const story: MorningStory = {
    kind: s["kind"],
    headline: clip(s["headline"], 160),
    summary: clip(s["summary"], 800),
    why: clip(s["why"], 400),
    rivals: clip(s["rivals"], 400),
    line: clip(s["line"], 300),
    figures: list(s["figures"])
      .flatMap((f) => {
        const value = clip(f["value"], 24);
        const label = clip(f["label"], 80);
        return value && label ? [{ value, label }] : [];
      })
      .slice(0, 3),
    sources: links(s["sources"]).slice(0, 5),
    also: list(s["also"])
      .flatMap((x) => links([x]).map((l) => ({ ...l, soWhat: clip(x["soWhat"], 200) })))
      .slice(0, 5),
    picks: links(s["picks"]).slice(0, 12),
    from: Number.isFinite(Number(s["from"])) ? Number(s["from"]) : 0,
  };
  if (story.kind === "written" && !story.headline) return null;
  return {
    day: r.day,
    story,
    writtenBy: r.written_by === "groundwork" ? "groundwork" : "team",
    at: r.edited_at ?? r.created_at,
    editedBy: editorName,
  };
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/** Who wrote the story, and when, in Nairobi's time. */
export function kicker(v: StoryView): string {
  const at = clock(v.at);
  if (v.writtenBy === "team") return `${v.editedBy ? `Edited by ${v.editedBy}` : "Written by the team"} at ${at}`;
  if (v.story.kind === "headlines") return `This morning's top stories, gathered at ${at}`;
  return `Written by Groundwork at ${at} from ${v.story.from} ${v.story.from === 1 ? "source" : "sources"}`;
}
```

- [ ] **Step 4: Run** it. Expected: all pass.
- [ ] **Step 5: Lint** (new files; `--fix` is fine). **Commit**
      `The morning story's rules: what the AI may say, headlines when it can't, and the team's own`.

---

### Task 8: The 06:00 step

**Files:**
- Create: `src/lib/morning-story.server.ts`
- Modify: `src/routes/api/public/listening/scan.ts`, `tests/fake-supabase.ts` (upsert key
  for `morning_stories`)
- Test: `tests/morning-story-step.test.ts`

**Interfaces:** Consumes Task 7 (`storyItems`, `checkStory`, `headlinesStory`,
`MentionRow`, `MorningStory`, `StoryItem`) and `askAiJson` from `@/lib/listening.server`.
Produces `STORY_SCHEMA`, `type CampaignInfo = { id: string | null; name: string; candidate:
string | null; seat: string }`, `type Gathered = { items: StoryItem[]; said: string[];
rivals: string[] }`, `gather(sb, campaignId: string | null, now): Promise<Gathered>`,
`writeStory(c, g, lead?: string): Promise<MorningStory | null>`,
`type MorningRun = { ran; written; headlines; quiet; kept; notes: string[] }`,
`runMorningStory(sb, { now?, force? }): Promise<MorningRun>`.

- [ ] **Step 1: The fake knows the story's key.** In `tests/fake-supabase.ts`, add to `KEYS`:
      `morning_stories: [["campaign_id", "day"]],`.

- [ ] **Step 2: Write the failing tests** in `tests/morning-story-step.test.ts`:

```ts
// Checks for the 06:00 step: once a morning, a story for each campaign from its
// own last day of news, never over the team's, headlines when the AI fails.
// Stand-ins for the database and the AI; nothing leaves this process. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story-step.test.ts

import { runMorningStory } from "@/lib/morning-story.server";

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

// 06:05 in Nairobi on 30 September is 03:05 UTC.
const at = (hhmm: string, day = "2026-09-30") => new Date(`${day}T${hhmm}:00+03:00`);
const hoursBefore = (d: Date, h: number) => new Date(d.getTime() - h * 3600_000).toISOString();

const ANSWER = {
  noStory: false,
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: "Water is the loudest issue.",
  rivals: "Babu Owino blames City Hall.",
  line: "Tankers to every ward this week.",
  figures: [{ value: "14", label: "wards on rationing", item: 1 }],
  items: [1],
  also: [{ item: 2, soWhat: "Floods next." }],
};
const aiSays = (answer: unknown) =>
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(answer) })}\n\n`;

function stubAi(status = 200, answer: unknown = ANSWER) {
  const prompts: string[] = [];
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    prompts.push(String(init?.body ?? ""));
    return new Response(status === 200 ? aiSays(answer) : "down", { status });
  }) as typeof fetch;
  return prompts;
}

function world(now: Date, extra: Record<string, Record<string, unknown>[]> = {}) {
  const mention = (campaign: string, url: string, title: string, hoursAgo: number, rival: string | null = null) => ({
    id: url,
    campaign_id: campaign,
    url,
    title,
    snippet: title === "Rationing extended in 14 Eastlands wards" ? "Supply cut to 1.1 million." : null,
    source: rival ? "tiktok" : "news",
    domain: rival ? null : "nation.africa",
    published_at: hoursBefore(now, hoursAgo),
    found_at: hoursBefore(now, hoursAgo),
    rival_id: rival,
    reach: rival ? 1000 : null,
  });
  return fakeSupabase({
    campaigns: [
      { id: "c2", name: "Sakaja 2027", candidate: "Johnson Sakaja", seat: "Governor · Nairobi" },
      { id: "c3", name: "Waruru Gikandi", candidate: "Waruru Gikandi", seat: "MP · Mathira" },
    ],
    listening_mentions: [
      mention("c2", "https://nation.africa/rationing", "Rationing extended in 14 Eastlands wards", 2),
      mention("c2", "https://the-star.co.ke/drains", "Drains blocked on Jogoo Road", 5),
      mention("c2", "https://www.tiktok.com/@he.babuowino/video/1", "Maji kwa kila mtaa", 10, "r-babu"),
      mention("c2", "https://www.tiktok.com/@sakaja/video/2", "Our own post", 10, "r-us"),
      mention("c3", "https://mathira.test/tea", "Mathira tea prices", 30),
    ],
    race_rivals: [
      { id: "r-babu", campaign_id: "c2", name: "Babu Owino", is_us: false },
      { id: "r-us", campaign_id: "c2", name: "Johnson Sakaja", is_us: true },
    ],
    morning_stories: [],
    listening_jobs: [],
    ...extra,
  });
}
const stories = (sb: ReturnType<typeof world>) => sb.tables["morning_stories"] ?? [];

async function main() {
  process.env["LOVABLE_API_KEY"] = "test-key";

  {
    const sb = world(at("05:59"));
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now: at("05:59") });
    eq("before 06:00 nothing is written", [r.ran, prompts.length], [false, 0]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now });
    const s = stories(sb)[0];
    eq("a story for the campaign with news", [stories(sb).length, s?.["campaign_id"], s?.["day"], s?.["written_by"]], [
      1,
      "c2",
      "2026-09-30",
      "groundwork",
    ]);
    const story = s?.["story"] as { headline: string; sources: { url: string }[]; figures: unknown[] };
    eq("written from the day's news", [story.headline, story.sources[0]?.url], [
      "Rationing hits Eastlands",
      "https://nation.africa/rationing",
    ]);
    eq("the AI read the rival's post, not ours", [prompts[0]?.includes("Babu Owino on tiktok"), prompts[0]?.includes("Our own post")], [
      true,
      false,
    ]);
    eq("nor another campaign's news", prompts.some((p) => p.includes("Mathira tea prices")), false);
    eq("a campaign with no news that day gets none", [r.written, r.quiet], [1, 1]);
    const detail = String(sb.tables["listening_jobs"]?.[0]?.["detail"] ?? "");
    eq("the shared note names no campaign", [detail, /Sakaja|Mathira/.test(detail)], [
      "Wrote 1 story. · 1 campaign had no news in the last day.",
      false,
    ]);

    const again = await runMorningStory(sb as never, { now: at("07:05") });
    eq("a second call that morning writes nothing", [again.ran, prompts.length], [false, 1]);

    const tomorrow = at("06:10", "2026-10-01");
    const next = await runMorningStory(sb as never, { now: tomorrow });
    eq("the next morning writes again", [next.ran, stories(sb).length], [true, 1 + (next.written + next.headlines)]);
  }
  {
    const now = at("06:05");
    const sb = world(now, {
      morning_stories: [
        { id: "own", campaign_id: "c2", day: "2026-09-30", story: { kind: "written", headline: "Ours" }, written_by: "team" },
      ],
    });
    const prompts = stubAi();
    const r = await runMorningStory(sb as never, { now });
    eq("the team's story stays", [stories(sb).length, (stories(sb)[0]?.["story"] as { headline: string }).headline, r.kept, prompts.length], [
      1,
      "Ours",
      1,
      0,
    ]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubAi(500);
    const r = await runMorningStory(sb as never, { now });
    const story = stories(sb)[0]?.["story"] as { kind: string; also: unknown[] };
    eq("the AI down: the morning's headlines instead", [r.headlines, story.kind, story.also.length], [1, "headlines", 2]);
  }
  {
    const now = at("06:05");
    const sb = world(now);
    stubAi(200, { ...ANSWER, noStory: true });
    await runMorningStory(sb as never, { now });
    eq(
      "nothing bears on the race: headlines too",
      (stories(sb)[0]?.["story"] as { kind: string }).kind,
      "headlines",
    );
  }

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 3: Run** it. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/morning-story.server.ts`:

```ts
// This morning's story, written once a day for each campaign from the news
// Listening found in its last day (server only). It rides on the hourly call
// and keeps its own clock: its first run at or after 06:00 Nairobi time. A
// story already there (the team's, or an earlier run's) is never replaced. The
// shared job row says what happened in counts only.

import { nairobiToday } from "@/lib/demo/insights";
import { askAiJson } from "@/lib/listening.server";
import {
  checkStory,
  headlinesStory,
  storyItems,
  type MentionRow,
  type MorningStory,
  type StoryItem,
} from "@/lib/morning-story";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely
  from: (table: string) => any;
};

const JOB_KEY = "morning_story";

/** 06:00 on a Nairobi day, as a moment. */
const sixOn = (day: string) => Date.parse(`${day}T06:00:00+03:00`);

export const STORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["noStory", "headline", "summary", "why", "rivals", "line", "figures", "items", "also"],
  properties: {
    noStory: { type: "boolean" },
    headline: { type: "string" },
    summary: { type: "string" },
    why: { type: "string" },
    rivals: { type: "string" },
    line: { type: "string" },
    figures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["value", "label", "item"],
        properties: {
          value: { type: "string" },
          label: { type: "string" },
          item: { type: "integer" },
        },
      },
    },
    items: { type: "array", items: { type: "integer" } },
    also: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "soWhat"],
        properties: { item: { type: "integer" }, soWhat: { type: "string" } },
      },
    },
  },
};

export type CampaignInfo = {
  id: string | null;
  name: string;
  candidate: string | null;
  seat: string;
};

export type Gathered = {
  items: StoryItem[];
  /** What rivals (not our candidate) posted in the last two days. */
  said: string[];
  rivals: string[];
};

/**
 * The last day's news for one campaign, and what its rivals posted. With a
 * campaign id (the server's key) it filters by campaign; without one (the
 * signed-in person's client) row level security does.
 */
export async function gather(sb: Client, campaignId: string | null, now: Date): Promise<Gathered> {
  const since24 = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const since48 = new Date(now.getTime() - 48 * 3600_000).toISOString();
  const own = <T>(q: T): T =>
    campaignId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campaign_id", campaignId) : q;
  const [{ data: rows }, { data: rivals }, { data: posts }] = await Promise.all([
    own(
      sb
        .from("listening_mentions")
        .select("title, snippet, url, source, domain, published_at")
        .is("rival_id", null)
        .gte("found_at", since24),
    )
      .order("found_at", { ascending: false })
      .limit(60),
    own(sb.from("race_rivals").select("id, name, is_us")),
    own(
      sb
        .from("listening_mentions")
        .select("rival_id, source, title")
        .not("rival_id", "is", null)
        .gte("published_at", since48),
    )
      .order("reach", { ascending: false })
      .limit(12),
  ]);
  const names = new Map(
    ((rivals ?? []) as { id: string; name: string; is_us: boolean }[])
      .filter((r) => !r.is_us)
      .map((r) => [r.id, r.name]),
  );
  const said = ((posts ?? []) as { rival_id: string; source: string; title: string | null }[]).flatMap(
    (p) =>
      names.has(p.rival_id) && p.title
        ? [`${names.get(p.rival_id)} on ${p.source}: "${p.title.slice(0, 200)}"`]
        : [],
  );
  return { items: storyItems((rows ?? []) as MentionRow[]), said, rivals: [...names.values()] };
}

function storyPrompt(c: CampaignInfo, g: Gathered, lead?: string): string {
  const who = c.candidate ?? c.name;
  const leadItem = lead ? g.items.find((i) => i.url === lead) : undefined;
  return [
    `You write the morning briefing for the campaign of ${who}, running for ${c.seat}.`,
    "Below are the news and social posts found in the last 24 hours, numbered. Use only these.",
    leadItem
      ? `Write the story around item ${leadItem.n}.`
      : "Pick the one story that most shapes the race this morning: the candidates, county services, the issues people face.",
    "Give: a plain headline under 12 words; a summary of two or three sentences of what happened;",
    `why it matters for ${who}'s race; how rivals are playing it, only from the rivals' posts below,`,
    `or "Rivals haven't spoken on it." when none bear on it; one line ${who} could say;`,
    "up to three figures copied exactly from an item's text, each with that item's number;",
    "the numbers of the items the story rests on; and three to five other items worth knowing,",
    "each with one line on why it matters. If nothing bears on the race or the county, set",
    "noStory to true and leave the rest empty. Plain English. Invent no facts, figures or quotes.",
    "",
    `Rivals in the race: ${g.rivals.join(", ") || "none on record"}.`,
    "Rivals' own posts, last two days:",
    ...(g.said.length ? g.said.map((s) => `- ${s}`) : ["- none"]),
    "",
    "Items:",
    ...g.items.map(
      (i) => `[${i.n}] ${i.source} · ${i.publishedAt ?? "undated"} · ${i.text.slice(0, 400)}`,
    ),
  ].join("\n");
}

/** A story from the gathered news, checked; null when the AI has none that holds up. */
export async function writeStory(c: CampaignInfo, g: Gathered, lead?: string): Promise<MorningStory | null> {
  const answer = await askAiJson<unknown>(storyPrompt(c, g, lead), "morning_story", STORY_SCHEMA);
  const story = checkStory(answer, g.items);
  if (lead && story && !story.sources.some((s) => s.url === lead)) return null;
  return story;
}

export type MorningRun = {
  ran: boolean;
  written: number;
  headlines: number;
  /** Campaigns with no news in the last day. */
  quiet: number;
  /** Campaigns whose story was already there. */
  kept: number;
  /** What went wrong, naming the campaign: for the scheduler only. */
  notes: string[];
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function runMorningStory(
  sb: Client,
  opts: { now?: Date; force?: boolean } = {},
): Promise<MorningRun> {
  const now = opts.now ?? new Date();
  const day = nairobiToday(now);
  const out: MorningRun = { ran: false, written: 0, headlines: 0, quiet: 0, kept: 0, notes: [] };
  if (!opts.force && now.getTime() < sixOn(day)) return out;
  const { data: job } = await sb.from("listening_jobs").select("*").eq("key", JOB_KEY).maybeSingle();
  if (!opts.force && job?.last_run_at && Date.parse(job.last_run_at) >= sixOn(day)) return out;
  if (!opts.force && job?.locked_until && Date.parse(job.locked_until) > now.getTime()) return out;
  out.ran = true;
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "running",
      locked_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );

  const { data: campaigns } = await sb.from("campaigns").select("id, name, candidate, seat");
  for (const c of (campaigns ?? []) as CampaignInfo[]) {
    const { data: have } = await sb
      .from("morning_stories")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("day", day)
      .maybeSingle();
    if (have) {
      out.kept++;
      continue;
    }
    const g = await gather(sb, c.id, now);
    if (!g.items.length) {
      out.quiet++;
      continue;
    }
    let story: MorningStory | null = null;
    try {
      story = await writeStory(c, g);
    } catch (err) {
      out.notes.push(`${c.name}: ${(err as Error).message}`);
    }
    if (story) out.written++;
    else {
      story = headlinesStory(g.items);
      out.headlines++;
    }
    // Never over a story the team saved while this one was being written.
    const { error } = await sb
      .from("morning_stories")
      .upsert(
        { campaign_id: c.id, day, story, written_by: "groundwork", edited_by: null },
        { onConflict: "campaign_id,day", ignoreDuplicates: true },
      );
    if (error) out.notes.push(`${c.name}: the story could not be stored (${error.message}).`);
  }

  const detail =
    [
      out.written && `Wrote ${count(out.written, "story", "stories")}.`,
      out.headlines &&
        `${count(out.headlines, "campaign", "campaigns")} got the top headlines instead.`,
      out.quiet && `${count(out.quiet, "campaign", "campaigns")} had no news in the last day.`,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  await sb.from("listening_jobs").upsert(
    {
      key: JOB_KEY,
      status: "idle",
      locked_until: null,
      last_run_at: now.toISOString(),
      detail,
      updated_at: now.toISOString(),
    },
    { onConflict: "key" },
  );
  return out;
}
```

- [ ] **Step 5: Ride on the hourly call.** In `src/routes/api/public/listening/scan.ts`, import
      `runMorningStory` from `@/lib/morning-story.server` and, after the rival sweep:

```ts
        // And once a morning, each campaign's story from its day of news.
        const story = await runMorningStory(sb as never).catch((e: Error) => ({
          ran: false,
          error: e.message,
        }));
        return Response.json({ ...result, rivals, story });
```

  (replacing `return Response.json({ ...result, rivals });`).

- [ ] **Step 6: Run** the step tests, then `npm test`. Expected: all pass. Typecheck. Lint the
      new file (`--fix`), and `scan.ts` must not gain errors.
- [ ] **Step 7: Commit** `Each morning at 06:00, a story for each campaign from its day of news`.

---

### Task 9: The team changes the story

**Files:**
- Create: `src/lib/morning-story.functions.ts`, `src/components/gw/home/StoryEditor.tsx`
- Test: `tests/morning-story-functions.test.ts`

**Interfaces:** Consumes Task 7 (`cleanTeamStory`, `storyFromRow`, `MorningStory`,
`StoryView`, `TeamStoryInput`) and Task 8 (`gather`, `writeStory`, `CampaignInfo`, loaded
with a dynamic `import()` inside handlers so server code stays on the server). Produces
`STORY_DENIED`, `storyError(e)`, `loadStory(sb, day): Promise<StoryView | null>`,
`saveTeamStory(sb, userId, day, input): Promise<void>`,
`saveStoryAs(sb, userId, day, story): Promise<void>`, server functions `saveStory(input)` and
`reviseStory({ url })`.

- [ ] **Step 1: Write the failing tests** in `tests/morning-story-functions.test.ts`:

```ts
// Checks for the team's own changes to this morning's story, with a stand-in
// database. Who may change it is checked in tests/sql/mornings.test.sql. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/morning-story-functions.test.ts

import {
  loadStory,
  saveTeamStory,
  STORY_DENIED,
  storyError,
} from "@/lib/morning-story.functions";

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

const ME = "user-1";
const GROUNDWORK = {
  kind: "written",
  headline: "Rationing hits Eastlands",
  summary: "Water rationing now covers 14 wards.",
  why: null,
  rivals: null,
  line: null,
  figures: [{ value: "14", label: "wards" }],
  sources: [{ title: "Nation", url: "https://nation.africa/rationing", source: "nation.africa", publishedAt: null }],
  also: [],
  picks: [],
  from: 3,
};

async function main() {
  {
    const sb = fakeSupabase({
      morning_stories: [
        {
          id: "s1",
          day: "2026-09-30",
          story: GROUNDWORK,
          written_by: "groundwork",
          created_at: "2026-09-30T03:04:00Z",
          edited_at: null,
          edited_by: null,
        },
      ],
      profiles: [{ user_id: ME, full_name: "Njeri Kamau" }],
    });
    await saveTeamStory(sb as never, ME, "2026-09-30", {
      headline: "Rationing, and our plan",
      summary: "Tankers go out today.",
    });
    const row = sb.tables["morning_stories"]?.[0];
    eq("an edit is the team's, and keeps the sources", [
      row?.["written_by"],
      row?.["edited_by"],
      (row?.["story"] as { headline: string; sources: unknown[] }).headline,
      (row?.["story"] as { sources: unknown[] }).sources.length,
    ], ["team", ME, "Rationing, and our plan", 1]);
    const view = await loadStory(sb as never, "2026-09-30");
    eq("read back with who edited it", [view?.writtenBy, view?.editedBy], ["team", "Njeri Kamau"]);
  }
  {
    const sb = fakeSupabase({ morning_stories: [] });
    await saveTeamStory(sb as never, ME, "2026-09-30", {
      headline: "Our own story",
      summary: "Written before six.",
      links: ["https://ours.test/plan"],
    });
    eq("with no story yet, the team writes one", sb.tables["morning_stories"]?.length, 1);
  }
  eq("no story, nothing to read", await loadStory(fakeSupabase({}) as never, "2026-09-30"), null);
  eq(
    "what the database's refusals mean",
    [storyError({ code: "42501" }), storyError({ code: "23505" })],
    [STORY_DENIED, "Someone saved this morning's story at the same moment. Open Home again."],
  );

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
```

- [ ] **Step 2: Run** it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/morning-story.functions.ts`:

```ts
// This morning's story, read and changed as the signed-in person. Row level
// security keeps each campaign to its own story and lets only the candidate or
// campaign manager change it, as the team's; a change that reaches no row is
// treated as refused.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { nairobiToday } from "@/lib/demo/insights";
import {
  cleanTeamStory,
  storyFromRow,
  type MorningStory,
  type StoryView,
  type TeamStoryInput,
} from "@/lib/morning-story";

type Sb = SupabaseClient<Database>;

export const STORY_DENIED = "Only the candidate or campaign manager can change the story.";

export function storyError(e: { code?: string; message?: string }): string {
  if (e.code === "42501" || e.message?.includes("row-level security")) return STORY_DENIED;
  if (e.code === "23505")
    return "Someone saved this morning's story at the same moment. Open Home again.";
  return "Could not save the story. Try again.";
}

/** The story for `day`, with the name of whoever last edited it. */
export async function loadStory(sb: Sb, day: string): Promise<StoryView | null> {
  const { data } = await sb
    .from("morning_stories")
    .select("day, story, written_by, created_at, edited_at, edited_by")
    .eq("day", day)
    .maybeSingle();
  if (!data) return null;
  let editor: string | null = null;
  if (data.edited_by) {
    const { data: p } = await sb
      .from("profiles")
      .select("full_name")
      .eq("user_id", data.edited_by)
      .maybeSingle();
    editor = p?.full_name?.trim() || null;
  }
  return storyFromRow(data, editor);
}

/** Save `story` as the team's for `day`: over the morning's, or as the first. */
export async function saveStoryAs(sb: Sb, userId: string, day: string, story: MorningStory): Promise<void> {
  const row = {
    day,
    story: story as unknown as Json,
    written_by: "team",
    edited_by: userId,
    edited_at: new Date().toISOString(),
  };
  const { data: have } = await sb.from("morning_stories").select("id").eq("day", day).maybeSingle();
  const { data, error } = have
    ? await sb.from("morning_stories").update(row).eq("id", have.id).select("id")
    : await sb.from("morning_stories").insert(row).select("id");
  if (error) throw new Error(storyError(error));
  if (!data?.length) throw new Error(STORY_DENIED);
}

/** The team's edit, or its own story when there is none yet. */
export async function saveTeamStory(
  sb: Sb,
  userId: string,
  day: string,
  input: TeamStoryInput,
): Promise<void> {
  const prev = await loadStory(sb, day);
  await saveStoryAs(sb, userId, day, cleanTeamStory(input, prev?.story ?? null));
}

export const saveStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TeamStoryInput) => input)
  .handler(async ({ data, context }) => {
    await saveTeamStory(context.supabase, context.userId, nairobiToday(), data);
    return { ok: true };
  });

/** "Use another story": the morning's story rewritten around one of its items. */
export const reviseStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    const url = String(input?.url ?? "");
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Pick one of the morning's stories.");
    return { url };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { gather, writeStory } = await import("@/lib/morning-story.server");
    const [{ data: campaignId }, g] = await Promise.all([
      sb.rpc("my_campaign"),
      gather(sb as never, null, new Date()),
    ]);
    const { data: c } = await sb
      .from("campaigns")
      .select("id, name, candidate, seat")
      .eq("id", String(campaignId ?? ""))
      .maybeSingle();
    if (!c) throw new Error("Could not find the campaign.");
    const story = await writeStory(c, g, data.url);
    if (!story) throw new Error("Could not write a story around that one. Try another.");
    await saveStoryAs(sb, context.userId, nairobiToday(), story);
    return { ok: true };
  });
```

- [ ] **Step 4: Run** it. Expected: all pass. Typecheck.

- [ ] **Step 5: The editor** `src/components/gw/home/StoryEditor.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { cleanTeamStory, type StoryView } from "@/lib/morning-story";
import { reviseStory, saveStory } from "@/lib/morning-story.functions";

/** The candidate or manager edits this morning's story, picks another, or writes their own. */
export function StoryEditor({ view, onClose }: { view: StoryView | null; onClose: () => void }) {
  const s = view?.story ?? null;
  const [headline, setHeadline] = useState(s?.headline ?? "");
  const [summary, setSummary] = useState(s?.summary ?? "");
  const [why, setWhy] = useState(s?.why ?? "");
  const [rivals, setRivals] = useState(s?.rivals ?? "");
  const [line, setLine] = useState(s?.line ?? "");
  const [links, setLinks] = useState("");
  const save = useServerFn(saveStory);
  const revise = useServerFn(reviseStory);
  const queryClient = useQueryClient();
  const done = async (message: string) => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: ["home"] });
    onClose();
  };

  const input = {
    headline,
    summary,
    why,
    rivals,
    line,
    links: links.split(/\s+/).filter(Boolean),
  };
  // The server checks again; this only says what is missing before it is sent.
  let problem: string | null = null;
  try {
    cleanTeamStory(input, s);
  } catch (e) {
    problem = (e as Error).message;
  }
  const saving = useMutation({
    mutationFn: () => save({ data: input }),
    onSuccess: () => done("This morning's story is saved."),
    onError: (e: Error) => toast.error(e.message),
  });
  const rewriting = useMutation({
    mutationFn: (url: string) => revise({ data: { url } }),
    onSuccess: () => done("The story is rewritten around that one."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="pb-scrim" role="dialog" aria-modal="true" aria-labelledby="se-title">
      <form
        className="pb re-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) saving.mutate();
        }}
      >
        <div className="pb-head">
          <div>
            <span className="eyebrow">Today · the story</span>
            <h2 id="se-title">{s ? "This morning's story" : "Write today's story"}</h2>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pb-body">
          <label className="pb-field">
            <span>Headline</span>
            <input value={headline} maxLength={160} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>What happened</span>
            <textarea value={summary} maxLength={800} rows={3} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>Why it matters for the race</span>
            <textarea value={why} maxLength={400} rows={2} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>How rivals are playing it</span>
            <textarea value={rivals} maxLength={400} rows={2} onChange={(e) => setRivals(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>Suggested line</span>
            <textarea value={line} maxLength={300} rows={2} onChange={(e) => setLine(e.target.value)} />
          </label>
          <label className="pb-field">
            <span>Links (https, one per line; blank keeps the story&apos;s own)</span>
            <textarea value={links} rows={2} onChange={(e) => setLinks(e.target.value)} />
          </label>
          {problem && headline.trim() ? <p className="re-problem">{problem}</p> : null}
          {s?.picks.length ? (
            <fieldset className="pb-field">
              <legend>Or write it around another of the morning&apos;s stories</legend>
              <ul className="se-picks">
                {s.picks.map((p) => (
                  <li key={p.url}>
                    <span>
                      <b>{p.title}</b> <small className="dim">{p.source}</small>
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={rewriting.isPending}
                      onClick={() => rewriting.mutate(p.url)}
                    >
                      Use this one
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
        </div>
        <div className="pb-foot">
          <button type="submit" className="btn btn--primary" disabled={Boolean(problem) || saving.isPending}>
            Save the story
          </button>
        </div>
      </form>
    </div>
  );
}
```

  and in `src/styles/groundwork.css`:

```css
/* The story editor's list of the morning's other stories. */
.se-picks { list-style:none; margin:0; padding:0; }
.se-picks li { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-top:1px solid var(--border); }
.se-picks li:first-child { border-top:0; }
.se-picks span { min-width:0; overflow-wrap:anywhere; font-size:13px; }
```

- [ ] **Step 6: Run** all tests, typecheck, build. Lint new files. **Commit**
      `The candidate or manager edits the morning's story, rewrites it around another, or writes their own`.

---

### Task 10: Home shows this morning's story

**Files:**
- Create: `src/components/gw/home/MorningStoryBlock.tsx`
- Modify: `src/lib/home.functions.ts` (`HomeData.story`), `src/components/gw/home/Home.tsx`,
  `src/components/gw/home/TodaySection.tsx`, `src/components/gw/briefing/Story.tsx` (remove
  the invented `StoryBlock`; delete the file if nothing is left in it)
- Test: `tests/home.test.ts`

**Interfaces:** Consumes Task 9's `loadStory`, `StoryEditor`, Task 7's `kicker`,
`StoryView`, Task 3's `nairobiTime`. Produces `HomeData.story: StoryView | null`.

- [ ] **Step 1: Write the failing tests** in `tests/home.test.ts` (in `main()`):

```ts
  {
    const today = nairobiToday();
    const h = await loadHome(
      db({
        morning_stories: [
          {
            id: "s1",
            campaign_id: "c2",
            day: today,
            story: {
              kind: "written",
              headline: "Rationing extended",
              summary: "Water rationing now covers 14 wards.",
              sources: [{ title: "Nation", url: "https://nation.africa/x", source: "nation.africa", publishedAt: null }],
              figures: [],
              also: [],
              picks: [],
              from: 12,
            },
            written_by: "team",
            edited_by: ME,
            edited_at: `${today}T04:10:00Z`,
            created_at: `${today}T03:04:00Z`,
          },
        ],
      }) as never,
      ME,
      "manager",
      today,
    );
    eq(
      "this morning's story, and who edited it",
      [h.story?.story.headline, h.story?.writtenBy, h.story?.editedBy],
      ["Rationing extended", "team", "Njeri Kamau"],
    );
  }
  {
    const h = await loadHome(db() as never, ME, "manager");
    eq("no story yet", h.story, null);
  }
```

- [ ] **Step 2: Run** the Home tests. Expected: FAIL (`h.story` is undefined).

- [ ] **Step 3: Load it.** In `src/lib/home.functions.ts`: import `loadStory` from
      `@/lib/morning-story.functions` and `type StoryView` from `@/lib/morning-story`; add to
      `HomeData`:

```ts
  /** This morning's story: written at 06:00 from the news, or by the team. */
  story: StoryView | null;
```

  add `loadStory(sb, todayIso).catch(() => null)` to the `Promise.all` (as `story`) and `story`
  to the returned object; add `story: null` to `NOTHING_YET` in `Home.tsx`.

- [ ] **Step 4: Show it.** Create `src/components/gw/home/MorningStoryBlock.tsx`:

```tsx
import { kicker, type StoryView } from "@/lib/morning-story";

/** This morning's story: its kicker, the story with its sources, and the morning's other news. */
export function MorningStoryBlock({
  view,
  time,
  canEdit,
  onEdit,
}: {
  view: StoryView | null;
  /** Nairobi's time now, HH:MM. */
  time: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  if (!view) {
    return (
      <article className="mb-story" aria-labelledby="mb-story-h">
        <h2 id="mb-story-h" className="mb-sub">
          This morning&apos;s story
        </h2>
        <p className="mb-story-sum">
          {time < "06:00"
            ? "This morning's story is written at 6:00 from the news Listening finds."
            : "No news about the race in the last day."}
        </p>
        {canEdit ? (
          <div className="mb-actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={onEdit}>
              Write today&apos;s story
            </button>
          </div>
        ) : null}
      </article>
    );
  }
  const st = view.story;
  return (
    <article className="mb-story" aria-labelledby="mb-story-h">
      <p className="mb-story-kicker">
        {kicker(view)}
        {canEdit ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>
            {st.kind === "written" ? "Edit" : "Write today's story"}
          </button>
        ) : null}
      </p>
      {st.kind === "written" ? (
        <>
          <h2 id="mb-story-h" className="mb-story-h">
            {st.headline}
          </h2>
          <p className="mb-story-sum">{st.summary}</p>
          {st.why ? <p className="mb-story-sum">{st.why}</p> : null}
          {st.figures.length ? (
            <dl className="mb-figs">
              {st.figures.map((f) => (
                <div key={f.label}>
                  <dt>{f.value}</dt>
                  <dd>{f.label}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {st.rivals || st.line ? (
            <div className="mb-story-cols">
              {st.rivals ? (
                <div>
                  <h3>How rivals are playing it</h3>
                  <p>{st.rivals}</p>
                </div>
              ) : null}
              {st.line ? (
                <div className="mb-line">
                  <h3>Suggested line</h3>
                  <p>{st.line}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {st.sources.length ? (
            <p className="mb-source">
              Sources:{" "}
              {st.sources.map((s, i) => (
                <span key={s.url}>
                  {i ? " · " : ""}
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.source}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <h2 id="mb-story-h" className="mb-story-h">
          This morning&apos;s top stories
        </h2>
      )}
      {st.also.length ? (
        <>
          <h3 className="mb-sub">{st.kind === "written" ? "Also this morning" : "The morning's news"}</h3>
          <ul className="mb-news">
            {st.also.map((n) => (
              <li key={n.url}>
                <p className="mb-news-meta">{n.source}</p>
                <p className="mb-news-h">
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.title}
                  </a>
                </p>
                {n.soWhat ? <p className="mb-news-so">{n.soWhat}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
```

  In `TodaySection.tsx`: take `story: StoryView | null`, `time: string` and `onEditStory:
  () => void` props; render `<MorningStoryBlock view={story} time={time} canEdit={canEdit}
  onEdit={onEditStory} />` in place of `<StoryBlock s={s} />`, and remove the `home-note`
  paragraph and the `StoryBlock` import. In `Home.tsx`: add `"story"` to the `editing` state's
  union, pass `story={d.story}`, `time={now}` and `onEditStory={() => setEditing("story")}`,
  and render `{editing === "story" && <StoryEditor view={d.story} onClose={() =>
  setEditing(null)} />}`. Remove `StoryBlock` from `briefing/Story.tsx` (delete the file if it
  is now empty and nothing imports it).

- [ ] **Step 5: Run** all tests, typecheck, build. Lint changed files (counts must not rise).
- [ ] **Step 6: Commit** `Home shows this morning's real story, and the candidate or manager can change it`.

---

### Task 11: Look at it

- [ ] In the harness (scratchpad `harness/`): mock `@/lib/diary.functions` (a week with entries
      on three days, one of them "watch", and three wards) and `@/lib/morning-story.functions`
      (`saveStory`, `reviseStory` resolve); give `homeData` a `diary` (today's two stops, one
      watch tomorrow) and a `story` (written by Groundwork, two figures, three sources, three
      "also"), and a state with `story: null`. Add the real Diary route to the harness router.
- [ ] Check at 1280 and 375 wide: Home's story block, its kicker and Edit, the empty story
      before and after 06:00, "Where to be today", the watch list, Today's next stop; the
      Diary page's week, Add, Edit, Remove, the week links; the story editor. No horizontal
      scroll; no console errors on a fresh load.
- [ ] Fix what looks wrong (test first where a rule is involved), run `npm test`, commit
      `The diary and the morning's story read cleanly on a phone`.

---

## Self-review against the spec

- Spec 1 (the diary): Tasks 2–6. Spec 2 (the story): Tasks 2, 7–10. Data (schema 20): Task 2
  (search interest and `search_as` are part 2's schema 21). Privacy (shared job rows): Tasks 1
  and 8. Errors (AI down → headlines): Task 8. Testing: every task. Sections 3–5 are part 2.
