// Checks for the election atlas's register and population measures: register growth, adults not
// yet registered, the young share and the register flag. Pure; nothing leaves this process. A
// missing figure is null and never zero. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-register.test.ts

import { notYetRegistered, registerFlag, registerGrowth, youngShare } from "@/lib/atlas/register";

let pass = 0;
let fail = 0;

// JSON.stringify writes NaN and Infinity as null. Spell them out, so that a figure that came out
// as NaN or Infinity never passes for a missing one.
const spell = (_key: string, v: unknown) =>
  typeof v === "number" && !Number.isFinite(v) ? String(v) : v;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got, spell);
  const w = JSON.stringify(want, spell);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}

// Register growth: registered voters now minus at the last election, and as a share.
eq("growth", registerGrowth(52000, 48000), { change: 4000, pct: 8.333333 });
eq("a shrinking register", registerGrowth(45000, 48000), { change: -3000, pct: -6.25 });
eq("growth from an empty register has no share", registerGrowth(500, 0), {
  change: 500,
  pct: null,
});
eq("growth with no earlier register", registerGrowth(52000, null), null);
eq("growth with no later register", registerGrowth(null, 48000), null);

// Not yet registered: adults minus registered voters, never below zero.
eq("not yet registered", notYetRegistered(10000, 7600), 2400);
eq("more registered than adults", notYetRegistered(10000, 10400), 0);
eq("not yet registered, no adults figure", notYetRegistered(null, 7600), null);
eq("not yet registered, no register", notYetRegistered(10000, null), null);

// The young share: 18 to 34 as a share of the area's adults.
eq("young share", youngShare(4200, 10000), 42);
eq("young share of no adults", youngShare(0, 0), null);
eq("young share, no young figure", youngShare(null, 10000), null);
eq("young share, no adults figure", youngShare(4200, null), null);

// The register flag: an estimated quarter or more of the adults are not registered.
eq("exactly a quarter is flagged", registerFlag(10000, 7500), true);
eq("just under a quarter is not", registerFlag(10000, 7501), false);
eq("half unregistered is flagged", registerFlag(10000, 5000), true);
eq("a full register is not", registerFlag(10000, 10000), false);
eq("no adults figure is not flagged", registerFlag(null, 7500), false);
eq("no register is not flagged", registerFlag(10000, null), false);
eq("no adults is not flagged", registerFlag(0, 0), false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
