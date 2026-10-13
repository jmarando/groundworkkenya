// Checks for the Voters map's houses: the colours and legends, "Doors first",
// the door totals, and the server reads against an in-memory Supabase,
// including reads that fail before the voters-map migration is applied. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/houses.test.ts

import {
  BAND_COLOUR,
  blockNote,
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
import { readAreaDoors, readHouse, readWardHouses } from "@/lib/houses.functions";
import { readMapArea } from "@/lib/map.functions";

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
  "the house card's note for an outline big enough to be several homes",
  [blockNote(199), blockNote(200), blockNote(1250), blockNote(null)],
  [
    null,
    "This outline covers 200 m², often several homes: log each household as its own visit.",
    "This outline covers 1,250 m², often several homes: log each household as its own visit.",
    null,
  ],
);

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
  // Before the migration: no functions, no house_visits table, no map_area column.
  const sb = fakeSupabase({}, {});
  eq("door counts that can't be read are null", await readAreaDoors(sb), null);
  eq("a ward's houses that can't be read are none", await readWardHouses(sb, "w-a"), []);
  eq("no campaign function, no map area", await readMapArea(sb), null);
}
{
  const withArea = fakeSupabase(
    { campaigns: [{ id: "c1", map_area: "nairobi" }] },
    { my_campaign: () => "c1" },
  );
  const without = fakeSupabase({ campaigns: [{ id: "c1" }] }, { my_campaign: () => "c1" });
  eq(
    "the campaign's map area",
    [await readMapArea(withArea), await readMapArea(without)],
    ["nairobi", null],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
