// Checks for planning a walk list on the map (src/lib/walk-list-plan.ts): the state of the
// planner as the person taps, and the draft it makes of the houses read for the area. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/walk-list-plan.test.ts

import type { Building, LngLat } from "@/lib/geo";
import {
  draftDoors,
  emptyPlan,
  reducePlan,
  skipSplit,
  toDoors,
  toPlanHouses,
  type PlanState,
} from "@/lib/walk-list-plan";
import type { HouseHistory, PlanHouse } from "@/lib/walk-lists";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

const NOW = Date.parse("2026-10-20T08:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const house = (pc: string, lng: number, lat: number): PlanHouse => ({
  pc,
  centre: [lng, lat],
  rings: [
    [
      [lng - 0.00001, lat + 0.00001],
      [lng + 0.00001, lat + 0.00001],
      [lng + 0.00001, lat - 0.00001],
      [lng - 0.00001, lat + 0.00001],
    ],
  ],
  wardId: null,
});
const seen = (pc: string, extra: Partial<HouseHistory>): [string, HouseHistory] => [
  pc,
  { pc, spokeOrRefusedAt: null, notHomeAt: null, onList: null, ...extra },
];

// 60 houses in a line east of the start, 1 m apart: H3 and H4 spoken to lately, H5 not home
// yesterday, H6 on another list.
const line = Array.from({ length: 60 }, (_, i) => house(`H${i}`, 36.8 + i * 0.00001, -1.28));
const history = new Map<string, HouseHistory>([
  seen("H3", { spokeOrRefusedAt: iso(10) }),
  seen("H4", { spokeOrRefusedAt: iso(10) }),
  seen("H5", { notHomeAt: iso(1) }),
  seen("H6", { onList: "L1" }),
]);
const START: LngLat = [36.8, -1.28];
const started = (): PlanState => reducePlan(emptyPlan(), { type: "start", at: START });

// The state of the planner.
eq("the planner starts with a patch and nothing chosen", emptyPlan(), {
  mode: "patch",
  start: null,
  drawn: [],
  closed: false,
  off: [],
  added: [],
});
eq("a start point is where a patch begins", started().start, START);
eq(
  "a new start forgets what was taken off and added",
  reducePlan(
    reducePlan(reducePlan(started(), { type: "off", pc: "H1" }), { type: "add", pc: "H9" }),
    { type: "start", at: [36.801, -1.28] },
  ),
  { ...emptyPlan(), start: [36.801, -1.28] },
);
eq(
  "changing the way to choose keeps the start and drops the rest",
  reducePlan(reducePlan(started(), { type: "off", pc: "H1" }), { type: "mode", mode: "draw" }),
  { ...emptyPlan(), mode: "draw", start: START },
);
eq(
  "taking a house off, and putting it back",
  [
    reducePlan(started(), { type: "off", pc: "H1" }).off,
    reducePlan(reducePlan(started(), { type: "off", pc: "H1" }), { type: "add", pc: "H1" }).off,
  ],
  [["H1"], []],
);
eq(
  "adding a house, and taking it off again",
  [
    reducePlan(started(), { type: "add", pc: "H9" }).added,
    reducePlan(reducePlan(started(), { type: "add", pc: "H9" }), { type: "off", pc: "H9" }).added,
  ],
  [["H9"], []],
);
eq(
  "a house taken off twice is off once",
  reducePlan(reducePlan(started(), { type: "off", pc: "H1" }), { type: "off", pc: "H1" }).off,
  ["H1"],
);

const drawing = (n: number): PlanState => {
  let s = reducePlan(emptyPlan(), { type: "mode", mode: "draw" });
  for (let i = 0; i < n; i++)
    s = reducePlan(s, { type: "point", at: [36.8 + i * 0.0001, -1.28 - (i % 2) * 0.0001] });
  return s;
};
eq("points are drawn in draw mode", drawing(4).drawn.length, 4);
eq("and not in patch mode", reducePlan(emptyPlan(), { type: "point", at: START }).drawn, []);
eq("two points are not a shape to finish", reducePlan(drawing(2), { type: "done" }).closed, false);
eq("three are", reducePlan(drawing(3), { type: "done" }).closed, true);
eq(
  "no more points once it's done",
  reducePlan(reducePlan(drawing(3), { type: "done" }), { type: "point", at: START }).drawn.length,
  3,
);
eq(
  "start again clears the shape and the houses taken off",
  reducePlan(reducePlan(reducePlan(drawing(3), { type: "done" }), { type: "off", pc: "X" }), {
    type: "again",
  }),
  { ...emptyPlan(), mode: "draw" },
);
eq(
  "give up puts it all back",
  reducePlan(reducePlan(drawing(3), { type: "done" }), { type: "reset" }),
  emptyPlan(),
);

// The draft a patch makes.
const patch = draftDoors(started(), line, history, NOW, null);
eq(
  "a patch is the nearest free houses, in walking order, numbered from 1",
  [patch.doors.length, patch.doors[0]!.pc, patch.doors[0]!.n, patch.doors[49]!.n],
  [50, "H0", 1, 50],
);
eq(
  "the houses waiting for a visit or on another list are left out",
  patch.doors.slice(0, 5).map((d) => d.pc),
  ["H0", "H1", "H2", "H7", "H8"],
);
eq("and counted, by why", patch.skipped, { spoke: 2, notHome: 1, otherList: 1 });
eq("the left-off houses on other lists are counted for the sentence", patch.leftOff, 1);
eq("with no start there is no patch", draftDoors(emptyPlan(), line, history, NOW, null).doors, []);
eq("no houses read yet, no patch", draftDoors(started(), [], history, NOW, null).doors, []);

const taken = draftDoors(
  reducePlan(started(), { type: "off", pc: "H0" }),
  line,
  history,
  NOW,
  null,
);
eq(
  "taking a house off closes the numbers up",
  [
    taken.doors.length,
    taken.doors[0]!.pc,
    taken.doors[0]!.n,
    taken.doors.some((d) => d.pc === "H0"),
  ],
  [49, "H1", 1, false],
);
const extra = draftDoors(
  reducePlan(started(), { type: "add", pc: "H3" }),
  line,
  history,
  NOW,
  null,
);
eq(
  "a house added by hand joins the walk, though it was visited lately",
  [extra.doors.length, extra.doors.some((d) => d.pc === "H3")],
  [51, true],
);
eq(
  "a house already in the draft isn't twice in it",
  draftDoors({ ...started(), added: ["H0"] }, line, history, NOW, null).doors.length,
  50,
);
eq(
  "a house on another list can't be added",
  draftDoors(reducePlan(started(), { type: "add", pc: "H6" }), line, history, NOW, null).doors.some(
    (d) => d.pc === "H6",
  ),
  false,
);
eq(
  "a house that isn't in the area can't be added either",
  draftDoors(reducePlan(started(), { type: "add", pc: "ZZ" }), line, history, NOW, null).doors
    .length,
  50,
);

// The draft a drawn shape makes.
const grid = Array.from({ length: 9 }, (_, k) =>
  house(`G${k}`, 36.8004 + (k % 3) * 0.00009, -1.2804 - Math.floor(k / 3) * 0.00009),
);
const square: LngLat[] = [
  [36.8, -1.28],
  [36.801, -1.28],
  [36.801, -1.281],
  [36.8, -1.281],
];
const drawn = (): PlanState => {
  let s = reducePlan(emptyPlan(), { type: "mode", mode: "draw" });
  for (const at of square) s = reducePlan(s, { type: "point", at });
  return s;
};
eq("a shape not yet done takes nothing", draftDoors(drawn(), grid, new Map(), NOW, null).doors, []);
const done = reducePlan(drawn(), { type: "done" });
eq(
  "a finished shape takes the houses inside, numbered",
  draftDoors(done, grid, new Map(), NOW, null).doors.map((d) => d.n),
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
);
eq(
  "starting at the centre when there is one",
  draftDoors(done, grid, new Map(), NOW, grid[8]!.centre).doors[0]!.pc,
  "G8",
);
eq(
  "houses on other lists are left out and counted",
  (() => {
    const d = draftDoors(
      done,
      grid,
      new Map([seen("G1", { onList: "L2" }), seen("G2", { onList: "L2" })]),
      NOW,
      null,
    );
    return [d.doors.length, d.leftOff, d.tooMany];
  })(),
  [7, 2, false],
);
eq(
  "a houses spoken to lately are still taken in a drawn shape",
  draftDoors(done, grid, new Map([seen("G1", { spokeOrRefusedAt: iso(1) })]), NOW, null).doors
    .length,
  9,
);
{
  const crowd = Array.from({ length: 151 }, (_, i) =>
    house(`C${i}`, 36.71 + (i % 20) * 0.005, -1.21 - Math.floor(i / 20) * 0.005),
  );
  let s = reducePlan(emptyPlan(), { type: "mode", mode: "draw" });
  for (const at of [
    [36.7, -1.2],
    [36.9, -1.2],
    [36.9, -1.4],
    [36.7, -1.4],
  ] as LngLat[])
    s = reducePlan(s, { type: "point", at });
  const big = draftDoors(reducePlan(s, { type: "done" }), crowd, new Map(), NOW, null);
  eq("over 150 houses it takes none and says so", [big.doors.length, big.tooMany], [0, true]);
}

// What was skipped, by why; and a house on both counts as on another list.
eq("the skips by why", skipSplit(line, history, NOW), { spoke: 2, notHome: 1, otherList: 1 });
eq(
  "a house both spoken to and on a list is only on a list",
  skipSplit([line[0]!], new Map([seen("H0", { spokeOrRefusedAt: iso(1), onList: "L1" })]), NOW),
  { spoke: 0, notHome: 0, otherList: 1 },
);

// From the map's houses to the planner's, and from the draft to what the database is sent.
const building: Building = {
  id: "6GCRQ2XQ+22",
  area: 80,
  centre: [36.78, -1.28],
  rings: [
    [
      [36.78, -1.28],
      [36.7801, -1.28],
      [36.7801, -1.2801],
      [36.78, -1.28],
    ],
  ],
};
eq("a house on the map becomes one to plan", toPlanHouses([building]), [
  { pc: "6GCRQ2XQ+22", centre: [36.78, -1.28], rings: building.rings, wardId: null },
]);
eq("a draft becomes the doors the database is sent", toDoors(toPlanHouses([building])), [
  { pc: "6GCRQ2XQ+22", lat: -1.28, lng: 36.78, outline: building.rings, wardId: null },
]);
eq(
  "with the ward it stands in",
  toDoors([{ ...toPlanHouses([building])[0]!, wardId: "W1" }])[0]!.wardId,
  "W1",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
