// Checks for the what-to-say-where rules: a ward's top issue, an issue rising
// this week, and a seat whose wards live too differently for one message.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-message.test.ts

import { unaccounted } from "@/lib/findings/core";
import { issueRising, oneSeatDifferentPlaces, wardTopIssue } from "@/lib/findings/message";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

// ---------------------------------------------------------------- 3. top issue in a ward

{
  const out = wardTopIssue(FULL);
  eq(
    "a ward with enough issues and one well ahead",
    out.map((x) => [x.id, x.line]),
    [
      [
        `ward-top-issue:${KEYS.kawangware}`,
        "Kawangware: water is 38% of the 52 issues raised in 30 days (door 31, messages 15, news and social 6).",
      ],
    ],
  );
  eq("write to the ward", out[0]?.next, {
    label: "Write to this ward",
    to: "/broadcast",
    search: { wards: "w-kawangware" },
  });
  eq("weighed by the issue's count", out[0]?.weight, 20);
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "names that mean the same issue are one issue; non-issues drop",
  wardTopIssue(
    input({
      issues: [
        { wardId: "w-kileleshwa", source: "door", issue: "Water and sanitation", n: 4 },
        { wardId: "w-kileleshwa", source: "messages", issue: "sewer", n: 3 },
        { wardId: "w-kileleshwa", source: "news", issue: "water", n: 3 },
        { wardId: "w-kileleshwa", source: "door", issue: "general", n: 50 },
        { wardId: "w-kileleshwa", source: "door", issue: " ", n: 50 },
      ],
    }),
  ).map((x) => x.line),
  [
    "Kileleshwa: water is 100% of the 10 issues raised in 30 days (door 4, messages 3, news and social 3).",
  ],
);
eq(
  "fewer than 10 raised: quiet",
  wardTopIssue(input({ issues: FULL.issues!.filter((r) => r.wardId === "w-kileleshwa") })),
  [],
);
eq(
  "no issue at 30%: quiet",
  wardTopIssue(
    input({
      issues: ["a", "b", "c", "d"].map((issue) => ({
        wardId: "w-kangemi",
        source: "door" as const,
        issue,
        n: 3,
      })),
    }),
  ),
  [],
);
eq("before the update: quiet", wardTopIssue(input({ issues: null })), []);

// ---------------------------------------------------------------- 4. issue rising

{
  const out = issueRising(FULL);
  eq(
    "an issue well up on the previous four weeks",
    out.map((x) => [x.id, x.place, x.line]),
    [
      [
        "issue-rising:floods",
        null,
        "Floods rose to 63% of what was raised this week, from 15% over the previous four weeks.",
      ],
    ],
  );
  eq("see what's said", out[0]?.next, {
    label: "See what's said",
    to: "/listening",
    search: { issue: "floods" },
  });
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "raised fewer than 10 times this week: quiet",
  issueRising(input({ issueWeeks: FULL.issueWeeks!.filter((r) => r.issue !== "flooding") })),
  [],
);
eq(
  "no earlier weeks to compare with: quiet",
  issueRising(input({ issueWeeks: FULL.issueWeeks!.filter((r) => r.week === 0) })),
  [],
);
eq("before the update: quiet", issueRising(input({ issueWeeks: null })), []);

// ---------------------------------------------------------------- 5. one seat, different places

{
  const out = oneSeatDifferentPlaces(FULL);
  eq(
    "a seat whose wards differ three times over",
    out.map((x) => [x.id, x.line]),
    [
      [
        "one-seat-different-places:nairobi/dagoretti-north",
        "Dagoretti North's wards live differently: Kawangware has 4,739 buildings per km², Kileleshwa 1,255. One message won't fit both.",
      ],
    ],
  );
  eq(
    "its figures say where they're from",
    out[0]?.figures.map((x) => [x.text, x.source, x.period]),
    [
      ["4,739", "Google Open Buildings", "2023"],
      ["1,255", "Google Open Buildings", "2023"],
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[]]);
}
eq(
  "a ward not measured: quiet",
  oneSeatDifferentPlaces(
    input({
      atlas: { ...ATLAS, indicators: ATLAS.indicators.filter((x) => x.area !== KEYS.kileleshwa) },
    }),
  ),
  [],
);
eq(
  "an MP's own seat",
  oneSeatDifferentPlaces(input({ home: "nairobi/dagoretti-north" })).length,
  1,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
