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

// The ward maps under public/geo.
const real = loadWardMaps("public/geo");
eq("the ward maps hold Nairobi's 85 wards and Mathira's 6", real.size, 91);
eq("a Nairobi ward knows its constituency", real.get("umoja-ii"), "embakasi-west");
eq("Mathira's map names no constituency", real.get("iriaini"), null);

// Every county in data/atlas passes, and so does the blocs file they share.
const realBlocRows = loadBlocs("data/atlas/blocs.csv");
const blocProblems = checkBlocs(realBlocRows);
if (blocProblems.length) console.log(`blocs.csv:\n  ${blocProblems.join("\n  ")}`);
eq("data/atlas/blocs.csv passes", blocProblems, []);
for (const name of listCounties("data/atlas")) {
  const problems = checkCounty(loadCounty(join("data/atlas", name)), real, blocMap(realBlocRows));
  if (problems.length) console.log(`${name}:\n  ${problems.join("\n  ")}`);
  eq(`data/atlas/${name} passes`, problems, []);
}

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
if (asked.error || asked.status !== 0) {
  console.log(`SKIP: ${python} could not say which columns build_sql.py loads.`);
} else {
  const loaded = Object.fromEntries(
    Object.entries(COLUMNS).filter(([file]) => file !== "known-differences"),
  );
  eq("the columns match build_sql.py's", JSON.parse(asked.stdout), loaded);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
