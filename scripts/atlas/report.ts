// The data report: how much of each election a county's files hold, and what is missing, in the
// words the user reads before any screen work. `report` is pure; `run` builds the whole output of
// the command and says whether everything passed. Running this file prints that output for the
// counties named (default: every county under data/atlas), from any directory, and exits 1 when
// blocs.csv, a county or the candidates the counties share have a problem, so that a failing
// verdict fails the command:
//   npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi nyeri

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fmtVotes } from "../../src/lib/atlas/format";
import { levelOfKey } from "../../src/lib/atlas/scope";
import {
  blocMap,
  checkBlocs,
  checkCounty,
  checkShared,
  listCounties,
  loadBlocs,
  loadCounty,
  loadWardMaps,
  type County,
  type Row,
  type WardMaps,
} from "./checks";

const YEARS = [2013, 2017, 2022];
const ELECTIONS = YEARS.flatMap((y) =>
  ["president", "governor", "mp"].map((race) => `${y}-${race}`),
);

/**
 * The heading of the line for candidates' votes short of the valid votes. It says what the line
 * covers: an area with valid votes and no candidate rows at all is not listed.
 */
const SHORT = "Candidates' votes short of the valid votes (where both are held):";

const cell = (r: Row, column: string): string => r[column] ?? "";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Where the candidates' votes fall short of the valid votes, which means a candidate is
 * missing.
 */
export function shortfalls(c: County): string[] {
  const election = new Map(c.candidates.map((r) => [cell(r, "id"), cell(r, "election_id")]));
  const counted = new Map<string, number>();
  for (const r of c.results) {
    const e = election.get(cell(r, "candidate_id"));
    if (e === undefined) continue;
    const key = `${e} ${cell(r, "area_key")}`;
    counted.set(key, (counted.get(key) ?? 0) + Number(cell(r, "votes")));
  }
  const out: string[] = [];
  for (const t of c.turnout) {
    const key = `${cell(t, "election_id")} ${cell(t, "area_key")}`;
    const got = counted.get(key);
    const valid = cell(t, "valid_votes");
    if (valid !== "" && got !== undefined && got < Number(valid)) {
      out.push(`${key}: candidates' votes ${fmtVotes(got)} of ${fmtVotes(Number(valid))} valid`);
    }
  }
  return out.sort();
}

/** What one county's files hold, election by election and year by year. */
export function report(c: County, name: string): string {
  const keys = c.areas.map((a) => cell(a, "key"));
  const at = (level: string) => keys.filter((k) => levelOfKey(k) === level);
  const counties = at("county");
  const constituencies = at("constituency");
  const wards = at("ward");
  const electionOf = new Map(c.candidates.map((r) => [cell(r, "id"), cell(r, "election_id")]));
  const nConstituencies = plural(constituencies.length, "constituency", "constituencies");
  const nWards = plural(wards.length, "ward");

  /** "N of M" for the constituencies among `areas`, and whether the county is there too. */
  const coverage = (areas: Set<string>, race: string) => {
    const base = `${constituencies.filter((k) => areas.has(k)).length} of ${constituencies.length}`;
    if (race === "mp") return base;
    return counties.some((k) => areas.has(k))
      ? `${base} and the county`
      : `${base}, not the county`;
  };

  const lines = [
    `${name}: ${plural(counties.length, "county", "counties")}, ${nConstituencies}, ${nWards}`,
    "",
    "Results and turnout, by election (constituencies with figures):",
  ];
  for (const election of ELECTIONS) {
    const race = election.split("-")[1] ?? "";
    const votes = new Set(
      c.results
        .filter((r) => electionOf.get(cell(r, "candidate_id")) === election)
        .map((r) => cell(r, "area_key")),
    );
    // Turnout is the votes cast over the voters registered: a row without both holds no figure.
    const turnout = new Set(
      c.turnout
        .filter(
          (r) =>
            cell(r, "election_id") === election &&
            cell(r, "cast_votes") !== "" &&
            cell(r, "registered") !== "",
        )
        .map((r) => cell(r, "area_key")),
    );
    lines.push(
      `  ${election}: votes in ${coverage(votes, race)}; turnout in ${coverage(turnout, race)}`,
    );
  }

  lines.push("", "Registered voters, by year:");
  for (const year of YEARS) {
    const have = new Set(
      c.register.filter((r) => cell(r, "year") === String(year)).map((r) => cell(r, "area_key")),
    );
    const w = wards.filter((k) => have.has(k)).length;
    const k = constituencies.filter((x) => have.has(x)).length;
    const county = counties.some((x) => have.has(x)) ? "and the county" : "not the county";
    lines.push(`  ${year}: ${w} of ${nWards}, ${k} of ${nConstituencies}, ${county}`);
  }

  lines.push("");
  const popYears = [...new Set(c.population.map((r) => cell(r, "year")))].sort();
  if (popYears.length === 0) lines.push("Population estimates: none");
  for (const year of popYears) {
    const have = new Set(
      c.population.filter((r) => cell(r, "year") === year).map((r) => cell(r, "area_key")),
    );
    lines.push(
      `Population estimates: ${wards.filter((k) => have.has(k)).length} of ${nWards} (${year})`,
    );
  }

  // The blocs the candidates stood in, so a coalition spelt two ways shows up here.
  const blocLines = ELECTIONS.flatMap((election) => {
    const counts = new Map<string, number>();
    for (const r of c.candidates) {
      if (cell(r, "election_id") !== election) continue;
      counts.set(cell(r, "bloc"), (counts.get(cell(r, "bloc")) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const parts = [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([bloc, n]) => `${bloc || "(blank)"} ${n}`);
    return [`  ${election}: ${parts.join(", ")}`];
  });
  lines.push(
    "",
    "Blocs, by election (candidates):",
    ...(blocLines.length ? blocLines : ["  none"]),
  );

  const short = shortfalls(c);
  lines.push("", short.length ? `${SHORT}\n  ${short.join("\n  ")}` : `${SHORT} none`);
  const known = c.knownDifferences.map((r) => {
    const where =
      cell(r, "check") === "county_sum"
        ? `${cell(r, "candidate_id")} ${cell(r, "area_key")}`
        : `${cell(r, "election_id")} ${cell(r, "area_key")}`;
    return `${cell(r, "check")} ${where}: ${cell(r, "difference")} (${cell(r, "reason")})`;
  });
  lines.push(
    known.length ? `Recorded differences:\n  ${known.join("\n  ")}` : "Recorded differences: none",
  );
  return lines.join("\n");
}

/** A folder, as against a file or nothing. */
const isFolder = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/**
 * What the heading calls a county: its own name, from the county's row in areas.csv, else its
 * folder's name with the first letter capitalised.
 */
function headingName(c: County, folder: string): string {
  const row = c.areas.find((a) => levelOfKey(cell(a, "key")) === "county");
  const name = row ? cell(row, "name") : "";
  return name !== "" ? name : folder.charAt(0).toUpperCase() + folder.slice(1);
}

/**
 * The whole output of the command for the counties named (every county under `root` when none is),
 * less its last newline, and whether everything passed: blocs.csv, each county's checks and the
 * candidates the counties share. A name that is no county folder is said so and fails; the other
 * names still run. The shared candidates are compared across every county under `root`, not only
 * the ones named, because each county's migration writes them.
 */
export function run(names: string[], root: string, wards: WardMaps): { text: string; ok: boolean } {
  const counties = listCounties(root);
  const asked = names.length ? names : counties;
  if (asked.length === 0) return { text: "No counties under data/atlas yet.", ok: true };
  const blocRows = loadBlocs(join(root, "blocs.csv"));
  const blocProblems = checkBlocs(blocRows);
  // Each county's files are read once, whether it is named or only compared.
  const loaded = new Map<string, County>();
  const load = (name: string): County => {
    let county = loaded.get(name);
    if (county === undefined) {
      county = loadCounty(join(root, name));
      loaded.set(name, county);
    }
    return county;
  };
  // One piece for each thing the command prints, a newline between them.
  const out: string[] = [];
  let ok = blocProblems.length === 0;
  if (blocProblems.length) out.push(`blocs.csv: ${blocProblems.join("\n  ")}\n`);
  for (const name of asked) {
    if (!isFolder(join(root, name))) {
      out.push(`no county folder data/atlas/${name}; counties: ${counties.join(", ") || "none"}`);
      ok = false;
      continue;
    }
    const county = load(name);
    out.push(report(county, headingName(county, name)));
    const problems = checkCounty(county, wards, blocMap(blocRows));
    out.push(
      problems.length
        ? `\nChecks: ${plural(problems.length, "problem")}\n  ${problems.join("\n  ")}\n`
        : "\nChecks: all pass\n",
    );
    if (problems.length) ok = false;
  }
  const shared = checkShared(counties.map((name) => ({ name, candidates: load(name).candidates })));
  if (shared.length) {
    out.push(
      `\nShared candidates: ${plural(shared.length, "problem")}\n  ${shared.join("\n  ")}\n`,
    );
    ok = false;
  }
  return { text: out.join("\n"), ok };
}

const USAGE = [
  "usage: report.ts [county ...]",
  "Prints what each county's files hold and what is missing, then the checks' verdict.",
].join("\n");

function main(args: string[]) {
  // `report.ts nairobi | head -1` closes the pipe before the end: that is not an error.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code !== "EPIPE") throw e;
  });
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  // The data and the ward maps are found from this file, so the command works from any directory.
  const here = dirname(fileURLToPath(import.meta.url));
  const wards = loadWardMaps(join(here, "../../public/geo"));
  const { text, ok } = run(args, join(here, "../../data/atlas"), wards);
  process.stdout.write(`${text}\n`);
  process.exitCode = ok ? 0 : 1;
}

/** True when this file is the one being run, also when it is reached through a symlink. */
function isEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false; // an entry that is no file on disk (stdin, say) is not this one
  }
}

if (isEntry()) main(process.argv.slice(2));
