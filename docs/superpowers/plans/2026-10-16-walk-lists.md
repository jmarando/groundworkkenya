# Walk lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organiser plans a walk list on the Voters map (a suggested patch of 50 houses, or a shape drawn around houses), the doors are put in walking order and the list is given to a person; that person's phone opens on "Your walk lists" and works through each list door by door, with or without signal; the list closes itself when every door has been visited.

**Architecture:** Schema 28 adds `walk_lists` and `walk_list_doors` (each door carries its plus code, position, outline and ward), `house_visits.walk_list_id`, and database functions that are the only way to write a list; `record_door` learns to record a visit at a list's door with no person. Every rule (which houses a patch takes, a drawn shape's houses, the walking order, progress, the next door) is a pure function in `src/lib/walk-lists.ts`, tested with `eq()` scripts; server functions only read and call; the map and phone screens draw what they return. A list opened once with signal is kept in the phone's IndexedDB and deleted when the list ends, at sign-out and after 14 days.

**Tech Stack:** TanStack Start and Router, React 19, React Query 5, MapLibre GL 6, Supabase (Postgres 17), tsx test scripts, `tests/sql/run.sh`. No new libraries.

**Spec:** `docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md`, sections 2 to 4 and "Testing" (part 2). Part 1, the centres, is built and live (schema 27).

**Not in this plan:** notifications ("You've been given a walk list" is the next piece); routes along roads; street maps with no signal; 2022 results by polling station; agents' write access to people records (still open, worth its own fix).

## Global Constraints

- **Schema 28** is one hand-written file, `supabase/migrations/20261016090000_walk_lists.sql`, safe to run again, applied after schema 27, that sets `groundwork_schema_version()` to 28. Nothing else writes a list: no insert, update or delete is granted on the new tables.
- **A patch** is the 50 houses nearest the centre (or a tapped point) in that centre's area. It skips houses spoken to or refused in the last 30 days, houses marked not home in the last 3 days, and houses on another open list. In a ward with no placed centre it is the 50 nearest the tapped point in that ward.
- **A drawn shape** takes every house whose centre is inside it, except houses on another open list, which the screen counts ("12 houses are on other lists and were left out"). Over 150 houses it asks for a smaller area.
- **Walking order:** from the door nearest the centre (or the first door), a nearest-neighbour walk, then 2-opt (reverse a stretch while that shortens the walk), on straight-line distances between house centres. Worked out in the browser when planning; saved as each door's place in the order.
- **A list is `draft`, `out` (with one person) or `done`.** It is done when every door has a visit since the list first went out ("not home" included), or when an organiser closes it. An out list can be given to someone else and keeps its progress. A house is on at most one open (`draft` or `out`) list.
- **Who:** the candidate, managers, organisers and the platform owner plan, send, give again and close lists. An agent reads the lists given to them, their doors, and the visits at those doors, besides their own visits. People records are unchanged; an agent sees full phone numbers at their list's doors.
- **A door** is saved with its plus code, centre point, outline (rings rounded to 5 decimal places, about a metre) and ward, so the phone never reads the house file for a list.
- **On the phone:** the lists refresh when the app opens and every 60 seconds while it is open with signal. A list opened once with signal is kept (doors, order, outlines, the names and numbers on file at the doors, their last visits); the copy is deleted when the list is done or closed, at sign-out, and after 14 days. This changes AGENTS.md's rule that walk lists are never saved, for walk lists only, with the user's agreement on 14 October 2026.
- **The words on screen, exactly:** "Plan a walk list here", "Use the suggested patch", "Draw around houses", "Send", "Give to someone else", "Close", "Your walk lists", "15 of 44 done" (the form), "12 houses are on other lists and were left out" (one: "1 house is on another list and was left out"), "No signal · 3 visits saved on the phone, they send when it comes back", "Spoke", "Not home", "Refused", "Add them", "Save · go to door 16".
- **Database errors written for people** use `errcode` `P0001` (a bad request) or `42501` (not allowed), as `place_station` does; the server functions pass those messages on and replace every other error with a sentence of their own.
- **Reads fail soft.** Before schema 28 is applied each read returns `null` and writes one log line (the error's message, never rows); the screens go on without lists. A push does not run migrations, so this is the state right after a push.
- **Tests** are tsx files in `tests/` with the `eq()` helper, ending with ``console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);``. One at a time from the repository root: `npx tsx --tsconfig tsconfig.json tests/<file>.test.ts`; everything: `npm test` (it includes `tests/sql/run.sh`). `tsc` covers `src/` only.
- **Repository rules:** never run Prettier on `src/styles/groundwork.css` (add rules by hand); never name TransTally; the repository is public (no secrets, no voter data); commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; nothing is pushed, applied to the real database or published without the user's OK; keep the branch working (AGENTS.md); never rewrite pushed history; Lovable's bot commits to `main` too, so `git fetch` and rebase before pushing.

## Decisions to confirm

Choices the spec left open. Please read these.

1. **`draft` exists, the screen doesn't offer it.** The table and `create_walk_list` support a list with no one to give it to, as the spec's three states say, but Send needs a person, so organisers only ever make lists that go straight out.
2. **A knock is never refused because the list moved on.** A visit made offline at a door of a list that has since been closed or given to someone else is still recorded (at the house, with the list); the list's state does not change. A visit at a door that is not on that list is refused with a reason and waits in the phone's queue as a problem the agent can retry or discard.
3. **A drawn shape keeps houses spoken to recently** (the organiser chose them); only a patch skips them. Only houses on another open list are left out of a drawn shape, as the spec says.
4. **Door numbers on the phone's map are HTML markers, and the map with no signal is a plain background** drawn from the list's own outlines. A symbol layer needs the street style's fonts, which aren't there offline. With signal the list's map sits on the street style, not satellite.
5. **The people picker** lists agents first (each with the doors still open on their lists), then organisers, managers and the candidate, from a database function so organisers, who can't open Team, can use it.
6. **The phone's saved copy holds full phone numbers** of people at the list's doors (agreed 14 October). It is deleted the next time the phone has signal after the list is done or closed, at sign-out and after 14 days.
7. **Visits waiting to send count toward a list's progress on the phone**, and "done" only becomes true on the server once they arrive.
8. **A skipped door** is remembered while the list is open, not across a reload.
9. **Street level means zoom 16 or more** (the spec's 16 to 20): "Plan a walk list" appears in the panel there, besides the centre card's button.
10. **A default name** is the centre's name, tidied ("Kileleshwa Primary"), and the number of lists already made from it plus one; with no centre, the ward's name and a number.

## Review Focus

1. **Two organisers plan the same street at once.** The second list leaves off the shared houses and says how many; a list whose every house is taken is refused, never created empty.
   - Pinned: Task 1 ("a house is on one open list only", "every house taken"); Task 2 (`housesWithin` counts `otherList`).
2. **A drawn shape that is a line, has no houses, crosses itself or holds more than 150 houses.** A sentence, never a crash or an empty list.
   - Pinned: Task 2 (`housesWithin` on two points, an empty shape, a bow tie, 151 houses).
3. **A phone that never opened a list with signal.** It says "This list needs signal once to open." One opened once works with no signal, and its copy is gone after sign-out, after the list ends and after 14 days.
   - Pinned: Task 5 (`listsToForget`, the saved entries); seen in Task 6's harness steps.
4. **A visit synced twice, or from two tabs.** It is counted once and the list becomes done once.
   - Pinned: Task 1 ("a repeat is ignored", "done once").
5. **A block of flats (an outline of 200 m² or more) is one door with several households.** The door's card shows the existing note ("This outline covers 240 m², often several homes: log each household as its own visit").
   - Pinned: Task 6's harness step; the note is `blockNote` in `src/lib/houses.ts`.
6. **An agent opening `/voters` from an old bookmark.** The page guard sends them to `/field`, where their lists, their ward list and "Polling centres near me" are.
   - Pinned: Task 7 (`canOpen("agent", "/voters")` is false).

---

### Task 1: Schema 28, walk lists in the database

**Files:**
- Create: `supabase/migrations/20261016090000_walk_lists.sql`
- Create: `tests/sql/walk-lists.test.sql`

**Interfaces:**
- Consumes: schema 27; `house_visits`, `people`, `wards`, `polling_stations`; `record_door` as `20261012090000_voters_map.sql` leaves it (10 arguments); `my_campaign()`, `my_campaign_role()`, `is_team_member()`, the `stamp_campaign` trigger; the accounts in `tests/sql/fixtures.sql` (a1 Sakaja candidate, c3 manager, b2 agent, f6 Mathira agent).
- Produces (all `security definer` unless marked, `set search_path = public`, execute granted to `authenticated` only):
  - Tables `walk_lists (id, campaign_id, name, centre_id, ward_id, status, given_to, made_by, first_sent_at, given_at, done_at, closed_by, created_at)` and `walk_list_doors (campaign_id, walk_list_id, position, pc, lat, lng, outline, ward_id)`; column `house_visits.walk_list_id`.
  - `create_walk_list(_name text, _centre_id uuid, _ward_id uuid, _doors jsonb, _give_to uuid default null) returns jsonb` → `{"id": uuid, "left_off": integer}`. `_doors` is an array in walking order of `{pc, lat, lng, outline, ward_id}`.
  - `give_walk_list(_id uuid, _to uuid) returns void`; `close_walk_list(_id uuid) returns void`.
  - `walk_list_team() returns table (user_id uuid, full_name text, role text, doors_open integer)`; `walk_list_planning(_ward_id uuid) returns table (pc text, spoke_or_refused_at timestamptz, not_home_at timestamptz, on_list uuid)`: both staff only.
  - `walk_list_counts(_ids uuid[]) returns table (list_id uuid, doors integer, done integer, not_home integer)` (`security invoker`).
  - `open_walk_lists(_ward_id uuid) returns table (id uuid, name text, status text, centre_id uuid, ward_id uuid, given_to uuid, given_to_name text, doors integer, done integer, not_home integer, first_sent_at timestamptz, given_at timestamptz)`; `my_walk_lists() returns table (id uuid, name text, centre_id uuid, centre_name text, ward_id uuid, doors integer, done integer, given_at timestamptz, first_sent_at timestamptz)`; `walk_list_doors(_list_id uuid) returns table (position integer, pc text, lat double precision, lng double precision, outline jsonb, ward_id uuid, last_outcome text, last_at timestamptz)` (all `security invoker`: row level security decides who sees what).
  - `record_door(...the 10 it has, _walk_list_id uuid default null, _door_pc text default null) returns jsonb`, same result shape (`person_id` may now be null).

- [ ] **Step 1: Write the failing tests** in `tests/sql/walk-lists.test.sql`, in the style of `tests/sql/centres.test.sql`: `\ir fixtures.sql`, then each test is `begin; set local request.jwt.claim.sub = '<account>'; set local role authenticated; do $$ ... $$; rollback;` (`reset role` to write as the owner). The accounts are the fixtures' (`a1` candidate, `c3` manager, `b2` agent, `f6` Mathira agent, all `00000000-0000-0000-0000-0000000000XX`); `kile` is Sakaja's Kileleshwa ward; `pg_temp.fails_with(sql, message)` is the fixtures' helper. Start the file with a helper that builds doors, and write these tests:

```sql
create or replace function pg_temp.doors(_from integer, _to integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('pc', 'TEST0000+' || lpad(i::text, 2, '0'), 'lat', -1.28 - i * 0.00005, 'lng', 36.78,
    'outline', jsonb_build_array(jsonb_build_array(jsonb_build_array(36.78, -1.28), jsonb_build_array(36.78002, -1.28),
                                                   jsonb_build_array(36.78002, -1.28002), jsonb_build_array(36.78, -1.28))),
    'ward_id', null) order by i) from generate_series(_from, _to) i $$;

-- test: schema 28 is in
do $$ begin assert public.groundwork_schema_version() >= 28; end $$;

-- test: staff make and give a list, an agent cannot   (as c3, then as b2)
--   made := create_walk_list('Kileleshwa Primary 1', null, kile, pg_temp.doors(1, 5), b2)
assert (made ->> 'left_off')::int = 0;
assert (select status = 'out' and given_to = b2 and first_sent_at is not null and given_at is not null from public.walk_lists where id = (made ->> 'id')::uuid);
assert (select count(*) from public.walk_list_doors where walk_list_id = (made ->> 'id')::uuid) = 5;
assert (select position from public.walk_list_doors where walk_list_id = (made ->> 'id')::uuid and pc = 'TEST0000+03') = 3;
--   as b2: assert pg_temp.fails_with($q$ select public.create_walk_list('x', null, (select id from public.wards limit 1), pg_temp.doors(1, 2)) $q$, 'Only organisers and managers can plan walk lists.');

-- test: a house is on one open list only, and a list with every house taken is refused   (as c3)
--   one := create_walk_list('One', null, kile, pg_temp.doors(1, 5), null)  -- no one to give it to: a draft, which holds its houses
assert (select status from public.walk_lists where id = (one ->> 'id')::uuid) = 'draft';
--   two := create_walk_list('Two', null, kile, pg_temp.doors(4, 9), null)
assert (two ->> 'left_off')::int = 2 and (select count(*) from public.walk_list_doors where walk_list_id = (two ->> 'id')::uuid) = 4;
assert pg_temp.fails_with(format($q$ select public.create_walk_list('Three', null, %L, pg_temp.doors(1, 3), null) $q$, kile), 'Every one of those houses is on another list.');
assert pg_temp.fails_with(format($q$ select public.create_walk_list('Four', null, %L, '[]'::jsonb, null) $q$, kile), 'Pick at least one house.');

-- test: closing frees the houses, giving again keeps the progress, giving to a stranger is refused   (as c3)
perform public.close_walk_list((one ->> 'id')::uuid);
assert (select status = 'done' and done_at is not null and closed_by = c3 from public.walk_lists where id = (one ->> 'id')::uuid);
assert ((public.create_walk_list('Again', null, kile, pg_temp.doors(1, 3), null)) ->> 'left_off')::int = 0;
--   give two to b2, b2 records a visit at TEST0000+06, give two to a1: walk_list_counts(two).done is still 1
assert pg_temp.fails_with(format($q$ select public.give_walk_list(%L, %L) $q$, two_id, f6), 'That person isn''t on your team.');

-- test: an agent reads their lists, doors and the visits at them; another campaign's agent reads none
--   (as owner) list A for b2 with doors 1-4, list B for c3 with doors 6-9, a visit by c3 at TEST0000+02
--   as b2: count(*) from walk_lists = 1; from walk_list_doors = 4; (select count(*) from house_visits where pc = 'TEST0000+02') = 1; ... pc = 'TEST0000+07' = 0
assert (select doors = 4 and done = 0 from public.my_walk_lists());
--   as f6: count(*) from walk_lists = 0 and count(*) from public.walk_list_doors(A) = 0

-- test: record_door at a list door with no person is a visit on the house, with the list   (as b2, list A out)
--   r := record_door(cid, null, null, 'not_home', null, '', '{}', '', now(), null, list_a, 'TEST0000+01')
assert (r ->> 'repeat') = 'false' and (r -> 'person_id') = 'null'::jsonb;
assert (select walk_list_id = list_a and person_id is null and outcome = 'not_home' and ward_id = kile from public.house_visits where client_id = cid);
assert (public.record_door(cid, null, null, 'not_home', null, '', '{}', '', now(), null, list_a, 'TEST0000+01')) = '{"repeat": true}';
assert (select count(*) from public.house_visits where client_id = cid) = 1;
assert pg_temp.fails_with(format($q$ select public.record_door(%L, null, null, 'spoke', 3, '', '{}', '', now(), null, %L, 'TEST0000+99') $q$, gen_random_uuid(), list_a), 'That door isn''t on this list.');
--   a list id of another campaign's list gives the same sentence

-- test: record_door at a list door with a new person records the person, the event and the house
--   spoke, support 4, _new '{"phone":"+254712000001","name":"Mercy","ward_id":null,"language":"sw"}', door TEST0000+02
assert (r ->> 'created') = 'true';
assert exists (select 1 from public.people where phone = '+254712000001');
assert (select count(*) from public.person_events where kind in ('added', 'door_spoke') and person_id = (r ->> 'person_id')::uuid) = 2;
assert (select person_id = (r ->> 'person_id')::uuid and walk_list_id = list_a and support = 4 from public.house_visits where pc = 'TEST0000+02' and actor = b2);

-- test: a knock is never refused because the list moved on   (list A closed by c3, then b2 visits TEST0000+03)
assert (select walk_list_id = list_a from public.house_visits where pc = 'TEST0000+03');
assert (select status from public.walk_lists where id = list_a) = 'done';   -- and stays done

-- test: the list is done once every door has a visit since it first went out, and only once
--   a visit dated before first_sent_at (insert as owner) does not count; visiting the other doors, the last a not_home, makes it done
assert (select status = 'done' and done_at is not null from public.walk_lists where id = list_a);
--   one more visit: done_at is unchanged

-- test: walk_list_team lists agents first with the doors still open, planning lists only the houses that matter   (as c3)
assert (select role = 'agent' and user_id = b2 and doors_open = 4 from public.walk_list_team() limit 1);
assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+10' and spoke_or_refused_at is not null) = 1;   -- a spoke 10 days ago
assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+11' and not_home_at is not null) = 1;           -- not home yesterday
assert (select count(*) from public.walk_list_planning(kile) where pc = 'TEST0000+12') = 0;                                        -- only a visit 40 days ago
--   as b2 both functions raise 42501

-- test: plain visits are unchanged
--   record_door with the ten arguments it had, a person and a place: the same result and rows as tests/sql/houses.test.sql expects
```

- [ ] **Step 2: Run the tests to see them fail.**

Run: `bash tests/sql/run.sh`
Expected: `FAIL tests/sql/walk-lists.test.sql` (`function public.create_walk_list ... does not exist`); every other file `ok`.

- [ ] **Step 3: Write the migration.** In this order, safe to run again (`create table if not exists`, `drop policy if exists`, `create or replace function`):
  - The two tables as in Interfaces. `campaign_id uuid not null default public.my_campaign()` on both, with the restrictive "own campaign only" policy and the `stamp_campaign` trigger naming the parents (`wards`, `polling_stations` for lists; `walk_lists` for doors), as `house_visits` does. `status in ('draft','out','done')`; `name` 1 to 80 characters; `walk_list_doors` primary key `(walk_list_id, position)`, unique `(walk_list_id, pc)`; `pc` matching `^[0-9A-Z+]{4,24}$`. `house_visits.walk_list_id uuid references walk_lists(id) on delete set null`, indexed where not null.
  - Grants: `select` only on the new tables to `authenticated`. Read policies: candidate, managers, organisers and super read every row; an agent reads lists where `given_to = auth.uid()`, those lists' doors, and (new policy on `house_visits`) the visits at any pc that is a door of such a list.
  - The functions above. Role checks as `place_station` does (`coalesce(public.my_campaign_role(), '') in ('super','candidate','manager','organiser')`, else `42501` "Only organisers and managers can plan walk lists."). `create_walk_list` takes `pg_advisory_xact_lock(hashtextextended('walk-list:' || public.my_campaign(), 0))`, checks the ward and centre belong to the campaign, drops doors whose pc is already a door of a `draft` or `out` list (returning how many), refuses an empty array ("Pick at least one house."), more than 150 doors ("A list is at most 150 houses."), and an empty remainder ("Every one of those houses is on another list."), and with `_give_to` (who must be a member of the campaign and not `pending`: "That person isn't on your team.") sets `out`, `given_to`, `given_at`, `first_sent_at`.
  - `walk_list_counts` is the one place that decides "done" for a door: a door is done when `house_visits` has a row for its pc with `visited_at >= list.first_sent_at`; `not_home` counts doors whose latest such visit is `not_home`. `open_walk_lists`, `my_walk_lists` and `record_door` use it.
  - `record_door`: first `drop function if exists public.record_door(uuid, uuid, jsonb, text, integer, text, jsonb, text, timestamptz, jsonb)` (two overloads with defaults would make every call ambiguous), then create the 12-argument version from the 10-argument body. With `_walk_list_id`: the list must be in the campaign and `_door_pc` one of its doors, else `P0001` "That door isn't on this list." (the same words for a list that doesn't exist, so nothing leaks across campaigns); the house is `_door_pc` whatever `_place` says; a person is optional; the house visit takes the door's ward and the list id; the list's status and holder are not checked. Without it, behaviour is exactly today's. After the house visit, in the same function, an `out` list whose doors are all done becomes `done` with `done_at = now()` (the guard `status = 'out'` makes it fire once).
  - Finally `create or replace function public.groundwork_schema_version() returns integer language sql immutable as $$ select 28 $$;` with the same revoke and grant as schema 27's.

- [ ] **Step 4: Run all the SQL tests.**

Run: `bash tests/sql/run.sh`
Expected: `ok   46 migrations apply cleanly`; `ok   tests/sql/walk-lists.test.sql (11 tests)` (count the `-- test:` lines you wrote); every earlier file `ok`.

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/20261016090000_walk_lists.sql tests/sql/walk-lists.test.sql
git commit -m "Schema 28: walk lists, their doors, and record_door at a list's door" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The rules, in one pure module

**Files:**
- Create: `src/lib/walk-lists.ts`
- Test: `tests/walk-lists.test.ts`

**Interfaces:**
- Consumes: `LngLat`, `Ring`, `inPolygon`, `distanceM`, `toLocalM` from `@/lib/geo`; `MyRole` from `@/lib/access`; `Outcome` from `@/lib/houses`.
- Produces (exported, exactly):
  - `PATCH_SIZE = 50`, `DRAW_CAP = 150`, `SPOKE_REFUSED_DAYS = 30`, `NOT_HOME_DAYS = 3`.
  - `type PlanHouse = { pc: string; centre: LngLat; rings: Ring[]; wardId: string | null }`; `type HouseHistory = { pc: string; spokeOrRefusedAt: string | null; notHomeAt: string | null; onList: string | null }`.
  - `skipReason(h: HouseHistory | undefined, now: number): "other-list" | "recent" | null`.
  - `suggestPatch(houses: PlanHouse[], from: LngLat, history: Map<string, HouseHistory>, now: number, limit?: number): { doors: PlanHouse[]; skipped: { recent: number; otherList: number } }`.
  - `housesWithin(houses: PlanHouse[], shape: LngLat[], history: Map<string, HouseHistory>): { doors: PlanHouse[]; otherList: number; tooMany: boolean }`.
  - `walkingOrder(points: LngLat[]): number[]` (indices; the first point is the start) and `inWalkingOrder<T extends { centre: LngLat }>(doors: T[], start: LngLat | null): T[]`.
  - `defaultName(centreName: string | null, wardName: string, madeFromCentre: number): string`; `progressText(done: number, total: number): string`; `leftOffText(n: number): string`.
  - `nextDoor(order: string[], visited: Set<string>, skipped: string[], current: string | null): string | null`; `queuedDoors(queue: { walkListId?: string | null; doorPc?: string | null }[], listId: string): Set<string>`; `canPlanWalkLists(role: MyRole): boolean`.

- [ ] **Step 1: Write the failing test** `tests/walk-lists.test.ts` (header and `eq()` as in `tests/centres.test.ts`; `NOW = Date.parse("2026-10-20T08:00:00Z")`, `iso(daysAgo)`, `house(pc, lng, lat)`). Fixtures: `line` is 60 houses H0 to H59 one metre apart going east from the start; `history` holds H3 and H4 (spoke 10 days ago) and H5 (on list "L1"); `grid` is a 3 by 3 block of houses 10 m apart inside `square`; `onList(n)` is a history putting `n` of them on a list; `farSquare` holds none; `bowTie` crosses itself; `crowd(n)` is `n` houses inside `big`; `scrambledLine` is points on one latitude out of order; `any30` is 30 fixed pseudo-random points; `nearestOnly` is the nearest-neighbour walk before 2-opt (a local copy for the comparison).

```ts
eq("spoke 29 days ago is recent", skipReason({ pc: "A", spokeOrRefusedAt: iso(29), notHomeAt: null, onList: null }, NOW), "recent");
eq("spoke 31 days ago is not", skipReason({ pc: "A", spokeOrRefusedAt: iso(31), notHomeAt: null, onList: null }, NOW), null);
eq("not home 2 days ago is recent, 4 days ago is not",
  [skipReason({ pc: "A", spokeOrRefusedAt: null, notHomeAt: iso(2), onList: null }, NOW), skipReason({ pc: "A", spokeOrRefusedAt: null, notHomeAt: iso(4), onList: null }, NOW)], ["recent", null]);
eq("another open list outranks recency", skipReason({ pc: "A", spokeOrRefusedAt: iso(1), notHomeAt: null, onList: "L1" }, NOW), "other-list");
eq("no history is fine", skipReason(undefined, NOW), null);

// 60 houses in a line east of the start, 1 m apart; houses 3, 4 recent, 5 on a list
const line = Array.from({ length: 60 }, (_, i) => house(`H${i}`, 36.8 + i * 0.00001, -1.28));
const p = suggestPatch(line, [36.8, -1.28], history, NOW);
eq("a patch is the nearest free houses: H3, H4 and H5 are skipped", p.doors.map((d) => d.pc).slice(0, 4), ["H0", "H1", "H2", "H6"]);
eq("a patch has at most 50", p.doors.length, 50);
eq("the skips are counted", p.skipped, { recent: 2, otherList: 1 });
eq("fewer than 50 free: all of them", suggestPatch(line.slice(0, 8), [36.8, -1.28], new Map(), NOW).doors.length, 8);

const square: LngLat[] = [[36.8, -1.28], [36.801, -1.28], [36.801, -1.281], [36.8, -1.281]];
eq("a shape takes the houses whose centre is inside", housesWithin(grid, square, new Map()).doors.length, 9);
eq("houses on another list are left out and counted", housesWithin(grid, square, onList(2)).otherList, 2);
eq("two points are not a shape", housesWithin(grid, square.slice(0, 2), new Map()), { doors: [], otherList: 0, tooMany: false });
eq("a shape round no houses is empty", housesWithin(grid, farSquare, new Map()).doors.length, 0);
eq("a bow tie does not throw and takes what an even-odd test says", housesWithin(grid, bowTie, new Map()).doors.length >= 0, true);
eq("151 houses is too many, 150 is not", [housesWithin(crowd(151), big, new Map()).tooMany, housesWithin(crowd(150), big, new Map()).tooMany], [true, false]);

eq("a walk along a line, given out of order, is in line order", walkingOrder(scrambledLine).map((i) => scrambledLine[i]![0]), sortedLongitudes);
eq("the first point stays first", walkingOrder(any30)[0], 0);
eq("2-opt never lengthens the nearest-neighbour walk", length(any30, walkingOrder(any30)) <= length(any30, nearestOnly(any30)), true);
eq("the order starts at the door nearest the start", inWalkingOrder(doors, [36.8, -1.28])[0]!.pc, "H0");
eq("with no start the first door starts", inWalkingOrder(doors, null)[0]!.pc, doors[0]!.pc);

eq("default name tidies the centre", defaultName("KILELESHWA PRIMARY SCHOOL", "Kileleshwa", 2), "Kileleshwa Primary 3");
eq("default name with no centre", defaultName(null, "Kileleshwa", 0), "Kileleshwa 1");
eq("progress text", progressText(15, 44), "15 of 44 done");
eq("left off text", [leftOffText(12), leftOffText(1)], ["12 houses are on other lists and were left out", "1 house is on another list and was left out"]);
eq("next door skips visited and comes back to skipped last", nextDoor(["a", "b", "c", "d"], new Set(["a", "b"]), ["c"], "b"), "d");
eq("when only a skipped door is left it comes back", nextDoor(["a", "b", "c"], new Set(["a", "b"]), ["c"], "b"), "c");
eq("all visited is null", nextDoor(["a"], new Set(["a"]), [], "a"), null);
eq("queued visits for this list only", [...queuedDoors([{ walkListId: "L", doorPc: "A" }, { walkListId: "M", doorPc: "B" }, {}], "L")], ["A"]);
eq("who may plan", ["agent", "organiser", "manager", "candidate", "super", "pending", null].map((r) => canPlanWalkLists(r as never)), [false, true, true, true, true, false, false]);
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `npx tsx --tsconfig tsconfig.json tests/walk-lists.test.ts`
Expected: fails to start (`Cannot find module '@/lib/walk-lists'` or missing exports).

- [ ] **Step 3: Implement the module** with the signatures above. Approach: distances in metres with `distanceM`; `suggestPatch` filters with `skipReason`, counts the skips among the houses nearer than the 50th kept one is not needed: count every skipped house in the input; sort by distance, take `limit`. `housesWithin` uses `inPolygon(h.centre, [closed shape])`, needs at least 3 points, leaves out `onList` houses (counted), and sets `tooMany` when the remaining count exceeds 150 (returning no doors). `walkingOrder`: work in local metres (`toLocalM` around the first point); nearest-neighbour from index 0; then repeat passes of 2-opt on the open path with the first point fixed (for `i < j`, reverse `path[i+1..j]` if the walk gets shorter) until a pass changes nothing. `inWalkingOrder` puts the door nearest `start` first (else the first door), then orders the rest with `walkingOrder`. `defaultName` title-cases, drops a trailing "School", and appends `madeFromCentre + 1`. `nextDoor`: the first unvisited, unskipped door after `current` in order, else the first of those before it, else the first skipped unvisited door, else null.

- [ ] **Step 4: Run it and see it pass.**

Run: `npx tsx --tsconfig tsconfig.json tests/walk-lists.test.ts`
Expected: `NN passed, 0 failed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/walk-lists.ts tests/walk-lists.test.ts
git commit -m "Walk lists: the rules for a patch, a drawn shape, the walking order and progress" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server functions

**Files:**
- Create: `src/lib/walk-lists.functions.ts`
- Test: `tests/walk-lists-functions.test.ts`

**Interfaces:**
- Consumes: `Client` from `@/lib/houses.functions` (the loosely typed Supabase builder, so `types.ts` needs no change); `pageAll` is not needed; Task 1's functions; Task 2's `HouseHistory`; `Ring`, `LngLat`; `Outcome`.
- Produces (exported, exactly):
  - `type Door = { pc: string; lat: number; lng: number; outline: Ring[]; wardId: string | null }`; `cleanDoors(input: unknown): Door[]`; `type NewList = { name: string; centreId: string | null; wardId: string; doors: Door[]; giveTo: string | null }`; `cleanNewList(input: unknown): NewList`.
  - `createList(sb: Client, list: NewList): Promise<{ id: string; leftOff: number }>`; `giveList(sb: Client, id: string, to: string): Promise<void>`; `closeList(sb: Client, id: string): Promise<void>`.
  - `type ListSummary = { id: string; name: string; status: "draft" | "out" | "done"; centreId: string | null; centreName: string | null; wardId: string; givenTo: string | null; givenToName: string | null; doors: number; done: number; notHome: number; firstSentAt: string | null; givenAt: string | null }`; `type ListDoor = { n: number; pc: string; at: LngLat; rings: Ring[]; wardId: string | null; outcome: Outcome | null; visitedAt: string | null }`; `type DoorPerson = { pc: string; id: string; name: string; phone: string; support: number }`; `type TeamMember = { userId: string; name: string; role: string; doorsOpen: number }`.
  - `readOpenLists(sb, wardId): Promise<ListSummary[] | null>`; `readPlanning(sb, wardId): Promise<HouseHistory[] | null>`; `readTeam(sb): Promise<TeamMember[] | null>`; `readMyLists(sb): Promise<ListSummary[] | null>`; `readListDoors(sb, id): Promise<{ doors: ListDoor[]; people: DoorPerson[] } | null>`.
  - Server functions (all behind `requireSupabaseAuth`): `getOpenLists`, `getPlanning`, `getListTeam`, `getMyWalkLists`, `getWalkListDoors` (reads), `makeWalkList`, `giveWalkListTo`, `closeWalkListNow` (writes).

- [ ] **Step 1: Write the failing test** `tests/walk-lists-functions.test.ts`, with `fakeSupabase` (`tests/fake-supabase.ts`) and the `logged()` / `thrown()` helpers copied from `tests/centres-functions.test.ts`. Fixtures: `ok` is a `NewList` (name "Kileleshwa Primary 1", two valid doors, a ward id and a `giveTo`); `fake` has an `rpc` handler for each function in Task 1 that records `calls()` and answers `create_walk_list` with `{ id: "L1", left_off: 2 }`; `refusing(code, message)` is a client whose `rpc` returns that error; `refusedRead` answers with the error `function open_walk_lists does not exist`; `withRows` and `withDoors` answer `my_walk_lists` and `walk_list_doors` with one row each in the database's snake_case.

```ts
eq("a door is kept with its outline rounded to 5 places", cleanDoors([{ pc: "6GCRQ2XQ+22", lat: -1.2800004, lng: 36.7800004, outline: [[[36.78000041, -1.28000041], [36.7801, -1.28], [36.7801, -1.2801]]], wardId: null }])[0]!.outline[0]![0], [36.78, -1.28]);
eq("a door with a bad plus code is refused", await thrown(() => cleanDoors([{ pc: "no good", lat: 0, lng: 0, outline: [], wardId: null }])), "That isn't a house on the map.");
eq("no doors", await thrown(() => cleanDoors([])), "Pick at least one house.");
eq("151 doors", await thrown(() => cleanDoors(doors(151))), "A list is at most 150 houses.");
eq("a list needs a name and a ward", [await thrown(() => cleanNewList({ ...ok, name: "  " })), await thrown(() => cleanNewList({ ...ok, wardId: "x" }))], ["Name the list.", "Pick a ward."]);
eq("createList calls create_walk_list with the doors in order and says how many were left off", await createList(fake, ok), { id: "L1", leftOff: 2 });
eq("the database's own words pass through for P0001 and 42501, ours otherwise", [await thrown(() => createList(refusing("42501", "Only organisers and managers can plan walk lists."), ok)), await thrown(() => createList(refusing("XX000", "boom"), ok))], ["Only organisers and managers can plan walk lists.", "Could not make the list."]);
eq("giveList and closeList call their functions", calls(), [["give_walk_list", { _id: "L1", _to: "U1" }], ["close_walk_list", { _id: "L1" }]]);
eq("a refused read is null with one log line and no rows", await logged(() => readOpenLists(refusedRead, WARD)), [null, ["Could not read the walk lists: function open_walk_lists does not exist"]]);
eq("my lists are read as summaries", (await readMyLists(withRows))![0], { id: "L1", name: "Kileleshwa Primary 1", status: "out", centreId: "C1", centreName: "KILELESHWA PRIMARY SCHOOL", wardId: "W1", givenTo: null, givenToName: null, doors: 44, done: 15, notHome: 0, firstSentAt: "2026-10-20T08:00:00Z", givenAt: "2026-10-20T08:00:00Z" });
eq("a list's doors come back numbered with their people", (await readListDoors(withDoors, "L1"))!.doors[0], { n: 1, pc: "TEST0000+01", at: [36.78, -1.28], rings: [[[36.78, -1.28]]], wardId: "W1", outcome: "spoke", visitedAt: "2026-10-20T09:00:00Z" });
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `npx tsx --tsconfig tsconfig.json tests/walk-lists-functions.test.ts`
Expected: `Cannot find module '@/lib/walk-lists.functions'`.

- [ ] **Step 3: Implement the module.** Follow `src/lib/centres.functions.ts`: validators throw the sentences in the test; writes call the RPCs by the names in Task 1 (`_name`, `_centre_id`, `_ward_id`, `_doors` as the array of `{pc, lat, lng, outline, ward_id}`, `_give_to`); `refused()` keeps messages for `P0001` and `42501` only. Reads call `open_walk_lists`, `walk_list_planning`, `walk_list_team`, `my_walk_lists`, `walk_list_doors` and, for the doors' people, `from("people").select("id, full_name, phone, support_score, building_id").in("building_id", pcs)`; on any error, one `console.error` line and `null`. `readListDoors` numbers doors by `position`.

- [ ] **Step 4: Run it and see it pass.**

Run: `npx tsx --tsconfig tsconfig.json tests/walk-lists-functions.test.ts`
Expected: `NN passed, 0 failed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/walk-lists.functions.ts tests/walk-lists-functions.test.ts
git commit -m "Walk lists: the server calls, and reads that fail soft before schema 28" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Planning on the map

**Files:**
- Create: `src/lib/walk-list-map.ts`, `src/hooks/useAreaBuildings.ts`, `src/hooks/useWalkListPlan.ts`, `src/components/gw/voters/PlanWalkList.tsx`, `src/components/gw/voters/WalkListCard.tsx`
- Modify: `src/lib/voters-view.ts`, `src/lib/voters-map.ts`, `src/components/gw/voters/CentreCard.tsx`, `src/components/gw/voters/MapPanel.tsx`, `src/components/gw/voters/VotersCanvas.tsx`, `src/routes/_authenticated/voters.tsx`, `src/styles/groundwork.css` (by hand)
- Test: `tests/walk-list-map.test.ts`, `tests/voters-view.test.ts`, `tests/voters-map.test.ts`

**Interfaces:**
- Consumes: Task 2's functions and types; Task 3's server functions and types (`getOpenLists`, `getPlanning`, `getListTeam`, `makeWalkList`, `giveWalkListTo`, `closeWalkListNow`, `getWalkListDoors`); `centreAreas` and `CentreArea` (`@/lib/stations/areas`), `housesInTile`/`combineTiles` (as `useAreaHouses` uses them), `OUTCOME_COLOUR` (`@/lib/houses`), `canPlaceCentres` pattern for the role gate (use `canPlanWalkLists`).
- Produces:
  - Address: `VotersSearch.list?: string` (a walk list's uuid); `stepFor` treats a change of `list` as a step Back undoes, as it does `centre`; `listStays(open: { wardId: string } | null, area: Area | null, level: Level, wards: { id: string; slug: string }[]): boolean` in `voters-map.ts` (the rule of `centreStays`: the list stays open only at ward and street level, inside its ward).
  - A `PlanHouse` is made from a `Building` (`@/lib/geo`): `pc` is its `id`, `centre` and `rings` as they are, `wardId` null.
  - `walk-list-map.ts`: `draftShapes(doors: { pc: string; rings: Ring[]; n: number }[]): FeatureCollection` (polygons, properties `{ pc, n }`); `drawnShape(points: LngLat[]): FeatureCollection` (the points, and the line closed once there are three); `listDoorShapes(doors: ListDoor[]): FeatureCollection` (polygons, properties `{ pc, n, colour }`, colour from `OUTCOME_COLOUR` or the plain fill for a door not yet visited); `openListOutlines(lists: { id: string; rings: Ring[] }[]): FeatureCollection`.
  - `useAreaBuildings(mapArea: MapArea | null, polygons: Ring[][] | null): Building[] | null | undefined` (undefined while the tiles are read, null when not counted: no outline or over 100 tiles).
  - `useWalkListPlan(...)` holds planning state: mode `"patch" | "draw"`, the start point, the drawn points, doors taken off or added by a tap; derives the draft doors with Task 2's functions.
  - Components `PlanWalkList` and `WalkListCard` as the spec's "Giving it out" and "The panel" describe.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/voters-view.test.ts, added (its centre tests are the model)
const LIST = "0b9a3f56-4a53-4f86-bb64-1f0a6a7d2a11";
eq("a list in the address", validateVotersSearch({ list: LIST }).list, LIST);
eq("a list that isn't an id is dropped", [validateVotersSearch({ list: "../etc" }).list, validateVotersSearch({ list: 42 }).list], [undefined, undefined]);
eq("a link opens a list in the area it names", nextSearch({ area: "w:kileleshwa" }, { list: LIST }), { area: "w:kileleshwa", list: LIST });
eq("opening a list is a step Back undoes, and doesn't go back to the top", stepFor({ list: LIST }), { replace: false, resetScroll: false });

// tests/voters-map.test.ts, added (its centreStays tests are the model)
eq("an open list stays while the map is in its ward, at ward and street level", [listStays(open, kileleshwa, "ward", ids), listStays(open, kileleshwa, "street", ids)], [true, true]);
eq("moving into another ward, or out to the county, closes it", [listStays(open, kilimani, "ward", ids), listStays(open, kileleshwa, "area", ids)], [false, false]);

// tests/walk-list-map.test.ts
eq("draft shapes carry the door number", draftShapes([{ pc: "A", rings: [ring], n: 3 }]).features[0]!.properties, { pc: "A", n: 3 });
eq("a drawn line closes at three points, not before", [drawnShape(two).features.some((f) => f.geometry.type === "Polygon"), drawnShape(three).features.some((f) => f.geometry.type === "Polygon")], [false, true]);
eq("a list's doors are coloured by their latest visit", listDoorShapes(doors).features.map((f) => f.properties!.colour), [OUTCOME_COLOUR.spoke, OUTCOME_COLOUR.not_home, PLAIN]);
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `npx tsx --tsconfig tsconfig.json tests/voters-view.test.ts; npx tsx --tsconfig tsconfig.json tests/voters-map.test.ts; npx tsx --tsconfig tsconfig.json tests/walk-list-map.test.ts`
Expected: the new checks fail (`list` not in the address, `listStays` missing, `walk-list-map` module missing).

- [ ] **Step 3: Implement the address change and `walk-list-map.ts`, then the screen.** Behaviour, from the spec (section 2):
  - **Entry points:** `CentreCard` gets **Plan a walk list here** (staff only, centre placed); at street level the panel's Doors section gets **Plan a walk list**. Both open `PlanWalkList` in the panel's card slot.
  - **Patch:** from the centre (or, with no placed centre, from a tap on the map), houses of the centre's area (the ward with no centre) read with `useAreaBuildings`, history from `getPlanning`; shows the count and "Left out: N spoken to or refused in 30 days, N not home in the last 3 days, N on other lists".
  - **Draw:** taps add points (`drawnShape` on the map), **Done** takes the houses (`housesWithin`), **Start again** clears; over 150: "That's more than 150 houses: draw a smaller area."; `leftOffText(n)` when houses were left out.
  - **The draft** is numbered on the map in walking order (`inWalkingOrder`, from the centre or the first door); a tap on a house takes it off or adds it back, and the order is worked out again.
  - **Giving it out:** a Name field with `defaultName(...)` (`madeFromCentre` is the number of lists `getOpenLists` returns for that centre; finished lists aren't read, so a name can repeat after old lists close, which is fine), a "Give it to" picker from `getListTeam` (agents first, each "N doors open"), **Send** calls `makeWalkList`; on success a toast "Walk list sent to <name>.", the open lists and planning queries are invalidated and the list opens (`list=` in the address).
  - **The map:** open lists are outlined at street level; the chosen list's doors are numbered and coloured by latest visit (`listDoorShapes`, refetched every 30 seconds while open); canvas layers `gw-list-outlines`, `gw-list-doors`, `gw-draft`, `gw-draw` added as `gw-centres` was; while planning, a tap is the planner's (a start point, a drawn point, a house toggled), not "open a house".
  - **`WalkListCard`:** eyebrow "Walk list", the name, "With <person> since <date>", `progressText` and a bar, "<n> not home", **Give to someone else** (the same picker, `giveWalkListTo`) and **Close** (a confirm: "Close this list? Doors not yet visited stay as they are.", `closeWalkListNow`).
  - **`MapPanel`:** the Doors rows gain "Walk lists out" (open lists with doors in the area).
  - Staff only: agents never see planning (they leave Voters in Task 7 anyway), and the buttons check `canPlanWalkLists(role)`.
  - Add `.pw-*` styles by hand in `groundwork.css`'s style; no Prettier on that file.

- [ ] **Step 4: Run the tests, `tsc`, ESLint and Prettier on the changed files.**

Run:
```bash
npx tsx --tsconfig tsconfig.json tests/voters-view.test.ts
npx tsx --tsconfig tsconfig.json tests/voters-map.test.ts
npx tsx --tsconfig tsconfig.json tests/walk-list-map.test.ts
npx tsc --noEmit -p tsconfig.json
npx eslint $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
npx prettier --check $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
```
Expected: all three tests `0 failed`; the other three print nothing. (The repository's other ESLint/Prettier errors are not ours.)

- [ ] **Step 5: Look at it in the preview harness** (the scratch Vite app in the session scratchpad, `fake-db.ts` plus handlers for `walk_list_planning`, `create_walk_list`, `open_walk_lists`, `walk_list_team`, `walk_list_doors`, `give_walk_list`, `close_walk_list`, seeded with two lists in Kileleshwa). Check and note what you see: `/voters?area=w:kileleshwa&centre=PS-0045` → **Plan a walk list here** → a patch of 50 numbered doors with the skip counts; take one off and the numbers close up; **Draw around houses** with five taps and **Done** → the doors inside; a drawn shape over 150 houses → the "smaller area" sentence; Name defaulting to "Kileleshwa Primary 1"; the picker with agents first; **Send** → the card with "0 of 50 done"; a list with houses on another list → the left-out sentence; `?role=agent` has no planning.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/walk-list-map.ts src/hooks/useAreaBuildings.ts src/hooks/useWalkListPlan.ts src/components/gw/voters src/lib/voters-view.ts src/lib/voters-map.ts src/routes/_authenticated/voters.tsx src/styles/groundwork.css tests/walk-list-map.test.ts tests/voters-view.test.ts tests/voters-map.test.ts
git commit -m "Voters: plan a walk list on the map, give it out, and watch it fill in" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: A visit at a list's door, and the phone's copy of a list

**Files:**
- Modify: `src/lib/field.ts`, `src/lib/field.functions.ts`, `src/lib/offline/saved.ts`, `src/lib/offline/persist.ts`
- Test: `tests/field-lists.test.ts` (create), `tests/offline-saved.test.ts`

**Interfaces:**
- Consumes: Task 1's `record_door` (12 arguments); Task 2's `queuedDoors`; Task 3's `ListSummary`.
- Produces:
  - `Visit` gains `walkListId?: string | null` and `doorPc?: string | null`; `cleanListRef(input: { walkListId?: unknown; doorPc?: unknown }): { walkListId: string; doorPc: string } | null` in `field.ts` (null for neither; throws `Error("That door isn't on a list.")` for one without the other, or either malformed).
  - `recordVisit` accepts a visit with no person when it names a list, and passes `_walk_list_id` and `_door_pc`.
  - Saved entries `my-walk-lists` and `walk-list-doors` in `saved.ts` (kept whole); `listsToForget(entries: SavedEntry[], active: string[]): string[]` returns the ids of saved `walk-list-doors` entries whose list (`key[1]`) is not in `active`.
  - `startSaving` (in `persist.ts`) removes those entries, and their query-cache entries, whenever `my-walk-lists` loads successfully.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/field-lists.test.ts
eq("no list reference is fine", cleanListRef({}), null);
eq("a list reference is kept", cleanListRef({ walkListId: UUID, doorPc: "6GCRQ2XQ+22" }), { walkListId: UUID, doorPc: "6GCRQ2XQ+22" });
eq("one without the other is refused", [thrown(() => cleanListRef({ walkListId: UUID })), thrown(() => cleanListRef({ doorPc: "6GCRQ2XQ+22" }))], ["That door isn't on a list.", "That door isn't on a list."]);
eq("a bad plus code is refused", thrown(() => cleanListRef({ walkListId: UUID, doorPc: "no good" })), "That door isn't on a list.");
eq("a queued list visit keeps its list and door through a sync", (await syncQueue([visit({ walkListId: UUID, doorPc: "A+B2" })], async () => undefined)).queue, []);   // sent, nothing left; the sender saw both fields

// tests/offline-saved.test.ts, added (`entry(id, updatedAt?)` is a SavedEntry for key ["walk-list-doors", id]; `withPeople` is a list's doors with a person and a full number at the first)
eq("walk lists are saved", [isSaved(["my-walk-lists"]), isSaved(["walk-list-doors", "L1"])], [true, true]);
eq("a list's doors are kept whole, names and numbers included", keptForm(["walk-list-doors", "L1"], withPeople), withPeople);
eq("a finished list's copy is forgotten, a live one's kept", listsToForget([entry("L1"), entry("L2")], ["L2"]), [idOf(["walk-list-doors", "L1"])]);
eq("other saved queries are never forgotten by this", listsToForget([{ id: "x", key: ["home"], data: 1, updatedAt: 0 }], []), []);
eq("a copy older than 14 days is dropped", restorable([entry("L1", NOW - 15 * DAY)], NOW).drop.length, 1);
eq("today's ward walk list is still never saved", (keptForm(["canvassing"], { totals: {}, wards: [], issues: [], walkList: [{ id: "p1" }], recent: [{ id: "e1" }] }) as { walkList: unknown[]; recent: unknown[] }), { totals: {}, wards: [], issues: [], unplaced: undefined, walkList: [], recent: [] });
// startSaving with a stand-in store: loading ["my-walk-lists"] with one list removes the other list's saved doors and its cache entry
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `npx tsx --tsconfig tsconfig.json tests/field-lists.test.ts; npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts`
Expected: the new checks fail (missing exports).

- [ ] **Step 3: Implement.** `cleanListRef` in `field.ts` (uuid and the plus-code pattern `^[0-9A-Z+]{4,24}$`); `recordVisit`'s validator uses it: with a list the "Who was this visit to?" rule doesn't apply; the call adds `_walk_list_id` and `_door_pc` (widened as the call already is). `saved.ts` adds the two `KEEP` entries as `same`, and `listsToForget`; `persist.ts` calls it after saving a `my-walk-lists` result (only on a successful load, so a phone with no signal forgets nothing) and runs `queryClient.removeQueries` for the same keys.

- [ ] **Step 4: Run them and the whole offline set.**

Run: `npx tsx --tsconfig tsconfig.json tests/field-lists.test.ts; npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts; npx tsx --tsconfig tsconfig.json tests/offline-session.test.ts; npx tsc --noEmit -p tsconfig.json`
Expected: every test `0 failed`; `tsc` prints nothing.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/field.ts src/lib/field.functions.ts src/lib/offline/saved.ts src/lib/offline/persist.ts tests/field-lists.test.ts tests/offline-saved.test.ts
git commit -m "Field: a visit at a list's door, and the phone keeps a list it has opened" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Your walk lists" on the phone

**Files:**
- Create: `src/lib/map-style.ts` (`styleUrl` and `OPENFREEMAP`, moved out of `VotersCanvas.tsx`), `src/components/gw/field/VisitSheet.tsx` (moved out of `FieldApp.tsx`, then extended), `src/components/gw/field/WalkLists.tsx`, `src/components/gw/field/WalkListRun.tsx`, `src/components/gw/field/WalkListMap.tsx`
- Modify: `src/components/gw/voters/VotersCanvas.tsx` (imports the moved `styleUrl`), `src/components/gw/FieldApp.tsx`, `src/routes/_authenticated/field.tsx`, `src/styles/groundwork.css` (by hand)

**Interfaces:**
- Consumes: Task 3's `getMyWalkLists`, `getWalkListDoors`, `ListSummary`, `ListDoor`, `DoorPerson`; Task 2's `progressText`, `nextDoor`, `queuedDoors`; Task 5's `Visit` fields and the queue (`queueStore`, `syncQueue`); `useFix` (`@/hooks/useDoorPlace`), `useOnline`, `getMapConfig` (its `maptilerKey`), `blockNote` (`@/lib/houses`).
- Produces: `styleUrl(basemap: Basemap, key: string | null): string` exported from `src/lib/map-style.ts` (unchanged body); `/field?list=<uuid>` (validated search) opens a list; the field page opens on "Your walk lists".

- [ ] **Step 1: Make two moves with no change in behaviour.** `styleUrl` and `OPENFREEMAP` out of `VotersCanvas.tsx` into `src/lib/map-style.ts` (the canvas imports them), and `VisitSheet` out of `FieldApp.tsx` into its own file (`FieldApp.tsx` imports it). Run `npx tsc --noEmit -p tsconfig.json`, then look at the Voters map and the ward list's sheet in the harness: unchanged.

- [ ] **Step 2: Build the screens** from the spec (section 3):
  - **`WalkLists`** (the first card on `/field`, above "At the door"): the lists out with this person (`["my-walk-lists"]`, refetched on mount and every 60 seconds while online): name, centre, `progressText` with a bar (queued visits count toward it), "given <when>"; a tap sets `?list=`. Empty: "No lists given to you yet. Today's ward list is below." Today's ward list, "Add someone you meet" and "Polling centres near me" follow, unchanged.
  - **`WalkListRun`:** header (name, `progressText`, a bar; with no signal "No signal · 3 visits saved on the phone, they send when it comes back"); the map; this door. A list never opened with signal and no signal now: "This list needs signal once to open."
  - **`WalkListMap`** (lazy-loaded, so MapLibre is fetched when a list is first opened): doors from the list's saved outlines, coloured by outcome, numbered by HTML markers, the next door ringed, the phone's position (`useFix`) shown; the street style with signal, a plain background without.
  - **This door:** "Door 16 of 44"; the people on file there with their full numbers and the last visit; `blockNote` for a big outline; **Spoke**, **Not home**, **Refused**. Spoke opens support 1 to 5, the issue and **Add them** (name, phone, consent ticks: the sheet's new-person path). **Save · go to door 16** saves the visit (with `walkListId` and `doorPc`, no person unless added) and moves to `nextDoor`; **Skip for now** skips; a skipped door comes back at the end.
  - Visits go through the existing queue and `record` path unchanged.
  - Styles by hand; `.wl-*` classes.

- [ ] **Step 3: Check types, lint and format.**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/gw/field src/components/gw/FieldApp.tsx src/routes/_authenticated/field.tsx
npx prettier --check src/components/gw/field src/components/gw/FieldApp.tsx src/routes/_authenticated/field.tsx
```
Expected: nothing printed. (If Prettier already failed on a file on `origin/main`, format only the lines you changed.)

- [ ] **Step 4: Look at it in the harness** at 390 wide (`?role=agent`, seeded lists and doors, one block of flats): the field page opens on "Your walk lists" with "15 of 44 done"; open a list: header, map with numbered doors, the next door ringed; **Not home** then **Save · go to door N**; **Spoke**, support, issue, **Add them**; **Skip for now** and the door returning at the end; the queue note and the count moving with a visit saved offline (`?offline`): "No signal · 1 visit saved on the phone, they send when it comes back"; reload `?offline` after opening once with signal: the list opens on the plain background; a list never opened: "This list needs signal once to open."; the block-of-flats note on its door.

- [ ] **Step 5: Commit.**

```bash
git add src/components/gw src/routes/_authenticated/field.tsx src/styles/groundwork.css
git commit -m "Field: Your walk lists, a list's doors on a map, and each door's visit" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Street plans retire, agents leave `/voters`, the notes

**Files:**
- Delete: `src/components/gw/StreetPlan.tsx`, `src/lib/streets.functions.ts`
- Modify: `src/components/gw/FieldApp.tsx` (the street picker and its queries), `src/routes/_authenticated/field.tsx` (the "Street plan" card), `src/lib/access.ts`, `tests/access.test.ts`, `AGENTS.md`, `docs/superpowers/specs/2026-10-14-polling-centres-and-walk-lists-design.md`

**Interfaces:**
- Consumes: Task 6's field page.
- Produces: `canOpen("agent", "/voters")` is `false`; agents' pages are `/field` and `/foundations`. `canvass_streets`, its rows, `people.street_id`, `door_no` and `street_walk` stay in the database untouched.

- [ ] **Step 1: Change the access test first.** In `tests/access.test.ts` the line `"an agent opens Voters and the Field app"` expects `[true, true]`; make it `"an agent opens the Field app, not Voters"` expecting `[false, true]`; add `eq("an agent's home is the field app", homeFor("agent"), "/field")` if it isn't there.

- [ ] **Step 2: Run it and watch it fail.**

Run: `npx tsx --tsconfig tsconfig.json tests/access.test.ts`
Expected: the Voters line fails (`got [true,true] want [false,true]`).

- [ ] **Step 3: Implement.** `AGENT_PAGES = ["/field", "/foundations"]` in `access.ts`; delete the two street-plan files and their uses (the street chips and the `["walk-list", "streets", …]` query in `FieldApp`; the "Street plan" card on the field page); search `src` for `streets.functions`, `StreetPlan`, `getStreetWalk` to be sure nothing else uses them. Leave `.sp` / `.fa-street*` CSS if removing it needs Prettier-free hand edits you can't check; they're harmless.

- [ ] **Step 4: Update the notes.** In `AGENTS.md` replace the line that says IndexedDB saves "never voter files, walk lists or feed" with: "... never voter files or feed. The one exception is the walk lists given to the signed-in person: their doors with the names and numbers on file there, deleted when the list ends, at sign-out and after 14 days. Why: safe field use without signal." and add:

```
- Walk lists: walk_lists and walk_list_doors (schema 28) are written only by create_walk_list, give_walk_list and close_walk_list; record_door alone writes house_visits, now also at a list's door with no person. A house is on at most one open list, a list is done when every door has a visit since it first went out, and the order of the doors is worked out in the browser when planning. Why: one retry-safe record of each knock, and no two people sent to the same door.
```
In the spec, change the status line to say part 2 is built, name the decisions in this plan's "Decisions to confirm" that differ from the text, and move "Notifications" under what is next.

- [ ] **Step 5: Run the test, then the whole set so far.**

Run: `npx tsx --tsconfig tsconfig.json tests/access.test.ts; npm test`
Expected: `access.test.ts` `0 failed`; `npm test` ends with `ok   46 migrations apply cleanly`, every SQL file ok, no `FAIL` line.

- [ ] **Step 6: Commit.**

```bash
git add -A src tests AGENTS.md docs/superpowers/specs
git commit -m "Street plans retire, agents leave Voters, and the notes say walk lists" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Put it together, check it, and (with the user's OK) release it

**Files:** none new.

**Interfaces:**
- Consumes: Tasks 1 to 7 on `walk-lists`.
- Produces: `main` with walk lists, schema 28 applied and verified, the site published; the user's test handed over.

- [ ] **Step 1: Start from the latest `main`.**

```bash
git fetch origin
git log --oneline walk-lists..origin/main
git ls-tree --name-only origin/main supabase/migrations/ | tail -3
```
If `origin/main` added a migration, schema 28 may need the next number: rename the file and `select 28`, and tell the user. Otherwise rebase `walk-lists` onto `origin/main` (nothing of it is pushed).

- [ ] **Step 2: The whole check.**

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npx eslint $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
npx prettier --check $(git diff --name-only --diff-filter=AM origin/main..HEAD | grep -E '\.(ts|tsx)$')
npm run build
```
Expected: `npm test` ends with `ok   46 migrations apply cleanly`, every SQL file ok, no `FAIL`; `tsc`, ESLint, Prettier print nothing; the build ends with `✔ You can preview this build`.

- [ ] **Step 3: Look again in the harness:** Tasks 4 and 6's steps; the harness switch `?walklists=off` (add it as `?centres=off` was: it refuses the new functions) to see a refused read: no lists, no errors on screen, one console line per read; `/field?role=agent` at 390 wide; and an agent opening `/voters` lands on `/field`.

- [ ] **Step 4: Stop and ask.** Report Steps 2 and 3 and ask for the user's OK to push. Nothing below happens without it. Say again that agents lose the Voters map (their field app has their lists, ward list and "Polling centres near me"), that a phone now keeps names and numbers for a list it has opened, and that the street-plan screen is gone.

- [ ] **Step 5: With the OK, release.**
  - `git switch main && git merge --ff-only walk-lists && git push origin main`. Lovable syncs the code; it does not run migrations or publish.
  - Apply schema 28 through the Lovable connector's `query_database`, in one transaction that stops unless the database is at 27, with the migration file's whole text; then check `groundwork_schema_version()` is 28, the two tables exist with no insert, update or delete grant to `authenticated`, and compare a fingerprint of the ten functions (the nine new ones and `record_door`; `md5(regexp_replace(prosrc, '\s+', ' ', 'g'))`), the policies and the grants with a local Postgres built from the migrations.
  - Publish with `deploy_project` (name `groundworkkenya`, after `get_project`'s `latest_commit_sha`), then check `/api/public/health` says 28 and the live chunks name "Your walk lists" and "Plan a walk list here".
  - If the connector is not available, say so and leave applying and publishing to the user: do not look for another route.

- [ ] **Step 6: Hand over the test** (the spec leaves it to the user): on a laptop plan a list around a real polling centre and give it to a test agent; on that agent's phone, open the field app with signal, open the list, turn on airplane mode, walk it (not home, spoke, add someone), turn signal back on and watch the visits arrive and the list's progress move on the Voters map; close the list and check the phone's copy is gone once it has signal.
