// Checks for the page data kept for no signal: what each saved query keeps
// (never the voter file, the contacts feed, today's ward list or recent visits; the walk lists
// out with the person, with the names and numbers at their doors), the 14-day limit, putting data back as old, saving as queries load, and clearing
// for another person, campaign or format. Runs against a real query cache and a
// stand-in for the phone's storage. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/offline-saved.test.ts

import { QueryClient } from "@tanstack/react-query";

import { lastLoaded, startSaving, type OfflineStore } from "@/lib/offline/persist";
import {
  idOf,
  isSaved,
  keptForm,
  listsToForget,
  MAX_AGE_MS,
  restorable,
  SAVED_VERSION,
  type SavedEntry,
  type Who,
} from "@/lib/offline/saved";

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

/** The phone's storage, in memory. */
function memory(who: Who | null = null, entries: SavedEntry[] = []) {
  const m = { who, saved: new Map(entries.map((e) => [e.id, e])), cleared: 0, slow: false };
  const store: OfflineStore = {
    readWho: async () => m.who,
    writeWho: async (w) => void (m.who = w),
    all: async () => [...m.saved.values()],
    put: async (e) => {
      if (m.slow) await new Promise((r) => setTimeout(r, 20));
      m.saved.set(e.id, e);
    },
    remove: async (ids) => ids.forEach((id) => m.saved.delete(id)),
    clear: async () => {
      m.saved.clear();
      m.who = null;
      m.cleared++;
    },
  };
  return { m, store };
}
const settle = () => new Promise((r) => setTimeout(r, 10));
const NOW = Date.parse("2026-10-14T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const entry = (key: unknown[], data: unknown, age = DAY): SavedEntry => ({
  id: idOf(key),
  key,
  data,
  updatedAt: NOW - age,
});
const ME = { userId: "u1", campaignId: "c1", version: SAVED_VERSION };

// ---------------------------------------------------------------- what is kept

eq(
  "the saved queries; others aren't",
  [
    ["my-access"],
    ["home", "c1"],
    ["diary", "c1", null],
    ["voters"],
    ["canvassing"],
    ["area-doors"],
    ["atlas"],
    ["findings", "c1"],
    ["map-config"],
    ["people"],
    ["walk-list", "w1", null],
    ["house", "6GCR+22"],
    ["inbox"],
  ].map(isSaved),
  [true, true, true, true, true, true, true, true, true, false, false, false, false],
);
eq(
  "Voters keeps its wards and totals; never the people or the feed",
  keptForm(["voters"], {
    wards: [{ id: "w1", name: "Kangemi", people: 4 }],
    totals: { people: 4 },
    feed: [{ name: "Wanjiru", phone: "+254700000000" }],
    people: [{ name: "Wanjiru", phone: "+254700000000" }],
    extra: "a field added later",
  }),
  {
    wards: [{ id: "w1", name: "Kangemi", people: 4 }],
    totals: { people: 4 },
    feed: [],
    people: [],
  },
);
eq(
  "the doors keep their counts and issues; never the walk list or recent visits",
  keptForm(["canvassing"], {
    totals: { people: 9 },
    wards: [{ id: "w1", knocked: 3 }],
    issues: [{ name: "Water", count: 2 }],
    unplaced: { people: 1, knocked: 0, doors30: 0 },
    walkList: [{ name: "Wanjiru", phone: "+254700000000" }],
    recent: [{ person: "Wanjiru" }],
  }),
  {
    totals: { people: 9 },
    wards: [{ id: "w1", knocked: 3 }],
    issues: [{ name: "Water", count: 2 }],
    unplaced: { people: 1, knocked: 0, doors30: 0 },
    walkList: [],
    recent: [],
  },
);
eq(
  "other saved queries as loaded; unsaved ones not at all",
  [keptForm(["atlas"], { a: 1 }), keptForm(["people"], [1])],
  [{ a: 1 }, undefined],
);
{
  const young = entry(["home", "c1"], 1, MAX_AGE_MS - 1);
  const old = entry(["atlas"], 2, MAX_AGE_MS + 1);
  const stray = entry(["people"], 3);
  const { keep, drop } = restorable([young, old, stray], NOW);
  eq(
    "14 days at most; anything not on the list goes",
    [keep.map((e) => e.id), drop],
    [[young.id], [old.id, stray.id]],
  );
}

// ---------------------------------------------------------------- walk lists

const withPeople = {
  doors: [
    {
      n: 1,
      pc: "6GCRQ2XQ+22",
      at: [36.78, -1.28],
      rings: [[[36.78, -1.28]]],
      wardId: "w1",
      outcome: null,
      visitedAt: null,
    },
  ],
  people: [{ pc: "6GCRQ2XQ+22", id: "p1", name: "Mercy", phone: "+254712345678", support: 4 }],
};
const doorsEntry = (list: string, age = DAY) => entry(["walk-list-doors", list], withPeople, age);

eq(
  "walk lists are saved",
  [isSaved(["my-walk-lists"]), isSaved(["walk-list-doors", "L1"])],
  [true, true],
);
eq(
  "a list's doors are kept whole, names and numbers included",
  keptForm(["walk-list-doors", "L1"], withPeople),
  withPeople,
);
eq(
  "the lists out are kept as loaded",
  keptForm(["my-walk-lists"], [{ id: "L1", name: "Kileleshwa Primary 1" }]),
  [{ id: "L1", name: "Kileleshwa Primary 1" }],
);
eq(
  "a finished list's copy is forgotten, a live one's kept",
  listsToForget([doorsEntry("L1"), doorsEntry("L2")], ["L2"]),
  [idOf(["walk-list-doors", "L1"])],
);
eq("no list out forgets every copy", listsToForget([doorsEntry("L1"), doorsEntry("L2")], []), [
  idOf(["walk-list-doors", "L1"]),
  idOf(["walk-list-doors", "L2"]),
]);
eq(
  "other saved queries are never forgotten by this",
  listsToForget(
    [
      { id: "x", key: ["home"], data: 1, updatedAt: 0 },
      { id: "y", key: ["my-walk-lists"], data: [], updatedAt: 0 },
    ],
    [],
  ),
  [],
);
eq(
  "a copy older than 14 days is dropped",
  restorable([doorsEntry("L1", 15 * DAY)], NOW).drop.length,
  1,
);
eq(
  "today's ward walk list is still never saved",
  keptForm(["canvassing"], {
    totals: {},
    wards: [],
    issues: [],
    walkList: [{ id: "p1" }],
    recent: [{ id: "e1" }],
  }),
  { totals: {}, wards: [], issues: [], unplaced: undefined, walkList: [], recent: [] },
);
eq("nor the ward's list by its own key", isSaved(["walk-list", "w1", null]), false);

// ---------------------------------------------------------------- putting back

{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [
    entry(["home", "c1"], { story: "saved" }, DAY),
    entry(["atlas"], { areas: [] }, 20 * DAY),
  ]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  const state = qc.getQueryState(["home", "c1"]);
  eq(
    "saved data comes back with its load time",
    [qc.getQueryData(["home", "c1"]), state?.dataUpdatedAt],
    [{ story: "saved" }, NOW - DAY],
  );
  const kept = qc.getQueryCache().find({ queryKey: ["home", "c1"] })!;
  eq(
    "so every page refreshes it with signal, even one that otherwise keeps its data for good",
    [kept.isStaleByTime(5 * 60_000), kept.isStaleByTime(Infinity)],
    [true, true],
  );
  eq(
    "data past 14 days isn't put back, and is deleted",
    [qc.getQueryData(["atlas"]), [...m.saved.keys()]],
    [undefined, [idOf(["home", "c1"])]],
  );
  eq("the last load is the newest saved", lastLoaded(qc), NOW - DAY);
  stop();
}
{
  const qc = new QueryClient();
  qc.setQueryData(["home", "c1"], { story: "fresh" }, { updatedAt: NOW });
  const { store } = memory(ME, [entry(["home", "c1"], { story: "saved" }, DAY)]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  eq("fresher data already loaded isn't replaced", qc.getQueryData(["home", "c1"]), {
    story: "fresh",
  });
  stop();
}

// ---------------------------------------------------------------- saving as queries load

{
  const qc = new QueryClient();
  const { m, store } = memory(ME);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["voters"],
    queryFn: async () => ({
      wards: [],
      totals: {},
      feed: [{ name: "x" }],
      people: [{ name: "y" }],
    }),
  });
  await qc.fetchQuery({
    queryKey: ["people"],
    queryFn: async () => [{ name: "y", phone: "+254700000000" }],
  });
  await settle();
  eq(
    "a saved query is stored as it's kept; others aren't stored",
    [...m.saved.values()].map((e) => [e.id, e.data]),
    [['["voters"]', { wards: [], totals: {}, feed: [], people: [] }]],
  );
  stop();
  await qc.fetchQuery({ queryKey: ["atlas"], queryFn: async () => ({ a: 1 }) });
  await settle();
  eq("after stopping, nothing more is saved", m.saved.size, 1);
}

{
  const qc = new QueryClient();
  const { m, store } = memory(ME);
  m.slow = true;
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({ queryKey: ["atlas"], queryFn: async () => ({ a: 1 }) });
  await new Promise((r) => setTimeout(r, 5)); // the save is under way
  await stop();
  eq("stopping waits for a save under way, so a clear after it is final", m.saved.size, 1);
}

// ---------------------------------------------------------------- a list that has ended

{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [doorsEntry("L1"), doorsEntry("L2")]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  eq(
    "both lists' doors are put back at the start",
    [
      qc.getQueryData(["walk-list-doors", "L1"]) !== undefined,
      qc.getQueryData(["walk-list-doors", "L2"]) !== undefined,
    ],
    [true, true],
  );
  await qc.fetchQuery({
    queryKey: ["my-walk-lists"],
    queryFn: async () => [{ id: "L2", name: "Kileleshwa Primary 2" }],
  });
  await settle();
  eq(
    "the lists out loading forgets the copy of a list that is no longer out, and its cache entry",
    [
      [...m.saved.keys()].sort(),
      qc.getQueryData(["walk-list-doors", "L1"]),
      qc.getQueryData(["walk-list-doors", "L2"]) !== undefined,
    ],
    [[idOf(["my-walk-lists"]), idOf(["walk-list-doors", "L2"])].sort(), undefined, true],
  );
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [doorsEntry("L1")]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc
    .fetchQuery({
      queryKey: ["my-walk-lists"],
      queryFn: async () => {
        throw new TypeError("Failed to fetch");
      },
      retry: false,
    })
    .catch(() => undefined);
  await settle();
  eq(
    "a failed load, as with no signal, forgets nothing",
    [[...m.saved.keys()], qc.getQueryData(["walk-list-doors", "L1"]) !== undefined],
    [[idOf(["walk-list-doors", "L1"])], true],
  );
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(ME);
  m.slow = true;
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 5 });
  await qc.fetchQuery({ queryKey: ["walk-list-doors", "L1"], queryFn: async () => withPeople });
  await qc.fetchQuery({ queryKey: ["my-walk-lists"], queryFn: async () => [] });
  await new Promise((r) => setTimeout(r, 60)); // the waits are over and the slow saves done
  await stop();
  eq(
    "a copy about to be saved when its list ends is not saved after all",
    [...m.saved.keys()],
    [idOf(["my-walk-lists"])],
  );
}

// ---------------------------------------------------------------- whose data

{
  const { m, store } = memory(
    { userId: "someone-else", campaignId: "c1", version: SAVED_VERSION },
    [entry(["home", "c1"], { story: "theirs" })],
  );
  const qc = new QueryClient();
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  eq(
    "another person's data is deleted, not shown",
    [qc.getQueryData(["home", "c1"]), m.saved.size, m.who],
    [undefined, 0, { userId: "u1", campaignId: null, version: SAVED_VERSION }],
  );
  stop();
}
{
  const { m, store } = memory({ ...ME, version: SAVED_VERSION - 1 }, [
    entry(["home", "c1"], { story: "old format" }),
  ]);
  const stop = await startSaving(new QueryClient(), store, "u1", { now: () => NOW, wait: 0 });
  eq("another format is deleted", m.saved.size, 0);
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(ME, [entry(["home", "c1"], { story: "c1's" })]);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["my-access"],
    queryFn: async () => ({ role: "manager", campaign: { id: "c2" } }),
  });
  await settle();
  eq(
    "another campaign clears what was saved for the last one",
    [[...m.saved.keys()], m.who?.campaignId],
    [['["my-access"]'], "c2"],
  );
  stop();
}
{
  const qc = new QueryClient();
  const { m, store } = memory(null);
  const stop = await startSaving(qc, store, "u1", { now: () => NOW, wait: 0 });
  await qc.fetchQuery({
    queryKey: ["my-access"],
    queryFn: async () => ({ role: "agent", campaign: { id: "c1" } }),
  });
  await settle();
  eq(
    "the first access names the campaign",
    [m.cleared, m.who],
    [1, { userId: "u1", campaignId: "c1", version: SAVED_VERSION }],
  );
  stop();
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
