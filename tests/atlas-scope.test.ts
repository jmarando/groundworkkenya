// Checks for where an atlas figure comes from: the key above an area, an area's level, which area
// holds the results a ward shows (its constituency's, until stations give wards their own), the
// label that says so, and the public surface of `@/lib/atlas`. Pure; nothing leaves this process.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-scope.test.ts

import * as atlas from "@/lib/atlas";
import { figureLabel, levelOfKey, parentKey, resultsArea } from "@/lib/atlas";

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

eq(
  "the key above",
  [
    parentKey("nairobi/dagoretti-north/kileleshwa"),
    parentKey("nairobi/dagoretti-north"),
    parentKey("nairobi"),
    parentKey("kenya"),
  ],
  ["nairobi/dagoretti-north", "nairobi", "kenya", null],
);
eq(
  "the level of a key",
  [
    levelOfKey("kenya"),
    levelOfKey("nairobi"),
    levelOfKey("nairobi/dagoretti-north"),
    levelOfKey("nairobi/dagoretti-north/kileleshwa"),
  ],
  ["country", "county", "constituency", "ward"],
);

// Results are held at the constituency for now.
const HAS = new Set(["nairobi", "nairobi/dagoretti-north", "nairobi/kibra"]);
const has = (key: string) => HAS.has(key);
eq("a constituency's own results", resultsArea("nairobi/kibra", has), {
  key: "nairobi/kibra",
  inherited: false,
});
eq("a ward shows its constituency's", resultsArea("nairobi/dagoretti-north/kileleshwa", has), {
  key: "nairobi/dagoretti-north",
  inherited: true,
});
eq(
  "a ward with results of its own",
  resultsArea("nairobi/kibra/sarangombe", (k) => k === "nairobi/kibra/sarangombe"),
  {
    key: "nairobi/kibra/sarangombe",
    inherited: false,
  },
);
eq("a ward whose constituency has none", resultsArea("nairobi/langata/karen", has), null);
eq(
  "a constituency with none does not borrow the county's",
  resultsArea("nairobi/langata", has),
  null,
);

eq(
  "the label for a ward showing its constituency's",
  figureLabel(resultsArea("nairobi/kibra/sarangombe", has)),
  "constituency figure",
);
eq("no label for an area's own figures", figureLabel(resultsArea("nairobi/kibra", has)), null);
eq("no label when there is nothing", figureLabel(null), null);

// Everything a screen needs comes from one import.
eq("the public surface", Object.keys(atlas).sort(), [
  "MISSING",
  "blocShares",
  "estimateTag",
  "figureLabel",
  "fmtPoints",
  "fmtShare",
  "fmtTurnout",
  "fmtVotes",
  "lean",
  "levelOfKey",
  "margin",
  "nearestRank",
  "notYetRegistered",
  "ourShare",
  "parentKey",
  "registerFlag",
  "registerGrowth",
  "registerTag",
  "resultTag",
  "resultsArea",
  "settle",
  "swing",
  "turnoutPct",
  "validVotes",
  "votesWithinReach",
  "whatToDo",
  "youngShare",
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
