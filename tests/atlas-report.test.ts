// Checks for the data report: how much of each election a county's files hold and what is missing,
// as the user reads it before any screen work. The report for the fictional Testland files is
// pinned word for word, so a change to it is a decision. Pure apart from reading the fixture.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-report.test.ts

import { loadCounty, type County, type Row } from "../scripts/atlas/checks";
import { report, shortfalls } from "../scripts/atlas/report";

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

const good = loadCounty("tests/fixtures/atlas/testland");

eq(
  "the report for the fixture county",
  report(good, "Testland"),
  [
    "Testland: 1 county, 2 constituencies, 2 wards",
    "",
    "Results and turnout, by election (constituencies with figures):",
    "  2013-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-mp: votes in 0 of 2; turnout in 0 of 2",
    "  2017-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-mp: votes in 0 of 2; turnout in 1 of 2",
    "  2022-president: votes in 2 of 2 and the county; turnout in 2 of 2 and the county",
    "  2022-governor: votes in 2 of 2 and the county; turnout in 2 of 2 and the county",
    "  2022-mp: votes in 1 of 2; turnout in 1 of 2",
    "",
    "Registered voters, by year:",
    "  2013: 0 of 2 wards, 0 of 2 constituencies, not the county",
    "  2017: 1 of 2 wards, 0 of 2 constituencies, not the county",
    "  2022: 2 of 2 wards, 2 of 2 constituencies, and the county",
    "",
    "Population estimates: 2 of 2 wards (2025)",
    "",
    "Blocs, by election (candidates):",
    "  2022-president: Alpha 1, Beta 1",
    "  2022-governor: Alpha 1, Beta 1, Gamma 1",
    "  2022-mp: Alpha 1, Beta 1, Independent 1",
    "",
    "Candidates' votes short of the valid votes: none",
    "Recorded differences: none",
  ].join("\n"),
);

eq("no votes short of valid in the fixture", shortfalls(good), []);

// A race whose candidates are not all loaded shows up as a shortfall.
const missingOne: County = structuredClone(good);
missingOne.results = missingOne.results.filter(
  (r: Row) =>
    r["candidate_id"] !== "2022-governor/testland/wa-test-jr" ||
    r["area_key"] !== "testland/north-test",
);
eq("a missing candidate is a shortfall", shortfalls(missingOne), [
  "2022-governor testland/north-test: candidates' votes 450 of 490 valid",
]);
eq(
  "and the report says so",
  report(missingOne, "Testland").includes(
    "Candidates' votes short of the valid votes:\n  2022-governor testland/north-test: candidates' votes 450 of 490 valid",
  ),
  true,
);

// Recorded differences are listed, so the user sees what IEBC itself got wrong.
const withKnown: County = structuredClone(good);
withKnown.knownDifferences.push({
  check: "cast_split",
  election_id: "2022-governor",
  area_key: "testland/north-test",
  candidate_id: "",
  difference: "-1",
  reason: "IEBC's own valid and rejected figures differ",
});
eq(
  "recorded differences are listed",
  report(withKnown, "Testland").includes(
    "Recorded differences:\n  cast_split 2022-governor testland/north-test: -1 (IEBC's own valid and rejected figures differ)",
  ),
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
