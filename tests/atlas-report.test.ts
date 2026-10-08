// Checks for the data report: how much of each election a county's files hold and what is missing,
// as the user reads it before any screen work. The report for the fictional Testland files is
// pinned word for word, so a change to it is a decision. `run`, which builds the whole output of
// the command and says whether every check passed, is tried on copies of the fixture in a
// temporary folder that is removed afterwards. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-report.test.ts

import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  blocMap,
  checkCounty,
  loadBlocs,
  loadCounty,
  type County,
  type Row,
  type WardMaps,
} from "../scripts/atlas/checks";
import { report, run, shortfalls } from "../scripts/atlas/report";

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

const FIXTURE = "tests/fixtures/atlas/testland";
const BLOCS_FILE = "tests/fixtures/atlas/blocs.csv";
// The ward maps the fixture's wards are checked against, as in tests/atlas-data.test.ts.
const MAPS: WardMaps = new Map([
  ["ward-one", "north-test"],
  ["ward-two", "north-test"],
]);
const good = loadCounty(FIXTURE);
const BLOCS = blocMap(loadBlocs(BLOCS_FILE));

/** The row of `rows` with these cell values. */
function find(rows: Row[], where: Row): Row {
  const hit = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  if (!hit) throw new Error(`no row like ${JSON.stringify(where)}`);
  return hit;
}
/** A copy of the fixture county, changed by `edit`. */
function changed(edit: (c: County) => void): County {
  const c = structuredClone(good);
  edit(c);
  return c;
}
/** The lines under a heading of a report, up to the next blank line. */
function under(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const at = lines.indexOf(heading);
  if (at === -1) return [`no heading "${heading}" in the report`];
  const end = lines.indexOf("", at);
  return lines.slice(at + 1, end === -1 ? undefined : end);
}
const RESULTS = "Results and turnout, by election (constituencies with figures):";
const BLOCS_HEADING = "Blocs, by election (candidates):";
/** The results and turnout line of one election. */
const electionLine = (text: string, election: string) =>
  under(text, RESULTS).find((line) => line.startsWith(`  ${election}:`));

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
    "  2017-mp: votes in 0 of 2; turnout in 0 of 2",
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
    "Candidates' votes short of the valid votes (where both are held): none",
    "Recorded differences: none",
  ].join("\n"),
);

// Turnout is the votes cast over the voters registered, so a row holding only one of the two (the
// fixture's 2017 MP row has only the register) is not a turnout figure. The votes are not touched.
const governorNorth = { election_id: "2022-governor", area_key: "testland/north-test" };
eq(
  "a turnout row with no registered figure holds no turnout",
  electionLine(
    report(
      changed((c) => {
        find(c.turnout, governorNorth)["registered"] = "";
      }),
      "Testland",
    ),
    "2022-governor",
  ),
  "  2022-governor: votes in 2 of 2 and the county; turnout in 1 of 2 and the county",
);
eq(
  "a turnout row with no votes cast holds no turnout",
  electionLine(
    report(
      changed((c) => {
        find(c.turnout, governorNorth)["cast_votes"] = "";
      }),
      "Testland",
    ),
    "2022-governor",
  ),
  "  2022-governor: votes in 2 of 2 and the county; turnout in 1 of 2 and the county",
);
eq(
  "the county's row is held to the same rule",
  electionLine(
    report(
      changed((c) => {
        find(c.turnout, { election_id: "2022-governor", area_key: "testland" })["cast_votes"] = "";
      }),
      "Testland",
    ),
    "2022-governor",
  ),
  "  2022-governor: votes in 2 of 2 and the county; turnout in 2 of 2, not the county",
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
    "Candidates' votes short of the valid votes (where both are held):\n" +
      "  2022-governor testland/north-test: candidates' votes 450 of 490 valid",
  ),
  true,
);

// The shortfalls come out sorted. The turnout rows are given in reverse, so the president's row
// (a shortfall of its own) comes up before the governor's, and only a sort puts them right.
const twoShort = changed((c) => {
  c.results = c.results.filter(
    (r) =>
      !(
        r["candidate_id"] === "2022-governor/testland/wa-test-jr" &&
        r["area_key"] === "testland/north-test"
      ) &&
      !(
        r["candidate_id"] === "2022-president/kenya/p-two-test" &&
        r["area_key"] === "testland/south-test"
      ),
  );
  c.turnout.reverse();
});
eq("shortfalls come out sorted", shortfalls(twoShort), [
  "2022-governor testland/north-test: candidates' votes 450 of 490 valid",
  "2022-president testland/south-test: candidates' votes 250 of 450 valid",
]);

// Recorded differences are listed, so the user sees what IEBC itself got wrong. Each record is one
// the checker accepts, which it does only for a gap that is really there.
const withKnown = changed((c) => {
  // Valid 490 and rejected 11 make 501 against 500 cast: a gap of -1.
  find(c.turnout, governorNorth)["rejected_votes"] = "11";
  c.knownDifferences.push({
    check: "cast_split",
    election_id: "2022-governor",
    area_key: "testland/north-test",
    candidate_id: "",
    difference: "-1",
    reason: "IEBC's own valid and rejected figures differ",
  });
});
eq("the cast_split record closes a real gap", checkCounty(withKnown, MAPS, BLOCS), []);
eq(
  "recorded differences are listed",
  report(withKnown, "Testland").includes(
    "Recorded differences:\n" +
      "  cast_split 2022-governor testland/north-test: -1 " +
      "(IEBC's own valid and rejected figures differ)",
  ),
  true,
);
const withSum = changed((c) => {
  // North Test's votes for P One come to 299: its constituencies add up to 549, the county says
  // 550, a gap of 1.
  find(c.results, {
    candidate_id: "2022-president/kenya/p-one-test",
    area_key: "testland/north-test",
  })["votes"] = "299";
  c.knownDifferences.push({
    check: "county_sum",
    election_id: "",
    area_key: "testland",
    candidate_id: "2022-president/kenya/p-one-test",
    difference: "1",
    reason: "IEBC's own constituency and county figures differ",
  });
});
eq("the county_sum record closes a real gap", checkCounty(withSum, MAPS, BLOCS), []);
eq(
  "a recorded county_sum difference is listed with its candidate and county",
  report(withSum, "Testland").includes(
    "Recorded differences:\n" +
      "  county_sum 2022-president/kenya/p-one-test testland: 1 " +
      "(IEBC's own constituency and county figures differ)",
  ),
  true,
);

// A second year of population estimates is a line of its own, the years in order. The later row
// is for the earlier year, so only a sort puts them right.
const twoYears = changed((c) => {
  c.population.push({
    area_key: "testland/north-test/ward-one",
    year: "2020",
    total: "1400",
    adults: "850",
    young_adults: "380",
    source: "WorldPop, Age and sex structures (test)",
    method: "Test estimate from the age-and-sex grid",
  });
});
eq(
  "a second year of population estimates is a second line, in order",
  report(twoYears, "Testland")
    .split("\n")
    .filter((line) => line.startsWith("Population estimates:")),
  ["Population estimates: 1 of 2 wards (2020)", "Population estimates: 2 of 2 wards (2025)"],
);

// A bloc that is blank is named as blank, not printed as nothing.
eq(
  "a blank bloc is named as blank",
  under(
    report(
      changed((c) => {
        find(c.candidates, { name: "A Test" })["bloc"] = "";
      }),
      "Testland",
    ),
    BLOCS_HEADING,
  ),
  [
    "  2022-president: Alpha 1, Beta 1",
    "  2022-governor: (blank) 1, Beta 1, Gamma 1",
    "  2022-mp: Alpha 1, Beta 1, Independent 1",
  ],
);

// A county with only its areas: every other file holds just its header.
const onlyAreas = changed((c) => {
  c.candidates = [];
  c.results = [];
  c.turnout = [];
  c.register = [];
  c.population = [];
  c.knownDifferences = [];
});
eq(
  "the report for a county with only its areas",
  report(onlyAreas, "Testland"),
  [
    "Testland: 1 county, 2 constituencies, 2 wards",
    "",
    "Results and turnout, by election (constituencies with figures):",
    "  2013-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2013-mp: votes in 0 of 2; turnout in 0 of 2",
    "  2017-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2017-mp: votes in 0 of 2; turnout in 0 of 2",
    "  2022-president: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2022-governor: votes in 0 of 2, not the county; turnout in 0 of 2, not the county",
    "  2022-mp: votes in 0 of 2; turnout in 0 of 2",
    "",
    "Registered voters, by year:",
    "  2013: 0 of 2 wards, 0 of 2 constituencies, not the county",
    "  2017: 0 of 2 wards, 0 of 2 constituencies, not the county",
    "  2022: 0 of 2 wards, 0 of 2 constituencies, not the county",
    "",
    "Population estimates: none",
    "",
    "Blocs, by election (candidates):",
    "  none",
    "",
    "Candidates' votes short of the valid votes (where both are held): none",
    "Recorded differences: none",
  ].join("\n"),
);

// The command's whole output and verdict, on copies of the fixture in a temporary folder.
const tmp = mkdtempSync(join(tmpdir(), "atlas-report-"));
try {
  let made = 0;
  /** A data folder holding a copy of the fixture as each of `counties`, and blocs.csv. */
  const makeRoot = (counties: string[], edit?: (root: string) => void): string => {
    const root = join(tmp, `root-${made++}`);
    mkdirSync(root);
    for (const name of counties) cpSync(FIXTURE, join(root, name), { recursive: true });
    cpSync(BLOCS_FILE, join(root, "blocs.csv"));
    edit?.(root);
    return root;
  };
  /** Replaces `from` by `to` in a file, which must hold `from` exactly once. */
  const replaceIn = (path: string, from: string, to: string) => {
    const text = readFileSync(path, "utf8");
    if (text.split(from).length !== 2) {
      throw new Error(`${path} must hold ${JSON.stringify(from)} once`);
    }
    writeFileSync(
      path,
      text.replace(from, () => to),
    );
  };
  /**
   * What `run` answers, or the error it throws, so that one failing case does not hide the rest.
   */
  const ran = (names: string[], root: string): { text: string; ok: boolean } => {
    try {
      return run(names, root, MAPS);
    } catch (e) {
      return { text: `threw ${String(e)}`, ok: false };
    }
  };

  const only = makeRoot(["testland"]);
  const checked = `${report(good, "Testland")}\n\nChecks: all pass\n`;
  eq("a county that passes the checks", ran(["testland"], only), { text: checked, ok: true });

  // One constituency's governor votes lowered, so that the county no longer adds up.
  const lowered = ran(
    ["testland"],
    makeRoot(["testland"], (root) =>
      replaceIn(
        join(root, "testland", "results.csv"),
        "2022-governor/testland/a-test,testland/north-test,350\n",
        "2022-governor/testland/a-test,testland/north-test,349\n",
      ),
    ),
  );
  eq("a county that does not add up fails the verdict", lowered.ok, false);
  eq(
    "and the verdict says why",
    lowered.text.endsWith(
      "\nChecks: 1 problem\n" +
        "  2022-governor/testland/a-test: its constituencies add up to 599 but testland says 600\n",
    ),
    true,
  );

  // A bad row in blocs.csv: 2019 is not an election year. The county itself passes.
  const badBlocs = makeRoot(["testland"], (root) =>
    appendFileSync(
      join(root, "blocs.csv"),
      '2019,Party A,Alpha,"Registrar, Test coalition list",\n',
    ),
  );
  eq("a blocs.csv with a problem fails the verdict", ran(["testland"], badBlocs), {
    text: `blocs.csv: blocs.csv row 5: 2019 is not an election year\n\n${checked}`,
    ok: false,
  });

  // A name that is no county folder is said so, not thrown; the other names still run.
  const two = makeRoot(["testland", "other"]);
  eq("a county that is not there", ran(["nosuchcounty"], two), {
    text: "no county folder data/atlas/nosuchcounty; counties: other, testland",
    ok: false,
  });
  eq(
    "a county that is not there, when there are no counties",
    ran(["nosuchcounty"], makeRoot([])),
    {
      text: "no county folder data/atlas/nosuchcounty; counties: none",
      ok: false,
    },
  );
  eq("a file is not a county folder", ran(["blocs.csv"], only), {
    text: "no county folder data/atlas/blocs.csv; counties: testland",
    ok: false,
  });
  eq("the other names still run", ran(["nosuchcounty", "testland"], only), {
    text: `no county folder data/atlas/nosuchcounty; counties: testland\n${checked}`,
    ok: false,
  });

  // With no names, every county runs; with no counties either, there is nothing to say.
  eq("no names and no counties", ran([], makeRoot([])), {
    text: "No counties under data/atlas yet.",
    ok: true,
  });
  eq("no names runs every county", ran([], two), { text: `${checked}\n${checked}`, ok: true });

  // Counties that each pass alone but disagree about a candidate they share. Every county's
  // migration writes the presidential candidates, so this fails the verdict, and for whichever
  // counties are asked for: beta spells P One Test's party its own way, with no coalition recorded
  // for that spelling, so its bloc is the party's.
  const disagreeing = makeRoot(["alpha", "beta"], (root) =>
    replaceIn(
      join(root, "beta", "candidates.csv"),
      "2022-president/kenya/p-one-test,2022-president,kenya,P One Test,Party A,Alpha\n",
      "2022-president/kenya/p-one-test,2022-president,kenya,P One Test,Party Z,Party Z\n",
    ),
  );
  const betaReport = report(loadCounty(join(disagreeing, "beta")), "Testland");
  const betaChecked = `${betaReport}\n\nChecks: all pass\n`;
  const disagreement = [
    '2022-president/kenya/p-one-test: party is "Party A" in alpha but "Party Z" in beta',
    '2022-president/kenya/p-one-test: bloc is "Alpha" in alpha but "Party Z" in beta',
  ];
  const sharedText = `\nShared candidates: 2 problems\n  ${disagreement.join("\n  ")}\n`;
  eq("counties that disagree on a shared candidate fail the verdict", ran([], disagreeing), {
    text: `${checked}\n${betaChecked}\n${sharedText}`,
    ok: false,
  });
  eq(
    "and the disagreement is found when only one of them is asked for",
    ran(["alpha"], disagreeing),
    {
      text: `${checked}\n${sharedText}`,
      ok: false,
    },
  );

  // The heading is the county's own name from areas.csv; only a county with none falls back to its
  // folder's name, capitalised.
  const firstLine = (text: string) => text.split("\n")[0];
  eq(
    "the heading is the county's name in areas.csv, not its folder's",
    firstLine(ran(["other"], two).text),
    "Testland: 1 county, 2 constituencies, 2 wards",
  );
  const noCountyRow = makeRoot(["other"], (root) =>
    replaceIn(join(root, "other", "areas.csv"), "testland,county,Testland,kenya,901\n", ""),
  );
  eq(
    "with no county row the heading is the folder's name",
    firstLine(ran(["other"], noCountyRow).text),
    "Other: 0 counties, 2 constituencies, 2 wards",
  );
  const noName = makeRoot(["other"], (root) =>
    replaceIn(
      join(root, "other", "areas.csv"),
      "testland,county,Testland,kenya,901",
      "testland,county,,kenya,901",
    ),
  );
  eq(
    "a county row with no name is no name",
    firstLine(ran(["other"], noName).text),
    "Other: 1 county, 2 constituencies, 2 wards",
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
