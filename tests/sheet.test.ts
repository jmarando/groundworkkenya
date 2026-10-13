// Checks for the Voters panel's sheet on a narrow screen: its three heights,
// where a drag lets go, what the handle steps to, and the room it takes from
// the map. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/sheet.test.ts

import { mapRoom, nearestSnap, nextSnap, snapHeight } from "@/lib/sheet";

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
  "peek, half and full in an 800 px map",
  [snapHeight("peek", 800), snapHeight("half", 800), snapHeight("full", 800)],
  [132, 400, 800],
);
eq(
  "a short map: peek is never taller than it, half never below peek",
  [snapHeight("peek", 100), snapHeight("half", 200), snapHeight("full", 0)],
  [100, 132, 0],
);
eq(
  "let go, the sheet goes to the nearest height",
  [nearestSnap(150, 800), nearestSnap(300, 800), nearestSnap(620, 800), nearestSnap(790, 800)],
  ["peek", "half", "full", "full"],
);
eq(
  "the handle steps up, then back down to peek",
  [nextSnap("peek"), nextSnap("half"), nextSnap("full")],
  ["half", "full", "peek"],
);
eq(
  "the room it takes from the map is at most half, so the map keeps a centre",
  [mapRoom("peek", 800), mapRoom("half", 800), mapRoom("full", 800)],
  [132, 400, 400],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
