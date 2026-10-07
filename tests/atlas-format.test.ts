// Checks for how the election atlas writes its figures: shares to one decimal place, turnout as a
// whole percentage, votes with thousands separators, a missing figure as missing, and the tag a
// figure carries to say where it came from. Pure; nothing leaves this process. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-format.test.ts

import {
  MISSING,
  estimateTag,
  fmtPoints,
  fmtShare,
  fmtTurnout,
  fmtVotes,
  registerTag,
  resultTag,
} from "@/lib/atlas/format";

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

eq("what missing reads as", MISSING, "not found yet");

// Votes, with thousands separators.
eq("votes", fmtVotes(1234567), "1,234,567");
eq("votes are whole", fmtVotes(999.6), "1,000");
eq("a real zero is a zero", fmtVotes(0), "0");
eq("votes missing", fmtVotes(null), MISSING);

// Shares to one decimal place.
eq("a share", fmtShare(48.25), "48.3%");
eq("a share that is whole", fmtShare(50), "50.0%");
eq("a real zero share is a zero", fmtShare(0), "0.0%");
eq("a share missing", fmtShare(null), MISSING);

// Turnout as a whole percentage.
eq("turnout", fmtTurnout(41.2), "41%");
eq("turnout rounds half up", fmtTurnout(41.5), "42%");
eq("turnout missing", fmtTurnout(null), MISSING);

// Points are a size; the words around them say which way.
eq("points", fmtPoints(6.04), "6.0 points");
eq("points ignore their sign", fmtPoints(-15.5), "15.5 points");
eq("points missing", fmtPoints(null), MISSING);

// A source reads "Publisher, document title"; the tag keeps the publisher.
eq(
  "a result tag",
  resultTag("IEBC, Presidential results by constituency", "constituency", 2022),
  "IEBC · constituency total · 2022",
);
eq(
  "a county result tag",
  resultTag("IEBC, Governor results", "county", 2017),
  "IEBC · county total · 2017",
);
eq(
  "a register tag",
  registerTag("IEBC, Registered voters by ward", "ward", 2022),
  "IEBC · ward register · 2022",
);
eq(
  "an estimate tag",
  estimateTag("WorldPop, Age and sex structures, Kenya", 2025),
  "WorldPop estimate · 2025",
);
eq("a source that is only a name", resultTag("IEBC", "county", 2013), "IEBC · county total · 2013");
eq(
  "a source with stray spaces",
  estimateTag("  WorldPop , grid", 2025),
  "WorldPop estimate · 2025",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
