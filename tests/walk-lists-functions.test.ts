// Checks for the walk lists' server side (src/lib/walk-lists.functions.ts): what a list must be
// before it goes to the database, the calls that make, give and close one, and the reads, which
// fail soft before schema 28 and say why in the server log. Against a stand-in database; nothing
// leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/walk-lists-functions.test.ts

import type { Client } from "@/lib/houses.functions";
import type { Door } from "@/lib/walk-lists.functions";
import {
  cleanDoors,
  cleanNewList,
  closeList,
  createList,
  giveList,
  readListDoors,
  readMyLists,
  readOpenLists,
  readPlanning,
  readTeam,
  type NewList,
} from "@/lib/walk-lists.functions";

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

/** Runs a read with console.error caught: its answer, and the first argument of each call. */
async function logged<T>(read: () => Promise<T>): Promise<[T, unknown[]]> {
  const lines: unknown[] = [];
  const original = console.error;
  console.error = (first?: unknown) => {
    lines.push(first);
  };
  try {
    return [await read(), lines];
  } finally {
    console.error = original;
  }
}

/** The message of whatever a call throws, or null if it doesn't. */
async function thrown(call: () => unknown): Promise<string | null> {
  try {
    await call();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const WARD = "8f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CENTRE = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-aaaa-4bbb-8ccc-dddddddddddd";

const door = (pc: string, extra: Record<string, unknown> = {}): Door => ({
  pc,
  lat: -1.28,
  lng: 36.78,
  outline: [
    [
      [36.78, -1.28],
      [36.7801, -1.28],
      [36.7801, -1.2801],
      [36.78, -1.28],
    ],
  ],
  wardId: WARD,
  ...extra,
});

// Full plus codes: the last two digits run through the code alphabet.
const DIGITS = "23456789CFGHJMPQRVWX";
const doors = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    door(`6GCRQ2XQ+${DIGITS[i % 20]}${DIGITS[Math.floor(i / 20)]}`),
  );

const ok: NewList = {
  name: "Kileleshwa Primary 1",
  centreId: CENTRE,
  wardId: WARD,
  doors: [door("6GCRQ2XQ+22"), door("6GCRQ2XQ+23")],
  giveTo: USER,
};

// What a door must be before it goes to the database.
eq(
  "a door is kept with its outline rounded to 5 places",
  cleanDoors([
    {
      pc: "6GCRQ2XQ+22",
      lat: -1.2800004,
      lng: 36.7800004,
      outline: [
        [
          [36.78000041, -1.28000041],
          [36.7801, -1.28],
          [36.7801, -1.2801],
        ],
      ],
      wardId: null,
    },
  ])[0]!.outline[0]![0],
  [36.78, -1.28],
);
eq(
  "a door with a bad plus code is refused",
  await thrown(() => cleanDoors([{ pc: "no good", lat: 0, lng: 0, outline: [], wardId: null }])),
  "That isn't a house on the map.",
);
eq("no doors", await thrown(() => cleanDoors([])), "Pick at least one house.");
eq(
  "not a list of doors",
  await thrown(() => cleanDoors("6GCRQ2XQ+22")),
  "Pick at least one house.",
);
eq("151 doors", await thrown(() => cleanDoors(doors(151))), "A list is at most 150 houses.");
eq("150 doors", cleanDoors(doors(150)).length, 150);
eq(
  "a door at no place is refused",
  await thrown(() => cleanDoors([door("6GCRQ2XQ+22", { lat: "-1.28" })])),
  "That isn't a house on the map.",
);
eq(
  "so is one past the pole",
  await thrown(() => cleanDoors([door("6GCRQ2XQ+22", { lng: 181 })])),
  "That isn't a house on the map.",
);
eq(
  "and one whose outline isn't rings of points",
  await thrown(() => cleanDoors([door("6GCRQ2XQ+22", { outline: [[["x", 1]]] })])),
  "That isn't a house on the map.",
);
eq(
  "a lower-case plus code is read as the house file writes it",
  cleanDoors([door("6gcrq2xq+22")])[0]!.pc,
  "6GCRQ2XQ+22",
);
eq(
  "the same house twice is one door, in the order it first came",
  cleanDoors([door("6GCRQ2XQ+22"), door("6GCRQ2XQ+23"), door("6GCRQ2XQ+22")]).map((d) => d.pc),
  ["6GCRQ2XQ+22", "6GCRQ2XQ+23"],
);
eq(
  "a ward that isn't an id is none, and a door with no outline is still a door",
  cleanDoors([door("6GCRQ2XQ+22", { wardId: "x", outline: undefined })]).map((d) => [
    d.wardId,
    d.outline,
  ]),
  [[null, []]],
);

// What a new list must be.
eq("a good list is kept as it is", cleanNewList(ok), ok);
eq(
  "a name is trimmed, and centre and recipient may be none",
  cleanNewList({ ...ok, name: "  Evening round ", centreId: undefined, giveTo: null }),
  { ...ok, name: "Evening round", centreId: null, giveTo: null },
);
eq(
  "a list needs a name and a ward",
  [
    await thrown(() => cleanNewList({ ...ok, name: "  " })),
    await thrown(() => cleanNewList({ ...ok, wardId: "x" })),
  ],
  ["Name the list.", "Pick a ward."],
);
eq(
  "a name of 81 letters is too long, 80 is not",
  [
    await thrown(() => cleanNewList({ ...ok, name: "x".repeat(81) })),
    await thrown(() => cleanNewList({ ...ok, name: "x".repeat(80) })),
  ],
  ["A name is at most 80 letters.", null],
);
eq(
  "a centre or a person that isn't an id is told so",
  [
    await thrown(() => cleanNewList({ ...ok, centreId: "PS-0001" })),
    await thrown(() => cleanNewList({ ...ok, giveTo: "someone" })),
  ],
  ["Pick a centre.", "Pick someone on the team."],
);
eq(
  "and the doors are checked as doors",
  await thrown(() => cleanNewList({ ...ok, doors: [] })),
  "Pick at least one house.",
);
eq("nothing at all is no list", await thrown(() => cleanNewList(null)), "Name the list.");

// What the database's functions are called with: their argument names are the contract.
let log: [string, unknown][] = [];
const calls = () => {
  const out = log;
  log = [];
  return out;
};
const fake: Client = {
  from: () => {
    throw new Error("unused");
  },
  rpc: (fn, args) => {
    log.push([fn, args ?? {}]);
    return Promise.resolve({
      data: fn === "create_walk_list" ? { id: "L1", left_off: 2 } : null,
      error: null,
    });
  },
};

eq(
  "createList calls create_walk_list with the doors in order and says how many were left off",
  await createList(fake, ok),
  { id: "L1", leftOff: 2 },
);
eq("the call it made", calls(), [
  [
    "create_walk_list",
    {
      _name: "Kileleshwa Primary 1",
      _centre_id: CENTRE,
      _ward_id: WARD,
      _doors: ok.doors.map((d) => ({
        pc: d.pc,
        lat: d.lat,
        lng: d.lng,
        outline: d.outline,
        ward_id: d.wardId,
      })),
      _give_to: USER,
    },
  ],
]);
await createList(fake, { ...ok, centreId: null, giveTo: null });
eq(
  "a draft names no centre and no one",
  [calls()[0]![1]].map((a) => [
    (a as Record<string, unknown>)["_centre_id"],
    (a as Record<string, unknown>)["_give_to"],
  ]),
  [[null, null]],
);
await giveList(fake, "L1", "U1");
await closeList(fake, "L1");
eq("giveList and closeList call their functions", calls(), [
  ["give_walk_list", { _id: "L1", _to: "U1" }],
  ["close_walk_list", { _id: "L1" }],
]);

// What a person is told when it goes wrong: the database's words for people, ours otherwise.
const refusing = (code: string, message: string): Client => ({
  from: () => {
    throw new Error("unused");
  },
  rpc: () => Promise.resolve({ data: null, error: { code, message } }),
});
eq(
  "the database's own words pass through for P0001 and 42501, ours otherwise",
  [
    await thrown(() =>
      createList(refusing("42501", "Only organisers and managers can plan walk lists."), ok),
    ),
    await thrown(() =>
      createList(refusing("P0001", "Every one of those houses is on another list."), ok),
    ),
    await thrown(() => createList(refusing("XX000", "boom"), ok)),
  ],
  [
    "Only organisers and managers can plan walk lists.",
    "Every one of those houses is on another list.",
    "Could not make the list.",
  ],
);
eq(
  "the same for giving and closing",
  [
    await thrown(() => giveList(refusing("P0001", "That person isn't on your team."), "L1", "U1")),
    await thrown(() => giveList(refusing("XX000", "boom"), "L1", "U1")),
    await thrown(() => closeList(refusing("XX000", "boom"), "L1")),
  ],
  ["That person isn't on your team.", "Could not give the list.", "Could not close the list."],
);
eq(
  "an answer without a list in it is no list made",
  await thrown(() =>
    createList(
      { from: fake.from, rpc: () => Promise.resolve({ data: { left_off: 0 }, error: null }) },
      ok,
    ),
  ),
  "Could not make the list.",
);

// A client whose every read is refused, as before schema 28: tables and functions that aren't there.
const answers = (answer: unknown) => {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "range"]) q[method] = () => q;
  q["then"] = (resolve: (a: unknown) => unknown) => Promise.resolve(answer).then(resolve);
  return q;
};
const missing = (what: string): Client => ({
  from: () => answers({ data: null, error: { message: `relation ${what} does not exist` } }),
  rpc: (fn) => answers({ data: null, error: { message: `function ${fn} does not exist` } }),
});
const refusedRead = missing("walk_lists");

eq(
  "a refused read is null with one log line and no rows",
  await logged(() => readOpenLists(refusedRead, WARD)),
  [null, ["Could not read the walk lists: function open_walk_lists does not exist"]],
);
eq(
  "so are the others, each saying what it was reading",
  [
    await logged(() => readPlanning(refusedRead, WARD)),
    await logged(() => readTeam(refusedRead)),
    await logged(() => readMyLists(refusedRead)),
    await logged(() => readListDoors(refusedRead, "L1")),
  ],
  [
    [null, ["Could not read the planning history: function walk_list_planning does not exist"]],
    [null, ["Could not read the team: function walk_list_team does not exist"]],
    [null, ["Could not read the walk lists: function my_walk_lists does not exist"]],
    [null, ["Could not read a walk list's doors: function walk_list_doors does not exist"]],
  ],
);

// The reads, in the database's snake_case.
const myRow = {
  id: "L1",
  name: "Kileleshwa Primary 1",
  centre_id: "C1",
  centre_name: "KILELESHWA PRIMARY SCHOOL",
  ward_id: "W1",
  doors: 44,
  done: 15,
  given_at: "2026-10-20T08:00:00Z",
  first_sent_at: "2026-10-20T08:00:00Z",
  due_on: "2026-10-22",
  shift: "morning",
};
const withRows = fakeSupabase({}, { my_walk_lists: () => [myRow] });
eq("my lists are read as summaries", (await readMyLists(withRows))![0], {
  id: "L1",
  name: "Kileleshwa Primary 1",
  status: "out",
  centreId: "C1",
  centreName: "KILELESHWA PRIMARY SCHOOL",
  wardId: "W1",
  givenTo: null,
  givenToName: null,
  doors: 44,
  done: 15,
  notHome: 0,
  firstSentAt: "2026-10-20T08:00:00Z",
  givenAt: "2026-10-20T08:00:00Z",
  dueOn: "2026-10-22",
  shift: "morning",
});

const openRows = fakeSupabase(
  {},
  {
    open_walk_lists: (args) => [
      {
        id: "L2",
        name: "Kileleshwa 1",
        status: "draft",
        centre_id: null,
        ward_id: args["_ward_id"],
        given_to: null,
        given_to_name: null,
        doors: 12,
        done: 0,
        not_home: 0,
        first_sent_at: null,
        given_at: null,
      },
      {
        id: "L3",
        name: "Kileleshwa Primary 2",
        status: "out",
        centre_id: "C1",
        ward_id: args["_ward_id"],
        given_to: USER,
        given_to_name: "Njoki Mwangi",
        doors: 44,
        done: 15,
        not_home: 4,
        first_sent_at: "2026-10-20T08:00:00Z",
        given_at: "2026-10-20T08:30:00Z",
      },
    ],
  },
);
eq("a ward's open lists are read as summaries", await readOpenLists(openRows, WARD), [
  {
    id: "L2",
    name: "Kileleshwa 1",
    status: "draft",
    centreId: null,
    centreName: null,
    wardId: WARD,
    givenTo: null,
    givenToName: null,
    doors: 12,
    done: 0,
    notHome: 0,
    firstSentAt: null,
    givenAt: null,
    dueOn: null,
    shift: null,
  },
  {
    id: "L3",
    name: "Kileleshwa Primary 2",
    status: "out",
    centreId: "C1",
    centreName: null,
    wardId: WARD,
    givenTo: USER,
    givenToName: "Njoki Mwangi",
    doors: 44,
    done: 15,
    notHome: 4,
    firstSentAt: "2026-10-20T08:00:00Z",
    givenAt: "2026-10-20T08:30:00Z",
    dueOn: null,
    shift: null,
  },
]);
eq(
  "a row that isn't a list is left out",
  (
    await readOpenLists(
      fakeSupabase({}, { open_walk_lists: () => [{ id: "L9", name: "x", status: "weird" }, null] }),
      WARD,
    )
  )?.length,
  0,
);

eq(
  "the team, agents as the database sent them, with a name for everyone",
  await readTeam(
    fakeSupabase(
      {},
      {
        walk_list_team: () => [
          { user_id: "U1", full_name: "Njoki Mwangi", role: "agent", doors_open: 12 },
          { user_id: "U2", full_name: null, role: "manager", doors_open: 0 },
        ],
      },
    ),
  ),
  [
    { userId: "U1", name: "Njoki Mwangi", role: "agent", doorsOpen: 12 },
    { userId: "U2", name: "Team member", role: "manager", doorsOpen: 0 },
  ],
);

eq(
  "the planning history, row by row",
  await readPlanning(
    fakeSupabase(
      {},
      {
        walk_list_planning: () => [
          {
            pc: "A",
            spoke_or_refused_at: "2026-10-10T08:00:00Z",
            not_home_at: null,
            on_list: null,
          },
          {
            pc: "B",
            spoke_or_refused_at: null,
            not_home_at: "2026-10-19T08:00:00Z",
            on_list: "L1",
          },
        ],
      },
    ),
    WARD,
  ),
  [
    { pc: "A", spokeOrRefusedAt: "2026-10-10T08:00:00Z", notHomeAt: null, onList: null },
    { pc: "B", spokeOrRefusedAt: null, notHomeAt: "2026-10-19T08:00:00Z", onList: "L1" },
  ],
);
eq(
  "every house in the history, paged past 1,000 rows",
  (
    await readPlanning(
      fakeSupabase(
        {},
        {
          walk_list_planning: () =>
            Array.from({ length: 2300 }, (_, i) => ({
              pc: `H${i}`,
              spoke_or_refused_at: null,
              not_home_at: null,
              on_list: "L1",
            })),
        },
      ),
      WARD,
    )
  )?.length,
  2300,
);

const doorRows = [
  {
    position: 1,
    pc: "TEST0000+01",
    lat: -1.28,
    lng: 36.78,
    outline: [[[36.78, -1.28]]],
    ward_id: "W1",
    last_outcome: "spoke",
    last_at: "2026-10-20T09:00:00Z",
  },
  {
    position: 2,
    pc: "TEST0000+02",
    lat: -1.2801,
    lng: 36.7801,
    outline: null,
    ward_id: null,
    last_outcome: null,
    last_at: null,
  },
];
const withDoors = fakeSupabase(
  {
    people: [
      {
        id: "P2",
        full_name: "Mercy",
        phone: "+254712000002",
        support_score: 75,
        building_id: "TEST0000+02",
      },
      {
        id: "P1",
        full_name: "Otieno",
        phone: "+254712000001",
        support_score: 0,
        building_id: "TEST0000+01",
      },
      {
        id: "P3",
        full_name: null,
        phone: "+254712000003",
        support_score: 95,
        building_id: "TEST0000+01",
      },
      {
        id: "P4",
        full_name: "Elsewhere",
        phone: "+254712000004",
        support_score: 50,
        building_id: "OTHER000+01",
      },
    ],
  },
  { walk_list_doors: () => doorRows },
);
const read = await readListDoors(withDoors, "L1");
eq("a list's doors come back numbered", read!.doors[0], {
  n: 1,
  pc: "TEST0000+01",
  at: [36.78, -1.28],
  rings: [[[36.78, -1.28]]],
  wardId: "W1",
  outcome: "spoke",
  visitedAt: "2026-10-20T09:00:00Z",
});
eq("a door with no outline, ward or visit is still a door", read!.doors[1], {
  n: 2,
  pc: "TEST0000+02",
  at: [36.7801, -1.2801],
  rings: [],
  wardId: null,
  outcome: null,
  visitedAt: null,
});
eq(
  "and the people on file at those doors, on the 1 to 5 scale, nobody from another house",
  read!.people,
  [
    { pc: "TEST0000+01", id: "P3", name: "No name on file", phone: "+254712000003", support: 5 },
    { pc: "TEST0000+01", id: "P1", name: "Otieno", phone: "+254712000001", support: 0 },
    { pc: "TEST0000+02", id: "P2", name: "Mercy", phone: "+254712000002", support: 4 },
  ],
);
eq(
  "doors are numbered in walking order whatever order the rows come in",
  (await readListDoors(
    fakeSupabase({}, { walk_list_doors: () => [doorRows[1], doorRows[0]] }),
    "L1",
  ))!.doors.map((d) => d.n),
  [1, 2],
);
eq(
  "a door of no known outcome is a door with none",
  (await readListDoors(
    fakeSupabase({}, { walk_list_doors: () => [{ ...doorRows[0], last_outcome: "visited" }] }),
    "L1",
  ))!.doors[0]!.outcome,
  null,
);
eq(
  "people the database sends from a house that isn't a door are left out",
  (await readListDoors(
    {
      from: () =>
        answers({
          data: [
            {
              id: "P9",
              full_name: "Stray",
              phone: "+254712000009",
              support_score: 50,
              building_id: "ELSEWHERE+99",
            },
            {
              id: "P1",
              full_name: "Otieno",
              phone: "+254712000001",
              support_score: 50,
              building_id: "TEST0000+01",
            },
          ],
          error: null,
        }),
      rpc: withDoors.rpc,
    },
    "L1",
  ))!.people.map((q) => q.id),
  ["P1"],
);
{
  // The people are a nicety: a refused lookup of them leaves the doors as they are.
  const noPeople: Client = {
    from: () => answers({ data: null, error: { message: "permission denied for table people" } }),
    rpc: withDoors.rpc,
  };
  const [kept, line] = await logged(() => readListDoors(noPeople, "L1"));
  eq(
    "doors without their people when those can't be read",
    [kept?.doors.length, kept?.people],
    [2, []],
  );
  eq("and the log says why, once", line, [
    "Could not read the people at a walk list's doors: permission denied for table people",
  ]);
}
{
  // The outlines of the open lists need only the doors: nobody's name or number is read for them.
  let asked = 0;
  const watching: Client = {
    from: (table) => {
      asked++;
      return withDoors.from(table);
    },
    rpc: withDoors.rpc,
  };
  const bare = await readListDoors(watching, "L1", false);
  eq(
    "doors without their people when only the doors are wanted",
    [bare?.doors.length, bare?.people],
    [2, []],
  );
  eq("and the people table is not touched", asked, 0);
}
eq(
  "a list with no doors has no people to look up",
  await readListDoors(fakeSupabase({}, { walk_list_doors: () => [] }), "L1"),
  { doors: [], people: [] },
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
