// The checks every county's atlas files must pass before they become a migration, and the readers
// that load them. `checkCounty` takes the parsed files and says, in a sentence each, what is
// wrong; tests/atlas-data.test.ts runs it on every county under data/atlas. It refuses a missing
// row (a share of 0 is a count, and a row that is not there is none) and whatever the CHECK
// constraints of supabase/migrations/20261007090000_election_atlas.sql refuse, so that a county
// that passes can be applied. `checkShared` compares the counties with one another. A recorded
// difference (known-differences.csv) is how a county keeps an inconsistency IEBC itself published:
// it must say why, and it is refused once nothing needs it any more. blocs.csv records, for each
// election, which coalition (bloc) each party stood in, so a coalition has one name everywhere.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { levelOfKey, parentKey } from "../../src/lib/atlas/scope";
import { parseCSV } from "../../src/lib/csv";

export type Row = Record<string, string>;

/** The files and their columns. scripts/atlas/build_sql.py loads the same first six. */
export const COLUMNS = {
  areas: ["key", "level", "name", "parent", "iebc_code"],
  candidates: ["id", "election_id", "seat", "name", "party", "bloc"],
  results: ["candidate_id", "area_key", "votes"],
  turnout: [
    "election_id",
    "area_key",
    "registered",
    "cast_votes",
    "rejected_votes",
    "valid_votes",
    "source",
    "source_url",
  ],
  register: ["year", "area_key", "registered", "source", "source_url"],
  population: ["area_key", "year", "total", "adults", "young_adults", "source", "method"],
  "known-differences": ["check", "election_id", "area_key", "candidate_id", "difference", "reason"],
} as const;

export type County = {
  areas: Row[];
  candidates: Row[];
  results: Row[];
  turnout: Row[];
  register: Row[];
  population: Row[];
  knownDifferences: Row[];
};

/**
 * Every ward slug in the ward maps under public/geo, and the slug of the constituency the map
 * puts it in; null when the map names none (Mathira's does not).
 */
export type WardMaps = Map<string, string | null>;

/** `${year}|${party}` to the bloc blocs.csv records for that party in that election. */
export type Blocs = Map<string, string>;

/** blocs.csv's columns. */
const BLOC_COLUMNS = ["year", "party", "bloc", "source", "source_url"];

/** The slug rule: lower-case, punctuation dropped, other runs of non-letters a hyphen. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\P{ASCII}/gu, "")
    .toLowerCase()
    .replace(/['`.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A CSV file's text, read as scripts/atlas/build_sql.py reads it: as UTF-8, and bytes that are not
 * UTF-8 are refused, not decoded into replacement characters. A byte-order mark is kept, for
 * parseCSV to drop exactly one, as build_sql.py's utf-8-sig does: a doubled mark stays in the
 * first header cell and the columns are refused.
 */
function readText(path: string): string {
  // Built outside the try: a runtime that cannot build it should say so, not blame every file.
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const bytes = readFileSync(path);
  try {
    return utf8.decode(bytes);
  } catch {
    throw new Error(
      `${basename(path)}: the file must be UTF-8 text; save it as UTF-8, not a legacy code page`,
    );
  }
}

/**
 * A CSV file's rows as objects, refusing what build_sql.py refuses: the wrong columns, a header
 * separated by semicolons (src/lib/csv.ts reads one, build_sql.py reads commas only), a blank line
 * before the header, a row of the wrong length, and a backslash in a cell.
 */
function readRows(path: string, want: readonly string[]): Row[] {
  const label = basename(path);
  const text = readText(path);
  const first = text.split(/\r\n|\r|\n/, 1)[0] ?? "";
  if (first.includes(";")) {
    throw new Error(`${label}: the header must be separated by commas, not semicolons`);
  }
  const [head, ...body] = parseCSV(text);
  // Cell by cell, as build_sql.py compares it: joined with commas, one quoted cell "key,level"
  // would pass for the two columns key and level.
  if (!head || head.length !== want.length || head.some((h, j) => h !== want[j])) {
    throw new Error(
      `${label}: the columns must be ${want.join(",")}; found ${head ? head.join(",") : "nothing"}`,
    );
  }
  // parseCSV drops blank rows, so a blank line before the header would pass above, where
  // build_sql.py reads that line as the first row and refuses it. parseCSV says what blank is.
  if (parseCSV(first).length === 0) {
    throw new Error(`${label}: the first line must be the header, not a blank line`);
  }
  return body.map((cells, i) => {
    if (cells.length !== want.length) {
      throw new Error(`${label} row ${i + 2}: ${cells.length} cells, expected ${want.length}`);
    }
    const slash = cells.findIndex((cell) => cell.includes("\\"));
    if (slash !== -1) {
      throw new Error(
        `${label} row ${i + 2}: the ${want[slash]} cell has a backslash, ` +
          "which build_sql.py refuses",
      );
    }
    return Object.fromEntries(want.map((column, j) => [column, cells[j] ?? ""]));
  });
}

function table(dir: string, name: keyof typeof COLUMNS, optional = false): Row[] {
  const path = join(dir, `${name}.csv`);
  if (!existsSync(path)) {
    if (optional) return [];
    throw new Error(`${name}.csv is missing`);
  }
  return readRows(path, COLUMNS[name]);
}

/** blocs.csv's rows; no file, no rows. */
export function loadBlocs(path: string): Row[] {
  return existsSync(path) ? readRows(path, BLOC_COLUMNS) : [];
}

/** blocs.csv's rows as a lookup. */
export function blocMap(rows: Row[]): Blocs {
  return new Map(rows.map((r) => [`${r["year"] ?? ""}|${r["party"] ?? ""}`, r["bloc"] ?? ""]));
}

/** One county's files. */
export function loadCounty(dir: string): County {
  return {
    areas: table(dir, "areas"),
    candidates: table(dir, "candidates"),
    results: table(dir, "results"),
    turnout: table(dir, "turnout"),
    register: table(dir, "register"),
    population: table(dir, "population"),
    knownDifferences: table(dir, "known-differences", true),
  };
}

/** The county folders under a root: folders whose names do not start with an underscore. */
export function listCounties(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith("_") && statSync(join(root, name)).isDirectory())
    .sort();
}

/**
 * The ward maps under a folder like public/geo: every `*-wards.json`. The slug alone is the key,
 * so a slug that two maps (or one map twice) give different constituencies, a constituency in one
 * and none in the other included, is refused rather than overwritten. The same ward again is fine.
 */
export function loadWardMaps(geoDir: string): WardMaps {
  const maps: WardMaps = new Map();
  const firstIn = new Map<string, string>();
  const named = (constituency: string | null) => constituency ?? "no constituency";
  for (const file of readdirSync(geoDir)
    .filter((f) => f.endsWith("-wards.json"))
    .sort()) {
    const geo = JSON.parse(readFileSync(join(geoDir, file), "utf8")) as {
      features: { properties: { slug?: string; constituency?: string } }[];
    };
    for (const feature of geo.features) {
      const { slug, constituency } = feature.properties;
      if (!slug) continue;
      const there = constituency ? slugify(constituency) : null;
      const before = maps.get(slug);
      if (before !== undefined && before !== there) {
        throw new Error(
          `the ward ${slug} is in ${named(before)} in ${firstIn.get(slug)} ` +
            `but in ${named(there)} in ${file}: a ward slug has to name one ward`,
        );
      }
      maps.set(slug, there);
      if (!firstIn.has(slug)) firstIn.set(slug, file);
    }
  }
  return maps;
}

const ELECTION_YEARS = ["2013", "2017", "2022"];
const ELECTIONS = new Set(
  ELECTION_YEARS.flatMap((y) => ["president", "governor", "mp"].map((race) => `${y}-${race}`)),
);
const SEAT_LEVEL: Record<string, string> = {
  president: "country",
  governor: "county",
  mp: "constituency",
};
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/;
const WHOLE = /^\d+$/;
const SIGNED = /^-?\d+$/;
const SOURCE = /^[^,]{2,40}, .{3,}$/;
const HTTPS = /^https:\/\/\S+$/;

/** The largest value a Postgres `integer` column holds. */
const INT_MAX = 2147483647;

const cell = (r: Row, column: string): string => r[column] ?? "";
const whole = (s: string): number | null => (WHOLE.test(s) ? Number(s) : null);

/** Characters as Postgres's length() counts them: one outside the basic plane is one, not two. */
const chars = (s: string): number => [...s].length;
/** What Postgres's btrim() leaves: spaces come off both ends, and nothing else (a tab stays). */
function btrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === " ") start++;
  while (end > start && s[end - 1] === " ") end--;
  return s.slice(start, end);
}

/** Whether a seat takes in an area: the area itself, or one below it. `kenya` takes in them all. */
const covers = (seat: string, area: string): boolean =>
  seat === "kenya" || area === seat || area.startsWith(`${seat}/`);

/**
 * What is wrong with a row's source and source_url. A source also has to be three characters once
 * the spaces at its ends are trimmed, as the database wants, which spaces around the comma are not.
 */
function sourceProblems(r: Row): string[] {
  const out: string[] = [];
  if (!SOURCE.test(cell(r, "source")) || chars(btrim(cell(r, "source"))) < 3) {
    out.push(`source must read "Publisher, document title", not "${cell(r, "source")}"`);
  }
  const url = cell(r, "source_url");
  if (url !== "" && !HTTPS.test(url)) {
    out.push(`source_url must be an https link or blank, not "${url}"`);
  }
  return out;
}

/**
 * What is wrong with blocs.csv: a year with no election, a party twice, a bloc unnamed or
 * unsourced.
 */
export function checkBlocs(rows: Row[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const bad = (what: string) => problems.push(`blocs.csv row ${i + 2}: ${what}`);
    const year = cell(r, "year");
    const party = cell(r, "party");
    if (!ELECTION_YEARS.includes(year)) bad(`${year} is not an election year`);
    if (party === "" || party !== party.trim()) bad("a party must be named, with no stray spaces");
    if (cell(r, "bloc").trim() === "") bad(`${party} needs a bloc`);
    if (seen.has(`${year}|${party}`)) bad(`${party} in ${year} is listed twice`);
    seen.add(`${year}|${party}`);
    sourceProblems(r).forEach(bad);
  });
  return problems;
}

/** The columns of a candidate that two counties listing the same id have to agree on. */
const SHARED_COLUMNS = COLUMNS.candidates.filter((column) => column !== "id");

/**
 * What is wrong between counties. Every county lists the presidential candidates, and each
 * county's migration upserts the row, so the last one applied wins: a candidate that more than one
 * county lists has to read the same in each. Each county is compared with the first that lists the
 * candidate; a candidate a county lists twice is checkCounty's complaint, not a disagreement.
 */
export function checkShared(counties: { name: string; candidates: Row[] }[]): string[] {
  const problems: string[] = [];
  const first = new Map<string, { county: string; row: Row }>();
  for (const { name, candidates } of counties) {
    const listed = new Set<string>();
    for (const row of candidates) {
      const id = cell(row, "id");
      if (listed.has(id)) continue;
      listed.add(id);
      const before = first.get(id);
      if (before === undefined) {
        first.set(id, { county: name, row });
        continue;
      }
      for (const column of SHARED_COLUMNS) {
        const was = cell(before.row, column);
        const now = cell(row, column);
        if (was !== now) {
          problems.push(`${id}: ${column} is "${was}" in ${before.county} but "${now}" in ${name}`);
        }
      }
    }
  }
  return problems;
}

type Known = { row: number; difference: number; used: boolean };

/**
 * What is wrong with a county's files, one sentence each; empty when they pass. `blocs` is what
 * blocs.csv records: a candidate stands in the bloc recorded for their party in that election,
 * else as their party, and an independent (no party) as "Independent".
 */
export function checkCounty(c: County, wards: WardMaps, blocs: Blocs): string[] {
  const problems: string[] = [];
  const bad = (file: string, i: number, what: string): void => {
    problems.push(`${file}.csv row ${i + 2}: ${what}`);
  };

  /**
   * A figure that must be a whole number the database's integer holds, or blank when `required` is
   * false. One that is refused answers null, so that nothing is worked out from it.
   */
  const figure = (file: string, i: number, r: Row, column: string, required = false) => {
    const s = cell(r, column);
    if (s === "" && !required) return null;
    const n = whole(s);
    if (n === null) {
      bad(file, i, `${column} must be a whole number${required ? "" : " or blank"}, not "${s}"`);
    } else if (n > INT_MAX) {
      bad(file, i, `${column} must be a whole number up to ${INT_MAX}, not "${s}"`);
      return null;
    }
    return n;
  };
  /** A text cell may hold at most `max` characters, as the database counts them. */
  const atMost = (file: string, i: number, r: Row, column: string, max: number) => {
    const n = chars(btrim(cell(r, column)));
    if (n > max) bad(file, i, `${column} must be at most ${max} characters, not ${n}`);
  };
  const source = (file: string, i: number, r: Row) => {
    sourceProblems(r).forEach((what) => bad(file, i, what));
    atMost(file, i, r, "source", 200);
    atMost(file, i, r, "source_url", 500);
  };
  const unique = (file: string, rows: Row[], key: (r: Row) => string) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (seen.has(k)) bad(file, i, `${k} is listed twice`);
      seen.add(k);
    });
  };

  unique("areas", c.areas, (r) => cell(r, "key"));
  unique("candidates", c.candidates, (r) => cell(r, "id"));
  unique("results", c.results, (r) => `${cell(r, "candidate_id")} at ${cell(r, "area_key")}`);
  unique("turnout", c.turnout, (r) => `${cell(r, "election_id")} at ${cell(r, "area_key")}`);
  unique("register", c.register, (r) => `${cell(r, "year")} at ${cell(r, "area_key")}`);
  unique("population", c.population, (r) => `${cell(r, "area_key")} in ${cell(r, "year")}`);
  // A recorded difference is one per thing it is about, which is how the lookups below find it:
  // the candidate and county for county_sum, the election and area for cast_split.
  unique("known-differences", c.knownDifferences, (r) => {
    const about =
      cell(r, "check") === "cast_split" ? cell(r, "election_id") : cell(r, "candidate_id");
    return `${cell(r, "check")} for ${about} at ${cell(r, "area_key")}`;
  });

  // The differences IEBC itself published, kept on purpose. Each is the figure IEBC gives for the
  // whole, minus what its parts add up to:
  // - county_sum is the county's own figure minus its constituencies' sum (549 against 550 is 1).
  //   Its row names the candidate_id and the county's area_key, and leaves election_id blank.
  // - cast_split is cast minus valid minus rejected (500, 490 and 11 is -1). Its row names the
  //   election_id and area_key, and leaves candidate_id blank.
  const known = new Map<string, Known>();
  c.knownDifferences.forEach((r, i) => {
    const check = cell(r, "check");
    const difference = SIGNED.test(cell(r, "difference")) ? Number(cell(r, "difference")) : null;
    if (difference === null)
      return bad("known-differences", i, "difference must be a whole number");
    if (cell(r, "reason").trim().length < 10) {
      return bad("known-differences", i, "the reason must say why the figures differ");
    }
    if (check === "county_sum") {
      known.set(`county_sum|${cell(r, "candidate_id")}|${cell(r, "area_key")}`, {
        row: i,
        difference,
        used: false,
      });
    } else if (check === "cast_split") {
      known.set(`cast_split|${cell(r, "election_id")}|${cell(r, "area_key")}`, {
        row: i,
        difference,
        used: false,
      });
    } else {
      bad("known-differences", i, `check must be county_sum or cast_split, not "${check}"`);
    }
  });

  // Areas: keys, levels, parents, and the ward maps.
  const areaKeys = new Set(["kenya", ...c.areas.map((a) => cell(a, "key"))]);
  c.areas.forEach((a, i) => {
    const key = cell(a, "key");
    if (key === "kenya") {
      return bad("areas", i, "kenya is added by the schema, so it stays out of the files");
    }
    if (!KEY.test(key)) {
      return bad("areas", i, `"${key}" is not a key: lower-case parts joined by "/"`);
    }
    if (key.startsWith("kenya/")) {
      bad(
        "areas",
        i,
        `${key} starts with kenya, but keys do not begin with the country: ` +
          "a county's key is its own name",
      );
    }
    const level = levelOfKey(key);
    const parent = parentKey(key);
    if (cell(a, "level") !== level) {
      bad("areas", i, `${key} is a ${level}, but the file says ${cell(a, "level")}`);
    }
    if (cell(a, "parent") !== parent) {
      bad("areas", i, `${key}'s parent should be ${parent}, not ${cell(a, "parent")}`);
    } else if (parent !== null && !areaKeys.has(parent)) {
      bad("areas", i, `the parent ${parent} is not in the files`);
    }
    const name = cell(a, "name");
    if (chars(name) < 2 || name !== name.trim()) {
      bad("areas", i, `${key} needs a name of at least two letters with no stray spaces`);
    }
    atMost("areas", i, a, "name", 80);
    const code = cell(a, "iebc_code");
    if (code !== "" && !/^\d{1,4}$/.test(code)) {
      bad("areas", i, `the IEBC code ${code} must be one to four digits`);
    }
    if (level === "ward") {
      const [, constituency, slug = ""] = key.split("/");
      if (!wards.has(slug)) {
        bad(
          "areas",
          i,
          `${key} is not in a ward map under public/geo (no ward has the slug ${slug})`,
        );
      } else {
        const there = wards.get(slug);
        if (there !== null && there !== constituency) {
          bad(
            "areas",
            i,
            `${key} is under ${constituency}, but the ward map says ${slug} belongs to ${there}`,
          );
        }
      }
    }
  });

  // Candidates.
  const candidates = new Map(c.candidates.map((r) => [cell(r, "id"), r]));
  c.candidates.forEach((r, i) => {
    const election = cell(r, "election_id");
    const seat = cell(r, "seat");
    const name = cell(r, "name");
    if (!ELECTIONS.has(election)) {
      bad("candidates", i, `${election} is not an election the atlas holds`);
    } else if (areaKeys.has(seat)) {
      const race = election.split("-")[1] ?? "";
      if (levelOfKey(seat) !== SEAT_LEVEL[race]) {
        bad("candidates", i, `a ${race} seat is a ${SEAT_LEVEL[race]}, not ${seat}`);
      }
    }
    if (!areaKeys.has(seat)) bad("candidates", i, `the seat ${seat} is not in the files`);
    const id = `${election}/${seat}/${slugify(name)}`;
    if (cell(r, "id") !== id) bad("candidates", i, `the id should be ${id}`);
    if (chars(name) < 2 || name !== name.trim()) {
      bad("candidates", i, `${id} needs a name with no stray spaces`);
    }
    atMost("candidates", i, r, "name", 120);
    const party = cell(r, "party");
    if (party !== "" && btrim(party) === "") {
      bad("candidates", i, `${id}: the party is only spaces; leave it empty for an independent`);
    }
    atMost("candidates", i, r, "party", 120);
    const bloc =
      party === "" ? "Independent" : (blocs.get(`${election.slice(0, 4)}|${party}`) ?? party);
    if (cell(r, "bloc") !== bloc) {
      bad("candidates", i, `${id}: the bloc should be ${bloc}, not ${cell(r, "bloc")}`);
    } else {
      // The right bloc still has to fit its column.
      atMost("candidates", i, r, "bloc", 80);
    }
  });

  // Results, what the candidates' votes come to in each area, and who has a row where.
  const votesAt = new Map<string, number>();
  const placesOf = new Map<string, Set<string>>(); // election to the areas it has a row in
  const hasRow = new Set<string>(); // `${candidate_id}|${area_key}`
  c.results.forEach((r, i) => {
    const candidate = candidates.get(cell(r, "candidate_id"));
    const area = cell(r, "area_key");
    const votes = figure("results", i, r, "votes", true);
    if (!candidate) bad("results", i, `${cell(r, "candidate_id")} is not in candidates.csv`);
    if (!areaKeys.has(area)) bad("results", i, `${area} is not in the files`);
    if (candidate && areaKeys.has(area)) {
      const seat = cell(candidate, "seat");
      const election = cell(candidate, "election_id");
      if (!covers(seat, area)) bad("results", i, `${area} is outside the seat ${seat}`);
      hasRow.add(`${cell(r, "candidate_id")}|${area}`);
      placesOf.set(election, (placesOf.get(election) ?? new Set<string>()).add(area));
      if (votes !== null) {
        const k = `${election}|${area}`;
        votesAt.set(k, (votesAt.get(k) ?? 0) + votes);
      }
    }
  });

  // A missing row is not a zero. Where an election has votes, every candidate whose seat covers
  // that place has a row there, else their share would read as 0 when it is only not found; and
  // the election has a turnout row there, because that is where the votes' source is held.
  for (const [id, candidate] of candidates) {
    const election = cell(candidate, "election_id");
    for (const area of placesOf.get(election) ?? []) {
      if (covers(cell(candidate, "seat"), area) && !hasRow.has(`${id}|${area}`)) {
        problems.push(
          `${id}: no votes for ${area}, where ${election} has votes for other candidates`,
        );
      }
    }
  }
  const turnoutAt = new Set(
    c.turnout.map((t) => `${cell(t, "election_id")}|${cell(t, "area_key")}`),
  );
  for (const [election, areas] of placesOf) {
    for (const area of areas) {
      if (!turnoutAt.has(`${election}|${area}`)) {
        problems.push(`${election} ${area}: votes but no turnout row, so no source`);
      }
    }
  }

  // Constituencies add up to their county, for president and governor; an MP race has no
  // county total.
  const byCandidate = new Map<string, Row[]>();
  for (const r of c.results) {
    const id = cell(r, "candidate_id");
    byCandidate.set(id, [...(byCandidate.get(id) ?? []), r]);
  }
  for (const [id, rows] of byCandidate) {
    const candidate = candidates.get(id);
    const race = candidate ? (cell(candidate, "election_id").split("-")[1] ?? "") : "";
    if (race !== "president" && race !== "governor") continue;
    for (const countyRow of rows.filter((r) => levelOfKey(cell(r, "area_key")) === "county")) {
      const county = cell(countyRow, "area_key");
      const kids = rows.filter(
        (r) =>
          levelOfKey(cell(r, "area_key")) === "constituency" &&
          parentKey(cell(r, "area_key")) === county,
      );
      const want = whole(cell(countyRow, "votes"));
      if (kids.length === 0 || want === null) continue;
      const sum = kids.reduce((total, r) => total + (whole(cell(r, "votes")) ?? 0), 0);
      const gap = want - sum;
      const k = known.get(`county_sum|${id}|${county}`);
      if (gap !== 0 && (k === undefined || k.difference !== gap)) {
        problems.push(
          `${id}: its constituencies add up to ${sum} but ${county} says ${want}` +
            (k ? ` (the recorded difference of ${k.difference} does not close it)` : ""),
        );
      } else if (gap !== 0 && k) {
        k.used = true;
      }
    }
  }

  // Turnout.
  c.turnout.forEach((r, i) => {
    const election = cell(r, "election_id");
    const area = cell(r, "area_key");
    if (!ELECTIONS.has(election))
      bad("turnout", i, `${election} is not an election the atlas holds`);
    if (!areaKeys.has(area)) bad("turnout", i, `${area} is not in the files`);
    const registered = figure("turnout", i, r, "registered");
    const cast = figure("turnout", i, r, "cast_votes");
    const rejected = figure("turnout", i, r, "rejected_votes");
    const valid = figure("turnout", i, r, "valid_votes");
    if (cast !== null && registered !== null && cast > registered) {
      bad("turnout", i, `more votes cast than registered (${cast} against ${registered})`);
    }
    if (valid !== null && cast !== null && valid > cast) {
      bad("turnout", i, `more valid votes than votes cast (${valid} against ${cast})`);
    }
    if (valid !== null && rejected !== null && cast !== null) {
      const gap = cast - valid - rejected;
      const k = known.get(`cast_split|${election}|${area}`);
      if (gap !== 0 && (k === undefined || k.difference !== gap)) {
        bad(
          "turnout",
          i,
          `valid plus rejected (${valid + rejected}) differs from cast (${cast})` +
            (k ? `; the recorded difference of ${k.difference} does not close it` : ""),
        );
      } else if (gap !== 0 && k) {
        k.used = true;
      }
    }
    const limit = valid ?? cast;
    const limitName = valid !== null ? "valid votes" : "votes cast";
    const total = votesAt.get(`${election}|${area}`);
    if (limit !== null && total !== undefined && total > limit) {
      bad(
        "turnout",
        i,
        `the candidates' votes (${total}) pass the ${limitName} (${limit}), a share over 100%`,
      );
    }
    source("turnout", i, r);
  });

  // Registers.
  c.register.forEach((r, i) => {
    const year = cell(r, "year");
    if (!ELECTION_YEARS.includes(year)) bad("register", i, `${year} is not an election year`);
    if (!areaKeys.has(cell(r, "area_key")))
      bad("register", i, `${cell(r, "area_key")} is not in the files`);
    figure("register", i, r, "registered", true);
    source("register", i, r);
  });

  // Population estimates.
  c.population.forEach((r, i) => {
    if (!areaKeys.has(cell(r, "area_key")))
      bad("population", i, `${cell(r, "area_key")} is not in the files`);
    const year = figure("population", i, r, "year", true);
    // A year written with a leading zero (02025) is the same key as 2025 once loaded.
    if (year !== null && (year < 1990 || year > 2100 || String(year) !== cell(r, "year")))
      bad("population", i, `${cell(r, "year")} is not a year`);
    const total = figure("population", i, r, "total", true);
    const adults = figure("population", i, r, "adults", true);
    const young = figure("population", i, r, "young_adults", true);
    if (adults !== null && total !== null && adults > total) {
      bad("population", i, `adults (${adults}) pass the total (${total})`);
    }
    if (young !== null && adults !== null && young > adults) {
      bad("population", i, `young adults (${young}) pass the adults (${adults})`);
    }
    if (chars(cell(r, "method").trim()) < 10)
      bad("population", i, "the method must say how it was worked out");
    atMost("population", i, r, "method", 500);
    source("population", i, r);
  });

  // A recorded difference that nothing needs is out of date.
  for (const [key, k] of known) {
    if (!k.used) {
      bad(
        "known-differences",
        k.row,
        `this difference no longer matches anything: remove it (${key})`,
      );
    }
  }
  return problems;
}
