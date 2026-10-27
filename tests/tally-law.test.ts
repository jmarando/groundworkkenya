// Checks for the law behind /guides/how-a-parallel-tally-works: the form table matches the Schedule to
// the Elections (General) Regulations (the forms 34A to 39C, each once, in the order the Schedule
// numbers them), and every statement names the provision it restates and links its source. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/tally-law.test.ts

import {
  AT_THE_STATION,
  CHANGES,
  FORMS,
  HOW_RESULTS_MOVE,
  IF_THEY_DIFFER,
  PORTAL_2022,
  WHO_DECLARES,
} from "@/lib/tally-law";

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

// The Schedule numbers the forms by race: 34 President, 35 National Assembly, 36 County Assembly, 37
// County Governor, 38 Senate, 39 County Woman Representative; A at the polling station, B at the
// constituency tallying centre, C at the county (or, for the President, the national) centre.
eq(
  "the races, in the Schedule's order",
  FORMS.map((f) => f.race),
  [
    "President",
    "Member of the National Assembly",
    "Member of a County Assembly (ward)",
    "County Governor",
    "Senator",
    "County Woman Representative",
  ],
);
FORMS.forEach((f, i) => {
  const n = 34 + i;
  eq(`${f.race}: the polling-station form`, f.station, `${n}A`);
  eq(`${f.race}: the constituency form`, f.constituency.form, `${n}B`);
  const upper = i === 0 ? f.national : f.county;
  const hasUpper = i === 0 || i >= 3;
  eq(`${f.race}: the form above the constituency`, upper, hasUpper ? `${n}C` : null);
  eq(
    `${f.race}: only the President has a national form`,
    i === 0 ? f.national : null,
    i === 0 ? "34C" : null,
  );
});
eq(
  "the sixteen forms, each once",
  FORMS.flatMap((f) => [f.station, f.constituency.form, f.county, f.national])
    .filter(Boolean)
    .sort(),
  [
    "34A",
    "34B",
    "34C",
    "35A",
    "35B",
    "36A",
    "36B",
    "37A",
    "37B",
    "37C",
    "38A",
    "38B",
    "38C",
    "39A",
    "39B",
    "39C",
  ],
);

// Where the constituency returning officer declares (National Assembly, County Assembly) the form
// is a declaration; where they collate for a higher centre it is a collation (section 39(1A)).
eq(
  "which constituency forms declare",
  FORMS.filter((f) => f.constituency.does === "declaration").map((f) => f.constituency.form),
  ["35B", "36B"],
);

// Every statement names its provision and links its source.
const all = [
  ...AT_THE_STATION,
  ...HOW_RESULTS_MOVE,
  ...WHO_DECLARES,
  ...PORTAL_2022,
  ...IF_THEY_DIFFER,
  ...CHANGES,
];
for (const s of all) {
  const label = s.says.slice(0, 48);
  eq(`${label}: a provision named`, s.ref.length > 0, true);
  eq(`${label}: a source linked`, (s.from.url ?? "").startsWith("https://"), true);
}
eq("no statement twice", new Set(all.map((s) => s.says)).size, all.length);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
