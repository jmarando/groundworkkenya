// Checks for door-to-door numbers by ward: who has been seen, doors knocked
// in 30 days, and what people raised at the door. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/canvass.test.ts

import { doorsByWard } from "@/lib/canvass";

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

const NOW = Date.UTC(2026, 9, 4, 9);
const daysAgo = (d: number) => new Date(NOW - d * 864e5).toISOString();
const PEOPLE = [
  { id: "a1", ward_id: "wa", last_contacted_at: daysAgo(3) },
  { id: "a2", ward_id: "wa", last_contacted_at: daysAgo(45) },
  { id: "a3", ward_id: "wa", last_contacted_at: null },
  { id: "b1", ward_id: "wb", last_contacted_at: daysAgo(10) },
  { id: "c1", ward_id: "wc", last_contacted_at: null },
  { id: "x1", ward_id: null, last_contacted_at: daysAgo(1) },
];
const EVENTS = [
  { person_id: "a1", kind: "door_spoke", detail: "Water", created_at: daysAgo(3) },
  { person_id: "a1", kind: "door_spoke", detail: "Water", created_at: daysAgo(20) },
  { person_id: "a2", kind: "door_not_home", detail: null, created_at: daysAgo(45) },
  { person_id: "b1", kind: "door_spoke", detail: "Roads", created_at: daysAgo(10) },
  { person_id: "b1", kind: "door_refused", detail: null, created_at: daysAgo(12) },
  { person_id: "x1", kind: "door_spoke", detail: "Jobs", created_at: daysAgo(1) },
];
const by = doorsByWard(PEOPLE, EVENTS, NOW);
eq("a ward's doors", by.get("wa"), {
  people: 3,
  knocked: 1,
  spoke: 2,
  stale: 1,
  never: 1,
  doors30: 2,
  issues: [{ name: "Water", count: 2 }],
});
eq("another's", [by.get("wb")?.doors30, by.get("wb")?.issues], [2, [{ name: "Roads", count: 1 }]]);
eq("a ward nobody has knocked", by.get("wc"), {
  people: 1,
  knocked: 0,
  spoke: 0,
  stale: 0,
  never: 1,
  doors30: 0,
  issues: [],
});
eq("people with no ward are kept apart", by.get("none")?.people, 1);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
