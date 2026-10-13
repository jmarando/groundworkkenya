// Checks for the Voters map's houses: the colours and legends, "Doors first",
// the door totals, and the server reads against an in-memory Supabase,
// including reads that fail, before the voters-map migration is applied or from
// a fault after it, and say why in the server log. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/houses.test.ts

import {
  doorsFirst,
  doorTotals,
  houseColour,
  houseLegend,
  NO_DATA,
  NO_SCORE,
  OUTCOME_COLOUR,
  scaleColour,
  toHouseStates,
  toWardDoors,
  wardLegend,
  wardShade,
  type WardDoors,
} from "@/lib/houses";
import { readAreaDoors, readHouse, readWardHouses, type Client } from "@/lib/houses.functions";
import { readMapArea } from "@/lib/map.functions";
import { BAND_COLOUR } from "@/lib/wardmap";

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

/**
 * Runs a read with console.error caught, so this file prints only its check
 * lines: gives the read's answer, and the first argument of each console.error
 * call it made.
 */
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

eq(
  "the scale: red, amber, green, clamped, NaN as nothing",
  [
    scaleColour(0),
    scaleColour(0.25),
    scaleColour(0.5),
    scaleColour(1),
    scaleColour(2),
    scaleColour(-1),
    scaleColour(NaN),
  ],
  [
    "hsl(0, 72%, 52%)",
    "hsl(20, 82%, 52%)",
    "hsl(40, 92%, 52%)",
    "hsl(142, 62%, 40%)",
    "hsl(142, 62%, 40%)",
    "hsl(0, 72%, 52%)",
    "hsl(0, 72%, 52%)",
  ],
);

const spoke4 = {
  pc: "6GCRPQM6+V9F4",
  at: "2026-10-10T08:00:00Z",
  outcome: "spoke" as const,
  support: 4,
};
const away = {
  pc: "6GCRPQM6+V9F5",
  at: "2026-10-10T08:00:00Z",
  outcome: "not_home" as const,
  support: null,
};
eq(
  "a house by its last outcome",
  [houseColour("doors", spoke4), houseColour("doors", away)],
  [OUTCOME_COLOUR.spoke, OUTCOME_COLOUR.not_home],
);
eq(
  "a house by its last score, or none",
  [houseColour("support", spoke4), houseColour("support", away)],
  [BAND_COLOUR[4], NO_SCORE],
);
eq("houses take no colour from the 2022 vote", houseColour("vote", spoke4), null);

const d = (wardId: string, knocked: number, rated = 0, supporters = 0): WardDoors => ({
  wardId,
  knocked,
  rated,
  supporters,
  doorsWeek: 0,
  agentsToday: [],
});
eq(
  "a ward by the share of its houses knocked; 40% is full",
  [
    wardShade("doors", 100, d("w", 20)),
    wardShade("doors", 100, d("w", 50)),
    wardShade("doors", 100, undefined),
  ],
  [scaleColour(0.5), scaleColour(1), scaleColour(0)],
);
eq("a ward with no houses on the map is grey, not red", wardShade("doors", 0, d("w", 3)), NO_DATA);
eq(
  "a ward by its supporters among doors scored, or grey",
  [wardShade("support", 100, d("w", 9, 4, 1)), wardShade("support", 100, d("w", 9, 0, 0))],
  [scaleColour(0.25), NO_DATA],
);
eq(
  "the legends say what grey is",
  [
    wardLegend("doors").map((l) => l.label),
    wardLegend("support").at(-1)?.label,
    houseLegend("doors").at(-1)?.label,
    houseLegend("support").map((l) => l.label),
    wardLegend("vote"),
  ],
  [
    ["No houses knocked", "20% of houses", "40% or more", "No houses on the map"],
    "No doors scored",
    "Not knocked in 30 days",
    ["1 against", "3 undecided", "5 strong", "No score", "Not knocked in 30 days"],
    [],
  ],
);

const WARDS = [
  { id: "w-a", slug: "a", name: "Alpha" },
  { id: "w-b", slug: "b", name: "Bravo" },
  { id: "w-c", slug: "c", name: "Charlie" },
  { id: "w-d", slug: "d", name: "Delta" },
];
const HOUSES = { a: 100, b: 50, d: 50 };
const DOORS = [
  { ...d("w-a", 90, 30, 20), doorsWeek: 12, agentsToday: ["u1", "u2"] },
  { ...d("w-b", 10, 5, 1), doorsWeek: 3, agentsToday: ["u2"] },
];
eq(
  "doors first: most houses not knocked, ties by name, no count no row",
  doorsFirst(WARDS, HOUSES, DOORS).map((r) => [r.slug, r.notKnocked]),
  [
    ["d", 50],
    ["b", 40],
    ["a", 10],
  ],
);
eq("and no more than asked", doorsFirst(WARDS, HOUSES, DOORS, 1).length, 1);
eq(
  "a ward knocked more often than its count says is never below zero",
  doorsFirst(WARDS, { a: 10 }, DOORS)[0]?.notKnocked,
  0,
);
eq("door totals; an agent in two wards counts once", doorTotals(WARDS, HOUSES, DOORS), {
  houses: 200,
  knocked: 100,
  rated: 35,
  supporters: 21,
  doorsWeek: 15,
  agentsToday: 2,
});

eq(
  "bad rows are left out",
  [
    toWardDoors([
      {
        ward_id: "w-a",
        knocked: 3,
        rated: 1,
        supporters: 0,
        doors_week: 2,
        agents_today: ["u1", 7],
      },
      { ward_id: null, knocked: 3, rated: 1, supporters: 0, doors_week: 2, agents_today: [] },
      { ward_id: "w-b", knocked: "3", rated: 1, supporters: 0, doors_week: 2, agents_today: [] },
    ]),
    toHouseStates([
      { pc: "6GCRPQM6+V9F4", visited_at: "2026-10-10T08:00:00Z", outcome: "spoke", support: 9 },
      { pc: "6GCRPQM6+V9F5", visited_at: "2026-10-10T08:00:00Z", outcome: "maybe", support: null },
      { pc: null, visited_at: "2026-10-10T08:00:00Z", outcome: "spoke", support: 3 },
    ]),
    toWardDoors(null),
  ],
  [
    [{ wardId: "w-a", knocked: 3, rated: 1, supporters: 0, doorsWeek: 2, agentsToday: ["u1"] }],
    [{ pc: "6GCRPQM6+V9F4", at: "2026-10-10T08:00:00Z", outcome: "spoke", support: null }],
    [],
  ],
);

{
  const sb = fakeSupabase(
    {
      house_visits: [
        {
          id: "v1",
          pc: "6GCRPQM6+V9F4",
          visited_at: "2026-10-01T08:00:00Z",
          actor: "u1",
          outcome: "spoke",
          support: 4,
          issue: "Water",
          person_id: "p1",
        },
        {
          id: "v2",
          pc: "6GCRPQM6+V9F4",
          visited_at: "2026-10-09T08:00:00Z",
          actor: "u2",
          outcome: "not_home",
          support: null,
          issue: null,
          person_id: null,
        },
        {
          id: "v3",
          pc: "6GCRPQM6+V9F5",
          visited_at: "2026-10-09T09:00:00Z",
          actor: "u1",
          outcome: "spoke",
          support: 2,
          issue: null,
          person_id: null,
        },
      ],
      profiles: [
        { user_id: "u1", full_name: "Brian Otieno" },
        { user_id: "u2", full_name: "  " },
      ],
      people: [{ id: "p1", full_name: "Faith Chebet" }],
    },
    {
      house_doors: () => [
        {
          ward_id: "w-a",
          knocked: 2,
          rated: 1,
          supporters: 1,
          doors_week: 2,
          agents_today: ["u1"],
        },
      ],
      ward_houses: () =>
        Array.from({ length: 2500 }, (_, i) => ({
          pc: `HOUSE-${i}`,
          visited_at: "2026-10-09T08:00:00Z",
          outcome: "spoke",
          support: 3,
        })),
    },
  );
  eq(
    "a house's visits, newest first, with who knocked and who answered",
    await readHouse(sb, "6GCRPQM6+V9F4"),
    [
      {
        at: "2026-10-09T08:00:00Z",
        agent: null,
        outcome: "not_home",
        support: null,
        issue: null,
        person: null,
      },
      {
        at: "2026-10-01T08:00:00Z",
        agent: "Brian Otieno",
        outcome: "spoke",
        support: 4,
        issue: "Water",
        person: { id: "p1", name: "Faith Chebet" },
      },
    ],
  );
  eq("doors per ward", await readAreaDoors(sb), [
    { wardId: "w-a", knocked: 2, rated: 1, supporters: 1, doorsWeek: 2, agentsToday: ["u1"] },
  ]);
  eq("a ward's houses, paged past 1,000 rows", (await readWardHouses(sb, "w-a")).length, 2500);
}

{
  // Before the migration: the database functions don't exist (the fake answers
  // "no function ..." to each), so every read fails soft and says why, once.
  const sb = fakeSupabase({}, {});
  const [doors, doorsLog] = await logged(() => readAreaDoors(sb));
  const [houses, housesLog] = await logged(() => readWardHouses(sb, "w-a"));
  const [area, areaLog] = await logged(() => readMapArea(sb));
  eq("door counts that can't be read are null", doors, null);
  eq("a ward's houses that can't be read are none", houses, []);
  eq("no campaign function, no map area", area, null);
  eq("door counts that can't be read are logged, once", doorsLog, [
    "Could not read the door counts: no function house_doors",
  ]);
  eq("a ward's houses that can't be read are logged, once", housesLog, [
    "Could not read a ward's houses: no function ward_houses",
  ]);
  eq("no campaign function is logged, once", areaLog, [
    "Could not read the campaign's map area: no function my_campaign",
  ]);
}

{
  // After the migration a real fault (a missing grant, a row level security or SQL
  // error, a mistyped column) fails soft the same way, and the log says what it
  // was. This client is a database that is up but faulty: my_campaign answers,
  // ward_houses gives a full first page and then times out, and every table
  // read is refused.
  const fault = (message: string) => ({ data: null, error: { message } });
  // What the Supabase builder gives once awaited, however it was built up.
  const answers = (answer: unknown) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) q[method] = () => q;
    q["maybeSingle"] = () => Promise.resolve(answer);
    q["then"] = (resolve: (a: unknown) => unknown) => Promise.resolve(answer).then(resolve);
    return q;
  };
  const fullPage = Array.from({ length: 1000 }, (_, i) => ({
    pc: `HOUSE-${i}`,
    visited_at: "2026-10-09T08:00:00Z",
    outcome: "spoke",
    support: 3,
  }));
  const faulty: Client = {
    from: (table) => answers(fault(`permission denied for table ${table}`)),
    rpc: (fn) =>
      fn === "my_campaign"
        ? answers({ data: "c1", error: null })
        : {
            range: (from: number) =>
              answers(
                from === 0
                  ? { data: fullPage, error: null }
                  : fault("canceling statement due to statement timeout"),
              ),
          },
  };
  const [visits, visitsLog] = await logged(() => readHouse(faulty, "6GCRPQM6+V9F4"));
  const [area, areaLog] = await logged(() => readMapArea(faulty));
  const [houses, housesLog] = await logged(() => readWardHouses(faulty, "w-a"));
  eq("a house whose visits can't be read is null", visits, null);
  eq("a campaign whose row can't be read has no map area", area, null);
  eq("a ward's houses are none when the second page fails", houses.length, 0);
  eq("a house's visits that can't be read are logged, once", visitsLog, [
    "Could not read a house's visits: permission denied for table house_visits",
  ]);
  eq("a campaign row that can't be read is logged, once", areaLog, [
    "Could not read the campaign's map area: permission denied for table campaigns",
  ]);
  eq("a second page that fails is logged, once", housesLog, [
    "Could not read a ward's houses: canceling statement due to statement timeout",
  ]);

  // And a client that throws instead of answering: an Error, or anything else.
  const down = (thrown: unknown): Client => ({
    from: () => {
      throw thrown;
    },
    rpc: () => {
      throw thrown;
    },
  });
  const [byError, byErrorLog] = await logged(() =>
    readMapArea(down(new Error("connection reset"))),
  );
  const [byText, byTextLog] = await logged(() => readMapArea(down("socket hang up")));
  eq("a client that throws gives no map area", [byError, byText], [null, null]);
  eq(
    "and what it threw is logged, once each",
    [byErrorLog, byTextLog],
    [
      ["Could not read the campaign's map area: connection reset"],
      ["Could not read the campaign's map area: socket hang up"],
    ],
  );
}

{
  const withArea = fakeSupabase(
    { campaigns: [{ id: "c1", map_area: "nairobi" }] },
    { my_campaign: () => "c1" },
  );
  const without = fakeSupabase({ campaigns: [{ id: "c1" }] }, { my_campaign: () => "c1" });
  const empty = fakeSupabase(
    { campaigns: [{ id: "c1", map_area: "" }] },
    { my_campaign: () => "c1" },
  );
  const nobody = fakeSupabase(
    { campaigns: [{ id: "c1", map_area: "nairobi" }] },
    { my_campaign: () => null },
  );
  const [areas, quiet] = await logged(async () => [
    await readMapArea(withArea),
    await readMapArea(without),
    await readMapArea(empty),
    await readMapArea(nobody),
  ]);
  eq("the campaign's map area", areas.slice(0, 2), ["nairobi", null]);
  eq("an empty map area, or a person with no campaign, is no map area", areas.slice(2), [
    null,
    null,
  ]);
  eq("and none of those is a fault, so nothing is logged", quiet, []);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
