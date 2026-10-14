// Checks across every finding rule at once, on the full example: each is
// registered and fires, the page's order, unique ids, every number in every
// line one of its figures, and nothing quoted from a team's profile. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-all.test.ts

import { findings, RULE_FNS } from "@/lib/findings";
import { RULES, unaccounted } from "@/lib/findings/core";

import { ATLAS, input, KEYS } from "./findings-fixture";

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

// A profile no finding may quote: about the place, in the team's words.
const PROFILED = input({
  atlas: {
    ...ATLAS,
    profiles: {
      [KEYS.kawangware]: {
        area: KEYS.kawangware,
        settlement: "informal",
        communities: "Zq communities text",
        languages: ["sw", "sheng"],
        institutions: "Zq institutions text",
        issues: "Zq issues text",
        updatedAt: "2026-10-01T00:00:00Z",
        updatedBy: null,
      },
    },
  },
});
const all = findings(PROFILED);

eq(
  "every rule is registered",
  RULES.filter((r) => !RULE_FNS[r.id]).map((r) => r.id),
  [],
);
eq(
  "every rule fires on the full example",
  RULES.filter((r) => !all.some((f) => f.rule === r.id)).map((r) => r.id),
  [],
);
eq(
  "the order on the page",
  all.map((f) => f.id),
  [
    "not-visited:nairobi/kasarani",
    "time-in-safe-seats:campaign",
    `ward-top-issue:${KEYS.kawangware}`,
    "issue-rising:floods",
    "one-seat-different-places:nairobi/dagoretti-north",
    "votes-within-reach:nairobi/kasarani",
    "votes-within-reach:nairobi/dagoretti-north",
    "votes-within-reach:nairobi/embakasi-east",
    "votes-within-reach:nairobi/westlands",
    `doors-behind:${KEYS.mwiki}`,
    `doors-behind:${KEYS.kawangware}`,
    `short-of-target:${KEYS.kawangware}`,
    `short-of-target:${KEYS.kangemi}`,
    `unregistered-adults:${KEYS.kawangware}`,
    `unregistered-adults:${KEYS.parklands}`,
    `spend-out-of-line:${KEYS.mwiki}`,
    `spend-out-of-line:${KEYS.kawangware}`,
    "poll-move:campaign",
    "rival-in-news:r-a",
  ],
);
eq("ids are unique", new Set(all.map((f) => f.id)).size, all.length);
eq(
  "every number in every line is one of its figures",
  all.filter((f) => unaccounted(f).length).map((f) => [f.id, unaccounted(f)]),
  [],
);
eq(
  "nothing from a profile, and no community or language, in any line or figure",
  all
    .filter((f) =>
      /zq|informal|swahili|sheng|communit|tribe|ethnic/i.test(
        [f.line, ...f.figures.map((x) => `${x.label} ${x.text} ${x.source}`)].join(" "),
      ),
    )
    .map((f) => f.id),
  [],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
