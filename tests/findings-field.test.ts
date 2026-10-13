// Checks for the field-work-and-money rules: votes within reach, doors
// behind, short of target, unregistered adults and stipend spend out of line.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-field.test.ts

import { orderFindings, unaccounted } from "@/lib/findings/core";
import {
  doorsBehind,
  shortOfTarget,
  spendOutOfLine,
  unregisteredAdults,
  votesWithinReach,
} from "@/lib/findings/field";

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

// ---------------------------------------------------------------- 6. votes within reach

{
  const out = votesWithinReach(FULL);
  eq(
    "every seat, most votes within reach first",
    out.map((x) => x.line),
    [
      "Kasarani: Mobilise. We took 55.0% here in 2022, but turnout was 40%, 9.6 points below Nairobi. About 26,603 votes within reach.",
      "Dagoretti North: Persuade. 2022 was close: 46.1% to us against 48.0% for Bloc B. About 10,173 votes within reach.",
      "Embakasi East: Cut the gap. We trail Bloc B by 40 points here in 2022: 30.0% to 70.0%. About 5,000 votes within reach.",
      "Westlands: Hold. We took 65.0% here in 2022. About 5,000 votes within reach.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], [], [], []]);
  eq("open the seat in Elections", out[0]?.next, {
    label: "Open in Elections",
    to: "/elections",
    search: { area: "nairobi/kasarani" },
  });
  eq(
    "the reason's figures carry the count's source",
    out[1]?.figures.map((x) => [x.label, x.text, x.source]),
    [
      ["Election", "2022", "IEBC"],
      ["Our share", "46.1%", "IEBC"],
      ["Bloc B's share", "48.0%", "IEBC"],
      ["Votes within reach", "10,173", "Worked out from IEBC results"],
    ],
  );
}
eq("no side: quiet", votesWithinReach(input({ atlas: { ...ATLAS, sides: {} } })), []);
eq(
  "an MP's own seat",
  votesWithinReach(input({ home: "nairobi/westlands" })).map((x) => x.id),
  ["votes-within-reach:nairobi/westlands"],
);
eq(
  "a presidential race with no county results: quiet",
  votesWithinReach(input({ home: "kenya", race: "president" })),
  [],
);

// ---------------------------------------------------------------- 7. doors behind

{
  const out = orderFindings(doorsBehind(FULL));
  eq(
    "the bottom quarter for doors among the top half for voters",
    out.map((x) => x.line),
    [
      "Mwiki: 5% of its 9,000 houses knocked in 30 days, with 60,000 registered voters.",
      "Kawangware: 2% of its 8,830 houses knocked in 30 days, with 52,000 registered voters.",
    ],
  );
  eq("open the ward on the map", out[1]?.next, {
    label: "Open the ward on the map",
    to: "/voters",
    search: { area: "w:kawangware" },
  });
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
{
  const quiet = doorsBehind(
    input({
      doors: [
        {
          wardId: "w-kangemi",
          knocked: 34,
          rated: 0,
          supporters: 0,
          doorsWeek: 0,
          agentsToday: [],
        },
      ],
    }),
  );
  eq(
    "few doors anywhere: one campaign finding",
    quiet.map((x) => [x.id, x.place, x.line]),
    [["doors-behind:campaign", null, "34 houses knocked across your 6 wards in the last 30 days."]],
  );
  eq("every number is a figure", quiet.map(unaccounted), [[]]);
}
eq("no house file: quiet", doorsBehind(input({ houses: null })), []);
eq("doors not read: quiet", doorsBehind(input({ doors: null })), []);

// ---------------------------------------------------------------- 8. short of target

{
  const out = orderFindings(shortOfTarget(FULL));
  eq(
    "wards short of their targets, biggest gap first",
    out.map((x) => x.line),
    [
      "Kawangware: 1,204 supporters found of a 6,000 target, 4,796 short.",
      "Kangemi: 3,000 supporters found of a 4,000 target, 1,000 short.",
    ],
  );
  eq("the ward's people", out.find((x) => x.place === KEYS.kangemi)?.next, {
    label: "See the ward's people",
    to: "/voters",
    search: { area: "w:kangemi", tab: "people" },
  });
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq("before the update: quiet", shortOfTarget(input({ supporters: null })), []);

// ---------------------------------------------------------------- 9. unregistered adults

{
  const out = orderFindings(unregisteredAdults(FULL));
  eq(
    "5,000 or more, or a fifth of the adults",
    out.map((x) => x.line),
    [
      "Kawangware: about 14,500 adults aren't registered (estimate), a registration drive opportunity.",
      "Parklands: about 9,000 adults aren't registered (estimate), a registration drive opportunity.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq(
  "a fifth of the adults is enough",
  orderFindings(
    unregisteredAdults(
      input({
        atlas: {
          ...ATLAS,
          population: ATLAS.population.map((p) =>
            p.area === KEYS.kangemi ? { ...p, adults: 50_000 } : p,
          ),
        },
      }),
    ),
  ).map((x) => x.id),
  [
    `unregistered-adults:${KEYS.kawangware}`,
    `unregistered-adults:${KEYS.kangemi}`,
    `unregistered-adults:${KEYS.parklands}`,
  ],
);

// ---------------------------------------------------------------- 10. spend out of line

{
  const out = spendOutOfLine(FULL);
  eq(
    "bigger wards with under half their share of the spend",
    out.map((x) => x.line),
    [
      "Mwiki: 0% of stipend spend in 30 days, for 22% of your registered voters.",
      "Kawangware: 2% of stipend spend in 30 days, for 19% of your registered voters.",
    ],
  );
  eq("every number is a figure", out.map(unaccounted), [[], []]);
}
eq(
  "under KES 10,000 spent: quiet",
  spendOutOfLine(input({ spend: [{ wardId: "w-kileleshwa", kes: 9_999 }] })),
  [],
);
eq("before the update: quiet", spendOutOfLine(input({ spend: null })), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
