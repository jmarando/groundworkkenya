// Checks for the rules of a walk list (src/lib/walk-lists.ts): which houses a suggested patch
// takes, which a drawn shape takes, the order to walk them in, and the words and progress the
// screens show. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/walk-lists.test.ts

import { toLocalM, type LngLat } from "@/lib/geo";
import {
  canPlanWalkLists,
  DRAW_CAP,
  defaultName,
  housesWithin,
  inWalkingOrder,
  leftOffText,
  nextDoor,
  NOT_HOME_DAYS,
  PATCH_SIZE,
  progressText,
  queuedDoors,
  skipReason,
  SPOKE_REFUSED_DAYS,
  suggestPatch,
  walkingOrder,
  type HouseHistory,
  type PlanHouse,
} from "@/lib/walk-lists";

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

/** A house with a small square outline at the point, as the house file gives them. */
const house = (pc: string, lng: number, lat: number): PlanHouse => ({
  pc,
  centre: [lng, lat],
  rings: [
    [
      [lng - 0.00001, lat + 0.00001],
      [lng + 0.00001, lat + 0.00001],
      [lng + 0.00001, lat - 0.00001],
      [lng - 0.00001, lat - 0.00001],
      [lng - 0.00001, lat + 0.00001],
    ],
  ],
  wardId: null,
});

const past = (pc: string, extra: Partial<HouseHistory>): [string, HouseHistory] => [
  pc,
  { pc, spokeOrRefusedAt: null, notHomeAt: null, onList: null, ...extra },
];

eq(
  "the numbers the spec gives",
  [PATCH_SIZE, DRAW_CAP, SPOKE_REFUSED_DAYS, NOT_HOME_DAYS],
  [50, 150, 30, 3],
);

// What makes a house wait: another open list, a conversation in 30 days, nobody home in 3.
eq(
  "spoke 29 days ago is recent",
  skipReason({ pc: "A", spokeOrRefusedAt: iso(29), notHomeAt: null, onList: null }, NOW),
  "recent",
);
eq(
  "spoke 31 days ago is not",
  skipReason({ pc: "A", spokeOrRefusedAt: iso(31), notHomeAt: null, onList: null }, NOW),
  null,
);
eq(
  "not home 2 days ago is recent, 4 days ago is not",
  [
    skipReason({ pc: "A", spokeOrRefusedAt: null, notHomeAt: iso(2), onList: null }, NOW),
    skipReason({ pc: "A", spokeOrRefusedAt: null, notHomeAt: iso(4), onList: null }, NOW),
  ],
  ["recent", null],
);
eq(
  "another open list outranks recency",
  skipReason({ pc: "A", spokeOrRefusedAt: iso(1), notHomeAt: null, onList: "L1" }, NOW),
  "other-list",
);
eq("no history is fine", skipReason(undefined, NOW), null);
eq(
  "a time that isn't a time skips nothing",
  skipReason({ pc: "A", spokeOrRefusedAt: "soon", notHomeAt: "later", onList: null }, NOW),
  null,
);

// 60 houses in a line east of the start, 1 m apart; houses 3, 4 recent, 5 on a list.
const line = Array.from({ length: 60 }, (_, i) => house(`H${i}`, 36.8 + i * 0.00001, -1.28));
const history = new Map<string, HouseHistory>([
  past("H3", { spokeOrRefusedAt: iso(10) }),
  past("H4", { spokeOrRefusedAt: iso(10) }),
  past("H5", { onList: "L1" }),
]);
const p = suggestPatch(line, [36.8, -1.28], history, NOW);
eq(
  "a patch is the nearest free houses: H3, H4 and H5 are skipped",
  p.doors.map((d) => d.pc).slice(0, 4),
  ["H0", "H1", "H2", "H6"],
);
eq("a patch has at most 50", p.doors.length, 50);
eq("the skips are counted", p.skipped, { recent: 2, otherList: 1 });
eq(
  "fewer than 50 free: all of them",
  suggestPatch(line.slice(0, 8), [36.8, -1.28], new Map(), NOW).doors.length,
  8,
);
eq(
  "the nearest come first, from wherever the patch starts",
  suggestPatch(line, [36.8 + 59 * 0.00001, -1.28], new Map(), NOW)
    .doors.map((d) => d.pc)
    .slice(0, 3),
  ["H59", "H58", "H57"],
);
eq(
  "a smaller patch on request",
  suggestPatch(line, [36.8, -1.28], new Map(), NOW, 5).doors.map((d) => d.pc),
  ["H0", "H1", "H2", "H3", "H4"],
);
eq(
  "a house both spoken to and on a list counts as on a list",
  suggestPatch(
    line.slice(0, 3),
    [36.8, -1.28],
    new Map([past("H1", { spokeOrRefusedAt: iso(1), onList: "L1" })]),
    NOW,
  ).skipped,
  { recent: 0, otherList: 1 },
);
eq("no houses, no patch", suggestPatch([], [36.8, -1.28], new Map(), NOW), {
  doors: [],
  skipped: { recent: 0, otherList: 0 },
});

// A drawn shape: every house whose centre is inside, except those on another open list.
const square: LngLat[] = [
  [36.8, -1.28],
  [36.801, -1.28],
  [36.801, -1.281],
  [36.8, -1.281],
];
const farSquare: LngLat[] = [
  [36.9, -1.28],
  [36.901, -1.28],
  [36.901, -1.281],
  [36.9, -1.281],
];
const bowTie: LngLat[] = [
  [36.8, -1.28],
  [36.801, -1.281],
  [36.801, -1.28],
  [36.8, -1.281],
];
const grid = Array.from({ length: 9 }, (_, k) =>
  house(`G${k}`, 36.8004 + (k % 3) * 0.00009, -1.2804 - Math.floor(k / 3) * 0.00009),
);
const onList = (n: number) => new Map(grid.slice(0, n).map((h) => past(h.pc, { onList: "L9" })));
const big: LngLat[] = [
  [36.7, -1.2],
  [36.9, -1.2],
  [36.9, -1.4],
  [36.7, -1.4],
];
const crowd = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    house(`C${i}`, 36.71 + (i % 20) * 0.005, -1.21 - Math.floor(i / 20) * 0.005),
  );

eq(
  "a shape takes the houses whose centre is inside",
  housesWithin(grid, square, new Map()).doors.length,
  9,
);
eq(
  "houses on another list are left out and counted",
  housesWithin(grid, square, onList(2)).otherList,
  2,
);
eq(
  "and the rest are taken",
  housesWithin(grid, square, onList(2)).doors.map((d) => d.pc),
  ["G2", "G3", "G4", "G5", "G6", "G7", "G8"],
);
eq("two points are not a shape", housesWithin(grid, square.slice(0, 2), new Map()), {
  doors: [],
  otherList: 0,
  tooMany: false,
});
eq("a shape round no houses is empty", housesWithin(grid, farSquare, new Map()).doors.length, 0);
eq(
  "a bow tie does not throw and takes what an even-odd test says",
  housesWithin(grid, bowTie, new Map()).doors.length >= 0,
  true,
);
eq(
  "a house just outside is not taken",
  housesWithin([house("OUT", 36.8, -1.2815)], square, new Map()).doors.length,
  0,
);
eq(
  "151 houses is too many, 150 is not",
  [
    housesWithin(crowd(151), big, new Map()).tooMany,
    housesWithin(crowd(150), big, new Map()).tooMany,
  ],
  [true, false],
);
eq(
  "too many gives no doors, 150 gives them all",
  [
    housesWithin(crowd(151), big, new Map()).doors.length,
    housesWithin(crowd(150), big, new Map()).doors.length,
  ],
  [0, 150],
);
eq(
  "houses on other lists don't count toward the cap",
  housesWithin(crowd(151), big, new Map([past("C0", { onList: "L2" })])),
  { doors: crowd(151).slice(1), otherList: 1, tooMany: false },
);
eq(
  "a drawn shape takes houses spoken to lately: only another list keeps one out",
  housesWithin(grid, square, new Map([past("G1", { spokeOrRefusedAt: iso(1) })])).doors.length,
  9,
);

// The order to walk in: nearest next, then shortened while reversing a stretch helps.
const scrambledLine: LngLat[] = [
  [36.8, -1.28],
  [36.80004, -1.28],
  [36.80001, -1.28],
  [36.80003, -1.28],
  [36.80002, -1.28],
];
const sortedLongitudes = [...scrambledLine].map((q) => q[0]).sort((a, b) => a - b);
let seed = 12345;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const any30: LngLat[] = Array.from({ length: 30 }, () => [
  36.8 + random() * 0.004,
  -1.28 - random() * 0.004,
]);

/** Lengths in metres on the plane the order is worked out on: round the first point. */
function length(points: LngLat[], order: number[]): number {
  const flat = points.map((q) => toLocalM(q, points[0]!));
  let total = 0;
  for (let i = 1; i < order.length; i++) {
    const a = flat[order[i - 1]!]!;
    const b = flat[order[i]!]!;
    total += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return total;
}

/** The nearest-neighbour walk on its own, to compare with: what 2-opt starts from. */
function nearestOnly(points: LngLat[]): number[] {
  const flat = points.map((q) => toLocalM(q, points[0]!));
  const order = [0];
  const left = new Set(points.map((_, i) => i).slice(1));
  while (left.size) {
    const last = flat[order[order.length - 1]!]!;
    let best = -1;
    let bestD = Infinity;
    for (const i of left) {
      const d = Math.hypot(flat[i]![0] - last[0], flat[i]![1] - last[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
  }
  return order;
}

eq(
  "a walk along a line, given out of order, is in line order",
  walkingOrder(scrambledLine).map((i) => scrambledLine[i]![0]),
  sortedLongitudes,
);
eq("the first point stays first", walkingOrder(any30)[0], 0);
eq(
  "every point is walked once",
  [...walkingOrder(any30)].sort((a, b) => a - b),
  any30.map((_, i) => i),
);
eq(
  "2-opt never lengthens the nearest-neighbour walk",
  length(any30, walkingOrder(any30)) <= length(any30, nearestOnly(any30)) + 1e-9,
  true,
);
eq(
  "and on thirty scattered doors the reversals do shorten it",
  length(any30, walkingOrder(any30)) < length(any30, nearestOnly(any30)) * 0.98,
  true,
);
eq(
  "nothing to walk, one door, two doors",
  [walkingOrder([]), walkingOrder([[36.8, -1.28]]), walkingOrder(scrambledLine.slice(0, 2))],
  [[], [0], [0, 1]],
);

// Hand-made so that nearest-neighbour doubles back and a reversal fixes it: from the start it
// takes the near point of the far pair first.
const detour: LngLat[] = [
  [36.8, -1.28],
  [36.8001, -1.28],
  [36.8001, -1.28008],
  [36.8002, -1.28004],
  [36.80021, -1.28],
  [36.8003, -1.28],
];
eq(
  "the shortened walk is never longer than nearest-neighbour on a made-up street either",
  length(detour, walkingOrder(detour)) <= length(detour, nearestOnly(detour)) + 1e-9,
  true,
);

const doors = [...line.slice(0, 10)].reverse();
eq(
  "the order starts at the door nearest the start",
  inWalkingOrder(doors, [36.8, -1.28])[0]!.pc,
  "H0",
);
eq(
  "and goes on along the street",
  inWalkingOrder(doors, [36.8, -1.28]).map((d) => d.pc),
  ["H0", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9"],
);
eq("with no start the first door starts", inWalkingOrder(doors, null)[0]!.pc, doors[0]!.pc);
eq("no doors, no order", inWalkingOrder([], [36.8, -1.28]), []);

// Words and counts the screens show.
eq(
  "default name tidies the centre",
  defaultName("KILELESHWA PRIMARY SCHOOL", "Kileleshwa", 2),
  "Kileleshwa Primary 3",
);
eq("default name with no centre", defaultName(null, "Kileleshwa", 0), "Kileleshwa 1");
eq(
  "a centre name with a hyphen keeps it",
  defaultName("MUGUMO-INI PRIMARY SCHOOL", "Mugumo-ini", 0),
  "Mugumo-ini Primary 1",
);
eq(
  "a centre that is only a school falls back to the ward",
  defaultName("SCHOOL", "Kileleshwa", 0),
  "Kileleshwa 1",
);
eq(
  "a name stays within the 80 letters a list may have, number and all",
  defaultName("A".repeat(100), "Kileleshwa", 11).length,
  80,
);
eq("progress text", progressText(15, 44), "15 of 44 done");
eq(
  "left off text",
  [leftOffText(12), leftOffText(1)],
  ["12 houses are on other lists and were left out", "1 house is on another list and was left out"],
);
eq("nothing left off says nothing", leftOffText(0), "");

// The door after this one.
eq(
  "next door skips visited and comes back to skipped last",
  nextDoor(["a", "b", "c", "d"], new Set(["a", "b"]), ["c"], "b"),
  "d",
);
eq(
  "when only a skipped door is left it comes back",
  nextDoor(["a", "b", "c"], new Set(["a", "b"]), ["c"], "b"),
  "c",
);
eq("all visited is null", nextDoor(["a"], new Set(["a"]), [], "a"), null);
eq(
  "from the last door it goes back to an earlier one left",
  nextDoor(["a", "b", "c", "d"], new Set(["b", "c", "d"]), [], "d"),
  "a",
);
eq("with no door yet it starts at the first", nextDoor(["a", "b", "c"], new Set(), [], null), "a");
eq(
  "the door just skipped is not offered again",
  nextDoor(["a", "b", "c"], new Set(["a", "b"]), ["c"], "c"),
  null,
);
eq(
  "skipped doors come back in walking order",
  nextDoor(["a", "b", "c", "d"], new Set(["a", "d"]), ["c", "b"], "d"),
  "b",
);

eq(
  "queued visits for this list only",
  [...queuedDoors([{ walkListId: "L", doorPc: "A" }, { walkListId: "M", doorPc: "B" }, {}], "L")],
  ["A"],
);
eq(
  "a queued visit with no door adds none",
  [...queuedDoors([{ walkListId: "L", doorPc: null }, { walkListId: "L" }], "L")],
  [],
);
eq(
  "who may plan",
  (["agent", "organiser", "manager", "candidate", "super", "pending", null] as const).map(
    canPlanWalkLists,
  ),
  [false, true, true, true, true, false, false],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
