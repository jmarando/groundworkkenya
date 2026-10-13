# The findings engine (insights, part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn what Groundwork holds into ranked, sourced one-line findings for the candidate's four decisions, listed on a new Strategy page and shown as "so whats" on Home, Elections, Voters and the Diary.

**Architecture:** Five new database functions (schema 25) count, per ward and per week, inside the caller's own campaign, and give a field agent nothing. Twelve pure rules in `src/lib/findings/` turn those counts, the atlas, the diary and the race into findings, and every number in a finding's line is one of its figures. One server function, `getFindings`, gathers the input, reading each count softly so nothing breaks before Lovable applies the migration, then runs the rules; every screen shares its one cached query.

**Tech Stack:** TanStack Start (`createServerFn`, file routes), React 19, React Query, Supabase/Postgres (row level security, SQL functions), tsx tests with `eq()`, SQL tests run by `tests/sql/run.sh` (Postgres 16).

**Spec:** `docs/superpowers/specs/2026-10-13-findings-engine-design.md`

## Global Constraints

- No AI anywhere in this part.
- Only counts leave the database: the five functions return no name, phone number or person id, and no rows to a field agent.
- Findings are for the super admin, candidate, manager and organisers (`FINDINGS_READERS`), never field agents; the server refuses others with "This page isn't part of your role."
- A line names places, and rivals as the team entered them. Never a voter or an agent; never a profile's free text; never communities or languages. Nothing records or guesses anyone's tribe.
- Every number in a line is one of its figures, printed the same way: `unaccounted(f)` is `[]` for every finding.
- Order: decisions in the order time, message, field, rivals; then the rules' order; then weight, largest first; ties by id.
- Every threshold lives in `LIMITS` in `src/lib/findings/core.ts`.
- Schema 25, in `supabase/migrations/20261014090000_findings.sql`. Lovable applies it; until then the counts read softly and their rules stay quiet.
- Tests are tsx files in `tests/` with the `eq()` helper, ending `console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);`, run one at a time with `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts` and all together with `npm test`. SQL tests in `tests/sql/` start with `\ir fixtures.sql` and roll back.
- Repository rules: never run Prettier on `data/atlas/REPORT.md` or `src/styles/groundwork.css`; never name TransTally; the repository is public, so no secrets or voter data; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nothing is pushed without the user's OK.

## Review Focus

1. **A campaign whose wards don't match the atlas, or with none:** the ward rules stay quiet and nothing throws. Task 2's runner test "no campaign wards" covers every registered rule, and from Task 6 that is all twelve.
2. **A presidential campaign (home Kenya) with no county results:** the seat rules stay quiet. Tasks 3 and 5 test it.
3. **Diary entries with no ward, "To watch" entries, and stops outside the window:** ignored. Task 3 tests it.
4. **Issue names that mean the same issue, and non-issues** ("Water and sanitation", "sewer", "general", a blank): merged or dropped by `issueKey`. Task 4 tests it.
5. **A malformed `?place=` on Strategy, and a Voters area the atlas doesn't hold:** the first shows every finding; the second shows none rather than all. Task 2 tests `placeParam` and `votersPlace`.

## Files

| File | What it does |
|---|---|
| `supabase/migrations/20261014090000_findings.sql` | Schema 25: `ward_issues`, `issue_weeks`, `rival_mention_weeks`, `ward_spend`, `ward_supporters` |
| `tests/sql/findings.test.sql` | Those functions' counts, isolation and privacy |
| `src/lib/findings/core.ts` | Types, the rules' order, `LIMITS`, ordering, places, the figures check, shared helpers |
| `src/lib/findings/index.ts` | The rule registry and `findings()`, which runs them |
| `src/lib/findings/time.ts` | Rules 1–2: not visited, time in safe seats |
| `src/lib/findings/message.ts` | Rules 3–5: top issue in a ward, issue rising, one seat with different places |
| `src/lib/findings/field.ts` | Rules 6–10: votes within reach, doors behind, short of target, unregistered adults, spend out of line |
| `src/lib/findings/rivals.ts` | Rules 11–12: poll move, rival in the news |
| `src/lib/findings/rows.ts` | The database counts' rows, checked |
| `src/lib/house-totals.ts` | Each map area's houses per ward, imported from `public/tiles/houses-*.json` |
| `src/lib/findings.functions.ts` | `loadFindings` and the `getFindings` server function |
| `src/hooks/useFindings.ts` | The shared query |
| `src/components/gw/findings/FindingItem.tsx` | One finding, with its next step and its figures |
| `src/components/gw/findings/SoWhat.tsx` | A screen's few findings (`SoWhat`, `PlaceFindings`) |
| `src/components/gw/home/FindingsBlock.tsx` | Home's block |
| `src/routes/_authenticated/strategy.tsx` | The Strategy page |
| `src/lib/atlas.ts`, `src/lib/atlas-view.ts` | `whatToDoFigures`: the what-to-do reason's numbers |
| `src/lib/race-data.ts` | `biggestPollMove`, covering our own candidate and the margin of error |
| Elections, Voters, Diary, Home, the menu, styles | The screens that show findings |

---

### Task 1: Schema 25, the counts

**Files:**
- Create: `supabase/migrations/20261014090000_findings.sql`
- Create: `tests/sql/findings.test.sql`

**Interfaces:**
- Consumes: `public.my_campaign_role()`, the tables' "own campaign only" policies, and the `fixtures.sql` accounts (Sakaja `ca000000-…0002`: manager `…c3`, agent `…b2`; Mathira's candidate `…e5`).
- Produces (all `stable`, `security invoker`, granted to `authenticated` only, no rows for a field agent):
  - `ward_issues(_days integer default 30) returns table (ward_id uuid, source text, issue text, n integer)`, with `source` one of `door`, `messages`, `news`
  - `issue_weeks(_weeks integer default 5) returns table (week integer, source text, issue text, n integer)`, where week 0 is the last 7 days
  - `rival_mention_weeks(_weeks integer default 5) returns table (week integer, rival_id uuid, n integer)`, where a null `rival_id` means every mention that week
  - `ward_spend(_days integer default 30) returns table (ward_id uuid, kes numeric)`
  - `ward_supporters() returns table (ward_id uuid, supporters integer)`
  - `groundwork_schema_version()` returns 25

- [ ] **Step 1: Write the failing test**

Create `tests/sql/findings.test.sql`:

```sql
-- The findings engine's counts: issues by ward and by week, rival mentions by
-- week, stipend spend and supporters by ward. Each counts the caller's own
-- campaign only, gives a field agent nothing, and returns no personal column.
-- Test rows use a ward and issue names of their own ("Zq …"), so the seeded
-- campaign records never change a count. Run with tests/sql/run.sh; each test
-- rolls back.

\ir fixtures.sql

-- A ward of Sakaja's for these tests alone.
create or replace function pg_temp.zq_ward()
returns uuid language plpgsql as $$
declare w uuid;
begin
  select id into w from public.wards where slug = 'zq-ward';
  if w is null then
    insert into public.wards (campaign_id, name, slug, constituency)
    values ('ca000000-0000-4000-8000-000000000002', 'Zq Ward', 'zq-ward', 'Zq')
    returning id into w;
  end if;
  return w;
end $$;

-- test: the schema is at version 25 or later
do $$ begin
  assert public.groundwork_schema_version() >= 25, 'schema 25';
end $$;

-- test: issues raised in a ward, by source and only in the window, for the caller's campaign alone
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
  p uuid;
begin
  insert into public.people (campaign_id, phone, full_name, ward_id)
  values (sak, '+254711900001', 'Door person', w) returning id into p;
  insert into public.person_events (campaign_id, person_id, kind, channel, detail, created_at) values
    (sak, p, 'door_spoke', 'door', 'Zq water', now() - interval '2 days'),
    (sak, p, 'door_spoke', 'door', 'Zq water', now() - interval '3 days'),
    (sak, p, 'door_spoke', 'door', 'Zq roads', now() - interval '40 days'),
    (sak, p, 'door_not_home', 'door', null, now() - interval '1 day');
  insert into public.conversations (campaign_id, person_id, channel, issue, last_message_at)
  values (sak, p, 'sms', 'Zq water', now() - interval '1 day');
  insert into public.listening_mentions (campaign_id, url, issue, ward, found_at) values
    (sak, 'https://news.example.test/zq1', 'Zq water', ' zq ward', now() - interval '1 day'),
    (sak, 'https://news.example.test/zq2', 'Zq water', 'Elsewhere', now() - interval '1 day');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare w uuid := (select id from public.wards where slug = 'zq-ward');
begin
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'door' and issue = 'Zq water') = 2,
    'two door issues in 30 days';
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'messages' and issue = 'Zq water') = 1;
  assert (select n from public.ward_issues(30) where ward_id = w and source = 'news' and issue = 'Zq water') = 1,
    'a mention tagged with the ward by name, whatever its case and spaces';
  assert not exists (select 1 from public.ward_issues(30) where issue = 'Zq roads'), 'forty days ago is outside 30';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e5';
do $$ begin
  assert not exists (select 1 from public.ward_issues(30) where issue like 'Zq%'), 'Mathira sees none of Sakaja''s issues';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_issues(30)), 'a field agent gets nothing';
end $$;
rollback;

-- test: issues by week: this week is week 0, last week week 1, nothing older than the weeks asked for
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  p uuid;
begin
  insert into public.people (campaign_id, phone, full_name)
  values (sak, '+254711900002', 'Someone') returning id into p;
  insert into public.person_events (campaign_id, person_id, kind, channel, detail, created_at) values
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '1 day'),
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '10 days'),
    (sak, p, 'door_spoke', 'door', 'Zq floods', now() - interval '40 days');
  insert into public.listening_mentions (campaign_id, url, issue, found_at)
  values (sak, 'https://news.example.test/zq3', 'Zq floods', now() - interval '2 days');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select n from public.issue_weeks(5) where week = 0 and source = 'door' and issue = 'Zq floods') = 1;
  assert (select n from public.issue_weeks(5) where week = 1 and source = 'door' and issue = 'Zq floods') = 1,
    'ten days ago is last week';
  assert (select n from public.issue_weeks(5) where week = 0 and source = 'news' and issue = 'Zq floods') = 1;
  assert not exists (select 1 from public.issue_weeks(5) where week >= 5), 'nothing older than five weeks';
end $$;
rollback;

-- test: news about a rival counts for them through the team's keyword for them; their own posts don't
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  rv uuid;
  tp uuid;
begin
  insert into public.race_rivals (campaign_id, name, tone) values (sak, 'Zq Challenger', 'a') returning id into rv;
  insert into public.listening_topics (campaign_id, label, query, kind)
  values (sak, 'zq challenger', 'Zq Challenger Nairobi', 'rival') returning id into tp;
  insert into public.listening_mentions (campaign_id, url, topic_id, found_at) values
    (sak, 'https://news.example.test/zr1', tp, now() - interval '1 day'),
    (sak, 'https://news.example.test/zr2', tp, now() - interval '9 days');
  insert into public.listening_mentions (campaign_id, url, rival_id, source, found_at)
  values (sak, 'https://www.tiktok.com/@zq/video/1', rv, 'tiktok', now() - interval '1 day');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
declare rv uuid := (select id from public.race_rivals where name = 'Zq Challenger');
begin
  assert (select n from public.rival_mention_weeks(5) where week = 0 and rival_id = rv) = 1, 'this week''s news about them';
  assert (select n from public.rival_mention_weeks(5) where week = 1 and rival_id = rv) = 1, 'and last week''s';
  assert (select n from public.rival_mention_weeks(5) where week = 0 and rival_id is null)
       = (select count(*) from public.listening_mentions
           where rival_id is null and found_at > now() - interval '7 days'),
    'every news mention this week, their own posts aside';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.rival_mention_weeks(5)), 'a field agent gets nothing';
end $$;
rollback;

-- test: stipends by ward over 30 days, owed, approved and paid alike
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
begin
  insert into public.agent_stipends (campaign_id, agent_name, ward_id, amount_kes, status, created_at, paid_at) values
    (sak, 'Agent One', w, 1000, 'pending', now() - interval '2 days', null),
    (sak, 'Agent Two', w, 1500, 'paid', now() - interval '60 days', now() - interval '3 days'),
    (sak, 'Agent Three', w, 9999, 'paid', now() - interval '45 days', now() - interval '45 days');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select s.kes from public.ward_spend(30) s join public.wards w on w.id = s.ward_id where w.slug = 'zq-ward') = 2500,
    'paid three days ago counts, though entered sixty days ago; paid 45 days ago does not';
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_spend(30)), 'a field agent gets nothing';
end $$;
rollback;

-- test: supporters by ward: agreed to SMS, not opted out, not samples
begin;
do $$
declare
  sak constant uuid := 'ca000000-0000-4000-8000-000000000002';
  w uuid := pg_temp.zq_ward();
begin
  insert into public.people (campaign_id, phone, full_name, ward_id, consent_sms, opted_out, tags) values
    (sak, '+254711900011', 'Yes', w, true, false, '{}'),
    (sak, '+254711900012', 'No consent', w, false, false, '{}'),
    (sak, '+254711900013', 'Stopped', w, true, true, '{}'),
    (sak, '+254711900014', 'Sample', w, true, false, '{sample}');
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$ begin
  assert (select s.supporters from public.ward_supporters() s join public.wards w on w.id = s.ward_id
           where w.slug = 'zq-ward') = 1;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert not exists (select 1 from public.ward_supporters()), 'a field agent gets nothing';
end $$;
rollback;

-- test: the counts return no personal columns
do $$
declare bad text;
begin
  select string_agg(p.proname || '.' || a, ', ') into bad
    from pg_proc p, unnest(p.proargnames) a
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('ward_issues', 'issue_weeks', 'rival_mention_weeks', 'ward_spend', 'ward_supporters')
     and a ~ '(name|phone|person|email|actor)';
  assert bad is null, 'personal columns: ' || bad;
  assert (select count(distinct proname) from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('ward_issues', 'issue_weeks', 'rival_mention_weeks', 'ward_spend', 'ward_supporters')) = 5,
    'all five functions exist';
end $$;
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash tests/sql/run.sh`
Expected: every file `ok` except `FAIL tests/sql/findings.test.sql`, failing on the assertion `schema 25`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261014090000_findings.sql`:

```sql
-- The findings engine's counts. Schema version 25.
--
-- Counts per ward and per week for the findings (insights, part 2): issues
-- raised at the door, in messages and in the news; issues and rival mentions
-- week by week; stipend spend and consenting supporters by ward. Each runs as
-- the person asking (security invoker), so the "own campaign only" policies
-- keep every count inside their campaign, and returns nothing to a field
-- agent. Counts only: never a name, a phone number or a person.

-- Issues raised in each ward in the last _days days, by where they were
-- raised, each source read as Home's top of mind reads it: a conversation at
-- the door (the issue is the event's detail), a conversation in messages (the
-- ward is the person's), and a news or social mention tagged with the ward by
-- name (rivals' own posts aside).
create or replace function public.ward_issues(_days integer default 30)
returns table (ward_id uuid, source text, issue text, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  select x.ward_id, x.source, x.issue, count(*)::integer
    from (
      select p.ward_id, 'door'::text as source, e.detail as issue
        from public.person_events e
        join public.people p on p.id = e.person_id
       where e.kind = 'door_spoke'
         and e.detail is not null
         and e.created_at > now() - make_interval(days => _days)
      union all
      select p.ward_id, 'messages', c.issue
        from public.conversations c
        join public.people p on p.id = c.person_id
       where c.issue is not null
         and c.last_message_at > now() - make_interval(days => _days)
      union all
      select w.id, 'news', m.issue
        from public.listening_mentions m
        join public.wards w on w.campaign_id = m.campaign_id
                           and lower(btrim(w.name)) = lower(btrim(m.ward))
       where m.rival_id is null
         and m.issue is not null
         and m.found_at > now() - make_interval(days => _days)
    ) x
   where x.ward_id is not null
     and (select public.my_campaign_role()) is distinct from 'agent'
   group by x.ward_id, x.source, x.issue
$$;

-- Issues raised across the campaign, week by week: week 0 is the last 7 days,
-- week 1 the 7 before, back _weeks weeks. The same three sources.
create or replace function public.issue_weeks(_weeks integer default 5)
returns table (week integer, source text, issue text, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  select floor(extract(epoch from now() - x.at) / 604800)::integer, x.source, x.issue, count(*)::integer
    from (
      select 'door'::text as source, e.detail as issue, e.created_at as at
        from public.person_events e
       where e.kind = 'door_spoke'
         and e.detail is not null
         and e.created_at > now() - make_interval(days => 7 * _weeks)
      union all
      select 'messages', c.issue, c.last_message_at
        from public.conversations c
       where c.issue is not null
         and c.last_message_at > now() - make_interval(days => 7 * _weeks)
      union all
      select 'news', m.issue, m.found_at
        from public.listening_mentions m
       where m.rival_id is null
         and m.issue is not null
         and m.found_at > now() - make_interval(days => 7 * _weeks)
    ) x
   where (select public.my_campaign_role()) is distinct from 'agent'
   group by 1, 2, 3
$$;

-- News and social mentions week by week: a row per rival, for the mentions
-- found by the team's keyword for them (a listening topic of kind 'rival'
-- labelled with their name or the name they're searched by), and a row with
-- no rival for every mention. Rivals' own posts aren't news about them.
create or replace function public.rival_mention_weeks(_weeks integer default 5)
returns table (week integer, rival_id uuid, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  with news as (
    select floor(extract(epoch from now() - m.found_at) / 604800)::integer as week,
           m.campaign_id, t.kind as topic_kind, t.label as topic_label
      from public.listening_mentions m
      left join public.listening_topics t on t.id = m.topic_id
     where m.rival_id is null
       and m.found_at > now() - make_interval(days => 7 * _weeks)
       and (select public.my_campaign_role()) is distinct from 'agent'
  )
  select n.week, r.id, count(*)::integer
    from news n
    join public.race_rivals r
      on r.campaign_id = n.campaign_id
     and not r.is_us
     and n.topic_kind = 'rival'
     and lower(btrim(n.topic_label)) in (lower(btrim(r.name)), lower(btrim(coalesce(r.search_as, r.name))))
   group by n.week, r.id
  union all
  select n.week, null::uuid, count(*)::integer
    from news n
   group by n.week
$$;

-- Stipends by ward over the last _days days: owed, approved or paid, dated
-- by payment, else by when they were entered.
create or replace function public.ward_spend(_days integer default 30)
returns table (ward_id uuid, kes numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select s.ward_id, sum(s.amount_kes)
    from public.agent_stipends s
   where s.ward_id is not null
     and s.status in ('pending', 'approved', 'paid')
     and coalesce(s.paid_at, s.created_at) > now() - make_interval(days => _days)
     and (select public.my_campaign_role()) is distinct from 'agent'
   group by s.ward_id
$$;

-- Supporters by ward as the Overview counts them: real people (not samples),
-- not opted out, who agreed to SMS.
create or replace function public.ward_supporters()
returns table (ward_id uuid, supporters integer)
language sql
stable
security invoker
set search_path = public
as $$
  select p.ward_id, count(*)::integer
    from public.people p
   where p.ward_id is not null
     and not p.opted_out
     and p.consent_sms
     and not ('sample' = any(p.tags))
     and (select public.my_campaign_role()) is distinct from 'agent'
   group by p.ward_id
$$;

revoke all on function public.ward_issues(integer) from public, anon;
grant execute on function public.ward_issues(integer) to authenticated;
revoke all on function public.issue_weeks(integer) from public, anon;
grant execute on function public.issue_weeks(integer) to authenticated;
revoke all on function public.rival_mention_weeks(integer) from public, anon;
grant execute on function public.rival_mention_weeks(integer) to authenticated;
revoke all on function public.ward_spend(integer) from public, anon;
grant execute on function public.ward_spend(integer) to authenticated;
revoke all on function public.ward_supporters() from public, anon;
grant execute on function public.ward_supporters() to authenticated;

create or replace function public.groundwork_schema_version()
returns integer
language sql
immutable
as $$ select 25 $$;

revoke all on function public.groundwork_schema_version() from public, anon, authenticated;
grant execute on function public.groundwork_schema_version() to service_role;
```

- [ ] **Step 4: Run the SQL tests**

Run: `bash tests/sql/run.sh`
Expected: `ok   42 migrations apply cleanly`, every file `ok`, including `ok   tests/sql/findings.test.sql (7 tests)` and `ok   tests/sql/access.test.sql (16 tests)` (no function open to anon).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014090000_findings.sql tests/sql/findings.test.sql
git commit -m "$(cat <<'EOF'
Schema 25: counts for the findings, by ward and by week

Issues raised by ward and by week, news about each rival by week, stipend
spend and supporters by ward: counts only, inside the caller's campaign,
and nothing for a field agent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The findings core

**Files:**
- Create: `src/lib/findings/core.ts`
- Create: `src/lib/findings/index.ts`
- Create: `tests/findings-fixture.ts`
- Create: `tests/findings-core.test.ts`

**Interfaces:**
- Consumes: `validateElectionsSearch` (`@/lib/elections-view`); the types `Race` (`@/lib/atlas`), `AtlasData` (`@/lib/atlas-view`), `DiaryEntry` (`@/lib/diary`), `WardDoors` (`@/lib/houses`), `RacePoll`/`RaceRival` (`@/lib/race-data`), `Area` (`@/lib/voters-view`).
- Produces, from `@/lib/findings/core`:
  - types `Decision`, `RuleId`, `Figure`, `Next`, `Finding`, `Count`, `IssueSource`, `FindingsWard`, `WardIssue`, `IssueWeek`, `RivalWeek`, `FindingsInput`, `FindingsResult`
  - constants `FINDINGS_READERS`, `DECISIONS`, `DECISION_NAMES`, `RULES`, `LIMITS`, `EPS`, `ISSUE_SOURCES`
  - `finding(rule, place, line, figures, next, weight, about = place): Finding`, whose id is `${rule}:${about ?? "campaign"}`
  - `orderFindings(fs)`, `within(place, key)`, `forPlace(fs, place, campaignWide = true)`, `firstOfEach(fs)`, `votersPlace(area, wards, wardKeys): string | null | undefined`, `placeParam(raw): string | null`, `unaccounted(f): string[]`, `count(n)`, `percent(x)`, `topPart(xs, by, part, id)`, `levelOf(i)`, `seatsOf(i)`, `emptyLine(decision, result)`
- Produces, from `@/lib/findings`: `type Rule = (i: FindingsInput) => Finding[]`, `RULE_FNS: Partial<Record<RuleId, Rule>>` (empty until Task 3), and `findings(i, rules = RULE_FNS, log = console.error): Finding[]`
- Produces, from `tests/findings-fixture.ts`: `ATLAS`, `KEYS`, `WARDS`, `RIVALS`, `poll(id, publishedOn, shares, margin?)`, `FULL` (today 2026-10-13; every rule fires on it once), `input(over)`

- [ ] **Step 1: Write the shared example data**

Create `tests/findings-fixture.ts`:

```ts
// One campaign's worth of made-up data on which every finding rule fires once:
// a Nairobi governor's race with four seats and six wards, the diary, doors,
// issues, stipends, polls and mentions. Shared by the findings tests.

import type { AtlasData } from "@/lib/atlas-view";
import type { DiaryEntry } from "@/lib/diary";
import type { FindingsInput, FindingsWard } from "@/lib/findings/core";
import type { RacePoll, RaceRival } from "@/lib/race-data";

const area = (key: string, level: string, name: string, parent: string | null) => ({
  key,
  level: level as AtlasData["areas"][number]["level"],
  name,
  parent,
});
const DN = "nairobi/dagoretti-north";
const WL = "nairobi/westlands";
const KS = "nairobi/kasarani";
const EE = "nairobi/embakasi-east";
export const KEYS = {
  kawangware: `${DN}/kawangware`,
  kileleshwa: `${DN}/kileleshwa`,
  kangemi: `${WL}/kangemi`,
  parklands: `${WL}/parklands`,
  mwiki: `${KS}/mwiki`,
  utawala: `${EE}/utawala`,
};

/** 2022 governor: our side is Bloc A. Kasarani is Mobilise, Dagoretti North Persuade, Embakasi East Cut the gap, Westlands Hold. */
export const ATLAS: AtlasData = {
  areas: [
    area("kenya", "country", "Kenya", null),
    area("nairobi", "county", "Nairobi", "kenya"),
    area(DN, "constituency", "Dagoretti North", "nairobi"),
    area(WL, "constituency", "Westlands", "nairobi"),
    area(KS, "constituency", "Kasarani", "nairobi"),
    area(EE, "constituency", "Embakasi East", "nairobi"),
    area(KEYS.kawangware, "ward", "Kawangware", DN),
    area(KEYS.kileleshwa, "ward", "Kileleshwa", DN),
    area(KEYS.kangemi, "ward", "Kangemi", WL),
    area(KEYS.parklands, "ward", "Parklands", WL),
    area(KEYS.mwiki, "ward", "Mwiki", KS),
    area(KEYS.utawala, "ward", "Utawala", EE),
  ],
  candidates: [
    {
      id: "a",
      election: "2022-governor",
      seat: "nairobi",
      name: "Candidate A",
      party: "Party A",
      bloc: "Bloc A",
    },
    {
      id: "b",
      election: "2022-governor",
      seat: "nairobi",
      name: "Candidate B",
      party: "Party B",
      bloc: "Bloc B",
    },
  ],
  results: (
    [
      [DN, 46_100, 48_000],
      [WL, 65_000, 35_000],
      [KS, 55_000, 45_000],
      [EE, 30_000, 70_000],
    ] as const
  ).flatMap(([at, a, b]) => [
    { candidate: "a", area: at, votes: a, source: "iebc" },
    { candidate: "b", area: at, votes: b, source: "iebc" },
  ]),
  turnout: (
    [
      ["nairobi", 1_000_000, 500_000, 499_000],
      [DN, 200_000, 101_000, 100_000],
      [WL, 160_000, 100_500, 100_000],
      [KS, 250_000, 101_000, 100_000],
      [EE, 180_000, 101_000, 100_000],
    ] as const
  ).map(([at, registered, cast, valid]) => ({
    election: "2022-governor",
    area: at,
    registered,
    cast,
    rejected: 1_000,
    valid,
    source: "iebc",
  })),
  register: (
    [
      [KEYS.kawangware, 52_000],
      [KEYS.kileleshwa, 48_000],
      [KEYS.kangemi, 40_000],
      [KEYS.parklands, 30_000],
      [KEYS.mwiki, 60_000],
      [KEYS.utawala, 45_000],
    ] as const
  ).map(([at, registered]) => ({ year: 2022, area: at, registered, source: "iebc" })),
  population: (
    [
      [KEYS.kawangware, 66_500],
      [KEYS.kileleshwa, 50_000],
      [KEYS.kangemi, 41_000],
      [KEYS.parklands, 39_000],
      [KEYS.mwiki, 63_000],
      [KEYS.utawala, 44_000],
    ] as const
  ).map(([at, adults]) => ({
    area: at,
    year: 2020,
    total: adults * 2,
    adults,
    youngAdults: adults / 2,
    source: "worldpop",
  })),
  sources: [
    { id: "iebc", title: "Results", publisher: "IEBC", url: null, note: null },
    { id: "worldpop", title: "Population", publisher: "WorldPop", url: null, note: null },
    {
      id: "ob",
      title: "Open Buildings v3",
      publisher: "Google Open Buildings",
      url: null,
      note: null,
    },
  ],
  indicators: (
    [
      [KEYS.kawangware, 4_739],
      [KEYS.kileleshwa, 1_255],
      [KEYS.kangemi, 6_000],
      [KEYS.parklands, 2_500],
    ] as const
  ).map(([at, value]) => ({
    area: at,
    indicator: "buildings_per_km2" as const,
    year: 2023,
    value,
    source: "ob",
  })),
  homeArea: null,
  sides: { "2022-governor": "Bloc A" },
  notes: {},
  profiles: {},
};

const ward = (
  slug: keyof typeof KEYS,
  name: string,
  constituency: string,
  targetVotes: number,
): FindingsWard => ({
  id: `w-${slug}`,
  name,
  slug,
  constituency,
  key: KEYS[slug],
  targetVotes,
});
export const WARDS: FindingsWard[] = [
  ward("kawangware", "Kawangware", "Dagoretti North", 6_000),
  ward("kileleshwa", "Kileleshwa", "Dagoretti North", 5_000),
  ward("kangemi", "Kangemi", "Westlands", 4_000),
  ward("parklands", "Parklands", "Westlands", 3_000),
  ward("mwiki", "Mwiki", "Kasarani", 0),
  ward("utawala", "Utawala", "Embakasi East", 2_000),
];

const doors = (wardId: string, knocked: number) => ({
  wardId,
  knocked,
  rated: 0,
  supporters: 0,
  doorsWeek: 0,
  agentsToday: [],
});

const stop = (
  id: string,
  day: string,
  kind: DiaryEntry["kind"],
  wardId: string | null,
): DiaryEntry => ({
  id,
  day,
  startsAt: null,
  title: `Stop ${id}`,
  kind,
  wardId,
  wardName: null,
  note: null,
});

export const RIVALS: RaceRival[] = (
  [
    ["us", "Our Candidate", true],
    ["r-a", "Challenger A", false],
    ["r-b", "Challenger B", false],
  ] as const
).map(([id, name, isUs], n) => ({
  id,
  name,
  party: null,
  office: null,
  isUs,
  tone: isUs ? "us" : "a",
  sort: n,
  facebook: null,
  x: null,
  tiktok: null,
  searchAs: null,
}));

export const poll = (
  id: string,
  publishedOn: string,
  shares: [string, number][],
  margin: number | null = null,
): RacePoll => ({
  id,
  pollster: "Pollster B",
  fieldworkFrom: null,
  fieldworkTo: null,
  publishedOn,
  sampleSize: 1_200,
  margin,
  sourceUrl: `https://example.test/${id}`,
  shares: shares.map(([rivalId, share]) => ({
    name: RIVALS.find((r) => r.id === rivalId)!.name,
    share,
    rivalId,
  })),
  undecided: null,
  approval: null,
  disapproval: null,
});

/** Every rule fires once on this, today being 13 October 2026. */
export const FULL: FindingsInput = {
  today: "2026-10-13",
  home: "nairobi",
  race: "governor",
  atlas: ATLAS,
  wards: WARDS,
  houses: {
    kawangware: 8_830,
    kileleshwa: 4_200,
    kangemi: 7_000,
    parklands: 3_000,
    mwiki: 9_000,
    utawala: 5_000,
  },
  doors: [
    doors("w-kawangware", 177),
    doors("w-kileleshwa", 1_260),
    doors("w-kangemi", 700),
    doors("w-parklands", 900),
    doors("w-mwiki", 450),
    doors("w-utawala", 2_000),
  ],
  supporters: [
    { wardId: "w-kawangware", supporters: 1_204 },
    { wardId: "w-kileleshwa", supporters: 5_200 },
    { wardId: "w-kangemi", supporters: 3_000 },
    { wardId: "w-parklands", supporters: 3_100 },
    { wardId: "w-utawala", supporters: 2_000 },
  ],
  spend: [
    { wardId: "w-kawangware", kes: 1_000 },
    { wardId: "w-kileleshwa", kes: 20_000 },
    { wardId: "w-kangemi", kes: 10_000 },
    { wardId: "w-parklands", kes: 9_000 },
    { wardId: "w-utawala", kes: 10_000 },
  ],
  issues: [
    { wardId: "w-kawangware", source: "door", issue: "Water", n: 12 },
    { wardId: "w-kawangware", source: "door", issue: "Roads", n: 8 },
    { wardId: "w-kawangware", source: "door", issue: "jobs", n: 11 },
    { wardId: "w-kawangware", source: "messages", issue: "Water and sanitation", n: 6 },
    { wardId: "w-kawangware", source: "messages", issue: "Rents", n: 9 },
    { wardId: "w-kawangware", source: "news", issue: "water", n: 2 },
    { wardId: "w-kawangware", source: "news", issue: "road", n: 4 },
    { wardId: "w-kileleshwa", source: "door", issue: "Security", n: 5 },
    { wardId: "w-kileleshwa", source: "door", issue: "Water", n: 4 },
  ],
  issueWeeks: [
    { week: 0, source: "door", issue: "Floods", n: 6 },
    { week: 0, source: "door", issue: "Water", n: 4 },
    { week: 0, source: "messages", issue: "flooding", n: 4 },
    { week: 0, source: "messages", issue: "Water", n: 2 },
    { week: 0, source: "news", issue: "Floods", n: 1 },
    { week: 2, source: "door", issue: "Floods", n: 2 },
    { week: 2, source: "door", issue: "Water", n: 30 },
    { week: 3, source: "messages", issue: "Floods", n: 1 },
    { week: 3, source: "messages", issue: "Water", n: 24 },
    { week: 4, source: "news", issue: "Floods", n: 10 },
    { week: 4, source: "news", issue: "Water", n: 20 },
  ],
  rivalWeeks: [
    { week: 0, rivalId: null, n: 50 },
    { week: 1, rivalId: null, n: 50 },
    { week: 2, rivalId: null, n: 50 },
    { week: 3, rivalId: null, n: 50 },
    { week: 4, rivalId: null, n: 50 },
    { week: 0, rivalId: "r-a", n: 21 },
    { week: 2, rivalId: "r-a", n: 20 },
    { week: 4, rivalId: "r-a", n: 16 },
    { week: 0, rivalId: "r-b", n: 5 },
  ],
  diary: [
    stop("d1", "2026-10-01", "visit", "w-kangemi"),
    stop("d2", "2026-10-05", "market", "w-parklands"),
    stop("d3", "2026-10-09", "church", "w-kangemi"),
    stop("d4", "2026-10-20", "rally", "w-parklands"),
    stop("d5", "2026-09-20", "visit", "w-kawangware"),
    stop("d6", "2026-10-15", "meeting", "w-kawangware"),
    stop("d7", "2026-10-14", "watch", "w-mwiki"),
    stop("d8", "2026-10-10", "media", null),
  ],
  rivals: RIVALS,
  polls: [
    poll("older", "2026-08-15", [
      ["us", 33],
      ["r-a", 31],
      ["r-b", 20],
    ]),
    poll(
      "newer",
      "2026-10-01",
      [
        ["us", 32],
        ["r-a", 35],
        ["r-b", 19],
      ],
      2.5,
    ),
  ],
};

/** The full input with some of it replaced. */
export const input = (over: Partial<FindingsInput> = {}): FindingsInput => ({ ...FULL, ...over });
```

- [ ] **Step 2: Write the failing test**

Create `tests/findings-core.test.ts`:

```ts
// Checks for the findings engine's shared parts: ordering, places, the first
// of each decision, the address's place, the figures check, number words,
// "top quarter", the seats weighed, the empty lines and the runner. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts

import { findings } from "@/lib/findings";
import {
  count,
  emptyLine,
  finding,
  firstOfEach,
  forPlace,
  orderFindings,
  percent,
  placeParam,
  seatsOf,
  topPart,
  unaccounted,
  votersPlace,
  within,
  type Finding,
} from "@/lib/findings/core";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

const go = { label: "Go", to: "/home" };
const WARD_RULES: string[] = [
  "ward-top-issue",
  "doors-behind",
  "short-of-target",
  "spend-out-of-line",
];
const f = (rule: Finding["rule"], place: string | null, weight: number, about?: string) =>
  finding(rule, place, `${rule} ${place}`, [], go, weight, about ?? place);

// ---------------------------------------------------------------- ordering

eq(
  "by decision, then the rules' order, then weight",
  orderFindings([
    f("poll-move", null, 1),
    f("votes-within-reach", KEYS.mwiki, 5),
    f("doors-behind", KEYS.kawangware, 9),
    f("votes-within-reach", KEYS.kangemi, 7),
    f("ward-top-issue", KEYS.kawangware, 1),
    f("not-visited", KEYS.mwiki, 1),
  ]).map((x) => x.id),
  [
    `not-visited:${KEYS.mwiki}`,
    `ward-top-issue:${KEYS.kawangware}`,
    `votes-within-reach:${KEYS.kangemi}`,
    `votes-within-reach:${KEYS.mwiki}`,
    `doors-behind:${KEYS.kawangware}`,
    "poll-move:campaign",
  ],
);
eq(
  "a finding's decision comes from its rule",
  f("issue-rising", null, 1, "floods").decision,
  "message",
);
eq("a campaign-wide finding's id", f("issue-rising", null, 1, "floods").id, "issue-rising:floods");

// ---------------------------------------------------------------- places

eq(
  "inside a place, itself included; Kenya holds everything",
  [
    within("nairobi/dagoretti-north", KEYS.kawangware),
    within("nairobi/dagoretti-north", "nairobi/dagoretti-north"),
    within("nairobi/dagoretti-north", "nairobi/dagoretti-northx"),
    within("kenya", "nyeri"),
  ],
  [true, true, false, true],
);
{
  const all = [
    f("poll-move", null, 1),
    f("doors-behind", KEYS.kawangware, 1),
    f("doors-behind", KEYS.mwiki, 1),
    f("votes-within-reach", "nairobi/dagoretti-north", 1),
  ];
  eq(
    "a place's findings and the campaign's",
    forPlace(all, "nairobi/dagoretti-north").map((x) => x.id),
    [
      "poll-move:campaign",
      `doors-behind:${KEYS.kawangware}`,
      "votes-within-reach:nairobi/dagoretti-north",
    ],
  );
  eq(
    "a place's findings alone",
    forPlace(all, "nairobi/dagoretti-north", false).map((x) => x.id),
    [`doors-behind:${KEYS.kawangware}`, "votes-within-reach:nairobi/dagoretti-north"],
  );
  eq("no place: everything", forPlace(all, null).length, 4);
  eq(
    "the first of each decision",
    firstOfEach(orderFindings(all)).map((x) => x.id),
    ["votes-within-reach:nairobi/dagoretti-north", "poll-move:campaign"],
  );
}
eq(
  "the address's place: a well-formed key, or none",
  [
    placeParam("nairobi/westlands"),
    placeParam("Nairobi/../x"),
    placeParam(42),
    placeParam(undefined),
  ],
  ["nairobi/westlands", null, null, null],
);

{
  const wards = [
    { id: "w-kawangware", slug: "kawangware", constituency: "Dagoretti North" },
    { id: "w-new", slug: "new-ward", constituency: "Dagoretti North" },
    { id: "w-x", slug: "x", constituency: "Nowhere" },
  ];
  const keys = { "w-kawangware": KEYS.kawangware };
  eq(
    "a Voters area in the atlas: the whole map, a ward, its constituency, or nothing known",
    [
      votersPlace({ level: "county" }, wards, keys),
      votersPlace({ level: "ward", slug: "kawangware" }, wards, keys),
      votersPlace({ level: "constituency", name: "Dagoretti North" }, wards, keys),
      votersPlace({ level: "ward", slug: "new-ward" }, wards, keys),
      votersPlace({ level: "constituency", name: "Nowhere" }, wards, keys),
    ].map((x) => (x === undefined ? "not in the atlas" : x)),
    [null, KEYS.kawangware, "nairobi/dagoretti-north", "not in the atlas", "not in the atlas"],
  );
}

// ---------------------------------------------------------------- the figures check

eq(
  "every number accounted for",
  unaccounted({
    line: "Kawangware: under 1% of its 8,830 houses knocked in 30 days.",
    figures: [
      { label: "a", value: 0.001, text: "under 1%", source: "s", period: "p" },
      { label: "b", value: 8830, text: "8,830", source: "s", period: "p" },
      { label: "c", value: 30, text: "30", source: "s", period: "p" },
    ],
  }),
  [],
);
eq(
  "a number no figure prints",
  unaccounted({
    line: "Kawangware: 2% of its 8,830 houses.",
    figures: [{ label: "b", value: 8830, text: "8,830", source: "s", period: "p" }],
  }),
  ["2"],
);

// ---------------------------------------------------------------- words and parts

eq("counts", [count(8830), count(0), count(1_204)], ["8,830", "0", "1,204"]);
eq(
  "percents",
  [percent(0.3846), percent(0.001), percent(0), percent(1)],
  ["38%", "under 1%", "0%", "100%"],
);
eq(
  "a quarter of six rounds up to two; ties by id",
  topPart([3, 1, 2, 2, 5, 4], (x) => x, 0.25, String),
  [5, 4],
);
eq(
  "a quarter of one is one",
  topPart([7], (x) => x, 0.25, String),
  [7],
);
eq(
  "a quarter of none is none",
  topPart([], (x: number) => x, 0.25, String),
  [],
);

eq("the seats weighed: a county's constituencies", seatsOf({ atlas: ATLAS, home: "nairobi" }), [
  "nairobi/dagoretti-north",
  "nairobi/westlands",
  "nairobi/kasarani",
  "nairobi/embakasi-east",
]);
eq("an MP's seat is itself", seatsOf({ atlas: ATLAS, home: "nairobi/kasarani" }), [
  "nairobi/kasarani",
]);
eq("Kenya's seats are its counties", seatsOf({ atlas: ATLAS, home: "kenya" }), ["nairobi"]);

eq(
  "what an empty group says",
  [
    emptyLine("time", { waiting: [], sideSet: false }),
    emptyLine("message", { waiting: ["ward_issues"], sideSet: true }),
    emptyLine("field", { waiting: [], sideSet: true }),
    emptyLine("rivals", { waiting: [], sideSet: true }),
  ],
  [
    "Set your side in Elections first: the diary is weighed against where the votes are.",
    "Waiting for the database update: the issues raised by ward come with it.",
    "Nothing stands out in the field figures right now.",
    "No poll moves or rivals rising in the news in the last 30 days.",
  ],
);

// ---------------------------------------------------------------- the runner

{
  const logged: string[] = [];
  const out = findings(
    FULL,
    {
      "poll-move": () => {
        throw new Error("bad poll");
      },
      "doors-behind": () => [f("doors-behind", KEYS.kawangware, 1)],
    },
    (message) => logged.push(message),
  );
  eq(
    "a rule that throws is left out and logged",
    [out.map((x) => x.id), logged],
    [[`doors-behind:${KEYS.kawangware}`], ["The poll-move rule failed"]],
  );
}
{
  const logged: string[] = [];
  const out = findings(input({ wards: [] }), undefined, (message) => logged.push(message));
  eq(
    "no campaign wards: the ward rules are quiet and nothing throws",
    [logged, out.filter((x) => WARD_RULES.includes(x.rule)).length],
    [[], 0],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts`
Expected: it fails because it cannot find `@/lib/findings` or `@/lib/findings/core`.

- [ ] **Step 4: Write the core**

Create `src/lib/findings/core.ts`:

```ts
// The findings engine's shared parts: what a finding is, the rules in the
// order the screens show them, the thresholds, how findings are ordered and
// filtered by place, and the check that every number in a line is one of its
// figures. Pure. See docs/superpowers/specs/2026-10-13-findings-engine-design.md.

import type { Race } from "@/lib/atlas";
import type { AtlasData } from "@/lib/atlas-view";
import type { DiaryEntry } from "@/lib/diary";
import { validateElectionsSearch } from "@/lib/elections-view";
import type { WardDoors } from "@/lib/houses";
import type { RacePoll, RaceRival } from "@/lib/race-data";
import type { Area } from "@/lib/voters-view";

/** Who reads findings: the whole team but field agents. */
export const FINDINGS_READERS: readonly string[] = ["super", "candidate", "manager", "organiser"];

export type Decision = "time" | "message" | "field" | "rivals";
export const DECISIONS: Decision[] = ["time", "message", "field", "rivals"];
export const DECISION_NAMES: Record<Decision, string> = {
  time: "Candidate's time",
  message: "What to say where",
  field: "Field work and money",
  rivals: "Rivals and polls",
};

/** Every rule, in the order the screens show them. */
export const RULES = [
  { id: "not-visited", decision: "time" },
  { id: "time-in-safe-seats", decision: "time" },
  { id: "ward-top-issue", decision: "message" },
  { id: "issue-rising", decision: "message" },
  { id: "one-seat-different-places", decision: "message" },
  { id: "votes-within-reach", decision: "field" },
  { id: "doors-behind", decision: "field" },
  { id: "short-of-target", decision: "field" },
  { id: "unregistered-adults", decision: "field" },
  { id: "spend-out-of-line", decision: "field" },
  { id: "poll-move", decision: "rivals" },
  { id: "rival-in-news", decision: "rivals" },
] as const satisfies readonly { id: string; decision: Decision }[];
export type RuleId = (typeof RULES)[number]["id"];

/** Every threshold the rules use, in one place. Shares are 0 to 1. */
export const LIMITS = {
  /** Not visited: the diary looked at, back and ahead, in days. */
  daysBack: 60,
  daysAhead: 14,
  /** Time in safe seats: stops in the last 30 days and the next 14. */
  safeDaysBack: 30,
  safeMinStops: 6,
  safeStopShare: 0.5,
  safeReachShare: 0.25,
  /** Top issue in a ward: issues raised in 30 days, and the top issue's share. */
  wardIssuesMin: 10,
  wardIssueShare: 0.3,
  /** Issue rising: a source counts with this many this week, or over the previous four. */
  risingWeekMin: 5,
  risingBeforeMin: 20,
  risingPoints: 0.1,
  risingRaisedMin: 10,
  /** One seat, different places: the densest ward over the least dense. */
  densityRatio: 3,
  /** Doors behind: below this many houses knocked, one campaign finding instead. */
  doorsCampaignMin: 100,
  /** Unregistered adults: either is enough. */
  unregisteredMin: 5000,
  unregisteredShare: 0.2,
  /** Spend out of line: the campaign's stipends in 30 days, and the ward's share against its voters'. */
  spendMinKes: 10000,
  spendOfVoterShare: 0.5,
  /** Rival in the news: mentions this week, and the rise in share. */
  rivalMentionsMin: 20,
  rivalPoints: 0.1,
} as const;

/** Shares are floats: a share of exactly a threshold must not miss it by rounding. */
export const EPS = 1e-9;

export type Figure = {
  label: string;
  value: number;
  /** Exactly as the line prints it. */
  text: string;
  source: string;
  period: string;
};
export type Next = { label: string; to: string; search?: Record<string, string>; hash?: string };
export type Finding = {
  /** Stable: the rule and the place (or what it is about). Part 3 cites findings by it. */
  id: string;
  rule: RuleId;
  decision: Decision;
  /** An atlas key, or null for the whole campaign. */
  place: string | null;
  line: string;
  figures: Figure[];
  next: Next;
  /** The rule's own measure: findings of one rule are ordered by it, largest first. */
  weight: number;
};

/** The database counts the engine reads, by the function that returns them. */
export type Count =
  | "house_doors"
  | "ward_issues"
  | "issue_weeks"
  | "rival_mention_weeks"
  | "ward_spend"
  | "ward_supporters";

export type IssueSource = "door" | "messages" | "news";
export const ISSUE_SOURCES: IssueSource[] = ["door", "messages", "news"];

/** A campaign ward, with its place in the atlas (null when the atlas doesn't hold it). */
export type FindingsWard = {
  id: string;
  name: string;
  slug: string;
  constituency: string;
  key: string | null;
  targetVotes: number | null;
};
export type WardIssue = { wardId: string; source: IssueSource; issue: string; n: number };
/** Week 0 is the last 7 days; week 1 the 7 before, and so on. */
export type IssueWeek = { week: number; source: IssueSource; issue: string; n: number };
/** A null rival is every news and social mention that week. */
export type RivalWeek = { week: number; rivalId: string | null; n: number };

/** Everything the rules read. A null count couldn't be read (its function isn't in yet). */
export type FindingsInput = {
  /** YYYY-MM-DD, Nairobi's. */
  today: string;
  home: string;
  race: Race;
  atlas: AtlasData;
  wards: FindingsWard[];
  /** Houses per ward slug, from the campaign's house file; null without one. */
  houses: Record<string, number> | null;
  doors: WardDoors[] | null;
  supporters: { wardId: string; supporters: number }[] | null;
  spend: { wardId: string; kes: number }[] | null;
  issues: WardIssue[] | null;
  issueWeeks: IssueWeek[] | null;
  rivalWeeks: RivalWeek[] | null;
  /** The diary from 60 days back to 14 ahead. */
  diary: DiaryEntry[];
  rivals: RaceRival[];
  polls: RacePoll[];
};

export type FindingsResult = {
  asOf: string;
  findings: Finding[];
  /** Counts that couldn't be read: their rules stay quiet. */
  waiting: Count[];
  /** Whether the campaign's side in its 2022 race is set. */
  sideSet: boolean;
  /** Each campaign ward's place in the atlas, by ward id. */
  wardKeys: Record<string, string>;
};

const ORDER = new Map<RuleId, number>(RULES.map((r, n) => [r.id, n]));
const DECISION_OF = new Map<RuleId, Decision>(RULES.map((r) => [r.id, r.decision]));

export function finding(
  rule: RuleId,
  place: string | null,
  line: string,
  figures: Figure[],
  next: Next,
  weight: number,
  about: string | null = place,
): Finding {
  return {
    id: `${rule}:${about ?? "campaign"}`,
    rule,
    decision: DECISION_OF.get(rule)!,
    place,
    line,
    figures,
    next,
    weight,
  };
}

/** Grouped by decision, then in the rules' order, then by weight, largest first; ties by id. */
export function orderFindings(fs: Finding[]): Finding[] {
  return [...fs].sort(
    (a, b) =>
      DECISIONS.indexOf(a.decision) - DECISIONS.indexOf(b.decision) ||
      ORDER.get(a.rule)! - ORDER.get(b.rule)! ||
      b.weight - a.weight ||
      a.id.localeCompare(b.id),
  );
}

/** `key` is `place` or inside it; Kenya holds everything. */
export const within = (place: string, key: string): boolean =>
  place === "kenya" || key === place || key.startsWith(`${place}/`);

/** The findings about `place` and the places inside it, and, unless left out, the campaign-wide ones. */
export function forPlace(fs: Finding[], place: string | null, campaignWide = true): Finding[] {
  if (place === null) return fs;
  return fs.filter((f) => (f.place === null ? campaignWide : within(place, f.place)));
}

/** The first finding of each decision, in the decisions' order. */
export function firstOfEach(fs: Finding[]): Finding[] {
  return DECISIONS.flatMap((d) => fs.find((f) => f.decision === d) ?? []);
}

/**
 * A Voters area's place in the atlas: a ward's key, a constituency's (from
 * any of its wards'), null for the whole map; undefined when the atlas
 * doesn't hold it, so nothing is shown rather than everything.
 */
export function votersPlace(
  area: Area,
  wards: { id: string; slug: string; constituency: string }[],
  wardKeys: Record<string, string>,
): string | null | undefined {
  if (area.level === "county") return null;
  if (area.level === "ward") {
    const w = wards.find((x) => x.slug === area.slug);
    return (w && wardKeys[w.id]) || undefined;
  }
  const key = wards
    .filter((x) => x.constituency === area.name)
    .map((x) => wardKeys[x.id])
    .find(Boolean);
  return key ? key.split("/").slice(0, 2).join("/") : undefined;
}

/** A place the address names, when it is well formed; anything else is no place. */
export const placeParam = (raw: unknown): string | null =>
  validateElectionsSearch({ area: raw }).area ?? null;

/** The digits in a line that no figure accounts for: each figure's text is taken out, longest first. */
export function unaccounted(f: Pick<Finding, "line" | "figures">): string[] {
  let rest = f.line;
  for (const fig of [...f.figures].sort((a, b) => b.text.length - a.text.length))
    rest = rest.split(fig.text).join(" ");
  return rest.match(/[0-9][0-9,.]*/g) ?? [];
}

/** "8,830". */
export const count = (n: number): string => new Intl.NumberFormat("en-KE").format(n);
/** "38%"; a share too small to round up reads "under 1%". */
export const percent = (x: number): string =>
  x > 0 && x < 0.005 ? "under 1%" : `${Math.round(x * 100)}%`;

/**
 * The first part of `xs` by `by`, largest first: "top quarter" is 0.25 and
 * rounds up, so there is always at least one. Ties go by `id`.
 */
export function topPart<T>(xs: T[], by: (x: T) => number, part: number, id: (x: T) => string): T[] {
  return [...xs]
    .sort((a, b) => by(b) - by(a) || id(a).localeCompare(id(b)))
    .slice(0, Math.ceil(xs.length * part));
}

/** The home area's level in the atlas. */
export const levelOf = (i: Pick<FindingsInput, "atlas" | "home">): string | undefined =>
  i.atlas.areas.find((a) => a.key === i.home)?.level;

/**
 * The places votes are weighed in, as Home's Moves card did: an MP's
 * constituency itself; otherwise the home area's parts (a county's
 * constituencies, Kenya's counties).
 */
export function seatsOf(i: Pick<FindingsInput, "atlas" | "home">): string[] {
  return levelOf(i) === "constituency"
    ? [i.home]
    : i.atlas.areas.filter((a) => a.parent === i.home).map((a) => a.key);
}

/** What an empty group says instead. */
export function emptyLine(d: Decision, r: Pick<FindingsResult, "waiting" | "sideSet">): string {
  if (d === "time")
    return r.sideSet
      ? "Nothing stands out in the diary right now."
      : "Set your side in Elections first: the diary is weighed against where the votes are.";
  if (d === "message")
    return r.waiting.includes("ward_issues")
      ? "Waiting for the database update: the issues raised by ward come with it."
      : "Not enough raised yet to say what stands out.";
  if (d === "field")
    return r.sideSet
      ? "Nothing stands out in the field figures right now."
      : "Set your side in Elections first, and the places where votes can move show here.";
  return "No poll moves or rivals rising in the news in the last 30 days.";
}
```

Create `src/lib/findings/index.ts`. The registry starts empty; Tasks 3–6 add the rules:

```ts
// Every finding rule, run over one input in the order the screens show them.
// A rule that throws is left out and logged; the others still run. Pure.

import {
  orderFindings,
  RULES,
  type Finding,
  type FindingsInput,
  type RuleId,
} from "@/lib/findings/core";

export type Rule = (i: FindingsInput) => Finding[];

/** Each rule's function; a rule without one is skipped. */
export const RULE_FNS: Partial<Record<RuleId, Rule>> = {};

export function findings(
  i: FindingsInput,
  rules: Partial<Record<RuleId, Rule>> = RULE_FNS,
  log: (message: string, error: unknown) => void = console.error,
): Finding[] {
  const out: Finding[] = [];
  for (const r of RULES) {
    const rule = rules[r.id];
    if (!rule) continue;
    try {
      out.push(...rule(i));
    } catch (e) {
      log(`The ${r.id} rule failed`, e);
    }
  }
  return orderFindings(out);
}
```

- [ ] **Step 5: Run the test**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts`
Expected: `23 passed, 0 failed`

- [ ] **Step 6: Type-check, format and commit**

Run: `npx tsc --noEmit -p . && npx prettier --check src/lib/findings tests/findings-fixture.ts tests/findings-core.test.ts`
Expected: no output from `tsc`; Prettier reports every file formatted.

```bash
git add src/lib/findings tests/findings-fixture.ts tests/findings-core.test.ts
git commit -m "$(cat <<'EOF'
Findings: what a finding is, their order and places, the figures check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The rules for the candidate's time

**Files:**
- Create: `src/lib/findings/time.ts`
- Create: `tests/findings-time.test.ts`
- Modify: `src/lib/findings/index.ts` (register the two rules)

**Interfaces:**
- Consumes: from core, `count`, `finding`, `levelOf`, `LIMITS`, `percent`, `seatsOf`, `topPart`, `within`, and the types; `electionOf`, `figuresFor`, `AreaFigures` (`@/lib/atlas-view`); `addDays` (`@/lib/diary`).
- Produces: `notVisited(i: FindingsInput): Finding[]` (rule 1) and `timeInSafeSeats(i: FindingsInput): Finding[]` (rule 2). Rule 1's next step is `{ label: "Plan a visit", to: "/diary", search: { add: <ward id> } }`, which Task 10's diary reads.

- [ ] **Step 1: Write the failing test**

Create `tests/findings-time.test.ts`:

```ts
// Checks for the candidate's-time rules: a place that matters with no stop in
// the diary, and stops spent in seats already ours. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-time.test.ts

import { unaccounted } from "@/lib/findings/core";
import { notVisited, timeInSafeSeats } from "@/lib/findings/time";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

const stop = (day: string, wardId: string | null, kind: "visit" | "watch" = "visit") => ({
  id: `s-${day}-${wardId}`,
  day,
  startsAt: null,
  title: "A stop",
  kind,
  wardId,
  wardName: null,
  note: null,
});
const NO_SIDE = { ...ATLAS, sides: {} };

// ---------------------------------------------------------------- 1. not visited

{
  const [k, ...rest] = notVisited(FULL);
  eq(
    "a governor: the top quarter of the seats to win, with no stop",
    [k?.id, rest.length],
    ["not-visited:nairobi/kasarani", 0],
  );
  eq(
    "its line",
    k?.line,
    "Kasarani: no diary stop in the last 60 days and none planned, with about 26,603 votes within reach.",
  );
  eq("plan a visit to its biggest ward", k?.next, {
    label: "Plan a visit",
    to: "/diary",
    search: { add: "w-mwiki" },
  });
  eq(
    "weighed by votes within reach",
    [k?.weight, k?.decision, k?.place],
    [26_603, "time", "nairobi/kasarani"],
  );
  eq("every number is a figure", k ? unaccounted(k) : null, []);
}
eq(
  "a stop in the seat in the window: visited",
  notVisited(input({ diary: [stop("2026-10-20", "w-mwiki")] })),
  [],
);
eq(
  "'To watch', no ward, 61 days ago or 15 ahead don't count",
  notVisited(
    input({
      diary: [
        stop("2026-10-14", "w-mwiki", "watch"),
        stop("2026-10-14", null),
        stop("2026-08-13", "w-mwiki"),
        stop("2026-10-28", "w-mwiki"),
      ],
    }),
  ).map((x) => x.id),
  ["not-visited:nairobi/kasarani"],
);
eq("no side, no seats to weigh", notVisited(input({ atlas: NO_SIDE })), []);
eq(
  "a presidential race with no county results: quiet",
  notVisited(input({ home: "kenya", race: "president" })),
  [],
);
{
  const mp = input({
    home: "nairobi/dagoretti-north",
    wards: FULL.wards.filter((w) => w.constituency === "Dagoretti North"),
    diary: [],
  });
  const out = notVisited(mp);
  eq(
    "an MP: the bigger half of the wards, by registered voters",
    out.map((x) => [x.id, x.line]),
    [
      [
        `not-visited:${KEYS.kawangware}`,
        "Kawangware: no diary stop in the last 60 days and none planned, with 52,000 registered voters.",
      ],
    ],
  );
  eq(
    "an MP's ward visited",
    notVisited({ ...mp, diary: [stop("2026-10-01", "w-kawangware")] }),
    [],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
}

// ---------------------------------------------------------------- 2. time in safe seats

{
  const out = timeInSafeSeats(FULL);
  eq(
    "most stops in seats already ours",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "time-in-safe-seats:campaign",
        null,
        "4 of your 6 stops (last 30 days and next 14) are in Hold or Lean ours seats, which hold 11% of the votes within reach.",
      ],
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
  eq("next: the diary", out[0]?.next, { label: "Open the diary", to: "/diary" });
}
eq(
  "fewer than six stops: quiet",
  timeInSafeSeats(input({ diary: FULL.diary.filter((e) => e.id !== "d4") })),
  [],
);
eq(
  "exactly half in safe seats still counts",
  timeInSafeSeats(
    input({
      diary: [...FULL.diary, stop("2026-10-11", "w-mwiki"), stop("2026-10-12", "w-utawala")],
    }),
  ).map((x) => x.line),
  [
    "4 of your 8 stops (last 30 days and next 14) are in Hold or Lean ours seats, which hold 11% of the votes within reach.",
  ],
);
eq(
  "under half in safe seats: quiet",
  timeInSafeSeats(
    input({
      diary: [
        ...FULL.diary,
        stop("2026-10-11", "w-mwiki"),
        stop("2026-10-12", "w-utawala"),
        stop("2026-10-16", "w-kileleshwa"),
      ],
    }),
  ),
  [],
);
eq("not for an MP", timeInSafeSeats(input({ home: "nairobi/westlands" })), []);
eq("no side: quiet", timeInSafeSeats(input({ atlas: NO_SIDE })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-time.test.ts`
Expected: it fails because it cannot find `@/lib/findings/time`.

- [ ] **Step 3: Write the rules**

Create `src/lib/findings/time.ts`:

```ts
// The rules for the candidate's time: places that matter with no stop in the
// diary, and stops spent where the votes are already ours. Pure.

import { electionOf, figuresFor, type AreaFigures } from "@/lib/atlas-view";
import { addDays } from "@/lib/diary";
import {
  count,
  finding,
  levelOf,
  LIMITS,
  percent,
  seatsOf,
  topPart,
  within,
  type Figure,
  type Finding,
  type FindingsInput,
  type FindingsWard,
} from "@/lib/findings/core";

const TO_WIN = ["persuade", "cut", "mobilise"];
const SAFE = ["hold", "lean-ours"];

/** The atlas keys of the diary's stops from `from` to `to`: entries with a ward, "To watch" aside. */
function stopKeys(i: FindingsInput, from: string, to: string): string[] {
  const keyOf = new Map(i.wards.map((w) => [w.id, w.key]));
  return i.diary
    .filter((e) => e.kind !== "watch" && e.wardId && e.day >= from && e.day <= to)
    .flatMap((e) => keyOf.get(e.wardId!) ?? []);
}

/** The seats with a 2022 count for the campaign's race, once its side is set. */
function seatFigures(i: FindingsInput): AreaFigures[] {
  if (!i.atlas.sides[electionOf(i.race, 2022)]) return [];
  return seatsOf(i)
    .map((k) => figuresFor(i.atlas, k, i.race, 2022))
    .filter((f) => f.reach !== null && f.todo !== null && f.todo.todo !== "no-side");
}

/** The campaign's ward inside `place` with the most registered voters. */
function biggestWard(i: FindingsInput, place: string): FindingsWard | null {
  const inside = i.wards.flatMap((w) => {
    const reg =
      w.key && within(place, w.key) ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
    return reg ? [{ w, reg }] : [];
  });
  return (
    topPart(
      inside,
      (x) => x.reg,
      1,
      (x) => x.w.id,
    )[0]?.w ?? null
  );
}

const looked = (i: FindingsInput): Figure => ({
  label: "Days of the diary looked back",
  value: LIMITS.daysBack,
  text: String(LIMITS.daysBack),
  source: "Your diary",
  period: `${LIMITS.daysBack} days back and ${LIMITS.daysAhead} ahead of ${i.today}`,
});

const visit = (w: FindingsWard | null) =>
  w
    ? { label: "Plan a visit", to: "/diary", search: { add: w.id } }
    : { label: "Open the diary", to: "/diary" };

/** 1. A place that matters with no stop in the last 60 days and none in the next 14. */
export function notVisited(i: FindingsInput): Finding[] {
  const stops = stopKeys(i, addDays(i.today, -LIMITS.daysBack), addDays(i.today, LIMITS.daysAhead));
  const visited = (place: string) => stops.some((k) => within(place, k));
  if (levelOf(i) === "constituency") {
    // An MP: the bigger half of the campaign's wards, by registered voters.
    const wards = i.wards.flatMap((w) => {
      const reg = w.key ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
      return w.key && reg ? [{ w, key: w.key, reg }] : [];
    });
    return topPart(
      wards,
      (x) => x.reg,
      0.5,
      (x) => x.key,
    )
      .filter((x) => !visited(x.key))
      .map((x) =>
        finding(
          "not-visited",
          x.key,
          `${x.w.name}: no diary stop in the last ${LIMITS.daysBack} days and none planned, with ${count(x.reg)} registered voters.`,
          [
            looked(i),
            {
              label: "Registered voters",
              value: x.reg,
              text: count(x.reg),
              source: "IEBC",
              period: "2022",
            },
          ],
          visit(x.w),
          x.reg,
        ),
      );
  }
  // Governor or president: the top quarter of the seats to win, by votes within reach.
  const seats = seatFigures(i).filter((f) => TO_WIN.includes(f.todo!.todo));
  return topPart(
    seats,
    (f) => f.reach!.total,
    0.25,
    (f) => f.key,
  )
    .filter((f) => !visited(f.key))
    .map((f) => {
      const reach = f.reach!;
      return finding(
        "not-visited",
        f.key,
        `${f.name}: no diary stop in the last ${LIMITS.daysBack} days and none planned, with ${reach.partial ? "at least" : "about"} ${count(reach.total)} votes within reach.`,
        [
          looked(i),
          {
            label: "Votes within reach",
            value: reach.total,
            text: count(reach.total),
            source: "Worked out from IEBC results",
            period: "2022",
          },
        ],
        visit(biggestWard(i, f.key)),
        reach.total,
      );
    });
}

/** 2. Most of the candidate's stops in seats already ours, which hold few of the votes within reach. */
export function timeInSafeSeats(i: FindingsInput): Finding[] {
  if (levelOf(i) === "constituency") return [];
  const seats = seatFigures(i);
  const stops = stopKeys(
    i,
    addDays(i.today, -LIMITS.safeDaysBack),
    addDays(i.today, LIMITS.daysAhead),
  ).flatMap((k) => seats.find((s) => within(s.key, k)) ?? []);
  if (stops.length < LIMITS.safeMinStops) return [];
  const safe = (f: AreaFigures) => SAFE.includes(f.todo!.todo);
  const inSafe = stops.filter(safe).length;
  const reach = seats.reduce((t, f) => t + f.reach!.total, 0);
  const reachSafe = seats.filter(safe).reduce((t, f) => t + f.reach!.total, 0);
  const stopShare = inSafe / stops.length;
  const reachShare = reach ? reachSafe / reach : 0;
  if (stopShare < LIMITS.safeStopShare || reachShare >= LIMITS.safeReachShare) return [];
  const period = `${LIMITS.safeDaysBack} days back and ${LIMITS.daysAhead} ahead of ${i.today}`;
  return [
    finding(
      "time-in-safe-seats",
      null,
      `${inSafe} of your ${stops.length} stops (last ${LIMITS.safeDaysBack} days and next ${LIMITS.daysAhead}) are in Hold or Lean ours seats, which hold ${percent(reachShare)} of the votes within reach.`,
      [
        {
          label: "Stops in Hold or Lean ours seats",
          value: inSafe,
          text: String(inSafe),
          source: "Your diary",
          period,
        },
        {
          label: "Stops in all",
          value: stops.length,
          text: String(stops.length),
          source: "Your diary",
          period,
        },
        {
          label: "Days back",
          value: LIMITS.safeDaysBack,
          text: String(LIMITS.safeDaysBack),
          source: "Your diary",
          period,
        },
        {
          label: "Days ahead",
          value: LIMITS.daysAhead,
          text: String(LIMITS.daysAhead),
          source: "Your diary",
          period,
        },
        {
          label: "Their share of the votes within reach",
          value: reachShare,
          text: percent(reachShare),
          source: "Worked out from IEBC results",
          period: "2022",
        },
      ],
      { label: "Open the diary", to: "/diary" },
      stopShare,
    ),
  ];
}
```

- [ ] **Step 4: Register them**

In `src/lib/findings/index.ts`, add after the import from `@/lib/findings/core`:

```ts
import { notVisited, timeInSafeSeats } from "@/lib/findings/time";
```

and replace `export const RULE_FNS: Partial<Record<RuleId, Rule>> = {};` with:

```ts
export const RULE_FNS: Partial<Record<RuleId, Rule>> = {
  "not-visited": notVisited,
  "time-in-safe-seats": timeInSafeSeats,
};
```

- [ ] **Step 5: Run the tests**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-time.test.ts && npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts`
Expected: `20 passed, 0 failed`, then `23 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/findings/time.ts src/lib/findings/index.ts tests/findings-time.test.ts
git commit -m "$(cat <<'EOF'
Findings: where the candidate hasn't been, and time in safe seats

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The rules for what to say where

**Files:**
- Create: `src/lib/findings/message.ts`
- Create: `tests/findings-message.test.ts`
- Modify: `src/lib/findings/index.ts`

**Interfaces:**
- Consumes: `measuredAt` (`@/lib/area-indicators`); `issueKey`, `issueLabel` (`@/lib/top-of-mind`); from core, `count`, `EPS`, `finding`, `ISSUE_SOURCES`, `levelOf`, `LIMITS`, `percent`, `within`, and the types.
- Produces: `wardTopIssue` (rule 3), `issueRising` (rule 4), `oneSeatDifferentPlaces` (rule 5), each `(i: FindingsInput) => Finding[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/findings-message.test.ts`:

```ts
// Checks for the what-to-say-where rules: a ward's top issue, an issue rising
// this week, and a seat whose wards live too differently for one message.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-message.test.ts

import { unaccounted } from "@/lib/findings/core";
import { issueRising, oneSeatDifferentPlaces, wardTopIssue } from "@/lib/findings/message";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

// ---------------------------------------------------------------- 3. top issue in a ward

{
  const out = wardTopIssue(FULL);
  eq(
    "a ward with enough issues and one well ahead",
    out.map((x) => [x.id, x.line]),
    [
      [
        `ward-top-issue:${KEYS.kawangware}`,
        "Kawangware: water is 38% of the 52 issues raised in 30 days (door 31, messages 15, news and social 6).",
      ],
    ],
  );
  eq("write to the ward", out[0]?.next, {
    label: "Write to this ward",
    to: "/broadcast",
    search: { wards: "w-kawangware" },
  });
  eq("weighed by the issue's count", out[0]?.weight, 20);
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "names that mean the same issue are one issue; non-issues drop",
  wardTopIssue(
    input({
      issues: [
        { wardId: "w-kileleshwa", source: "door", issue: "Water and sanitation", n: 4 },
        { wardId: "w-kileleshwa", source: "messages", issue: "sewer", n: 3 },
        { wardId: "w-kileleshwa", source: "news", issue: "water", n: 3 },
        { wardId: "w-kileleshwa", source: "door", issue: "general", n: 50 },
        { wardId: "w-kileleshwa", source: "door", issue: " ", n: 50 },
      ],
    }),
  ).map((x) => x.line),
  [
    "Kileleshwa: water is 100% of the 10 issues raised in 30 days (door 4, messages 3, news and social 3).",
  ],
);
eq(
  "fewer than 10 raised: quiet",
  wardTopIssue(input({ issues: FULL.issues!.filter((r) => r.wardId === "w-kileleshwa") })),
  [],
);
eq(
  "no issue at 30%: quiet",
  wardTopIssue(
    input({
      issues: ["a", "b", "c", "d"].map((issue) => ({
        wardId: "w-kangemi",
        source: "door" as const,
        issue,
        n: 3,
      })),
    }),
  ),
  [],
);
eq("before the update: quiet", wardTopIssue(input({ issues: null })), []);

// ---------------------------------------------------------------- 4. issue rising

{
  const out = issueRising(FULL);
  eq(
    "an issue well up on the previous four weeks",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "issue-rising:floods",
        null,
        "Floods rose to 63% of what was raised this week, from 15% over the previous four weeks.",
      ],
    ],
  );
  eq("see what's said", out[0]?.next, {
    label: "See what's said",
    to: "/listening",
    search: { issue: "floods" },
  });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "raised fewer than 10 times this week: quiet",
  issueRising(input({ issueWeeks: FULL.issueWeeks!.filter((r) => r.issue !== "flooding") })),
  [],
);
eq(
  "no earlier weeks to compare with: quiet",
  issueRising(input({ issueWeeks: FULL.issueWeeks!.filter((r) => r.week === 0) })),
  [],
);
eq("before the update: quiet", issueRising(input({ issueWeeks: null })), []);

// ---------------------------------------------------------------- 5. one seat, different places

{
  const out = oneSeatDifferentPlaces(FULL);
  eq(
    "a seat whose wards differ three times over",
    out.map((x) => [x.id, x.line]),
    [
      [
        "one-seat-different-places:nairobi/dagoretti-north",
        "Dagoretti North's wards live differently: Kawangware has 4,739 buildings per km², Kileleshwa 1,255. One message won't fit both.",
      ],
    ],
  );
  eq(
    "its figures say where they're from",
    out[0]?.figures.map((x) => [x.text, x.source, x.period]),
    [
      ["4,739", "Google Open Buildings", "2023"],
      ["1,255", "Google Open Buildings", "2023"],
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "a ward not measured: quiet",
  oneSeatDifferentPlaces(
    input({
      atlas: { ...ATLAS, indicators: ATLAS.indicators.filter((x) => x.area !== KEYS.kileleshwa) },
    }),
  ),
  [],
);
eq(
  "an MP's own seat",
  oneSeatDifferentPlaces(input({ home: "nairobi/dagoretti-north" })).length,
  1,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-message.test.ts`
Expected: it fails because it cannot find `@/lib/findings/message`.

- [ ] **Step 3: Write the rules**

Create `src/lib/findings/message.ts`:

```ts
// The rules for what to say where: the issue a ward raises most, an issue
// rising this week, and a seat whose wards live too differently for one
// message. Pure.

import { measuredAt } from "@/lib/area-indicators";
import {
  count,
  EPS,
  finding,
  ISSUE_SOURCES,
  levelOf,
  LIMITS,
  percent,
  within,
  type Figure,
  type Finding,
  type FindingsInput,
  type IssueSource,
} from "@/lib/findings/core";
import { issueKey, issueLabel } from "@/lib/top-of-mind";

const SOURCE_WORDS: Record<IssueSource, string> = {
  door: "door",
  messages: "messages",
  news: "news and social",
};
const SOURCE_NAMES: Record<IssueSource, string> = {
  door: "Conversations at the door",
  messages: "Messages to your campaign",
  news: "News and social mentions",
};

/** 3. The issue a ward raises most, when it is a big share of enough issues raised. */
export function wardTopIssue(i: FindingsInput): Finding[] {
  if (!i.issues) return [];
  const period = `30 days to ${i.today}`;
  return i.wards.flatMap((w) => {
    if (!w.key) return [];
    const bySource: Record<IssueSource, number> = { door: 0, messages: 0, news: 0 };
    const byIssue = new Map<string, number>();
    for (const r of i.issues!) {
      const k = r.wardId === w.id ? issueKey(r.issue) : null;
      if (!k) continue;
      bySource[r.source] += r.n;
      byIssue.set(k, (byIssue.get(k) ?? 0) + r.n);
    }
    const total = bySource.door + bySource.messages + bySource.news;
    if (total < LIMITS.wardIssuesMin) return [];
    const [top, n] = [...byIssue.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]!;
    if (n / total < LIMITS.wardIssueShare - EPS) return [];
    const used = ISSUE_SOURCES.filter((s) => bySource[s] > 0);
    const figures: Figure[] = [
      {
        label: `Share that is ${top}`,
        value: n / total,
        text: percent(n / total),
        source: "Issues raised to your campaign",
        period,
      },
      {
        label: "Issues raised",
        value: total,
        text: count(total),
        source: "Issues raised to your campaign",
        period,
      },
      ...used.map((s) => ({
        label: SOURCE_NAMES[s],
        value: bySource[s],
        text: count(bySource[s]),
        source: SOURCE_NAMES[s],
        period,
      })),
    ];
    return [
      finding(
        "ward-top-issue",
        w.key,
        `${w.name}: ${top} is ${percent(n / total)} of the ${count(total)} issues raised in 30 days (${used.map((s) => `${SOURCE_WORDS[s]} ${count(bySource[s])}`).join(", ")}).`,
        [
          ...figures,
          {
            label: "Days",
            value: 30,
            text: "30",
            source: "Issues raised to your campaign",
            period,
          },
        ],
        { label: "Write to this ward", to: "/broadcast", search: { wards: w.id } },
        n,
      ),
    ];
  });
}

type Tally = Map<IssueSource, Map<string, number>>;
const total = (m: Map<string, number> | undefined) =>
  [...(m?.values() ?? [])].reduce((a, b) => a + b, 0);

/** An issue's share in a period: its share of each counting source's issues, averaged, as top of mind does. */
function shareIn(t: Tally, sources: IssueSource[], key: string): number {
  return (
    sources.reduce((a, s) => a + (t.get(s)?.get(key) ?? 0) / total(t.get(s)), 0) / sources.length
  );
}

/** 4. An issue's share of what was raised this week, well up on the previous four weeks. */
export function issueRising(i: FindingsInput): Finding[] {
  if (!i.issueWeeks) return [];
  const now: Tally = new Map();
  const before: Tally = new Map();
  for (const r of i.issueWeeks) {
    const k = issueKey(r.issue);
    if (!k || r.week < 0 || r.week > 4) continue;
    const t = r.week === 0 ? now : before;
    const m = t.get(r.source) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + r.n);
    t.set(r.source, m);
  }
  const srcNow = ISSUE_SOURCES.filter((s) => total(now.get(s)) >= LIMITS.risingWeekMin);
  const srcBefore = ISSUE_SOURCES.filter((s) => total(before.get(s)) >= LIMITS.risingBeforeMin);
  if (!srcNow.length || !srcBefore.length) return [];
  const keys = [...new Set(srcNow.flatMap((s) => [...now.get(s)!.keys()]))];
  return keys.flatMap((k) => {
    const raised = ISSUE_SOURCES.reduce((a, s) => a + (now.get(s)?.get(k) ?? 0), 0);
    const a = shareIn(now, srcNow, k);
    const b = shareIn(before, srcBefore, k);
    if (raised < LIMITS.risingRaisedMin || a - b < LIMITS.risingPoints - EPS) return [];
    return [
      finding(
        "issue-rising",
        null,
        `${issueLabel(k)} rose to ${percent(a)} of what was raised this week, from ${percent(b)} over the previous four weeks.`,
        [
          {
            label: "Share this week",
            value: a,
            text: percent(a),
            source: "Issues raised to your campaign",
            period: `7 days to ${i.today}`,
          },
          {
            label: "Share over the previous four weeks",
            value: b,
            text: percent(b),
            source: "Issues raised to your campaign",
            period: `the 28 days before`,
          },
          {
            label: "Times raised this week",
            value: raised,
            text: count(raised),
            source: "Issues raised to your campaign",
            period: `7 days to ${i.today}`,
          },
        ],
        { label: "See what's said", to: "/listening", search: { issue: k } },
        a - b,
        k,
      ),
    ];
  });
}

/** 5. A seat whose densest ward has three times or more the buildings per km² of its least dense. */
export function oneSeatDifferentPlaces(i: FindingsInput): Finding[] {
  const seats =
    levelOf(i) === "constituency"
      ? [i.home]
      : i.atlas.areas
          .filter((a) => a.level === "constituency" && within(i.home, a.key))
          .map((a) => a.key);
  return seats.flatMap((seat) => {
    const wards = i.atlas.areas.filter((a) => a.parent === seat && a.level === "ward");
    const measured = wards.map((w) => ({ w, m: measuredAt(i.atlas, w.key).buildings_per_km2 }));
    if (measured.length < 2 || measured.some((x) => !x.m)) return [];
    const sorted = [...measured].sort(
      (a, b) => b.m!.value - a.m!.value || a.w.key.localeCompare(b.w.key),
    );
    const hi = sorted[0]!;
    const lo = sorted[sorted.length - 1]!;
    if (lo.m!.value <= 0 || hi.m!.value / lo.m!.value < LIMITS.densityRatio - EPS) return [];
    const name = i.atlas.areas.find((a) => a.key === seat)?.name ?? seat;
    const fig = (x: typeof hi): Figure => ({
      label: `Buildings per km² in ${x.w.name}`,
      value: x.m!.value,
      text: count(x.m!.value),
      source: i.atlas.sources.find((s) => s.id === x.m!.source)?.publisher ?? x.m!.source,
      period: String(x.m!.year),
    });
    return [
      finding(
        "one-seat-different-places",
        seat,
        `${name}'s wards live differently: ${hi.w.name} has ${count(hi.m!.value)} buildings per km², ${lo.w.name} ${count(lo.m!.value)}. One message won't fit both.`,
        [fig(hi), fig(lo)],
        { label: "Compare its wards", to: "/elections", search: { area: seat } },
        hi.m!.value / lo.m!.value,
      ),
    ];
  });
}
```

- [ ] **Step 4: Register them**

In `src/lib/findings/index.ts`, add before the import from `@/lib/findings/time`:

```ts
import { issueRising, oneSeatDifferentPlaces, wardTopIssue } from "@/lib/findings/message";
```

and add to `RULE_FNS`, after `"time-in-safe-seats": timeInSafeSeats,`:

```ts
  "ward-top-issue": wardTopIssue,
  "issue-rising": issueRising,
  "one-seat-different-places": oneSeatDifferentPlaces,
```

- [ ] **Step 5: Run the tests**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-message.test.ts && npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts`
Expected: `19 passed, 0 failed`, then `23 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/findings/message.ts src/lib/findings/index.ts tests/findings-message.test.ts
git commit -m "$(cat <<'EOF'
Findings: a ward's top issue, an issue rising, a seat of different places

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The rules for field work and money

**Files:**
- Modify: `src/lib/atlas.ts` (`whatToDoFigures`, with `whatToDo` built on it)
- Modify: `src/lib/atlas-view.ts` (`figuresFor` carries the reason's figures)
- Modify: `tests/atlas.test.ts`
- Create: `src/lib/findings/field.ts`
- Create: `tests/findings-field.test.ts`
- Modify: `src/lib/findings/index.ts`

**Interfaces:**
- Produces, from `@/lib/atlas`: `type ReasonFigure = { label: string; value: number; text: string }` and `whatToDoFigures(i: TodoInput): { todo: Todo; reason: string; figures: ReasonFigure[] }`. `whatToDo` keeps its signature and output.
- Changes, in `@/lib/atlas-view`: `AreaFigures.todo` becomes `{ todo: Todo; reason: string; figures: ReasonFigure[] } | null`.
- Consumes, in `field.ts`: `TODO_NAMES` (`@/lib/atlas`); `topMoves` (`@/lib/atlas-app`); `electionOf`, `figuresFor`, `sourceAt` (`@/lib/atlas-view`); core's helpers.
- Produces: `votesWithinReach` (rule 6), `doorsBehind` (rule 7), `shortOfTarget` (rule 8), `unregisteredAdults` (rule 9), `spendOutOfLine` (rule 10), each `(i: FindingsInput) => Finding[]`.

- [ ] **Step 1: Write the failing atlas test**

In `tests/atlas.test.ts`, add `whatToDoFigures,` to the import from `@/lib/atlas`, after `whatToDo,`. Then add this just above the closing `console.log(`${pass} passed, ${fail} failed`);`:

```ts
// What to do, with every number its reason prints: findings carry them as figures.
const todoFigures = (
  cands: [string, number][],
  parentTurnout: number | null = 0.5,
  before: AreaCount | null = null,
) =>
  whatToDoFigures({
    year: 2022,
    count: count(cands),
    side: KK,
    parentTurnout,
    parentName: "Nairobi",
    before: before ? { year: 2017, count: before, side: "Jubilee" } : null,
  });
/** The digits a reason prints that none of its figures accounts for. */
const leftOver = (r: { reason: string; figures: { text: string }[] }) => {
  let rest = r.reason;
  for (const f of [...r.figures].sort((a, b) => b.text.length - a.text.length))
    rest = rest.split(f.text).join(" ");
  return rest.match(/[0-9][0-9,.]*/g) ?? [];
};
eq(
  "mobilise's figures",
  todoFigures(
    [
      [KK, 30_000],
      [AZ, 20_000],
    ],
    0.6,
  ).figures,
  [
    { label: "Our share", value: 0.6, text: "60.0%" },
    { label: "Election", value: 2022, text: "2022" },
    { label: "Turnout", value: 0.5, text: "50%" },
    { label: "Points below Nairobi", value: 10, text: "10" },
  ],
);
eq(
  "every reason's numbers are among its figures",
  [
    todoFigures(
      [
        [KK, 30_000],
        [AZ, 20_000],
      ],
      0.6,
    ),
    todoFigures(
      [
        [KK, 30_000],
        [AZ, 20_000],
      ],
      0.52,
    ),
    todoFigures([
      [KK, 15_000],
      [AZ, 33_000],
      [IND, 2_000],
    ]),
    todoFigures([
      [KK, 24_000],
      [AZ, 22_500],
      [IND, 3_500],
    ]),
    todoFigures(
      [
        [KK, 27_500],
        [AZ, 17_500],
        [IND, 5_000],
      ],
      0.5,
      count([
        ["Jubilee", 21_000],
        ["NASA", 29_000],
      ]),
    ),
    todoFigures([
      [KK, 27_500],
      [AZ, 17_500],
      [IND, 5_000],
    ]),
  ].map((r) => [r.todo, leftOver(r)]),
  [
    ["mobilise", []],
    ["hold", []],
    ["cut", []],
    ["persuade", []],
    ["persuade", []],
    ["lean-ours", []],
  ],
);
eq(
  "no side: the year alone",
  whatToDoFigures({
    year: 2022,
    count: count([[KK, 1_000]]),
    side: null,
    parentTurnout: null,
    parentName: null,
    before: null,
  }),
  {
    todo: "no-side",
    reason: "Set your side in 2022 first.",
    figures: [{ label: "Election", value: 2022, text: "2022" }],
  },
);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/atlas.test.ts`
Expected: it fails because `@/lib/atlas` has no export named `whatToDoFigures`.

- [ ] **Step 3: Give the reason its figures**

In `src/lib/atlas.ts`, replace everything from the doc comment that begins `/**` followed by ` * What to do here and why; the first rule that matches wins.` down to the end of `whatToDo` (the line before `const LEVEL_TOTAL`) with:

```ts
/** A number a what-to-do reason prints, with what it is: findings carry these as figures. */
export type ReasonFigure = { label: string; value: number; text: string };

/**
 * What to do here and why, with every number the reason prints; the first rule
 * that matches wins. The rules follow who is ahead, not the share alone: behind
 * within 10 points is Persuade, behind by more is Cut the gap, ahead by more
 * than 10 (short of Hold) is Lean ours.
 */
export function whatToDoFigures(i: TodoInput): {
  todo: Todo;
  reason: string;
  figures: ReasonFigure[];
} {
  const year: ReasonFigure = { label: "Election", value: i.year, text: String(i.year) };
  const share = ourShare(i.count, i.side);
  if (share === null)
    return { todo: "no-side", reason: `Set your side in ${i.year} first.`, figures: [year] };
  const t = turnout(i.count);
  const m = margin(i.count, i.side) ?? 0;
  const leader = blocShares(i.count).find((b) => b.bloc !== i.side);
  const sw = i.before ? swing(i.count, i.side, i.before.count, i.before.side) : null;
  const ours: ReasonFigure = { label: "Our share", value: share, text: pct1(share) };
  const theirs: ReasonFigure = {
    label: `${leader?.bloc ?? "The leader"}'s share`,
    value: leader?.share ?? 0,
    text: pct1(leader?.share ?? 0),
  };
  const pts = (label: string, x: number): ReasonFigure => ({
    label,
    value: Number(points(x)),
    text: points(x),
  });
  if (
    share >= 0.5 - EPS &&
    t !== null &&
    i.parentTurnout !== null &&
    i.parentTurnout - t > 0.03 + EPS
  )
    return {
      todo: "mobilise",
      reason: `We took ${pct1(share)} here in ${i.year}, but turnout was ${pct0(t)}, ${points(i.parentTurnout - t)} points below ${i.parentName ?? "the area around it"}.`,
      figures: [
        ours,
        year,
        { label: "Turnout", value: t, text: pct0(t) },
        pts(`Points below ${i.parentName ?? "the area around it"}`, i.parentTurnout - t),
      ],
    };
  if (share >= 0.6 - EPS)
    return {
      todo: "hold",
      reason: `We took ${pct1(share)} here in ${i.year}.`,
      figures: [ours, year],
    };
  if (m < -0.1 - EPS)
    return {
      todo: "cut",
      reason: `We trail ${leader?.bloc ?? "the leader"} by ${points(m)} points here in ${i.year}: ${pct1(share)} to ${pct1(leader?.share ?? 0)}.`,
      figures: [pts("Points behind", m), year, ours, theirs],
    };
  if (Math.abs(m) <= 0.1 + EPS)
    return {
      todo: "persuade",
      reason: `${i.year} was close: ${pct1(share)} to us against ${pct1(leader?.share ?? 0)} for ${leader?.bloc ?? "the rest"}.`,
      figures: [year, ours, theirs],
    };
  if (sw !== null && i.before && Math.abs(sw) >= 0.1 - EPS)
    return {
      todo: "persuade",
      reason: `Our share moved ${points(sw)} points ${sw > 0 ? "up" : "down"} between ${i.before.year} and ${i.year}.`,
      figures: [
        pts("Points moved", sw),
        { label: "Election before", value: i.before.year, text: String(i.before.year) },
        year,
      ],
    };
  return {
    todo: "lean-ours",
    reason: `We took ${pct1(share)} here in ${i.year}, a ${points(m)}-point lead.`,
    figures: [ours, year, pts("Points ahead", m)],
  };
}

/** What to do here and why: `whatToDoFigures` without the figures. */
export function whatToDo(i: TodoInput): { todo: Todo; reason: string } {
  const { todo, reason } = whatToDoFigures(i);
  return { todo, reason };
}
```

In `src/lib/atlas-view.ts`:
- in the import from `@/lib/atlas`, replace `whatToDo,` with `whatToDoFigures,` and add `type ReasonFigure,` after `type Reach,`;
- in `AreaFigures`, replace `todo: { todo: Todo; reason: string } | null;` with `todo: { todo: Todo; reason: string; figures: ReasonFigure[] } | null;`;
- in `figuresFor`, replace `? whatToDo({` with `? whatToDoFigures({`.

- [ ] **Step 4: Run the atlas tests**

Run: `for t in atlas atlas-view atlas-app; do npx tsx --tsconfig tsconfig.json tests/$t.test.ts | tail -1; done`
Expected: `38 passed, 0 failed`, `20 passed, 0 failed`, `13 passed, 0 failed`

- [ ] **Step 5: Write the failing rules test**

Create `tests/findings-field.test.ts`:

```ts
// Checks for the field-work-and-money rules: votes within reach, doors
// behind, short of target, unregistered adults and stipend spend out of line.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-field.test.ts

import { orderFindings, unaccounted } from "@/lib/findings/core";
import {
  doorsBehind,
  shortOfTarget,
  spendOutOfLine,
  unregisteredAdults,
  votesWithinReach,
} from "@/lib/findings/field";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

// ---------------------------------------------------------------- 6. votes within reach

{
  const out = votesWithinReach(FULL);
  eq(
    "every seat, most votes within reach first",
    out.map((x) => x.line),
    [
      "Kasarani: Mobilise. We took 55.0% here in 2022, but turnout was 40%, 9.6 points below Nairobi. About 26,603 votes within reach.",
      "Dagoretti North: Persuade. 2022 was close: 46.1% to us against 48.0% for Bloc B. About 10,173 votes within reach.",
      "Embakasi East: Cut the gap. We trail Bloc B by 40 points here in 2022: 30.0% to 70.0%. About 5,000 votes within reach.",
      "Westlands: Hold. We took 65.0% here in 2022. About 5,000 votes within reach.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], [], [], []]);
  eq("open the seat in Elections", out[0]?.next, {
    label: "Open in Elections",
    to: "/elections",
    search: { area: "nairobi/kasarani" },
  });
  eq(
    "the reason's figures carry the count's source",
    out[1]?.figures.map((x) => [x.label, x.text, x.source]),
    [
      ["Election", "2022", "IEBC"],
      ["Our share", "46.1%", "IEBC"],
      ["Bloc B's share", "48.0%", "IEBC"],
      ["Votes within reach", "10,173", "Worked out from IEBC results"],
    ],
  );
}
eq("no side: quiet", votesWithinReach(input({ atlas: { ...ATLAS, sides: {} } })), []);
eq(
  "an MP's own seat",
  votesWithinReach(input({ home: "nairobi/westlands" })).map((x) => x.id),
  ["votes-within-reach:nairobi/westlands"],
);
eq(
  "a presidential race with no county results: quiet",
  votesWithinReach(input({ home: "kenya", race: "president" })),
  [],
);

// ---------------------------------------------------------------- 7. doors behind

{
  const out = orderFindings(doorsBehind(FULL));
  eq(
    "the bottom quarter for doors among the top half for voters",
    out.map((x) => x.line),
    [
      "Mwiki: 5% of its 9,000 houses knocked in 30 days, with 60,000 registered voters.",
      "Kawangware: 2% of its 8,830 houses knocked in 30 days, with 52,000 registered voters.",
    ],
  );
  eq("open the ward on the map", out[1]?.next, {
    label: "Open the ward on the map",
    to: "/voters",
    search: { area: "w:kawangware" },
  });
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
{
  const quiet = doorsBehind(
    input({
      doors: [
        {
          wardId: "w-kangemi",
          knocked: 34,
          rated: 0,
          supporters: 0,
          doorsWeek: 0,
          agentsToday: [],
        },
      ],
    }),
  );
  eq(
    "few doors anywhere: one campaign finding",
    quiet.map((x) => [x.id, x.place, x.line]),
    [["doors-behind:campaign", null, "34 houses knocked across your 6 wards in the last 30 days."]],
  );
  eq("every number is a figure", quiet.map(unaccounted), [[]]);
}
eq("no house file: quiet", doorsBehind(input({ houses: null })), []);
eq("doors not read: quiet", doorsBehind(input({ doors: null })), []);

// ---------------------------------------------------------------- 8. short of target

{
  const out = orderFindings(shortOfTarget(FULL));
  eq(
    "wards short of their targets, biggest gap first",
    out.map((x) => x.line),
    [
      "Kawangware: 1,204 supporters found of a 6,000 target, 4,796 short.",
      "Kangemi: 3,000 supporters found of a 4,000 target, 1,000 short.",
    ],
  );
  eq("the ward's people", out.find((x) => x.place === KEYS.kangemi)?.next, {
    label: "See the ward's people",
    to: "/voters",
    search: { area: "w:kangemi", tab: "people" },
  });
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq("before the update: quiet", shortOfTarget(input({ supporters: null })), []);

// ---------------------------------------------------------------- 9. unregistered adults

{
  const out = orderFindings(unregisteredAdults(FULL));
  eq(
    "5,000 or more, or a fifth of the adults",
    out.map((x) => x.line),
    [
      "Kawangware: about 14,500 adults aren't registered (estimate), a registration drive opportunity.",
      "Parklands: about 9,000 adults aren't registered (estimate), a registration drive opportunity.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq(
  "a fifth of the adults is enough",
  orderFindings(
    unregisteredAdults(
      input({
        atlas: {
          ...ATLAS,
          population: ATLAS.population.map((p) =>
            p.area === KEYS.kangemi ? { ...p, adults: 50_000 } : p,
          ),
        },
      }),
    ),
  ).map((x) => x.id),
  [
    `unregistered-adults:${KEYS.kawangware}`,
    `unregistered-adults:${KEYS.kangemi}`,
    `unregistered-adults:${KEYS.parklands}`,
  ],
);

// ---------------------------------------------------------------- 10. spend out of line

{
  const out = spendOutOfLine(FULL);
  eq(
    "bigger wards with under half their share of the spend",
    out.map((x) => x.line),
    [
      "Mwiki: 0% of stipend spend in 30 days, for 22% of your registered voters.",
      "Kawangware: 2% of stipend spend in 30 days, for 19% of your registered voters.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq(
  "under KES 10,000 spent: quiet",
  spendOutOfLine(input({ spend: [{ wardId: "w-kileleshwa", kes: 9_999 }] })),
  [],
);
eq("before the update: quiet", spendOutOfLine(input({ spend: null })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-field.test.ts`
Expected: it fails because it cannot find `@/lib/findings/field`.

- [ ] **Step 7: Write the rules**

Create `src/lib/findings/field.ts`:

```ts
// The rules for field work and money: where votes can move, wards whose doors
// lag, wards short of their supporter targets, adults not yet registered, and
// stipend spend out of line with where the voters are. Pure.

import { TODO_NAMES } from "@/lib/atlas";
import { topMoves } from "@/lib/atlas-app";
import { electionOf, figuresFor, sourceAt } from "@/lib/atlas-view";
import {
  count,
  finding,
  LIMITS,
  percent,
  topPart,
  within,
  type Finding,
  type FindingsInput,
  type FindingsWard,
} from "@/lib/findings/core";

/** The campaign's wards the atlas holds, with their 2022 registered voters. */
function registered(i: FindingsInput): { w: FindingsWard; key: string; reg: number }[] {
  return i.wards.flatMap((w) => {
    const reg = w.key ? figuresFor(i.atlas, w.key, i.race, 2022).registered : null;
    return w.key && reg ? [{ w, key: w.key, reg }] : [];
  });
}

const days30 = (i: FindingsInput, source: string) => ({
  label: "Days",
  value: 30,
  text: "30",
  source,
  period: `30 days to ${i.today}`,
});

/** 6. Every seat to weigh, with what to do there, why, and the votes within reach. */
export function votesWithinReach(i: FindingsInput): Finding[] {
  return topMoves(i.atlas, i.home, i.race, Infinity).map((f) => {
    const reach = f.reach!;
    const todo = f.todo!;
    const src = sourceAt(i.atlas, electionOf(i.race, 2022), f.key)?.publisher ?? "IEBC";
    return finding(
      "votes-within-reach",
      f.key,
      `${f.name}: ${TODO_NAMES[todo.todo]}. ${todo.reason} ${reach.partial ? "At least" : "About"} ${count(reach.total)} votes within reach.`,
      [
        ...todo.figures.map((x) => ({ ...x, source: src, period: "2022" })),
        {
          label: "Votes within reach",
          value: reach.total,
          text: count(reach.total),
          source: `Worked out from ${src} results`,
          period: "2022",
        },
      ],
      { label: "Open in Elections", to: "/elections", search: { area: f.key } },
      reach.total,
    );
  });
}

/** 7. Wards in the bottom quarter for doors knocked and the top half for voters; or, with few doors, the campaign. */
export function doorsBehind(i: FindingsInput): Finding[] {
  if (!i.houses || !i.doors) return [];
  const knocked = new Map(i.doors.map((d) => [d.wardId, d.knocked]));
  const total = i.doors.reduce((t, d) => t + d.knocked, 0);
  if (total < LIMITS.doorsCampaignMin) {
    return [
      finding(
        "doors-behind",
        null,
        `${count(total)} houses knocked across your ${count(i.wards.length)} wards in the last 30 days.`,
        [
          {
            label: "Houses knocked",
            value: total,
            text: count(total),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Your wards",
            value: i.wards.length,
            text: count(i.wards.length),
            source: "Your wards",
            period: i.today,
          },
          days30(i, "Your door visits"),
        ],
        { label: "Open the Voters map", to: "/voters" },
        0,
      ),
    ];
  }
  const rows = registered(i).flatMap((r) => {
    const houses = i.houses![r.w.slug] ?? 0;
    return houses > 0 ? [{ ...r, houses, knocked: knocked.get(r.w.id) ?? 0 }] : [];
  });
  const cover = (r: (typeof rows)[number]) => r.knocked / r.houses;
  const low = new Set(
    topPart(
      rows,
      (r) => -cover(r),
      0.25,
      (r) => r.key,
    ).map((r) => r.key),
  );
  const big = new Set(
    topPart(
      rows,
      (r) => r.reg,
      0.5,
      (r) => r.key,
    ).map((r) => r.key),
  );
  return rows
    .filter((r) => low.has(r.key) && big.has(r.key))
    .map((r) =>
      finding(
        "doors-behind",
        r.key,
        `${r.w.name}: ${percent(cover(r))} of its ${count(r.houses)} houses knocked in 30 days, with ${count(r.reg)} registered voters.`,
        [
          {
            label: "Houses knocked",
            value: cover(r),
            text: percent(cover(r)),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Houses in the ward",
            value: r.houses,
            text: count(r.houses),
            source: "Google Open Buildings v3",
            period: "2023",
          },
          {
            label: "Houses knocked, in number",
            value: r.knocked,
            text: count(r.knocked),
            source: "Your door visits",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Registered voters",
            value: r.reg,
            text: count(r.reg),
            source: "IEBC",
            period: "2022",
          },
          days30(i, "Your door visits"),
        ],
        { label: "Open the ward on the map", to: "/voters", search: { area: `w:${r.w.slug}` } },
        r.reg,
      ),
    );
}

/** 8. Wards whose supporters fall short of the team's target. */
export function shortOfTarget(i: FindingsInput): Finding[] {
  if (!i.supporters) return [];
  const have = new Map(i.supporters.map((s) => [s.wardId, s.supporters]));
  return i.wards.flatMap((w) => {
    const target = w.targetVotes ?? 0;
    const found = have.get(w.id) ?? 0;
    const gap = target - found;
    if (!w.key || target <= 0 || gap <= 0) return [];
    return [
      finding(
        "short-of-target",
        w.key,
        `${w.name}: ${count(found)} supporters found of a ${count(target)} target, ${count(gap)} short.`,
        [
          {
            label: "Supporters found",
            value: found,
            text: count(found),
            source: "Your contacts who agreed to SMS",
            period: i.today,
          },
          {
            label: "Target",
            value: target,
            text: count(target),
            source: "Your team's ward targets",
            period: i.today,
          },
          {
            label: "Short",
            value: gap,
            text: count(gap),
            source: "Your team's ward targets",
            period: i.today,
          },
        ],
        {
          label: "See the ward's people",
          to: "/voters",
          search: { area: `w:${w.slug}`, tab: "people" },
        },
        gap,
      ),
    ];
  });
}

/** 9. Wards where WorldPop's adults outnumber the register by 5,000 or a fifth. */
export function unregisteredAdults(i: FindingsInput): Finding[] {
  return i.atlas.areas
    .filter((a) => a.level === "ward" && within(i.home, a.key))
    .flatMap((a) => {
      const f = figuresFor(i.atlas, a.key, i.race, 2022);
      const gap = f.notRegistered?.adults ?? 0;
      const adults = f.population?.adults ?? 0;
      if (!gap || !adults || f.registered === null) return [];
      if (gap < LIMITS.unregisteredMin && gap / adults < LIMITS.unregisteredShare) return [];
      const about = Math.round(gap / 100) * 100;
      const year = String(f.population!.year);
      return [
        finding(
          "unregistered-adults",
          a.key,
          `${a.name}: about ${count(about)} adults aren't registered (estimate), a registration drive opportunity.`,
          [
            {
              label: "Adults not registered, to the nearest 100",
              value: about,
              text: count(about),
              source: "WorldPop's estimate less IEBC's register",
              period: `${year} and 2022`,
            },
            {
              label: "Adults",
              value: adults,
              text: count(adults),
              source: "WorldPop estimate",
              period: year,
            },
            {
              label: "Registered voters",
              value: f.registered,
              text: count(f.registered),
              source: "IEBC",
              period: "2022",
            },
          ],
          { label: "Open in Elections", to: "/elections", search: { area: a.key } },
          gap,
        ),
      ];
    });
}

/** 10. Bigger wards getting under half their share of the campaign's stipend spend. */
export function spendOutOfLine(i: FindingsInput): Finding[] {
  if (!i.spend) return [];
  const spent = i.spend.reduce((t, s) => t + s.kes, 0);
  if (spent < LIMITS.spendMinKes) return [];
  const kes = new Map(i.spend.map((s) => [s.wardId, s.kes]));
  const rows = registered(i);
  const voters = rows.reduce((t, r) => t + r.reg, 0);
  if (!voters) return [];
  return topPart(
    rows,
    (r) => r.reg,
    0.5,
    (r) => r.key,
  ).flatMap((r) => {
    const voterShare = r.reg / voters;
    const mine = kes.get(r.w.id) ?? 0;
    const spendShare = mine / spent;
    if (spendShare >= LIMITS.spendOfVoterShare * voterShare) return [];
    return [
      finding(
        "spend-out-of-line",
        r.key,
        `${r.w.name}: ${percent(spendShare)} of stipend spend in 30 days, for ${percent(voterShare)} of your registered voters.`,
        [
          {
            label: "Share of stipend spend",
            value: spendShare,
            text: percent(spendShare),
            source: "Your stipend records",
            period: `30 days to ${i.today}`,
          },
          {
            label: "Share of your registered voters",
            value: voterShare,
            text: percent(voterShare),
            source: "IEBC",
            period: "2022",
          },
          {
            label: "Stipends in the ward, KES",
            value: mine,
            text: count(mine),
            source: "Your stipend records",
            period: `30 days to ${i.today}`,
          },
          days30(i, "Your stipend records"),
        ],
        { label: "Open Agents & stipends", to: "/agents" },
        voterShare - spendShare,
      ),
    ];
  });
}
```

- [ ] **Step 8: Register them**

In `src/lib/findings/index.ts`, add before the import from `@/lib/findings/message`:

```ts
import {
  doorsBehind,
  shortOfTarget,
  spendOutOfLine,
  unregisteredAdults,
  votesWithinReach,
} from "@/lib/findings/field";
```

and add to `RULE_FNS`, after `"one-seat-different-places": oneSeatDifferentPlaces,`:

```ts
  "votes-within-reach": votesWithinReach,
  "doors-behind": doorsBehind,
  "short-of-target": shortOfTarget,
  "unregistered-adults": unregisteredAdults,
  "spend-out-of-line": spendOutOfLine,
```

- [ ] **Step 9: Run the tests**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-field.test.ts && npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts && npx tsc --noEmit -p .`
Expected: `25 passed, 0 failed`, then `23 passed, 0 failed`, then no output from `tsc`

- [ ] **Step 10: Commit**

```bash
git add src/lib/atlas.ts src/lib/atlas-view.ts tests/atlas.test.ts src/lib/findings/field.ts src/lib/findings/index.ts tests/findings-field.test.ts
git commit -m "$(cat <<'EOF'
Findings: votes within reach, doors behind, targets, registration, spend

The atlas's what-to-do reason now carries its numbers, so a finding built
on it can show every one as a figure.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The rules for rivals and polls

**Files:**
- Modify: `src/lib/race-data.ts` (`biggestPollMove`, `moveTitle`, `withinMargin`; `rivalMove` built on them)
- Modify: `tests/race-data.test.ts`
- Create: `src/lib/findings/rivals.ts`
- Create: `tests/findings-rivals.test.ts`
- Create: `tests/findings-all.test.ts`
- Modify: `src/lib/findings/index.ts`

**Interfaces:**
- Produces, from `@/lib/race-data`: `type PollMove = { rival: RaceRival; from: number; to: number; points: number; older: RacePoll; newer: RacePoll }`, `biggestPollMove(rivals, polls, todayIso, minPoints = 2, withinDays = 30): PollMove | null` (our own candidate included), `moveTitle(m): string` ("We're down 3.0 points in …" for us), `withinMargin(m): boolean`. `rivalMove` keeps its signature and now covers us too, adding "That's within the poll's margin of error (±m)." to its detail when it applies. That changes Home's Today line on purpose (spec, rule 11).
- Consumes, in `rivals.ts`: `fieldworkLabel` and the above (`@/lib/race-data`); core's helpers.
- Produces: `pollMove` (rule 11) and `rivalInNews` (rule 12).

- [ ] **Step 1: Change the race test to what the spec wants**

In `tests/race-data.test.ts`, replace the test named `"our own drop is not a rival's move"`, from that `eq(` to the `}` that closes its block, with:

```ts
  eq("our own move counts too", rivalMove(RIVALS, [before, after], "2026-09-29"), {
    title: "We're down 8.0 points in Poll Co's latest poll",
    detail: "From 30% in Aug 2026 to 22% in Sep 2026.",
  });
}
{
  const before = poll("o", "Poll Co", null, null, "2026-08-01", [["Babu Owino", 30, "b"]]);
  const after = {
    ...poll("n", "Poll Co", null, null, "2026-09-20", [["Babu Owino", 32, "b"]]),
    margin: 2.5,
  };
  eq(
    "a move within the margin of error says so",
    rivalMove(RIVALS, [before, after], "2026-09-29")?.detail,
    "From 30% in Aug 2026 to 32% in Sep 2026. That's within the poll's margin of error (±2.5).",
  );
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/race-data.test.ts | tail -6`
Expected: `FAIL our own move counts too` (it still says Babu Owino's move), `FAIL a move within the margin of error says so`, and `89 passed, 2 failed`.

- [ ] **Step 3: Extend the poll move**

In `src/lib/race-data.ts`, replace everything from `export type RivalMove = { title: string; detail: string };` down to, but not including, the line `// ------------------------------------------------------------------ rivals' posts` with:

```ts
export type RivalMove = { title: string; detail: string };

/** One candidate's change between one pollster's last two polls. */
export type PollMove = {
  rival: RaceRival;
  from: number;
  to: number;
  /** The change in points, rounded to one decimal. */
  points: number;
  older: RacePoll;
  newer: RacePoll;
};

/**
 * The biggest change for any candidate, our own included, between one
 * pollster's last two polls, when the newer one came out in the last
 * `withinDays` and moved at least `minPoints`.
 */
export function biggestPollMove(
  rivals: RaceRival[],
  polls: RacePoll[],
  todayIso: string,
  minPoints = 2,
  withinDays = 30,
): PollMove | null {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const byPollster = new Map<string, RacePoll[]>();
  for (const p of polls) {
    const k = p.pollster.trim().toLowerCase();
    byPollster.set(k, [...(byPollster.get(k) ?? []), p]);
  }
  let best: PollMove | null = null;
  for (const mine of byPollster.values()) {
    const [newer, older] = [...mine].sort(byRecency);
    if (!newer || !older) continue;
    if ((today - Date.parse(`${newer.publishedOn}T00:00:00Z`)) / 864e5 > withinDays) continue;
    for (const r of rivals) {
      const to = shareOf(newer, r);
      const from = shareOf(older, r);
      if (to === null || from === null) continue;
      const d = Math.round(Math.abs(to - from) * 10) / 10;
      if (d < minPoints) continue;
      if (!best || d > best.points || (d === best.points && r.name < best.rival.name))
        best = { rival: r, from, to, points: d, older, newer };
    }
  }
  return best;
}

/** "Babu Owino up 3.8 points in Mizani Africa's latest poll"; ours reads "We're down 2.9 points …". */
export function moveTitle(m: PollMove): string {
  const way = m.to > m.from ? "up" : "down";
  const who = m.rival.isUs ? "We're" : m.rival.name;
  return `${who} ${way} ${m.points.toFixed(1)} points in ${m.newer.pollster}'s latest poll`;
}

/** The move is no bigger than the newer poll's stated margin of error. */
export const withinMargin = (m: PollMove): boolean =>
  m.newer.margin !== null && m.points <= m.newer.margin;

/** The biggest recent poll move, as Home's Today list words it. */
export function rivalMove(
  rivals: RaceRival[],
  polls: RacePoll[],
  todayIso: string,
  minPoints = 2,
  withinDays = 30,
): RivalMove | null {
  const m = biggestPollMove(rivals, polls, todayIso, minPoints, withinDays);
  if (!m) return null;
  const margin = withinMargin(m)
    ? ` That's within the poll's margin of error (±${m.newer.margin}).`
    : "";
  return {
    title: moveTitle(m),
    detail: `From ${m.from}% in ${monthLabel(pollDate(m.older))} to ${m.to}% in ${monthLabel(pollDate(m.newer))}.${margin}`,
  };
}
```

- [ ] **Step 4: Run the race and Home tests**

Run: `for t in race-data home; do npx tsx --tsconfig tsconfig.json tests/$t.test.ts | tail -1; done`
Expected: `91 passed, 0 failed`, then `41 passed, 0 failed`

- [ ] **Step 5: Write the failing rules tests**

Create `tests/findings-rivals.test.ts`:

```ts
// Checks for the rivals-and-polls rules: the biggest recent poll move, ours
// included, and a rival suddenly taking more of the news. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-rivals.test.ts

import { unaccounted } from "@/lib/findings/core";
import { pollMove, rivalInNews } from "@/lib/findings/rivals";

import { FULL, input, poll } from "./findings-fixture";

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

// ---------------------------------------------------------------- 11. poll move

{
  const out = pollMove(FULL);
  eq(
    "the biggest move in one pollster's last two polls",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "poll-move:campaign",
        null,
        "Challenger A up 4.0 points in Pollster B's latest poll, from 31% to 35%.",
      ],
    ],
  );
  eq("see the race", out[0]?.next, { label: "See the race", to: "/home", hash: "race" });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
{
  const ours = pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [
          ["us", 36],
          ["r-a", 31],
        ]),
        poll(
          "newer",
          "2026-10-01",
          [
            ["us", 33],
            ["r-a", 32],
          ],
          2.5,
        ),
      ],
    }),
  );
  eq(
    "our own move counts",
    ours.map((x) => x.line),
    ["We're down 3.0 points in Pollster B's latest poll, from 36% to 33%."],
  );
}
{
  const small = pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [
          ["us", 33],
          ["r-a", 31],
        ]),
        poll(
          "newer",
          "2026-10-01",
          [
            ["us", 33],
            ["r-a", 33],
          ],
          2.5,
        ),
      ],
    }),
  );
  eq(
    "a move inside the margin of error says so",
    small.map((x) => x.line),
    [
      "Challenger A up 2.0 points in Pollster B's latest poll, from 31% to 33%, within the poll's margin of error (±2.5).",
    ],
  );
  eq("every number is a figure", small.map(unaccounted), [[]]);
}
eq(
  "no margin given: no note",
  pollMove(
    input({
      polls: [
        poll("older", "2026-08-15", [["r-a", 31]]),
        poll("newer", "2026-10-01", [["r-a", 33]]),
      ],
    }),
  ).map((x) => x.line),
  ["Challenger A up 2.0 points in Pollster B's latest poll, from 31% to 33%."],
);
eq("the newer poll over 30 days old: quiet", pollMove(input({ today: "2026-11-15" })), []);
eq("one poll: quiet", pollMove(input({ polls: FULL.polls.slice(1) })), []);

// ---------------------------------------------------------------- 12. rival in the news

{
  const out = rivalInNews(FULL);
  eq(
    "a rival's share of the news well up",
    out.map((x) => [x.id, x.line]),
    [
      [
        "rival-in-news:r-a",
        "Challenger A was in 42% of news and social mentions this week, up from 18% over the previous four weeks.",
      ],
    ],
  );
  eq("open Listening", out[0]?.next, { label: "Open Listening", to: "/listening" });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "under 20 mentions this week: quiet",
  rivalInNews(
    input({
      rivalWeeks: FULL.rivalWeeks!.map((r) =>
        r.rivalId === "r-a" && r.week === 0 ? { ...r, n: 19 } : r,
      ),
    }),
  ),
  [],
);
eq(
  "too few mentions before to compare: quiet",
  rivalInNews(input({ rivalWeeks: FULL.rivalWeeks!.filter((r) => r.week === 0) })),
  [],
);
eq(
  "our own candidate isn't a rival",
  rivalInNews(input({ rivals: FULL.rivals.filter((r) => r.isUs) })),
  [],
);
eq("before the update: quiet", rivalInNews(input({ rivalWeeks: null })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

Create `tests/findings-all.test.ts`, which checks every rule at once:

```ts
// Checks across every finding rule at once, on the full example: each is
// registered and fires, the page's order, unique ids, every number in every
// line one of its figures, and nothing quoted from a team's profile. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-all.test.ts

import { findings, RULE_FNS } from "@/lib/findings";
import { RULES, unaccounted } from "@/lib/findings/core";

import { ATLAS, input, KEYS } from "./findings-fixture";

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

// A profile no finding may quote: about the place, in the team's words.
const PROFILED = input({
  atlas: {
    ...ATLAS,
    profiles: {
      [KEYS.kawangware]: {
        area: KEYS.kawangware,
        settlement: "informal",
        communities: "Zq communities text",
        languages: ["sw", "sheng"],
        institutions: "Zq institutions text",
        issues: "Zq issues text",
        updatedAt: "2026-10-01T00:00:00Z",
        updatedBy: null,
      },
    },
  },
});
const all = findings(PROFILED);

eq(
  "every rule is registered",
  RULES.filter((r) => !RULE_FNS[r.id]).map((r) => r.id),
  [],
);
eq(
  "every rule fires on the full example",
  RULES.filter((r) => !all.some((f) => f.rule === r.id)).map((r) => r.id),
  [],
);
eq(
  "the order on the page",
  all.map((f) => f.id),
  [
    "not-visited:nairobi/kasarani",
    "time-in-safe-seats:campaign",
    `ward-top-issue:${KEYS.kawangware}`,
    "issue-rising:floods",
    "one-seat-different-places:nairobi/dagoretti-north",
    "votes-within-reach:nairobi/kasarani",
    "votes-within-reach:nairobi/dagoretti-north",
    "votes-within-reach:nairobi/embakasi-east",
    "votes-within-reach:nairobi/westlands",
    `doors-behind:${KEYS.mwiki}`,
    `doors-behind:${KEYS.kawangware}`,
    `short-of-target:${KEYS.kawangware}`,
    `short-of-target:${KEYS.kangemi}`,
    `unregistered-adults:${KEYS.kawangware}`,
    `unregistered-adults:${KEYS.parklands}`,
    `spend-out-of-line:${KEYS.mwiki}`,
    `spend-out-of-line:${KEYS.kawangware}`,
    "poll-move:campaign",
    "rival-in-news:r-a",
  ],
);
eq("ids are unique", new Set(all.map((f) => f.id)).size, all.length);
eq(
  "every number in every line is one of its figures",
  all.filter((f) => unaccounted(f).length).map((f) => [f.id, unaccounted(f)]),
  [],
);
eq(
  "nothing from a profile, and no community or language, in any line or figure",
  all
    .filter((f) =>
      /zq|informal|swahili|sheng|communit|tribe|ethnic/i.test(
        [f.line, ...f.figures.map((x) => `${x.label} ${x.text} ${x.source}`)].join(" "),
      ),
    )
    .map((f) => f.id),
  [],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-rivals.test.ts`
Expected: it fails because it cannot find `@/lib/findings/rivals`.

- [ ] **Step 7: Write the rules**

Create `src/lib/findings/rivals.ts`:

```ts
// The rules for rivals and polls: the biggest recent poll move, ours
// included, and a rival suddenly taking more of the news. Pure.

import {
  count,
  EPS,
  finding,
  LIMITS,
  percent,
  type Figure,
  type Finding,
  type FindingsInput,
} from "@/lib/findings/core";
import { biggestPollMove, fieldworkLabel, moveTitle, withinMargin } from "@/lib/race-data";

/** 11. The biggest move between one pollster's last two polls, the newer in the last 30 days. */
export function pollMove(i: FindingsInput): Finding[] {
  const m = biggestPollMove(i.rivals, i.polls, i.today);
  if (!m) return [];
  const inside = withinMargin(m);
  const figures: Figure[] = [
    {
      label: "Points moved",
      value: m.points,
      text: m.points.toFixed(1),
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    },
    {
      label: "Share before",
      value: m.from,
      text: `${m.from}%`,
      source: m.older.pollster,
      period: fieldworkLabel(m.older),
    },
    {
      label: "Share now",
      value: m.to,
      text: `${m.to}%`,
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    },
  ];
  if (m.newer.sampleSize !== null)
    figures.push({
      label: "People asked",
      value: m.newer.sampleSize,
      text: count(m.newer.sampleSize),
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    });
  if (inside)
    figures.push({
      label: "Margin of error",
      value: m.newer.margin!,
      text: `±${m.newer.margin}`,
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    });
  return [
    finding(
      "poll-move",
      null,
      `${moveTitle(m)}, from ${m.from}% to ${m.to}%${inside ? `, within the poll's margin of error (±${m.newer.margin})` : ""}.`,
      figures,
      { label: "See the race", to: "/home", hash: "race" },
      m.points,
    ),
  ];
}

/** 12. A rival's share of the news this week, 10 points or more above the previous four weeks'. */
export function rivalInNews(i: FindingsInput): Finding[] {
  if (!i.rivalWeeks) return [];
  const sum = (rival: string | null, now: boolean) =>
    i
      .rivalWeeks!.filter(
        (r) => r.rivalId === rival && (now ? r.week === 0 : r.week >= 1 && r.week <= 4),
      )
      .reduce((t, r) => t + r.n, 0);
  const allNow = sum(null, true);
  const allBefore = sum(null, false);
  if (!allNow || allBefore < LIMITS.rivalMentionsMin) return [];
  return i.rivals
    .filter((r) => !r.isUs)
    .flatMap((r) => {
      const now = sum(r.id, true);
      const a = now / allNow;
      const b = sum(r.id, false) / allBefore;
      if (now < LIMITS.rivalMentionsMin || a - b < LIMITS.rivalPoints - EPS) return [];
      return [
        finding(
          "rival-in-news",
          null,
          `${r.name} was in ${percent(a)} of news and social mentions this week, up from ${percent(b)} over the previous four weeks.`,
          [
            {
              label: "Share this week",
              value: a,
              text: percent(a),
              source: "Listening",
              period: `7 days to ${i.today}`,
            },
            {
              label: "Share over the previous four weeks",
              value: b,
              text: percent(b),
              source: "Listening",
              period: "the 28 days before",
            },
            {
              label: "Mentions this week",
              value: now,
              text: count(now),
              source: "Listening",
              period: `7 days to ${i.today}`,
            },
          ],
          { label: "Open Listening", to: "/listening" },
          a - b,
          r.id,
        ),
      ];
    });
}
```

- [ ] **Step 8: Register them**

In `src/lib/findings/index.ts`, add before the import from `@/lib/findings/time`:

```ts
import { pollMove, rivalInNews } from "@/lib/findings/rivals";
```

and add to `RULE_FNS`, after `"spend-out-of-line": spendOutOfLine,`:

```ts
  "poll-move": pollMove,
  "rival-in-news": rivalInNews,
```

`src/lib/findings/index.ts` now reads:

```ts
// Every finding rule, run over one input in the order the screens show them.
// A rule that throws is left out and logged; the others still run. Pure.

import {
  orderFindings,
  RULES,
  type Finding,
  type FindingsInput,
  type RuleId,
} from "@/lib/findings/core";
import {
  doorsBehind,
  shortOfTarget,
  spendOutOfLine,
  unregisteredAdults,
  votesWithinReach,
} from "@/lib/findings/field";
import { issueRising, oneSeatDifferentPlaces, wardTopIssue } from "@/lib/findings/message";
import { pollMove, rivalInNews } from "@/lib/findings/rivals";
import { notVisited, timeInSafeSeats } from "@/lib/findings/time";

export type Rule = (i: FindingsInput) => Finding[];

export const RULE_FNS: Partial<Record<RuleId, Rule>> = {
  "not-visited": notVisited,
  "time-in-safe-seats": timeInSafeSeats,
  "ward-top-issue": wardTopIssue,
  "issue-rising": issueRising,
  "one-seat-different-places": oneSeatDifferentPlaces,
  "votes-within-reach": votesWithinReach,
  "doors-behind": doorsBehind,
  "short-of-target": shortOfTarget,
  "unregistered-adults": unregisteredAdults,
  "spend-out-of-line": spendOutOfLine,
  "poll-move": pollMove,
  "rival-in-news": rivalInNews,
};

export function findings(
  i: FindingsInput,
  rules: Partial<Record<RuleId, Rule>> = RULE_FNS,
  log: (message: string, error: unknown) => void = console.error,
): Finding[] {
  const out: Finding[] = [];
  for (const r of RULES) {
    const rule = rules[r.id];
    if (!rule) continue;
    try {
      out.push(...rule(i));
    } catch (e) {
      log(`The ${r.id} rule failed`, e);
    }
  }
  return orderFindings(out);
}
```

- [ ] **Step 9: Run the tests**

Run: `for t in findings-rivals findings-all findings-core; do npx tsx --tsconfig tsconfig.json tests/$t.test.ts | tail -1; done`
Expected: `16 passed, 0 failed`, `6 passed, 0 failed`, `23 passed, 0 failed`

- [ ] **Step 10: Commit**

```bash
git add src/lib/race-data.ts tests/race-data.test.ts src/lib/findings/rivals.ts src/lib/findings/index.ts tests/findings-rivals.test.ts tests/findings-all.test.ts
git commit -m "$(cat <<'EOF'
Findings: poll moves, ours included, and a rival rising in the news

Home's Today line uses the same poll move, so it now shows our own
candidate's moves too, and says when a move is within the margin of error.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The server: reading everything and working out the findings

**Files:**
- Create: `src/lib/findings/rows.ts`
- Create: `src/lib/house-totals.ts`
- Create: `src/lib/findings.functions.ts`
- Create: `tests/findings-functions.test.ts`

**Interfaces:**
- Consumes: `loadAtlas` (`@/lib/atlas.functions`), `wardKey` (`@/lib/atlas-app`), `loadDiary` (`@/lib/diary.functions`), `loadRivals`/`loadPolls` (`@/lib/race.functions`), `toWardDoors` (`@/lib/houses`), `pageAll` (`@/lib/page-all`), `homeAreaFor`/`defaultRace` (`@/lib/elections-view`), `nairobiToday` (`@/lib/demo/insights`), `findings` (`@/lib/findings`), `HouseCounts`/`MAP_AREAS` (`@/lib/map-areas`), and Task 1's five functions plus the existing `house_doors()`.
- Produces:
  - `toWardIssues`, `toIssueWeeks`, `toRivalWeeks`, `toWardSpend`, `toWardSupporters` (`@/lib/findings/rows`)
  - `HOUSE_TOTALS: Record<string, HouseCounts>` and `houseTotals(mapArea): Record<string, number> | null` (`@/lib/house-totals`)
  - `FINDINGS_DENIED`, `loadFindings(sb, today?, now?): Promise<FindingsResult>`, and `getFindings`, a GET server function (`@/lib/findings.functions`)

- [ ] **Step 1: Write the failing test**

Create `tests/findings-functions.test.ts`:

```ts
// Checks for working out the findings against a stand-in database: field
// agents refused, the counts read and checked, each campaign ward placed in
// the atlas, the house totals, and every count missing before schema 25 is
// applied without the page failing. Nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-functions.test.ts

import { FINDINGS_DENIED, loadFindings } from "@/lib/findings.functions";
import { toIssueWeeks, toRivalWeeks, toWardIssues, toWardSpend } from "@/lib/findings/rows";
import { HOUSE_TOTALS, houseTotals } from "@/lib/house-totals";
import { MAP_AREAS } from "@/lib/map-areas";

import { fakeSupabase } from "./fake-supabase";
import { ATLAS, FULL, KEYS } from "./findings-fixture";

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

async function refuses(name: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    eq(name, "accepted", message);
  } catch (e) {
    eq(name, (e as Error).message, message);
  }
}

const CAMP = "camp-sakaja";
const TODAY = "2026-10-13";
const NOW = new Date("2026-10-13T09:00:00Z");

/** The fixture's atlas and campaign as database rows. */
const SEED = {
  campaigns: [{ id: CAMP, level: "governor", seat: "Governor · Nairobi", map_area: "nairobi" }],
  atlas_areas: ATLAS.areas,
  atlas_candidates: ATLAS.candidates.map((c) => ({ ...c, election_id: c.election })),
  atlas_results: ATLAS.results.map((r) => ({
    candidate_id: r.candidate,
    area_key: r.area,
    votes: r.votes,
    source_id: r.source,
  })),
  atlas_turnout: ATLAS.turnout.map((t) => ({
    election_id: t.election,
    area_key: t.area,
    registered: t.registered,
    cast_votes: t.cast,
    rejected: t.rejected,
    valid: t.valid,
    source_id: t.source,
  })),
  atlas_register: ATLAS.register.map((r) => ({
    year: r.year,
    area_key: r.area,
    registered: r.registered,
    source_id: r.source,
  })),
  atlas_population: ATLAS.population.map((p) => ({
    area_key: p.area,
    year: p.year,
    total: p.total,
    adults: p.adults,
    young_adults: p.youngAdults,
    source_id: p.source,
  })),
  atlas_sources: ATLAS.sources,
  atlas_indicators: ATLAS.indicators.map((x) => ({
    area_key: x.area,
    indicator: x.indicator,
    year: x.year,
    value: x.value,
    source_id: x.source,
  })),
  atlas_sides: [{ election_id: "2022-governor", bloc: "Bloc A" }],
  wards: FULL.wards.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    constituency: w.constituency,
    target_votes: w.targetVotes,
  })),
  diary_entries: FULL.diary.map((e) => ({
    id: e.id,
    day: e.day,
    starts_at: null,
    title: e.title,
    kind: e.kind,
    ward_id: e.wardId,
    note: null,
  })),
  race_rivals: FULL.rivals.map((r) => ({
    id: r.id,
    name: r.name,
    party: null,
    office: null,
    is_us: r.isUs,
    tone: r.tone,
    sort: r.sort,
  })),
  race_polls: FULL.polls.map((p) => ({
    id: p.id,
    pollster: p.pollster,
    fieldwork_from: null,
    fieldwork_to: null,
    published_on: p.publishedOn,
    sample_size: p.sampleSize,
    margin: p.margin,
    source_url: p.sourceUrl,
    shares: p.shares.map((s) => ({ name: s.name, share: s.share, rival_id: s.rivalId })),
    undecided: null,
    approval: null,
    disapproval: null,
  })),
};

/** The counting functions, as schema 25 returns them. */
const COUNTS = {
  house_doors: () =>
    FULL.doors!.map((d) => ({
      ward_id: d.wardId,
      knocked: d.knocked,
      rated: 0,
      supporters: 0,
      doors_week: 0,
      agents_today: [],
    })),
  ward_supporters: () =>
    FULL.supporters!.map((s) => ({ ward_id: s.wardId, supporters: s.supporters })),
  ward_spend: () => FULL.spend!.map((s) => ({ ward_id: s.wardId, kes: String(s.kes) })),
  ward_issues: () =>
    FULL.issues!.map((r) => ({ ward_id: r.wardId, source: r.source, issue: r.issue, n: r.n })),
  issue_weeks: () =>
    FULL.issueWeeks!.map((r) => ({ week: r.week, source: r.source, issue: r.issue, n: r.n })),
  rival_mention_weeks: () =>
    FULL.rivalWeeks!.map((r) => ({ week: r.week, rival_id: r.rivalId, n: r.n })),
};
const as = (role: string, counts: Record<string, () => unknown> = COUNTS) =>
  fakeSupabase(SEED, { my_campaign_role: () => role, my_campaign: () => CAMP, ...counts });

// ---------------------------------------------------------------- who

await refuses(
  "a field agent is refused",
  () => loadFindings(as("agent"), TODAY, NOW),
  FINDINGS_DENIED,
);
await refuses(
  "someone waiting to be admitted is refused",
  () => loadFindings(as("pending"), TODAY, NOW),
  FINDINGS_DENIED,
);

// ---------------------------------------------------------------- with schema 25

{
  const r = await loadFindings(as("organiser"), TODAY, NOW);
  eq("worked out now", r.asOf, "2026-10-13T09:00:00.000Z");
  eq("nothing waiting", r.waiting, []);
  eq("the side is set", r.sideSet, true);
  eq("each ward placed in the atlas", r.wardKeys["w-kawangware"], KEYS.kawangware);
  eq("every rule fires, as on the example", [...new Set(r.findings.map((f) => f.rule))].length, 12);
  eq(
    "the first finding",
    r.findings[0]?.line,
    "Kasarani: no diary stop in the last 60 days and none planned, with about 26,603 votes within reach.",
  );
}

// ---------------------------------------------------------------- before schema 25

{
  const r = await loadFindings(as("manager", { house_doors: COUNTS.house_doors }), TODAY, NOW);
  eq("the new counts are named as waiting", r.waiting, [
    "issue_weeks",
    "rival_mention_weeks",
    "ward_issues",
    "ward_spend",
    "ward_supporters",
  ]);
  eq(
    "the rules that need them are quiet; the rest still run",
    [...new Set(r.findings.map((f) => f.rule))],
    [
      "not-visited",
      "time-in-safe-seats",
      "one-seat-different-places",
      "votes-within-reach",
      "doors-behind",
      "unregistered-adults",
      "poll-move",
    ],
  );
}

// ---------------------------------------------------------------- rows

eq(
  "issue rows: malformed ones dropped, numbers as text read",
  toWardIssues([
    { ward_id: "w", source: "door", issue: "Water", n: "3" },
    { ward_id: "w", source: "sms", issue: "Water", n: 3 },
    { ward_id: null, source: "door", issue: "Water", n: 3 },
    { ward_id: "w", source: "news", issue: " ", n: 3 },
    "nonsense",
  ]),
  [{ wardId: "w", source: "door", issue: "Water", n: 3 }],
);
eq(
  "week rows",
  [
    toIssueWeeks([
      { week: 1, source: "messages", issue: "Floods", n: 2 },
      { week: -1, source: "door", issue: "x", n: 1 },
    ]),
    toRivalWeeks([
      { week: 0, rival_id: null, n: 9 },
      { week: 0, rival_id: 7, n: 1 },
    ]),
  ],
  [[{ week: 1, source: "messages", issue: "Floods", n: 2 }], [{ week: 0, rivalId: null, n: 9 }]],
);
eq("spend rows: numeric as text", toWardSpend([{ ward_id: "w", kes: "1500.50" }]), [
  { wardId: "w", kes: 1500.5 },
]);
eq("nothing that isn't a list", toWardIssues(null), []);

// ---------------------------------------------------------------- house totals

eq(
  "every map area has its house totals",
  MAP_AREAS.filter((a) => !HOUSE_TOTALS[a.key]).map((a) => a.key),
  [],
);
eq(
  "houses per ward slug",
  [
    houseTotals("nairobi")?.["kawangware"] !== undefined,
    Object.keys(houseTotals("nyeri/mathira") ?? {}).length,
    houseTotals(null),
    houseTotals("mombasa"),
  ],
  [true, 6, null, null],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-functions.test.ts`
Expected: it fails because it cannot find `@/lib/findings.functions`.

- [ ] **Step 3: Write the rows, the house totals and the server function**

Create `src/lib/findings/rows.ts`:

```ts
// The database counts as the rules read them: each row checked, anything
// malformed dropped. Pure.

import {
  ISSUE_SOURCES,
  type IssueSource,
  type IssueWeek,
  type RivalWeek,
  type WardIssue,
} from "@/lib/findings/core";

type Row = Record<string, unknown>;

const rowsOf = (data: unknown): Row[] =>
  Array.isArray(data) ? data.filter((r): r is Row => typeof r === "object" && r !== null) : [];

/** A whole number from a count or a numeric column (which can arrive as text). */
const whole = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const source = (v: unknown): IssueSource | null =>
  (ISSUE_SOURCES as string[]).includes(String(v)) ? (v as IssueSource) : null;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function toWardIssues(data: unknown): WardIssue[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const s = source(r["source"]);
    const issue = text(r["issue"]);
    const n = whole(r["n"]);
    return wardId && s && issue && n !== null ? [{ wardId, source: s, issue, n }] : [];
  });
}

export function toIssueWeeks(data: unknown): IssueWeek[] {
  return rowsOf(data).flatMap((r) => {
    const week = whole(r["week"]);
    const s = source(r["source"]);
    const issue = text(r["issue"]);
    const n = whole(r["n"]);
    return week !== null && s && issue && n !== null ? [{ week, source: s, issue, n }] : [];
  });
}

export function toRivalWeeks(data: unknown): RivalWeek[] {
  return rowsOf(data).flatMap((r) => {
    const week = whole(r["week"]);
    const n = whole(r["n"]);
    const rival = r["rival_id"];
    if (week === null || n === null || (rival !== null && typeof rival !== "string")) return [];
    return [{ week, rivalId: rival, n }];
  });
}

export function toWardSpend(data: unknown): { wardId: string; kes: number }[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const kes = whole(r["kes"]);
    return wardId && kes !== null ? [{ wardId, kes }] : [];
  });
}

export function toWardSupporters(data: unknown): { wardId: string; supporters: number }[] {
  return rowsOf(data).flatMap((r) => {
    const wardId = text(r["ward_id"]);
    const supporters = whole(r["supporters"]);
    return wardId && supporters !== null ? [{ wardId, supporters }] : [];
  });
}
```

Create `src/lib/house-totals.ts`:

```ts
// Each map area's houses per ward, from its house file's counts
// (public/tiles/houses-<id>.json, written by scripts/geo/house-tiles.ts).
// Imported, so server code reads them without a request; they are small.

import mathira from "../../public/tiles/houses-mathira.json";
import nairobi from "../../public/tiles/houses-nairobi.json";
import type { HouseCounts } from "@/lib/map-areas";

/** By the atlas key a campaign holds in campaigns.map_area; one per entry in MAP_AREAS. */
export const HOUSE_TOTALS: Record<string, HouseCounts> = {
  nairobi: nairobi as HouseCounts,
  "nyeri/mathira": mathira as HouseCounts,
};

/** Houses per ward slug in a map area; null for none, or an area with no house file. */
export const houseTotals = (mapArea: string | null | undefined): Record<string, number> | null =>
  (mapArea && HOUSE_TOTALS[mapArea]?.wards) || null;
```

Create `src/lib/findings.functions.ts`:

```ts
// The findings, worked out for the signed-in person's campaign. Everything
// the rules read is read as them, so row level security keeps it inside their
// campaign; field agents are refused. Each database count is read softly:
// before Lovable applies schema 25 its functions don't exist, and the rules
// that need them stay quiet while the page says what is waiting.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { wardKey } from "@/lib/atlas-app";
import { loadAtlas } from "@/lib/atlas.functions";
import { electionOf } from "@/lib/atlas-view";
import { nairobiToday } from "@/lib/demo/insights";
import { addDays } from "@/lib/diary";
import { loadDiary } from "@/lib/diary.functions";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";
import { findings } from "@/lib/findings";
import {
  FINDINGS_READERS,
  LIMITS,
  type Count,
  type FindingsResult,
  type FindingsWard,
} from "@/lib/findings/core";
import {
  toIssueWeeks,
  toRivalWeeks,
  toWardIssues,
  toWardSpend,
  toWardSupporters,
} from "@/lib/findings/rows";
import { houseTotals } from "@/lib/house-totals";
import { toWardDoors } from "@/lib/houses";
import { pageAll } from "@/lib/page-all";
import { loadPolls, loadRivals } from "@/lib/race.functions";

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: the counting functions are newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/** The words every closed page uses. */
export const FINDINGS_DENIED = "This page isn't part of your role.";

type WardRow = {
  id: string;
  name: string;
  slug: string;
  constituency: string;
  target_votes: number | null;
};

export async function loadFindings(
  sb: Client,
  today = nairobiToday(),
  now = new Date(),
): Promise<FindingsResult> {
  const { data: role } = (await sb.rpc("my_campaign_role")) as { data: unknown };
  if (!FINDINGS_READERS.includes(String(role))) throw new Error(FINDINGS_DENIED);
  const { data: campaignId } = (await sb.rpc("my_campaign")) as { data: unknown };

  const waiting: Count[] = [];
  /** A count's rows, every page; null (and named in `waiting`) when it can't be read. */
  const readCount = async (
    name: Count,
    args: Record<string, unknown> = {},
  ): Promise<unknown[] | null> => {
    let failed = false;
    const rows = await pageAll<unknown>(async (from, to) => {
      const { data, error } = (await sb.rpc(name, args).range(from, to)) as {
        data: unknown[] | null;
        error: unknown;
      };
      if (error) failed = true;
      return { data: error ? [] : data };
    });
    if (failed) waiting.push(name);
    return failed ? null : rows;
  };

  const [
    atlas,
    campaign,
    wardRows,
    diary,
    rivals,
    polls,
    doors,
    supporters,
    spend,
    issues,
    issueWeeks,
    rivalWeeks,
  ] = await Promise.all([
    loadAtlas(sb),
    sb
      .from("campaigns")
      .select("level, seat, map_area")
      .eq("id", String(campaignId))
      .maybeSingle() as Promise<{
      data: { level: string; seat: string; map_area: string | null } | null;
    }>,
    sb.from("wards").select("id, name, slug, constituency, target_votes") as Promise<{
      data: WardRow[] | null;
    }>,
    loadDiary(
      sb as never,
      addDays(today, -LIMITS.daysBack),
      addDays(today, LIMITS.daysAhead),
    ).catch(() => []),
    loadRivals(sb as never).catch(() => []),
    loadPolls(sb as never).catch(() => []),
    readCount("house_doors"),
    readCount("ward_supporters"),
    readCount("ward_spend", { _days: 30 }),
    readCount("ward_issues", { _days: 30 }),
    readCount("issue_weeks", { _weeks: 5 }),
    readCount("rival_mention_weeks", { _weeks: 5 }),
  ]);

  const c = campaign.data;
  const home = homeAreaFor(c, atlas.homeArea, atlas.areas);
  const race = defaultRace(c?.level);
  const level = new Map(atlas.areas.map((a) => [a.key, a.level]));
  const wards: FindingsWard[] = (wardRows.data ?? []).map((w) => {
    const k = wardKey(atlas, w.constituency, w.slug);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      constituency: w.constituency,
      key: k && level.get(k) === "ward" ? k : null,
      targetVotes: w.target_votes,
    };
  });

  return {
    asOf: now.toISOString(),
    findings: findings({
      today,
      home,
      race,
      atlas,
      wards,
      houses: houseTotals(c?.map_area),
      doors: doors ? toWardDoors(doors) : null,
      supporters: supporters ? toWardSupporters(supporters) : null,
      spend: spend ? toWardSpend(spend) : null,
      issues: issues ? toWardIssues(issues) : null,
      issueWeeks: issueWeeks ? toIssueWeeks(issueWeeks) : null,
      rivalWeeks: rivalWeeks ? toRivalWeeks(rivalWeeks) : null,
      diary,
      rivals,
      polls,
    }),
    waiting: waiting.sort(),
    sideSet: Boolean(atlas.sides[electionOf(race, 2022)]),
    wardKeys: Object.fromEntries(wards.flatMap((w) => (w.key ? [[w.id, w.key]] : []))),
  };
}

export const getFindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FindingsResult> => loadFindings(context.supabase as never));
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx tsx --tsconfig tsconfig.json tests/findings-functions.test.ts && npx tsc --noEmit -p . && npx eslint src/lib/findings src/lib/findings.functions.ts src/lib/house-totals.ts`
Expected: `16 passed, 0 failed`, then no output from `tsc` or `eslint`

- [ ] **Step 5: Commit**

```bash
git add src/lib/findings/rows.ts src/lib/house-totals.ts src/lib/findings.functions.ts tests/findings-functions.test.ts
git commit -m "$(cat <<'EOF'
Findings on the server: read as the person, counts read softly

Field agents are refused. Before schema 25 is applied, the counts that
need it are named as waiting and their rules stay quiet; the rest run.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The Strategy page

**Files:**
- Create: `src/hooks/useFindings.ts`
- Create: `src/components/gw/findings/FindingItem.tsx`
- Create: `src/components/gw/findings/SoWhat.tsx`
- Create: `src/routes/_authenticated/strategy.tsx`
- Modify: `src/components/gw/ConsoleShell.tsx` (menu item)
- Modify: `tests/access.test.ts`
- Modify: `src/styles/groundwork.css` (appended; no Prettier)
- Regenerated: `src/routeTree.gen.ts` (by the build)

**Interfaces:**
- Consumes: `getFindings` (Task 7); `FINDINGS_READERS`, `forPlace`, `emptyLine`, `placeParam`, `within`, `DECISIONS`, `DECISION_NAMES`, `RULES` (core); `useAccess`; `getAtlas`; `homeAreaFor`.
- Produces:
  - `useFindings()`: React Query `["findings", campaignId]`, kept 5 minutes, enabled only for `FINDINGS_READERS`.
  - `NextLink({ next })` and `FindingItem({ f, n? })`.
  - `SoWhat({ title, findings, place?, card? })`, which renders nothing without findings and links "See all findings" to `/strategy?place=`.
  - `PlaceFindings({ place, max, decisions?, title?, card? })`, which shows the findings about `place` and the places inside it (all of them when `place` is null), with campaign-wide ones only when `place` is null.
  - The route `/strategy`, with `?place=<atlas key>`.

- [ ] **Step 1: Write the access test**

In `tests/access.test.ts`, add above the closing `console.log`:

```ts
eq(
  "the team opens Strategy; agents and people waiting don't",
  [
    canOpen("organiser", "/strategy"),
    canOpen("candidate", "/strategy"),
    canOpen("agent", "/strategy"),
    canOpen("pending", "/strategy"),
  ],
  [true, true, false, false],
);
```

Run: `npx tsx --tsconfig tsconfig.json tests/access.test.ts`
Expected: all passed. It already holds, because `canOpen` opens unlisted pages to the team and keeps agents to field pages; the test guards that rule for Strategy.

- [ ] **Step 2: Write the shared query and the finding components**

Create `src/hooks/useFindings.ts`:

```ts
// The findings for the campaign in view, read once and shared by every
// screen that shows them: Strategy, Home, Elections, Voters and the Diary.
// Field agents and people not yet admitted don't ask.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAccess } from "@/hooks/useAccess";
import { getFindings } from "@/lib/findings.functions";
import { FINDINGS_READERS } from "@/lib/findings/core";

export function useFindings() {
  const { access, campaign } = useAccess();
  const fetchFindings = useServerFn(getFindings);
  return useQuery({
    queryKey: ["findings", campaign?.id ?? null],
    queryFn: () => fetchFindings(),
    enabled: Boolean(campaign?.id) && FINDINGS_READERS.includes(String(access?.role)),
    staleTime: 5 * 60_000,
  });
}
```

Create `src/components/gw/findings/FindingItem.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import type { Finding, Next } from "@/lib/findings/core";

/** Where a finding leads. */
export function NextLink({ next }: { next: Next }) {
  return (
    <Link
      to={next.to as never}
      search={(next.search ?? {}) as never}
      {...(next.hash ? { hash: next.hash } : {})}
      className="btn btn--ghost btn--sm"
    >
      {next.label}
    </Link>
  );
}

/** One finding: its line, its next step, and its figures and sources on request. */
export function FindingItem({ f, n }: { f: Finding; n?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="fd-item">
      {n !== undefined ? <span className="fd-n">{n}</span> : null}
      <div className="fd-body">
        <p className="fd-line">{f.line}</p>
        <div className="fd-actions">
          <NextLink next={f.next} />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            Figures and sources
          </button>
        </div>
        {open ? (
          <dl className="fd-figs">
            {f.figures.map((x, k) => (
              <Fragment key={k}>
                <dt>{x.label}</dt>
                <dd>
                  {x.text}{" "}
                  <span className="meta">
                    {x.source} · {x.period}
                  </span>
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}
```

Create `src/components/gw/findings/SoWhat.tsx`:

```tsx
import { Link } from "@tanstack/react-router";

import { FindingItem } from "@/components/gw/findings/FindingItem";
import { useFindings } from "@/hooks/useFindings";
import { forPlace, type Decision, type Finding } from "@/lib/findings/core";

/** A screen's few findings, and the way to the rest on Strategy. Nothing when there are none. */
export function SoWhat({
  title,
  findings,
  place = null,
  card = true,
}: {
  title: string;
  findings: Finding[];
  place?: string | null;
  card?: boolean;
}) {
  if (!findings.length) return null;
  return (
    <section className={card ? "card fd-card" : "fd-card"} aria-label={title}>
      <div className="card-head">
        <h2>{title}</h2>
        <Link to="/strategy" search={place ? { place } : {}} className="mono">
          See all findings
        </Link>
      </div>
      <ul className="fd-list">
        {findings.map((f) => (
          <FindingItem key={f.id} f={f} />
        ))}
      </ul>
    </section>
  );
}

/** The findings about a place and the places inside it (null: everywhere), from the shared read. */
export function PlaceFindings({
  place,
  max,
  decisions,
  title = "So what here",
  card = true,
}: {
  place: string | null;
  max: number;
  decisions?: Decision[];
  title?: string;
  card?: boolean;
}) {
  const { data } = useFindings();
  if (!data) return null;
  const here = forPlace(data.findings, place, false)
    .filter((f) => !decisions || decisions.includes(f.decision))
    .slice(0, max);
  return <SoWhat title={title} findings={here} place={place} card={card} />;
}
```

- [ ] **Step 3: Write the page**

Create `src/routes/_authenticated/strategy.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";

import { FindingItem } from "@/components/gw/findings/FindingItem";
import { useAccess } from "@/hooks/useAccess";
import { useFindings } from "@/hooks/useFindings";
import { getAtlas } from "@/lib/atlas.functions";
import { homeAreaFor } from "@/lib/elections-view";
import {
  DECISION_NAMES,
  DECISIONS,
  emptyLine,
  forPlace,
  placeParam,
  RULES,
  within,
} from "@/lib/findings/core";

const ABOUT =
  "What the figures say about where to spend time, what to say where, where to put field work and money, and how to answer rivals and polls.";
/** Findings shown for each rule before "Show more". */
const SHOWN = 5;

export const Route = createFileRoute("/_authenticated/strategy")({
  component: Strategy,
  // ?place=nairobi/dagoretti-north: that place's findings and its parts', and the campaign's.
  validateSearch: (search: Record<string, unknown>): { place?: string } => {
    const place = placeParam(search["place"]);
    return place ? { place } : {};
  },
  head: () => ({
    meta: [
      { title: "Strategy · Groundwork" },
      { name: "description", content: ABOUT },
      { property: "og:title", content: "Strategy · Groundwork" },
      { property: "og:description", content: ABOUT },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Strategy() {
  const { place } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { campaign } = useAccess();
  const { data, isError, refetch } = useFindings();
  const fetchAtlas = useServerFn(getAtlas);
  const { data: atlas } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  const [open, setOpen] = useState<string[]>([]);

  const home = atlas ? homeAreaFor(campaign, atlas.homeArea, atlas.areas) : null;
  const homeName = atlas?.areas.find((a) => a.key === home)?.name ?? "your area";
  const places =
    atlas && home
      ? atlas.areas
          .filter((a) => a.key !== home && a.level !== "country" && within(home, a.key))
          .sort((a, b) => a.key.localeCompare(b.key))
      : [];

  if (isError)
    return (
      <section className="view active" aria-label="Strategy">
        <div className="card">
          <h2>Couldn't load the findings. Try again.</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      </section>
    );

  const shown = data ? forPlace(data.findings, place ?? null) : [];
  let n = 0;
  return (
    <section className="view active" aria-label="Strategy">
      <div className="vh fx">
        <div>
          <span className="eyebrow">Operate · Strategy</span>
          <h1>What the numbers say</h1>
          <p className="meta">
            {data
              ? `Worked out at ${new Date(data.asOf).toLocaleTimeString("en-KE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Africa/Nairobi",
                })}. `
              : "Working out the findings… "}
            They change as the figures do.
          </p>
        </div>
        <label className="vh-side fd-place">
          <span>Place</span>
          <select
            value={place ?? ""}
            onChange={(e) => navigate({ search: e.target.value ? { place: e.target.value } : {} })}
          >
            <option value="">All of {homeName}</option>
            {places.map((a) => (
              <option key={a.key} value={a.key}>
                {a.level === "ward" ? `— ${a.name}` : a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data?.waiting.length ? (
        <p className="f-note fd-waiting">
          Some findings are waiting for a database update and show once it's applied.
        </p>
      ) : null}
      {data
        ? DECISIONS.map((d) => {
            const mine = shown.filter((f) => f.decision === d);
            const items: ReactNode[] = [];
            for (const r of RULES.filter((x) => x.decision === d)) {
              const all = mine.filter((f) => f.rule === r.id);
              const seen = open.includes(r.id) ? all : all.slice(0, SHOWN);
              for (const f of seen) items.push(<FindingItem key={f.id} f={f} n={++n} />);
              if (all.length > seen.length)
                items.push(
                  <li key={`${r.id}-more`} className="fd-more">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setOpen([...open, r.id])}
                    >
                      Show {all.length - seen.length} more
                    </button>
                  </li>,
                );
            }
            return (
              <section key={d} className="card fd-group" aria-labelledby={`fd-${d}`}>
                <div className="card-head">
                  <h2 id={`fd-${d}`}>{DECISION_NAMES[d]}</h2>
                </div>
                {items.length ? (
                  <ol className="fd-list">{items}</ol>
                ) : (
                  <p className="f-note">{emptyLine(d, data)}</p>
                )}
              </section>
            );
          })
        : null}
    </section>
  );
}
```

- [ ] **Step 4: Add it to the menu, and its styles**

In `src/components/gw/ConsoleShell.tsx`, in the "Operate" group, add after `{ to: "/elections", label: "Elections", faint: "ATLAS" },`:

```ts
      { to: "/strategy", label: "Strategy", faint: "SO WHAT" },
```

Append to `src/styles/groundwork.css` (by hand, not with Prettier):

```css

/* Findings: Strategy, Home, Elections, Voters and the Diary */
.fd-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px; }
.fd-item { display:flex; gap:10px; align-items:flex-start; }
.fd-n { flex:none; min-width:1.6rem; height:1.6rem; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; background:var(--muted); color:var(--foreground); }
.fd-body { min-width:0; flex:1; }
.fd-line { margin:0 0 6px; font-size:14px; line-height:1.45; }
.fd-actions { display:flex; flex-wrap:wrap; gap:6px; }
.fd-figs { display:grid; grid-template-columns:minmax(0, 15rem) minmax(0, 1fr); gap:4px 12px; margin:8px 0 0; font-size:12.5px; }
.fd-figs dt { color:var(--muted-foreground); }
.fd-figs dd { margin:0; }
.fd-group + .fd-group { margin-top:16px; }
.fd-place { display:flex; flex-direction:column; gap:4px; font-size:12.5px; }
.fd-place select { font:inherit; padding:6px 10px; border:1px solid var(--border); border-radius:10px; background:var(--card); color:inherit; max-width:100%; }
.fd-waiting { margin:0 0 12px; }
.diary-find { margin:2px 0 0; font-size:12px; color:var(--muted-foreground); }
@media (max-width:600px) { .fd-figs { grid-template-columns:1fr; } }
```

- [ ] **Step 5: Build, type-check and lint**

Run: `npm run build && npx tsc --noEmit -p . && npx eslint src/hooks/useFindings.ts src/components/gw/findings src/routes/_authenticated/strategy.tsx src/components/gw/ConsoleShell.tsx && npx prettier --check src/hooks/useFindings.ts src/components/gw/findings src/routes/_authenticated/strategy.tsx`
Expected: the build passes and regenerates `src/routeTree.gen.ts` with `/_authenticated/strategy`; no output from `tsc` or `eslint`; Prettier reports every file formatted.

- [ ] **Step 6: Look at it in the preview harness**

The harness is this session's scratchpad `harness/` (`.claude/launch.json`, "home-harness", port 5198). It runs server functions in the browser against `tests/fake-supabase.ts`, seeded from the real atlas; `?role=` picks the role.

In `harness/main.tsx`, add beside the other route imports:

```tsx
import { Route as DiaryRoute } from "@/routes/_authenticated/diary";
import { Route as HomeRoute } from "@/routes/_authenticated/home";
import { Route as StrategyRoute } from "@/routes/_authenticated/strategy";
```

and beside the other routes:

```tsx
const strategy = StrategyRoute.update({ id: "/strategy", path: "/strategy", getParentRoute: () => authed } as never);
const home = HomeRoute.update({ id: "/home", path: "/home", getParentRoute: () => authed } as never);
const diary = DiaryRoute.update({ id: "/diary", path: "/diary", getParentRoute: () => authed } as never);
```

then change `authed.addChildren([voters, field, elections])` to `authed.addChildren([voters, field, elections, strategy, home, diary])`.

In `harness/fake-db.ts`, add after `const kile = …`:

```ts
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const wardOf = (slug: string) => wards.find((w) => w.slug === slug)!;
const tally = (keys: string[]) => {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m];
};
```

In the seed object, replace `atlas_sides: [],` with:

```ts
    atlas_sides: [{ campaign_id: CAMPAIGN, election_id: "2022-governor", bloc: "Kenya Kwanza" }],
    diary_entries: (
      [
        ["kangemi", -20, "visit"],
        ["parklands-highridge", -9, "church"],
        ["kangemi", -4, "market"],
        ["parklands-highridge", 3, "meeting"],
        ["kawangware", 2, "rally"],
        ["kileleshwa", 5, "visit"],
      ] as const
    ).map(([slug, offset, kind], i) => ({
      id: uuid("d000", i + 1),
      campaign_id: CAMPAIGN,
      day: day(offset),
      starts_at: null,
      title: `Stop ${i + 1}`,
      kind,
      ward_id: wardOf(slug).id,
      note: null,
      wards: { name: wardOf(slug).name },
    })),
    race_rivals: [
      { id: uuid("e000", 1), campaign_id: CAMPAIGN, name: "Our Candidate", party: null, office: null, is_us: true, tone: "us", sort: 0, facebook: null, x: null, tiktok: null, search_as: null },
      { id: uuid("e000", 2), campaign_id: CAMPAIGN, name: "Challenger A", party: null, office: null, is_us: false, tone: "a", sort: 1, facebook: null, x: null, tiktok: null, search_as: null },
    ],
    race_polls: [
      ["p1", day(-50), 33, 31],
      ["p2", day(-10), 32, 35],
    ].map(([id, published, us, a]) => ({
      id: uuid("f000", id === "p1" ? 1 : 2),
      campaign_id: CAMPAIGN,
      pollster: "Pollster B",
      fieldwork_from: null,
      fieldwork_to: null,
      published_on: published,
      sample_size: 1_200,
      margin: 2.5,
      source_url: "https://example.test/poll",
      shares: [
        { name: "Our Candidate", share: us, rival_id: uuid("e000", 1) },
        { name: "Challenger A", share: a, rival_id: uuid("e000", 2) },
      ],
      undecided: null,
      approval: null,
      disapproval: null,
    })),
```

and add these beside `house_doors` among the functions:

```ts
    ward_supporters: () =>
      tally(people.filter((p) => p.consent_sms && !p.opted_out).map((p) => p.ward_id)).map(
        ([ward_id, supporters]) => ({ ward_id, supporters }),
      ),
    ward_spend: () => wards.slice(0, 12).map((w, i) => ({ ward_id: w.id, kes: 4_000 * (i + 1) })),
    ward_issues: () =>
      tally(
        houseVisits
          .filter((v) => v["issue"] && String(v["visited_at"]) > since(30))
          .map((v) => `${v["ward_id"]}|${v["issue"]}`),
      ).map(([k, n]) => ({ ward_id: k.split("|")[0], source: "door", issue: k.split("|")[1], n })),
    issue_weeks: () => [
      { week: 0, source: "door", issue: "Floods", n: 9 },
      { week: 0, source: "door", issue: "Water", n: 6 },
      { week: 0, source: "messages", issue: "Floods", n: 5 },
      { week: 0, source: "messages", issue: "Water", n: 3 },
      { week: 2, source: "door", issue: "Water", n: 30 },
      { week: 2, source: "door", issue: "Floods", n: 2 },
      { week: 3, source: "messages", issue: "Water", n: 22 },
      { week: 3, source: "messages", issue: "Floods", n: 1 },
    ],
    rival_mention_weeks: () => [
      ...[0, 1, 2, 3, 4].map((week) => ({ week, rival_id: null, n: 50 })),
      { week: 0, rival_id: uuid("e000", 2), n: 22 },
      { week: 2, rival_id: uuid("e000", 2), n: 30 },
    ],
```

Start the harness (`preview_start` "home-harness") and open `/strategy?role=organiser` at 1440×900 and at 390×844:
- four groups in order, each with numbered findings (1, 2, 3…) running down the page;
- "Figures and sources" opens each finding's figures, with their sources and periods;
- "Show N more" appears where a rule has more than five;
- the place picker narrows the page to Westlands and then to Kangemi, with the campaign-wide findings still there;
- `?place=../x` shows everything;
- no console errors.

Then `?role=agent` shows "This page isn't part of your role." To see the waiting note, comment out `ward_issues` in `fake-db.ts`: the page says some findings are waiting, and the issue findings go. Put it back afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useFindings.ts src/components/gw/findings src/routes/_authenticated/strategy.tsx src/routeTree.gen.ts src/components/gw/ConsoleShell.tsx tests/access.test.ts src/styles/groundwork.css
git commit -m "$(cat <<'EOF'
Strategy: every finding, numbered and grouped by decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Home's block, and the Moves card retired

**Files:**
- Create: `src/components/gw/home/FindingsBlock.tsx`
- Modify: `src/components/gw/home/Home.tsx`
- Modify: `src/components/gw/home/AtlasCards.tsx` (`MovesCard` goes)
- Modify: `src/components/gw/home/RaceSection.tsx`
- Modify: `src/components/gw/home/RaceReal.tsx`

**Interfaces:**
- Consumes: `useFindings`, `SoWhat` (Task 8), `firstOfEach` (core).
- Produces: `FindingsBlock({ today }: { today: string[] })`, where `today` is the Today list's titles; it leaves out the poll move when Today already shows it.

- [ ] **Step 1: Write the block**

Create `src/components/gw/home/FindingsBlock.tsx`:

```tsx
import { SoWhat } from "@/components/gw/findings/SoWhat";
import { useFindings } from "@/hooks/useFindings";
import { firstOfEach } from "@/lib/findings/core";

/**
 * Home's findings, right after Today: the first of each decision. When
 * Today's rival line is already the poll move, it isn't said twice.
 */
export function FindingsBlock({ today }: { today: string[] }) {
  const { data } = useFindings();
  if (!data) return null;
  const shown = firstOfEach(
    data.findings.filter(
      (f) => !(f.rule === "poll-move" && today.some((t) => f.line.startsWith(t))),
    ),
  );
  return (
    <div className="home-sec">
      <SoWhat title="What the numbers say" findings={shown} />
    </div>
  );
}
```

- [ ] **Step 2: Put it after Today**

In `src/components/gw/home/Home.tsx`, add `import { FindingsBlock } from "@/components/gw/home/FindingsBlock";` after the import of `CampaignSection`, and replace:

```tsx
        onEditStory={() => setEditing("story")}
      />
      {editing === "story" && <StoryEditor view={d.story} onClose={() => setEditing(null)} />}
```

with:

```tsx
        onEditStory={() => setEditing("story")}
      />
      <FindingsBlock today={items.map((t) => t.title)} />
      {editing === "story" && <StoryEditor view={d.story} onClose={() => setEditing(null)} />}
```

- [ ] **Step 3: Retire the Moves card**

Its seats are now rule 6 (votes within reach).

In `src/components/gw/home/RaceSection.tsx` and `src/components/gw/home/RaceReal.tsx`:
- change `import { LastResultCard, MovesCard } from "@/components/gw/home/AtlasCards";` to `import { LastResultCard } from "@/components/gw/home/AtlasCards";`;
- delete the line `<MovesCard />`.

Replace the whole of `src/components/gw/home/AtlasCards.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ResultList } from "@/components/gw/elections/ResultList";
import { useAccess } from "@/hooks/useAccess";
import { getAtlas } from "@/lib/atlas.functions";
import { raceInText, resultBlocks } from "@/lib/atlas-view";
import { defaultRace, homeAreaFor } from "@/lib/elections-view";

/** The atlas as Home reads it: the campaign's home area and race. Null until it loads. */
function useAtlasHome() {
  const { campaign } = useAccess();
  const fetchAtlas = useServerFn(getAtlas);
  const { data } = useQuery({
    queryKey: ["atlas"],
    queryFn: () => fetchAtlas(),
    staleTime: 5 * 60_000,
  });
  if (!data) return null;
  const home = homeAreaFor(campaign, data.homeArea, data.areas);
  return {
    d: data,
    home,
    homeName: data.areas.find((a) => a.key === home)?.name ?? "your area",
    race: defaultRace(campaign?.level),
  };
}

/** The campaign's race the last time, in its home area, from the atlas. */
export function LastResultCard() {
  const a = useAtlasHome();
  if (!a) return null;
  const block = resultBlocks(a.d, a.home, [a.race])[0] ?? null;
  return (
    <section className="card mb-last" aria-labelledby="home-last-h">
      <div className="card-head">
        <h2 id="home-last-h">Last time</h2>
        <Link to="/elections" search={{ area: a.home }} className="mono">
          Elections
        </Link>
      </div>
      {block ? (
        <ResultList block={block} />
      ) : (
        <p className="f-note">
          The last {raceInText(a.race)} result for {a.homeName} isn't in the atlas yet.{" "}
          <Link to="/elections" search={{ area: a.home }}>
            Open Elections
          </Link>
        </p>
      )}
    </section>
  );
}
```

`topMoves` in `src/lib/atlas-app.ts` stays: rule 6 uses it.

- [ ] **Step 4: Build, type-check and lint**

Run: `npm run build && npx tsc --noEmit -p . && npx eslint src/components/gw/home && npx tsx --tsconfig tsconfig.json tests/home.test.ts`
Expected: the build passes; no output from `tsc` or `eslint`; `41 passed, 0 failed`

- [ ] **Step 5: Look at it in the preview**

Open `/home?role=manager` in the harness. "What the numbers say" sits right after Today, with up to four findings, one per decision, and "See all findings" leads to Strategy. The Race section has no "Where votes can move" card, and "Last time" is still there. With Today's rival line being the poll move ("Challenger A up 4.0 points…"), the block shows the rival-in-the-news finding for rivals and polls instead. Check at 390×844 too.

- [ ] **Step 6: Commit**

```bash
git add src/components/gw/home/FindingsBlock.tsx src/components/gw/home/Home.tsx src/components/gw/home/AtlasCards.tsx src/components/gw/home/RaceSection.tsx src/components/gw/home/RaceReal.tsx
git commit -m "$(cat <<'EOF'
Home: what the numbers say, after Today

The first finding of each decision. The Moves card goes: its seats are
the votes-within-reach findings now.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Findings on Elections, Voters and the Diary

**Files:**
- Modify: `src/routes/_authenticated/elections.tsx`
- Modify: `src/components/gw/elections/SetupPanel.tsx`
- Modify: `src/components/gw/voters/MapPanel.tsx`
- Modify: `src/routes/_authenticated/diary.tsx`
- Modify: `src/components/gw/diary/DiaryWeek.tsx`

**Interfaces:**
- Consumes: `PlaceFindings` (Task 8), `useFindings`, `votersPlace` (core), `addDays` (`@/lib/diary`).
- Produces: the diary's `?add=<ward id>` search param; `DiaryWeek`'s new prop `addWard?: string | undefined`.

- [ ] **Step 1: Elections**

In `src/routes/_authenticated/elections.tsx`, add `import { PlaceFindings } from "@/components/gw/findings/SoWhat";` after the import of `CountyView`, and replace:

```tsx
        ) : null}
      </div>
      {area.level === "constituency" ? (
        <ConstituencyView
```

with:

```tsx
        ) : null}
      </div>
      <PlaceFindings place={area.key} max={5} />
      {area.level === "constituency" ? (
        <ConstituencyView
```

In `src/components/gw/elections/SetupPanel.tsx`, after `await qc.invalidateQueries({ queryKey: ["atlas"] });` add:

```ts
      await qc.invalidateQueries({ queryKey: ["findings"] });
```

A new side changes what to do in every seat, so the findings are worked out again.

- [ ] **Step 2: Voters**

In `src/components/gw/voters/MapPanel.tsx`, add after `import { LastTimeHere } from "@/components/gw/voters/LastTimeHere";`:

```tsx
import { PlaceFindings } from "@/components/gw/findings/SoWhat";
import { useFindings } from "@/hooks/useFindings";
```

and after `import type { CanvassData } from "@/lib/console.functions";`:

```tsx
import { votersPlace } from "@/lib/findings/core";
```

Replace `{isAgent ? null : <LastTimeHere area={area} wards={wards} />}` with:

```tsx
      {isAgent ? null : <LastTimeHere area={area} wards={wards} />}
      {isAgent ? null : <VotersFindings area={area} wards={wards} />}
```

and add at the end of the file:

```tsx

/** The map's few field and message findings for the area in view; none for a place the atlas doesn't hold. */
function VotersFindings({ area, wards }: { area: Area; wards: WardInfo[] }) {
  const { data } = useFindings();
  const place = data ? votersPlace(area, wards, data.wardKeys) : undefined;
  if (place === undefined) return null;
  return <PlaceFindings place={place} max={3} decisions={["field", "message"]} card={false} />;
}
```

- [ ] **Step 3: The diary**

In `src/routes/_authenticated/diary.tsx`, add `import { PlaceFindings } from "@/components/gw/findings/SoWhat";` after the import of `DiaryWeek`, and replace the `validateSearch`, with its comment, by:

```tsx
  // ?week=2026-10-05: the week that holds that day; none: this week. ?add=<ward id>: a
  // finding's "Plan a visit", which opens today's form with that ward chosen.
  validateSearch: (search: Record<string, unknown>): { week?: string; add?: string } => {
    const w = typeof search["week"] === "string" ? search["week"] : "";
    const a = typeof search["add"] === "string" ? search["add"] : "";
    return {
      ...(/^\d{4}-\d{2}-\d{2}$/.test(w) ? { week: w } : {}),
      ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a) ? { add: a } : {}),
    };
  },
```

In `DiaryPage`, change `const { week } = Route.useSearch();` to `const { week, add } = Route.useSearch();` and replace `<DiaryWeek week={data} canEdit={isPrincipal} />` with:

```tsx
          <>
            <PlaceFindings
              place={null}
              decisions={["time"]}
              max={3}
              title="Where the candidate's time goes"
            />
            <DiaryWeek week={data} canEdit={isPrincipal} addWard={add} />
          </>
```

In `src/components/gw/diary/DiaryWeek.tsx`:

1. Add `import { useFindings } from "@/hooks/useFindings";` after the import of `useAccess`, and add `addDays,` as the first name in the import from `@/lib/diary`.
2. In `useRefresh`, after `await queryClient.invalidateQueries({ queryKey: ["home"] });`, add `await queryClient.invalidateQueries({ queryKey: ["findings"] });`.
3. Add this after `useBriefs`:

```tsx
/** Each stop in the next seven days with a ward: that ward's first two message or field findings. */
function useStopFindings(week: Week): Record<string, string[]> {
  const { data } = useFindings();
  return useMemo(() => {
    if (!data) return {};
    const last = addDays(week.today, 6);
    const out: Record<string, string[]> = {};
    for (const e of week.entries) {
      const key = e.wardId ? data.wardKeys[e.wardId] : undefined;
      if (!key || e.day < week.today || e.day > last) continue;
      const lines = data.findings
        .filter((f) => f.place === key && (f.decision === "message" || f.decision === "field"))
        .slice(0, 2)
        .map((f) => f.line);
      if (lines.length) out[e.id] = lines;
    }
    return out;
  }, [data, week]);
}
```

4. Replace the `DiaryWeek` component with:

```tsx
/** A week of the diary, Monday to Sunday, each day with its entries by time. */
export function DiaryWeek({
  week,
  canEdit,
  addWard,
}: {
  week: Week;
  canEdit: boolean;
  /** From a finding's "Plan a visit": today's form opens with this ward chosen. */
  addWard?: string | undefined;
}) {
  const briefs = useBriefs(week);
  const finds = useStopFindings(week);
  return (
    <div className="diary-days">
      {week.days.map((day) => (
        <DiaryDay
          key={day}
          day={day}
          isToday={day === week.today}
          entries={week.entries.filter((e) => e.day === day)}
          wards={week.wards}
          briefs={briefs}
          finds={finds}
          canEdit={canEdit}
          startWard={canEdit && day === week.today ? addWard : undefined}
        />
      ))}
    </div>
  );
}
```

5. In `DiaryDay`'s props, add `finds,` after `briefs,` and `startWard,` after `canEdit,`. In its types, add after `briefs: Record<string, string>;`:

```tsx
  /** The stop's ward's findings, by entry id, for stops in the next seven days. */
  finds: Record<string, string[]>;
```

and after `canEdit: boolean;` add `startWard?: string | undefined;`. Change `const [adding, setAdding] = useState(false);` to `const [adding, setAdding] = useState(Boolean(startWard));`.
6. After the `briefs[e.id] ? (…) : null` paragraph, add:

```tsx
                  {finds[e.id]?.map((line) => (
                    <p key={line} className="diary-find">
                      {line}
                    </p>
                  ))}
```

7. Replace `<EntryForm day={day} entry={null} wards={wards} onDone={() => setAdding(false)} />` with:

```tsx
        <EntryForm
          day={day}
          entry={null}
          wards={wards}
          startWard={startWard}
          onDone={() => setAdding(false)}
        />
```

8. In `EntryForm`'s props, add `startWard,` after `wards,` and `startWard?: string | undefined;` after `wards: Ward[];`. Change `useState(entry?.wardId ?? "")` to `useState(entry?.wardId ?? startWard ?? "")`.

- [ ] **Step 4: Build, type-check and lint**

Run: `npm run build && npx tsc --noEmit -p . && npx eslint src/routes/_authenticated/elections.tsx src/routes/_authenticated/diary.tsx src/components/gw/elections/SetupPanel.tsx src/components/gw/voters/MapPanel.tsx src/components/gw/diary/DiaryWeek.tsx && npx prettier --check src/routes/_authenticated/elections.tsx src/routes/_authenticated/diary.tsx src/components/gw/elections/SetupPanel.tsx src/components/gw/voters/MapPanel.tsx src/components/gw/diary/DiaryWeek.tsx`
Expected: the build passes; no output from `tsc` or `eslint`; Prettier reports every file formatted.

- [ ] **Step 5: Look at them in the preview**

In the harness, at 1440×900 and 390×844:
- `/elections?role=organiser&area=nairobi/dagoretti-north`: "So what here" under the switches, up to five findings about the seat and its wards; "See all findings" opens Strategy at that place. At `area=nairobi`, the county's top five.
- `/voters?role=manager&area=c:Westlands`: the panel shows up to three field and message findings under "Last time here"; at a ward, that ward's. `?role=agent` shows none.
- `/diary?role=manager`: "Where the candidate's time goes" above the week; each stop in the next seven days at Kawangware or Kileleshwa shows its ward's findings in small print. Open "Plan a visit" from a not-visited finding on Strategy: today's form opens with that ward chosen. As `role=organiser`, the same link opens the diary without a form.
- Setting a side in Elections' setup panel works out the findings again.
- No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/elections.tsx src/components/gw/elections/SetupPanel.tsx src/components/gw/voters/MapPanel.tsx src/routes/_authenticated/diary.tsx src/components/gw/diary/DiaryWeek.tsx
git commit -m "$(cat <<'EOF'
Findings on Elections, the Voters map and the Diary

So what here on every Elections place; the map's field and message
findings for the area in view; the candidate's time above the diary week,
each coming stop's ward findings, and "Plan a visit" opening today's form.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Docs, the whole check, and the release

**Files:**
- Modify: `AGENTS.md` (one line)

- [ ] **Step 1: Record the rule for whoever works here next**

Append to the bullet list at the end of `AGENTS.md`:

```markdown
- Findings are plain-code rules (`src/lib/findings/`) over counts from database functions (`ward_issues`, `issue_weeks`, `rival_mention_weeks`, `ward_spend`, `ward_supporters`, `house_doors`) that return counts only and nothing to field agents; every number in a finding's line is one of its figures. Why: part 3's AI writes only from findings, and a checker can hold it to them.
```

- [ ] **Step 2: The whole check**

Run: `npm test && npm run build && git diff --name-only main...HEAD -- '*.ts' '*.tsx' | xargs npx eslint`
Expected: every tsx file `0 failed`, including the seven new `findings-*` files; every SQL file `ok`, including `findings.test.sql (7 tests)`; the build passes; no lint output.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
AGENTS.md: how findings are made

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Hand the release to the user**

Don't push. Tell the user the branch is ready, and that once it's on `main`, Lovable must apply `supabase/migrations/20261014090000_findings.sql` (schema 25). The code reads the new counts softly, so it can ship before the migration, but issue, spend, supporter and rival-news findings wait for it. To check afterwards, `select public.groundwork_schema_version();` should return 25 in Supabase's SQL editor.
