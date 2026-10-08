// Checks for the election atlas's data files: that every county under data/atlas adds up, and
// that the checker itself catches each thing it is meant to. The fictional Testland files in
// tests/fixtures/atlas pass; each case below breaks them one way and expects that complaint.
// Pure apart from reading files. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-data.test.ts

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseCSV } from "../src/lib/csv";
import {
  COLUMNS,
  blocMap,
  checkBlocs,
  checkCounty,
  checkShared,
  listCounties,
  loadBlocs,
  loadCounty,
  loadWardMaps,
  slugify,
  type Blocs,
  type County,
  type Row,
  type WardMaps,
} from "../scripts/atlas/checks";

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
const MAPS: WardMaps = new Map([
  ["ward-one", "north-test"],
  ["ward-two", "north-test"],
]);
const good = loadCounty(FIXTURE);
const BLOCS: Blocs = blocMap(loadBlocs("tests/fixtures/atlas/blocs.csv"));

/** The checker's answer for a county, with the fixture's ward maps and blocs unless given. */
const check = (c: County, maps: WardMaps = MAPS, blocs: Blocs = BLOCS) =>
  checkCounty(c, maps, blocs);

/** The row of `rows` with these cell values. */
function find(rows: Row[], where: Row): Row {
  const hit = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  if (!hit) throw new Error(`no row like ${JSON.stringify(where)}`);
  return hit;
}
/** Sets one cell of the row of `rows` with these cell values. */
function set(rows: Row[], where: Row, cell: string, value: string) {
  find(rows, where)[cell] = value;
}
/** The row number of the first row of `rows` like `where`, as the complaints count them. */
const rowOf = (rows: Row[], where: Row) => rows.indexOf(find(rows, where)) + 2;
/** What the checker says about the fixture after `edit` has broken it. */
function broken(edit: (c: County) => void, maps: WardMaps = MAPS): string[] {
  const c = structuredClone(good);
  edit(c);
  return check(c, maps);
}
/** True when some complaint contains `text`. */
const says = (problems: string[], text: string) => problems.some((p) => p.includes(text));
/** What `says` ought to answer, with the case's name. */
const flags = (name: string, problems: string[], text: string) =>
  eq(name, says(problems, text) ? text : problems, text);

eq("the fixture county passes", check(good), []);

// Constituencies add up to the county's, for president and governor; an MP race has no county
// total.
const P1 = "2022-president/kenya/p-one-test";
const lowNorth = (c: County) =>
  set(c.results, { candidate_id: P1, area_key: "testland/north-test" }, "votes", "299");
eq("constituencies short of the county", broken(lowNorth), [
  `${P1}: its constituencies add up to 549 but testland says 550`,
]);
const A_GOV = "2022-governor/testland/a-test";
eq(
  "constituencies short of the county, for a governor",
  broken((c) =>
    set(c.results, { candidate_id: A_GOV, area_key: "testland/north-test" }, "votes", "349"),
  ),
  [`${A_GOV}: its constituencies add up to 599 but testland says 600`],
);
eq(
  "a county total with no constituency rows to add up is left alone",
  broken((c) => {
    // Every governor's constituency rows go, not one candidate's: a candidate with no row where the
    // others have theirs is refused (see "A missing row is not a zero" below).
    c.results = c.results.filter(
      (r) => !r["candidate_id"]?.startsWith("2022-governor/") || r["area_key"] === "testland",
    );
  }),
  [],
);
const closes = {
  check: "county_sum",
  election_id: "",
  area_key: "testland",
  candidate_id: P1,
  difference: "1",
  reason: "IEBC's own constituency and county figures differ",
};
eq(
  "a recorded difference closes the gap",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes });
  }),
  [],
);
flags(
  "a recorded difference of the wrong size does not",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes, difference: "2" });
  }),
  "the recorded difference of 2 does not close it",
);
flags(
  "a recorded difference of the wrong sign does not close the gap",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes, difference: "-1" });
  }),
  "the recorded difference of -1 does not close it",
);
flags(
  "a recorded difference nothing needs is stale",
  broken((c) => c.knownDifferences.push({ ...closes })),
  "no longer matches anything",
);
flags(
  "a recorded difference with no reason is refused",
  broken((c) => c.knownDifferences.push({ ...closes, reason: "" })),
  "say why",
);
flags(
  "a recorded difference with a nine-character reason is refused",
  broken((c) => c.knownDifferences.push({ ...closes, reason: "IEBC typo" })),
  "the reason must say why the figures differ",
);
eq(
  "a recorded difference with a ten-character reason is accepted",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes, reason: "IEBC typos" });
  }),
  [],
);
flags(
  "a recorded difference with an unknown check is refused",
  broken((c) => c.knownDifferences.push({ ...closes, check: "nonsense" })),
  'check must be county_sum or cast_split, not "nonsense"',
);
flags(
  "a recorded difference that is not a number is refused",
  broken((c) => c.knownDifferences.push({ ...closes, difference: "one" })),
  "difference must be a whole number",
);
eq(
  "a recorded difference listed twice is refused",
  broken((c) => {
    lowNorth(c);
    c.knownDifferences.push({ ...closes }, { ...closes });
  }),
  [`known-differences.csv row 3: county_sum for ${P1} at testland is listed twice`],
);

// Turnout.
const SOUTH_GOV = { election_id: "2022-governor", area_key: "testland/south-test" };
const NORTH_GOV = { election_id: "2022-governor", area_key: "testland/north-test" };
flags(
  "more cast than registered",
  broken((c) => set(c.turnout, SOUTH_GOV, "cast_votes", "901")),
  "more votes cast than registered (901 against 900)",
);
flags(
  "more valid votes than votes cast",
  broken((c) => set(c.turnout, SOUTH_GOV, "valid_votes", "521")),
  "more valid votes than votes cast (521 against 520)",
);
// A blank figure is skipped, never read as 0. Each case blanks one figure of a row that has them
// all (the fixture's one row with blanks has cast, rejected and valid all blank, which reads the
// same as 0).
eq(
  "a blank rejected figure is skipped, not read as 0",
  broken((c) => set(c.turnout, NORTH_GOV, "rejected_votes", "")),
  [],
);
eq(
  "a blank cast figure is skipped, not read as 0",
  broken((c) => set(c.turnout, NORTH_GOV, "cast_votes", "")),
  [],
);
eq(
  "a blank valid figure is skipped, not read as 0",
  broken((c) => set(c.turnout, NORTH_GOV, "valid_votes", "")),
  [],
);
eq(
  "a blank registered figure is skipped, not read as 0",
  broken((c) => set(c.turnout, NORTH_GOV, "registered", "")),
  [],
);
eq(
  "cast equal to registered is fine",
  broken((c) => {
    set(c.turnout, SOUTH_GOV, "cast_votes", "900");
    set(c.turnout, SOUTH_GOV, "valid_votes", "890");
  }),
  [],
);
const extraRejected = (c: County) => set(c.turnout, NORTH_GOV, "rejected_votes", "11");
flags(
  "valid plus rejected differs from cast",
  broken(extraRejected),
  "valid plus rejected (501) differs from cast (500)",
);
const castGap = {
  check: "cast_split",
  election_id: "2022-governor",
  area_key: "testland/north-test",
  candidate_id: "",
  difference: "-1",
  reason: "IEBC's own valid and rejected figures differ",
};
eq(
  "a recorded cast difference closes it",
  broken((c) => {
    extraRejected(c);
    c.knownDifferences.push({ ...castGap });
  }),
  [],
);
eq(
  "a recorded cast difference listed twice is refused",
  broken((c) => {
    extraRejected(c);
    c.knownDifferences.push({ ...castGap }, { ...castGap });
  }),
  [
    "known-differences.csv row 3: cast_split for 2022-governor at testland/north-test " +
      "is listed twice",
  ],
);
flags(
  "a recorded cast difference of the wrong size does not close it",
  broken((c) => {
    extraRejected(c);
    c.knownDifferences.push({ ...castGap, difference: "-2" });
  }),
  "the recorded difference of -2 does not close it",
);
flags(
  "a recorded cast difference of the wrong sign does not close it",
  broken((c) => {
    extraRejected(c);
    c.knownDifferences.push({ ...castGap, difference: "1" });
  }),
  "the recorded difference of 1 does not close it",
);
flags(
  "a recorded cast difference nothing needs is stale",
  broken((c) => c.knownDifferences.push({ ...castGap })),
  "no longer matches anything",
);
flags(
  "a share over 100%",
  broken((c) =>
    set(
      c.results,
      { candidate_id: "2022-governor/testland/a-test", area_key: "testland/north-test" },
      "votes",
      "600",
    ),
  ),
  "a share over 100%",
);
flags(
  "a share is measured against votes cast when valid votes are blank",
  broken((c) => {
    set(c.turnout, NORTH_GOV, "valid_votes", "");
    set(
      c.results,
      { candidate_id: "2022-governor/testland/a-test", area_key: "testland/north-test" },
      "votes",
      "400",
    );
  }),
  "the candidates' votes (540) pass the votes cast (500), a share over 100%",
);
flags(
  "a source with no publisher",
  broken((c) => set(c.turnout, SOUTH_GOV, "source", "no publisher here")),
  'must read "Publisher, document title"',
);
flags(
  "a plain http link",
  broken((c) => set(c.turnout, SOUTH_GOV, "source_url", "http://example.test/a")),
  "must be an https link",
);
flags(
  "a turnout row for an election the atlas does not hold",
  broken((c) => set(c.turnout, SOUTH_GOV, "election_id", "2021-governor")),
  "2021-governor is not an election the atlas holds",
);
flags(
  "a turnout row for an area that is not there",
  broken((c) => set(c.turnout, SOUTH_GOV, "area_key", "testland/ghost-test")),
  "testland/ghost-test is not in the files",
);
flags(
  "a turnout row listed twice",
  broken((c) => c.turnout.push({ ...find(c.turnout, SOUTH_GOV) })),
  "2022-governor at testland/south-test is listed twice",
);

// Areas, parents and ward maps.
flags(
  "a parent that is not there",
  broken((c) => {
    c.areas = c.areas.filter((a) => a["key"] !== "testland/north-test");
  }),
  "the parent testland/north-test is not in the files",
);
flags(
  "a parent that is the wrong one",
  broken((c) =>
    set(c.areas, { key: "testland/north-test/ward-one" }, "parent", "testland/ghost-test"),
  ),
  "parent should be testland/north-test, not testland/ghost-test",
);
flags(
  "a level that is wrong for the key",
  broken((c) => set(c.areas, { key: "testland/south-test" }, "level", "ward")),
  "is a constituency, but the file says ward",
);
flags(
  "a ward missing from the ward maps",
  check(good, new Map([["ward-one", "north-test"]])),
  "testland/north-test/ward-two is not in a ward map",
);
flags(
  "a ward the map puts in another constituency",
  check(
    good,
    new Map([
      ["ward-one", "south-test"],
      ["ward-two", "north-test"],
    ]),
  ),
  "the ward map says ward-one belongs to south-test",
);
eq(
  "a ward map that names no constituency accepts the file's",
  check(
    good,
    new Map([
      ["ward-one", null],
      ["ward-two", null],
    ]),
  ),
  [],
);
flags(
  "kenya stays out of the files",
  broken((c) =>
    c.areas.push({ key: "kenya", level: "country", name: "Kenya", parent: "", iebc_code: "" }),
  ),
  "kenya is added by the schema",
);
flags(
  "a key that is not lower-case parts joined by a slash",
  broken((c) =>
    c.areas.push({
      key: "Bad Key",
      level: "county",
      name: "Bad Key",
      parent: "kenya",
      iebc_code: "",
    }),
  ),
  '"Bad Key" is not a key: lower-case parts joined by "/"',
);
const needsName = "needs a name of at least two letters with no stray spaces";
eq(
  "an area name that is too short, or has stray spaces",
  broken((c) => {
    set(c.areas, { key: "testland" }, "name", " Testland");
    set(c.areas, { key: "testland/south-test" }, "name", "S");
  }),
  [`areas.csv row 2: testland ${needsName}`, `areas.csv row 4: testland/south-test ${needsName}`],
);
flags(
  "an IEBC code that is not one to four digits",
  broken((c) => set(c.areas, { key: "testland" }, "iebc_code", "12345")),
  "the IEBC code 12345 must be one to four digits",
);
flags(
  "an area listed twice",
  broken((c) => c.areas.push({ ...find(c.areas, { key: "testland/south-test" }) })),
  "testland/south-test is listed twice",
);

// Blocs: one party, one bloc, in an election, as blocs.csv records it. A party with none recorded
// stands as itself, and an independent (no party) as "Independent".
flags(
  "a bloc that is not the one recorded",
  broken((c) => set(c.candidates, { name: "A Test" }, "bloc", "Beta")),
  "the bloc should be Alpha, not Beta",
);
flags(
  "a party with no recorded bloc stands as itself",
  check(good, MAPS, new Map()),
  "the bloc should be Party A, not Alpha",
);
flags(
  "an independent stands as Independent",
  broken((c) => set(c.candidates, { name: "O'Test" }, "bloc", "Alpha")),
  "the bloc should be Independent, not Alpha",
);
const blocRows = loadBlocs("tests/fixtures/atlas/blocs.csv");
const listed = { source: "Registrar, Test coalition list", source_url: "" };
eq("the fixture's blocs pass", checkBlocs(blocRows), []);
flags(
  "a bloc for a year with no election",
  checkBlocs([...blocRows, { year: "2019", party: "Party A", bloc: "Alpha", ...listed }]),
  "2019 is not an election year",
);
flags(
  "a party in two blocs in one election",
  checkBlocs([...blocRows, { year: "2022", party: "Party A", bloc: "Beta", ...listed }]),
  "is listed twice",
);
flags(
  "a bloc with no source",
  checkBlocs([
    { year: "2022", party: "Party A", bloc: "Alpha", source: "no publisher", source_url: "" },
  ]),
  'must read "Publisher, document title"',
);
flags(
  "a bloc with no name",
  checkBlocs([{ year: "2022", party: "Party A", bloc: "", ...listed }]),
  "needs a bloc",
);
eq(
  "a party with no name, or with stray spaces",
  checkBlocs([
    { year: "2022", party: "", bloc: "Alpha", ...listed },
    { year: "2022", party: " Party A", bloc: "Alpha", ...listed },
  ]),
  [
    "blocs.csv row 2: a party must be named, with no stray spaces",
    "blocs.csv row 3: a party must be named, with no stray spaces",
  ],
);
eq("no blocs file, no blocs", loadBlocs("tests/fixtures/atlas/nowhere.csv"), []);

// Candidates and their results.
flags(
  "a candidate id that is not election, seat and name",
  broken((c) => set(c.candidates, { name: "A Test" }, "id", "2022-governor/testland/atest")),
  "the id should be 2022-governor/testland/a-test",
);
flags(
  "an election the atlas does not hold",
  broken((c) => set(c.candidates, { name: "A Test" }, "election_id", "2021-governor")),
  "2021-governor is not an election the atlas holds",
);
flags(
  "a seat of the wrong level for the race",
  broken((c) => set(c.candidates, { name: "A Test" }, "seat", "testland/north-test")),
  "a governor seat is a county",
);
flags(
  "a seat that is not in the files",
  broken((c) => set(c.candidates, { name: "A Test" }, "seat", "testland/ghost-test")),
  "the seat testland/ghost-test is not in the files",
);
flags(
  "a candidate name with stray spaces",
  broken((c) => set(c.candidates, { name: "A Test" }, "name", " A Test")),
  "2022-governor/testland/a-test needs a name with no stray spaces",
);
flags(
  "a candidate name that is too short",
  broken((c) => set(c.candidates, { name: "B Test" }, "name", "B")),
  "2022-governor/testland/b needs a name with no stray spaces",
);
flags(
  "votes in an area outside the seat",
  broken((c) =>
    set(
      c.results,
      { candidate_id: "2022-mp/testland/north-test/m-one-test" },
      "area_key",
      "testland/south-test",
    ),
  ),
  "testland/south-test is outside the seat testland/north-test",
);
flags(
  "votes in an area that is not there",
  broken((c) =>
    set(
      c.results,
      { candidate_id: P1, area_key: "testland/south-test" },
      "area_key",
      "testland/ghost-test",
    ),
  ),
  "testland/ghost-test is not in the files",
);
flags(
  "votes for a candidate nobody lists",
  broken((c) =>
    set(
      c.results,
      { candidate_id: P1, area_key: "testland" },
      "candidate_id",
      "2022-governor/testland/nobody",
    ),
  ),
  "is not in candidates.csv",
);
flags(
  "votes that are not a number",
  broken((c) => set(c.results, { candidate_id: P1, area_key: "testland" }, "votes", "6OO")),
  'votes must be a whole number, not "6OO"',
);
flags(
  "a row listed twice",
  broken((c) => c.results.push({ ...find(c.results, { candidate_id: P1, area_key: "testland" }) })),
  "is listed twice",
);
flags(
  "a candidate listed twice",
  broken((c) => c.candidates.push({ ...find(c.candidates, { name: "A Test" }) })),
  "2022-governor/testland/a-test is listed twice",
);

// A missing row is not a zero. A share of 0 is a count, so where an election has votes, every
// candidate whose seat covers that place has a row there (kenya covers every area, a county itself
// and its constituencies, a constituency only itself), and the election has a turnout row there,
// which is where the votes' source is held: a result row has none of its own. An election with no
// votes in a place at all is a gap, not a fault.
const M1 = "2022-mp/testland/north-test/m-one-test";
const M2 = "2022-mp/testland/north-test/m-two-test";
const O_TEST = "2022-mp/testland/north-test/otest";
const B_GOV = "2022-governor/testland/b-test";
const P2 = "2022-president/kenya/p-two-test";
/** Takes a candidate's row at an area out of the results. */
const without = (candidate: string, area: string) => (c: County) => {
  c.results = c.results.filter((r) => r["candidate_id"] !== candidate || r["area_key"] !== area);
};
/** The complaint about a candidate with no row where the election has votes for the others. */
const noRow = (id: string, area: string, election: string) =>
  `${id}: no votes for ${area}, where ${election} has votes for other candidates`;
eq("an MP with no row in their constituency", broken(without(M1, "testland/north-test")), [
  noRow(M1, "testland/north-test", "2022-mp"),
]);
eq("a governor with no county row, the others having theirs", broken(without(B_GOV, "testland")), [
  noRow(B_GOV, "testland", "2022-governor"),
]);
// The county's figure for the candidate no longer has all its constituencies to add up, which is
// refused on its own account.
eq("a governor with no row in one constituency", broken(without(B_GOV, "testland/south-test")), [
  noRow(B_GOV, "testland/south-test", "2022-governor"),
  `${B_GOV}: its constituencies add up to 100 but testland says 300`,
]);
eq("a presidential candidate with no county row", broken(without(P2, "testland")), [
  noRow(P2, "testland", "2022-president"),
]);
// A row whose votes cell is refused is a row all the same, not a missing one.
eq(
  "a row whose votes are not a number is not a missing row",
  broken((c) => set(c.results, { candidate_id: P1, area_key: "testland" }, "votes", "6OO")),
  [
    `results.csv row ${rowOf(good.results, { candidate_id: P1, area_key: "testland" })}: ` +
      'votes must be a whole number, not "6OO"',
  ],
);
// ... and it makes the place one with votes: the other MPs' rows are still missing.
eq(
  "the only row in a place, with a figure that is not a number, still counts",
  broken((c) => {
    c.results = c.results.filter(
      (r) => r["candidate_id"] === M1 || !r["candidate_id"]?.includes("-mp/"),
    );
    set(c.results, { candidate_id: M1 }, "votes", "6OO");
  }),
  [
    `results.csv row ${rowOf(good.results, { candidate_id: M1 })}: ` +
      'votes must be a whole number, not "6OO"',
    noRow(M2, "testland/north-test", "2022-mp"),
    noRow(O_TEST, "testland/north-test", "2022-mp"),
  ],
);
eq(
  "an election with no votes in a place is a gap, not a fault",
  broken((c) => {
    c.results = c.results.filter(
      (r) => !r["candidate_id"]?.startsWith("2022-governor/") || r["area_key"] !== "testland",
    );
  }),
  [],
);
// The MP turnout row is for another area, so the MPs' votes at North Test have none. North Test has
// turnout rows for other elections, and 2022-mp has one elsewhere: neither stands in for it.
eq(
  "votes with no turnout row for that election and area have no source",
  broken((c) => set(c.turnout, { election_id: "2022-mp" }, "area_key", "testland/south-test")),
  ["2022-mp testland/north-test: votes but no turnout row, so no source"],
);

// Counties agree on the candidates they share. Every county lists the presidential candidates and
// each county's migration upserts them, so the last one applied wins: two counties that spell a
// party or a bloc differently would each pass alone and still overwrite one another's data.
const countyOf = (name: string, edit?: (candidates: Row[]) => void) => {
  const candidates = structuredClone(good.candidates);
  edit?.(candidates);
  return { name, candidates };
};
const respell = (column: string, value: string) => (candidates: Row[]) =>
  set(candidates, { id: P1 }, column, value);
const disagree = (column: string, was: string, now: string, one = "alpha", other = "beta") =>
  `${P1}: ${column} is "${was}" in ${one} but "${now}" in ${other}`;
eq(
  "two counties that agree on what they share",
  checkShared([countyOf("alpha"), countyOf("beta")]),
  [],
);
eq(
  "a party spelt two ways",
  checkShared([countyOf("alpha"), countyOf("beta", respell("party", "Party Z"))]),
  [disagree("party", "Party A", "Party Z")],
);
eq(
  "a bloc spelt two ways",
  checkShared([countyOf("alpha"), countyOf("beta", respell("bloc", "Zeta"))]),
  [disagree("bloc", "Alpha", "Zeta")],
);
eq(
  "a party and a bloc that both differ are two complaints",
  checkShared([
    countyOf("alpha"),
    countyOf("beta", (candidates) => {
      respell("party", "Party Z")(candidates);
      respell("bloc", "Zeta")(candidates);
    }),
  ]),
  [disagree("party", "Party A", "Party Z"), disagree("bloc", "Alpha", "Zeta")],
);
// Every column but the id is compared.
const P1_ROW = find(good.candidates, { id: P1 });
for (const [column, value] of [
  ["election_id", "2017-president"],
  ["seat", "testland"],
  ["name", "P One Test, Jr."],
  ["party", "Party Z"],
  ["bloc", "Zeta"],
] as const) {
  eq(
    `a candidate whose ${column} differs between counties`,
    checkShared([countyOf("alpha"), countyOf("beta", respell(column, value))]),
    [disagree(column, P1_ROW[column] ?? "", value)],
  );
}
eq(
  "a candidate that only one county lists is not compared",
  checkShared([
    countyOf("alpha"),
    countyOf("beta", (candidates) => {
      candidates.splice(0, 3, {
        id: "2022-governor/other-test/d-test",
        election_id: "2022-governor",
        seat: "other-test",
        name: "D Test",
        party: "Party D",
        bloc: "Party D",
      });
    }),
  ]),
  [],
);
eq(
  "three counties, only the third differing",
  checkShared([
    countyOf("alpha"),
    countyOf("beta"),
    countyOf("gamma", respell("party", "Party Z")),
  ]),
  [disagree("party", "Party A", "Party Z", "alpha", "gamma")],
);
eq(
  "each county is compared with the first that lists the candidate",
  checkShared([
    countyOf("alpha", respell("party", "Party Z")),
    countyOf("beta"),
    countyOf("gamma"),
  ]),
  [
    disagree("party", "Party Z", "Party A", "alpha", "beta"),
    disagree("party", "Party Z", "Party A", "alpha", "gamma"),
  ],
);
eq(
  "a candidate a county lists twice is that county's problem, not a disagreement",
  checkShared([
    countyOf("alpha", (candidates) => {
      candidates.push({ ...P1_ROW, party: "Party Z" });
    }),
    countyOf("beta"),
  ]),
  [],
);

// Registers and population.
flags(
  "a register for a year with no election",
  broken((c) => set(c.register, { year: "2017" }, "year", "2019")),
  "2019 is not an election year",
);
flags(
  "a register for an area that is not there",
  broken((c) => set(c.register, { year: "2017" }, "area_key", "testland/ghost-test")),
  "testland/ghost-test is not in the files",
);
flags(
  "a registered figure that is not a number",
  broken((c) => set(c.register, { year: "2017" }, "registered", "55O")),
  'registered must be a whole number, not "55O"',
);
flags(
  "a register source with no publisher",
  broken((c) => set(c.register, { year: "2017" }, "source", "no publisher here")),
  'must read "Publisher, document title"',
);
flags(
  "a register row listed twice",
  broken((c) => c.register.push({ ...find(c.register, { year: "2017" }) })),
  "2017 at testland/north-test/ward-one is listed twice",
);
const WARD_ONE = { area_key: "testland/north-test/ward-one" };
const WARD_TWO = { area_key: "testland/north-test/ward-two" };
flags(
  "more young adults than adults",
  broken((c) => set(c.population, WARD_ONE, "young_adults", "901")),
  "young adults (901) pass the adults (900)",
);
flags(
  "more adults than people",
  broken((c) => set(c.population, WARD_ONE, "adults", "1501")),
  "adults (1501) pass the total (1500)",
);
flags(
  "population for an area that is not there",
  broken((c) => set(c.population, WARD_ONE, "area_key", "testland/ghost-test")),
  "testland/ghost-test is not in the files",
);
eq(
  "a population year outside 1990 to 2100",
  broken((c) => {
    set(c.population, WARD_ONE, "year", "1989");
    set(c.population, WARD_TWO, "year", "2101");
  }),
  ["population.csv row 2: 1989 is not a year", "population.csv row 3: 2101 is not a year"],
);
// 02025 reads as 2025 once loaded, so next to a 2025 row for the same ward it is a second row for
// the same key, which the database refuses; it is not a year as written.
eq(
  "a population year written with a leading zero is not a year",
  broken((c) => c.population.push({ ...find(c.population, WARD_ONE), year: "02025" })),
  [`population.csv row ${good.population.length + 2}: 02025 is not a year`],
);
eq(
  "population years 1990 and 2100 are accepted",
  broken((c) => {
    set(c.population, WARD_ONE, "year", "1990");
    set(c.population, WARD_TWO, "year", "2100");
  }),
  [],
);
flags(
  "a population method that says nothing",
  broken((c) => set(c.population, WARD_ONE, "method", "short")),
  "the method must say how it was worked out",
);
flags(
  "a population source with no publisher",
  broken((c) => set(c.population, WARD_ONE, "source", "no publisher here")),
  'must read "Publisher, document title"',
);
flags(
  "a population row listed twice",
  broken((c) => c.population.push({ ...find(c.population, WARD_ONE) })),
  "testland/north-test/ward-one in 2025 is listed twice",
);

// The database's limits. A county that passes has to load, so the checker refuses what the CHECK
// constraints of supabase/migrations/20261007090000_election_atlas.sql refuse: text longer than its
// column holds (lengths are in characters, with spaces trimmed off the ends, as Postgres counts
// them), a whole number over the integer maximum, and a key the shape constraint rejects. Each
// limit is tried one over (refused) and, where it is cheap to show, at the limit (accepted).
const tooLong = (file: string, row: number, column: string, max: number, n: number) =>
  `${file}.csv row ${row}: ${column} must be at most ${max} characters, not ${n}`;
const overMax = (file: string, row: number, column: string) =>
  `${file}.csv row ${row}: ${column} must be a whole number up to 2147483647, not "2147483648"`;
const SOUTH = { key: "testland/south-test" };
const B_TEST = { name: "B Test" };
const REG_2017 = { year: "2017" };
const SOUTH_ROW = rowOf(good.areas, SOUTH);
const B_ROW = rowOf(good.candidates, B_TEST);
const POP_ROW = rowOf(good.population, WARD_ONE);

// Area names are 2 to 80 characters.
eq(
  "an area name of 80 characters",
  broken((c) => set(c.areas, SOUTH, "name", "x".repeat(80))),
  [],
);
eq(
  "an area name of 81 characters",
  broken((c) => set(c.areas, SOUTH, "name", "x".repeat(81))),
  [tooLong("areas", SOUTH_ROW, "name", 80, 81)],
);

// Candidate names are 2 to 120. The dots are dropped from the slug, so the id stays right.
const named = (n: number) =>
  broken((c) => set(c.candidates, B_TEST, "name", "B Test".padEnd(n, ".")));
eq("a candidate name of 120 characters", named(120), []);
eq("a candidate name of 121 characters", named(121), [
  tooLong("candidates", B_ROW, "name", 120, 121),
]);

// A party is empty (an independent) or 1 to 120 characters. Each party here has a bloc recorded,
// so the bloc is right.
const withParty = (party: string) => {
  const c = structuredClone(good);
  set(c.candidates, B_TEST, "party", party);
  return check(c, MAPS, new Map<string, string>([...BLOCS, [`2022|${party}`, "Beta"]]));
};
eq("a party of 120 characters", withParty("P".repeat(120)), []);
eq("a party of 121 characters", withParty("P".repeat(121)), [
  tooLong("candidates", B_ROW, "party", 120, 121),
]);
// With no bloc recorded the bloc is the party, which is only spaces too.
eq(
  "a party of only spaces",
  broken((c) => {
    set(c.candidates, B_TEST, "party", "  ");
    set(c.candidates, B_TEST, "bloc", "  ");
  }),
  [
    `candidates.csv row ${B_ROW}: 2022-governor/testland/b-test: ` +
      "the party is only spaces; leave it empty for an independent",
  ],
);

// A bloc is 1 to 80 characters. Party Q has this bloc recorded, so the bloc is right.
const withBloc = (bloc: string) => {
  const c = structuredClone(good);
  set(c.candidates, B_TEST, "party", "Party Q");
  set(c.candidates, B_TEST, "bloc", bloc);
  return check(c, MAPS, new Map<string, string>([...BLOCS, ["2022|Party Q", bloc]]));
};
eq("a bloc of 80 characters", withBloc("B".repeat(80)), []);
eq("a bloc of 81 characters", withBloc("B".repeat(81)), [
  tooLong("candidates", B_ROW, "bloc", 80, 81),
]);

// A source is 3 to 200 characters on every table that has one, and a source_url at most 500. The
// source stays "Publisher, document title" and the link an https link.
const sourced = (n: number) => `IEBC, ${"x".repeat(n - 6)}`;
const linked = (n: number) => `https://example.test/${"a".repeat(n - 21)}`;
eq(
  "a turnout source of 200 characters",
  broken((c) => set(c.turnout, SOUTH_GOV, "source", sourced(200))),
  [],
);
const TURNOUT_ROW = rowOf(good.turnout, SOUTH_GOV);
eq(
  "a turnout source of 201 characters",
  broken((c) => set(c.turnout, SOUTH_GOV, "source", sourced(201))),
  [tooLong("turnout", TURNOUT_ROW, "source", 200, 201)],
);
eq(
  "a register source of 201 characters",
  broken((c) => set(c.register, REG_2017, "source", sourced(201))),
  [tooLong("register", rowOf(good.register, REG_2017), "source", 200, 201)],
);
eq(
  "a population source of 201 characters",
  broken((c) => set(c.population, WARD_ONE, "source", sourced(201))),
  [tooLong("population", POP_ROW, "source", 200, 201)],
);
// Spaces around the comma satisfy "Publisher, document title" but are nothing once trimmed.
const SPACED = `${" ".repeat(2)}, ${" ".repeat(3)}`;
eq(
  "a source that is only spaces around a comma",
  broken((c) => set(c.turnout, SOUTH_GOV, "source", SPACED)),
  [`turnout.csv row ${TURNOUT_ROW}: source must read "Publisher, document title", not "${SPACED}"`],
);
eq(
  "a turnout link of 500 characters",
  broken((c) => set(c.turnout, SOUTH_GOV, "source_url", linked(500))),
  [],
);
eq(
  "a turnout link of 501 characters",
  broken((c) => set(c.turnout, SOUTH_GOV, "source_url", linked(501))),
  [tooLong("turnout", TURNOUT_ROW, "source_url", 500, 501)],
);
eq(
  "a register link of 501 characters",
  broken((c) => set(c.register, REG_2017, "source_url", linked(501))),
  [tooLong("register", rowOf(good.register, REG_2017), "source_url", 500, 501)],
);

// A population method is 10 to 500 characters.
eq(
  "a population method of 500 characters",
  broken((c) => set(c.population, WARD_ONE, "method", "x".repeat(500))),
  [],
);
eq(
  "a population method of 501 characters",
  broken((c) => set(c.population, WARD_ONE, "method", "x".repeat(501))),
  [tooLong("population", POP_ROW, "method", 500, 501)],
);

// Postgres counts characters, not the UTF-16 units JavaScript counts: a character outside the
// basic plane is one. Eighty of them fit a name, one is too short for a name and five for a method.
const FACE = String.fromCodePoint(0x1f600);
eq(
  "an area name of 80 characters outside the basic plane",
  broken((c) => set(c.areas, SOUTH, "name", FACE.repeat(80))),
  [],
);
eq(
  "one character outside the basic plane is too short for an area name",
  broken((c) => set(c.areas, SOUTH, "name", FACE)),
  [`areas.csv row ${SOUTH_ROW}: testland/south-test ${needsName}`],
);
flags(
  "one character outside the basic plane is too short for a candidate name",
  broken((c) => set(c.candidates, B_TEST, "name", FACE)),
  "needs a name with no stray spaces",
);
eq(
  "five characters outside the basic plane are too short for a method",
  broken((c) => set(c.population, WARD_ONE, "method", FACE.repeat(5))),
  [`population.csv row ${POP_ROW}: the method must say how it was worked out`],
);

// A whole number is at most 2147483647, Postgres's integer maximum.
eq(
  "a registered figure at the integer maximum",
  broken((c) => set(c.register, REG_2017, "registered", "2147483647")),
  [],
);
const OTEST = { candidate_id: O_TEST };
type Table = "results" | "turnout" | "register" | "population";
const overs: [Table, string, Row][] = [
  ["results", "votes", OTEST],
  ["turnout", "registered", NORTH_GOV],
  ["turnout", "cast_votes", NORTH_GOV],
  ["turnout", "rejected_votes", NORTH_GOV],
  ["turnout", "valid_votes", NORTH_GOV],
  ["register", "registered", REG_2017],
  ["population", "year", WARD_ONE],
  ["population", "total", WARD_ONE],
  ["population", "adults", WARD_ONE],
  ["population", "young_adults", WARD_ONE],
];
for (const [file, column, where] of overs) {
  eq(
    `${column} one over the integer maximum, in ${file}.csv`,
    broken((c) => set(c[file], where, column, "2147483648")),
    [overMax(file, rowOf(good[file], where), column)],
  );
}

// A key under kenya: the schema wants a constituency's parent to be a county, never kenya.
eq(
  "a constituency keyed under kenya",
  broken((c) =>
    c.areas.push({
      key: "kenya/x-test",
      level: "constituency",
      name: "X Test",
      parent: "kenya",
      iebc_code: "",
    }),
  ),
  [
    `areas.csv row ${good.areas.length + 2}: kenya/x-test starts with kenya, ` +
      "but keys do not begin with the country: a county's key is its own name",
  ],
);
eq(
  "a county whose key only starts like kenya is fine",
  broken((c) =>
    c.areas.push({
      key: "kenya-west",
      level: "county",
      name: "Kenya West",
      parent: "kenya",
      iebc_code: "",
    }),
  ),
  [],
);

// Reading the files.
function refusal(dir: string): string {
  try {
    loadCounty(dir);
    return "";
  } catch (e) {
    return String(e);
  }
}
const tmp = mkdtempSync(join(tmpdir(), "atlas-data-"));
try {
  const copy = (name: string) => {
    const dir = join(tmp, name);
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  };
  const wrong = copy("wrong");
  writeFileSync(join(wrong, "results.csv"), "candidate,area,votes\nx,y,1\n");
  eq(
    "wrong columns are refused",
    refusal(wrong).includes("results.csv: the columns must be candidate_id,area_key,votes"),
    true,
  );
  const short = copy("short");
  writeFileSync(
    join(short, "results.csv"),
    "candidate_id,area_key,votes\n2022-governor/testland/a-test,testland\n",
  );
  eq(
    "a short row is refused",
    refusal(short).includes("results.csv row 2: 2 cells, expected 3"),
    true,
  );
  // The reader refuses what build_sql.py refuses, so that a county the checker passes can become a
  // migration: a header separated by semicolons (src/lib/csv.ts would read it), a file that is not
  // UTF-8 (it would decode with replacement characters), a backslash in a cell and a header whose
  // quoted cells only join to the columns.
  const semicolons = copy("semicolons");
  writeFileSync(
    join(semicolons, "results.csv"),
    "candidate_id;area_key;votes\n2022-governor/testland/a-test;testland;600\n",
  );
  eq(
    "a semicolon-separated file is refused",
    refusal(semicolons).includes(
      "results.csv: the header must be separated by commas, not semicolons",
    ),
    true,
  );
  const areasCsv = readFileSync(join(FIXTURE, "areas.csv"), "utf8");
  // Characters built from code points, so that this file stays plain ASCII.
  const BOM = String.fromCharCode(0xfeff);
  const O_UMLAUT = String.fromCharCode(0xf6); // one byte in Latin-1, not valid UTF-8 alone
  const legacy = copy("legacy");
  writeFileSync(
    join(legacy, "areas.csv"),
    Buffer.from(areasCsv.replace("North Test", `N${O_UMLAUT}rth Test`), "latin1"),
  );
  eq(
    "a file that is not UTF-8 is refused",
    refusal(legacy).includes("areas.csv: the file must be UTF-8 text"),
    true,
  );
  const backslash = copy("backslash");
  writeFileSync(join(backslash, "areas.csv"), areasCsv.replace("North Test", "North\\Test"));
  eq(
    "a backslash in a cell is refused",
    refusal(backslash).includes("areas.csv row 3: the name cell has a backslash"),
    true,
  );
  // build_sql.py compares the header cell by cell: a quoted "key,level" is one cell there, so the
  // header is four cells over five-cell rows. Joined with commas it reads as the five columns.
  const merged = copy("merged");
  writeFileSync(join(merged, "areas.csv"), areasCsv.replace("key,level,", '"key,level",'));
  eq(
    "a header whose quoted cells join to the columns is refused",
    refusal(merged).includes("areas.csv: the columns must be key,level,name,parent,iebc_code"),
    true,
  );
  // ... and takes what build_sql.py takes: a byte-order mark, CRLF line endings, blank rows, and a
  // semicolon anywhere but the header.
  const areasRead = (name: string, text: string) => {
    const dir = copy(name);
    writeFileSync(join(dir, "areas.csv"), text);
    try {
      return loadCounty(dir).areas;
    } catch (e) {
      return String(e);
    }
  };
  eq("a byte-order mark is accepted", areasRead("bom", `${BOM}${areasCsv}`), good.areas);
  eq(
    "a doubled byte-order mark is refused",
    String(areasRead("bom2", `${BOM}${BOM}${areasCsv}`)).includes(
      "areas.csv: the columns must be key,level,name,parent,iebc_code",
    ),
    true,
  );
  eq(
    "CRLF line endings are accepted",
    areasRead("crlf", areasCsv.replace(/\n/g, "\r\n")),
    good.areas,
  );
  eq("blank rows are accepted", areasRead("blank", areasCsv.replace(/\n/g, "\n\n")), good.areas);
  const semicell = areasCsv.replace("North Test", "North;Test");
  const northSemicolon = good.areas.map((a) =>
    a["key"] === "testland/north-test" ? { ...a, name: "North;Test" } : a,
  );
  eq(
    "a semicolon in a cell, not the header, is accepted",
    areasRead("semicell", semicell),
    northSemicolon,
  );
  eq(
    "CR line endings and a semicolon in a cell are accepted",
    areasRead("cr", semicell.replace(/\n/g, "\r")),
    northSemicolon,
  );
  // A line before the header, even a blank one, leaves the header second: build_sql.py reads the
  // blank line as the first row, and refuses the columns it finds there.
  const headerFirst = "areas.csv: the first line must be the header, not a blank line";
  const refusedFirst = (name: string, text: string) =>
    String(areasRead(name, text)).includes(headerFirst);
  eq("a blank line before the header is refused", refusedFirst("lead1", `\n${areasCsv}`), true);
  eq(
    "two blank lines before the header, in a CRLF file, are refused",
    refusedFirst("lead2", `\r\n\r\n${areasCsv.replace(/\n/g, "\r\n")}`),
    true,
  );
  eq(
    "a line of spaces before the header is refused",
    refusedFirst("lead3", `   \n${areasCsv}`),
    true,
  );
  eq(
    "a line of commas before the header is refused",
    refusedFirst("lead4", `,,,,\n${areasCsv}`),
    true,
  );
  eq(
    "a byte-order mark, a blank line, then the header is refused",
    refusedFirst("lead5", `${BOM}\n${areasCsv}`),
    true,
  );
  eq(
    "a byte-order mark, the header, then blank lines are accepted",
    areasRead("lead6", `${BOM}${areasCsv.replace("\n", "\n\n\n")}\n\n`),
    good.areas,
  );
  const missing = copy("missing");
  rmSync(join(missing, "register.csv"));
  eq("a missing file is refused", refusal(missing).includes("register.csv is missing"), true);
  const plain = copy("plain");
  rmSync(join(plain, "known-differences.csv"));
  eq("recorded differences are optional", loadCounty(plain).knownDifferences, []);
  writeFileSync(join(tmp, "blocs.csv"), "year,party,coalition\n2022,Party A,Alpha\n");
  let blocsRefusal = "";
  try {
    loadBlocs(join(tmp, "blocs.csv"));
  } catch (e) {
    blocsRefusal = String(e);
  }
  eq(
    "wrong columns in blocs.csv are refused",
    blocsRefusal.includes("blocs.csv: the columns must be year,party,bloc,source,source_url"),
    true,
  );

  // Which folders are counties.
  const root = join(tmp, "root");
  mkdirSync(join(root, "nairobi"), { recursive: true });
  mkdirSync(join(root, "_sources"), { recursive: true });
  writeFileSync(join(root, "SOURCES.md"), "x");
  eq("counties are the folders not starting with an underscore", listCounties(root), ["nairobi"]);
  eq("no data folder, no counties", listCounties(join(tmp, "nowhere")), []);

  // Ward maps: the slug alone is the key, so a ward slug that two maps (or one map twice) put in
  // different constituencies is refused, not overwritten. The same ward again is fine.
  const wardMaps = (name: string, files: Record<string, [string, string | null][]>) => {
    const dir = join(tmp, name);
    mkdirSync(dir);
    for (const [file, wards] of Object.entries(files)) {
      const features = wards.map(([slug, constituency]) => ({
        type: "Feature",
        properties:
          constituency === null ? { slug, name: slug } : { slug, name: slug, constituency },
        geometry: null,
      }));
      writeFileSync(join(dir, file), JSON.stringify({ type: "FeatureCollection", features }));
    }
    return dir;
  };
  const wardRefusal = (dir: string): string => {
    try {
      loadWardMaps(dir);
      return "";
    } catch (e) {
      return String(e);
    }
  };
  // What loads, or the refusal in its place, so that a wrong refusal fails one case, not the file.
  const wardEntries = (dir: string) => {
    try {
      return [...loadWardMaps(dir)];
    } catch (e) {
      return String(e);
    }
  };
  eq(
    "a ward slug in two constituencies is refused",
    wardRefusal(
      wardMaps("clash", {
        "a-wards.json": [["ward-one", "North Test"]],
        "b-wards.json": [["ward-one", "South Test"]],
      }),
    ),
    "Error: the ward ward-one is in north-test in a-wards.json " +
      "but in south-test in b-wards.json: a ward slug has to name one ward",
  );
  eq(
    "a ward slug twice in one map, in two constituencies, is refused",
    wardRefusal(
      wardMaps("twice", {
        "a-wards.json": [
          ["ward-one", "North Test"],
          ["ward-one", "South Test"],
        ],
      }),
    ),
    "Error: the ward ward-one is in north-test in a-wards.json " +
      "but in south-test in a-wards.json: a ward slug has to name one ward",
  );
  eq(
    "a ward with a constituency in one map and none in another is refused",
    wardRefusal(
      wardMaps("none", {
        "a-wards.json": [["ward-one", null]],
        "b-wards.json": [["ward-one", "South Test"]],
      }),
    ),
    "Error: the ward ward-one is in no constituency in a-wards.json " +
      "but in south-test in b-wards.json: a ward slug has to name one ward",
  );
  eq(
    "the same ward again, in the same constituency, is fine",
    wardEntries(
      wardMaps("again", {
        "a-wards.json": [
          ["ward-one", "North Test"],
          ["ward-three", null],
        ],
        "b-wards.json": [
          ["ward-one", "North Test"],
          ["ward-two", "North Test"],
          ["ward-three", null],
        ],
      }),
    ),
    [
      ["ward-one", "north-test"],
      ["ward-three", null],
      ["ward-two", "north-test"],
    ],
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// The ward maps under public/geo. Another campaign's ward map would add to them, so Nairobi's and
// Mathira's are looked at by name, each with the slugs its own file holds, and the total is not
// pinned.
const real = loadWardMaps("public/geo");
const slugsIn = (file: string): Set<string> => {
  const geo = JSON.parse(readFileSync(join("public/geo", file), "utf8")) as {
    features: { properties: { slug?: string } }[];
  };
  return new Set(geo.features.flatMap((f) => (f.properties.slug ? [f.properties.slug] : [])));
};
const nairobiWards = slugsIn("nairobi-wards.json");
const mathiraWards = slugsIn("mathira-wards.json");
eq("Nairobi's map holds 85 wards", nairobiWards.size, 85);
eq("Mathira's map holds 6 wards", mathiraWards.size, 6);
eq(
  "every ward of Nairobi's map is among the loaded wards",
  [...nairobiWards].filter((slug) => !real.has(slug)),
  [],
);
eq(
  "every ward of Mathira's map is among the loaded wards",
  [...mathiraWards].filter((slug) => !real.has(slug)),
  [],
);
eq("a Nairobi ward knows its constituency", real.get("umoja-ii"), "embakasi-west");
eq("Mathira's map names no constituency", real.get("iriaini"), null);

// Every county in data/atlas passes, and so does the blocs file they share.
const realBlocRows = loadBlocs("data/atlas/blocs.csv");
const blocProblems = checkBlocs(realBlocRows);
if (blocProblems.length) console.log(`blocs.csv:\n  ${blocProblems.join("\n  ")}`);
eq("data/atlas/blocs.csv passes", blocProblems, []);
const realCounties: { name: string; candidates: Row[] }[] = [];
for (const name of listCounties("data/atlas")) {
  const county = loadCounty(join("data/atlas", name));
  realCounties.push({ name, candidates: county.candidates });
  const problems = checkCounty(county, real, blocMap(realBlocRows));
  if (problems.length) console.log(`${name}:\n  ${problems.join("\n  ")}`);
  eq(`data/atlas/${name} passes`, problems, []);
}
// ... and they agree with one another on the candidates they share (with no county yet, this holds
// for want of any).
const realShared = checkShared(realCounties);
if (realShared.length) console.log(`shared candidates:\n  ${realShared.join("\n  ")}`);
eq("the counties under data/atlas agree on their shared candidates", realShared, []);

// The slug rule is the one scripts/atlas/slug.py runs.
const cases = parseCSV(readFileSync("tests/fixtures/atlas/slug-cases.csv", "utf8")).slice(1);
eq("there are slug cases", cases.length > 0, true);
for (const [name, slug] of cases) eq(`the slug of "${name}"`, slugify(name ?? ""), slug);

// The files and columns are the ones scripts/atlas/build_sql.py loads.
const python = process.env["ATLAS_PYTHON"] || "python3";
const asked = spawnSync(
  python,
  [
    "-c",
    "import json, sys; sys.path.insert(0, 'scripts/atlas'); import build_sql; " +
      "print(json.dumps(build_sql.FILES))",
  ],
  { encoding: "utf8" },
);
const spawnError = asked.error as NodeJS.ErrnoException | undefined;
if (spawnError?.code === "ENOENT") {
  // There is no such interpreter, so there is nothing to compare with.
  console.log(`SKIP: ${python} could not say which columns build_sql.py loads.`);
} else if (spawnError) {
  // The interpreter is there and could not be run (not executable, say): that is a failure, not a
  // skip, and the error says why.
  fail++;
  console.log(
    `FAIL the columns match build_sql.py's\n  ${python} could not be run: ${spawnError.message}`,
  );
} else if (asked.status !== 0) {
  // The interpreter ran and build_sql.py did not load (a syntax error, a renamed FILES): that is a
  // failure, not a skip, and the interpreter says why.
  fail++;
  const how = asked.status ?? asked.signal;
  console.log(
    `FAIL the columns match build_sql.py's\n  ${python} exited with ${how}\n${asked.stderr}`,
  );
} else {
  const loaded = Object.fromEntries(
    Object.entries(COLUMNS).filter(([file]) => file !== "known-differences"),
  );
  eq("the columns match build_sql.py's", JSON.parse(asked.stdout), loaded);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
