// Checks for which pages each role opens, now that Voters holds People and
// Canvassing. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/access.test.ts

import { canOpen } from "@/lib/access";

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
  "an agent opens Voters and the Field app",
  [canOpen("agent", "/voters"), canOpen("agent", "/field")],
  [true, true],
);
eq("an agent's pages no longer name Canvassing", canOpen("agent", "/canvassing"), false);
eq("an agent doesn't open Broadcast", canOpen("agent", "/broadcast"), false);
eq("an organiser opens Voters", canOpen("organiser", "/voters"), true);
eq("someone waiting opens nothing", canOpen("pending", "/voters"), false);
eq(
  "finance stays with the principals",
  [canOpen("manager", "/finance"), canOpen("organiser", "/finance")],
  [true, false],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
