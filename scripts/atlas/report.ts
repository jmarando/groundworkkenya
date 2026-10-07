// The data report: how much of each election a county's files hold, and what is missing, in the
// words the user reads before any screen work. `report` is pure. Running this file prints the
// report and the checks' verdict for the counties named (default: every county under data/atlas):
//   npx tsx --tsconfig tsconfig.json scripts/atlas/report.ts nairobi nyeri

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { fmtVotes } from "../../src/lib/atlas/format";
import { levelOfKey } from "../../src/lib/atlas/scope";
import {
  blocMap,
  checkBlocs,
  checkCounty,
  listCounties,
  loadBlocs,
  loadCounty,
  loadWardMaps,
  type County,
  type Row,
} from "./checks";

const YEARS = [2013, 2017, 2022];
const ELECTIONS = YEARS.flatMap((y) =>
  ["president", "governor", "mp"].map((race) => `${y}-${race}`),
);

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
    const turnout = new Set(
      c.turnout.filter((r) => cell(r, "election_id") === election).map((r) => cell(r, "area_key")),
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
      .map(([bloc, n]) => `${bloc} ${n}`);
    return [`  ${election}: ${parts.join(", ")}`];
  });
  lines.push(
    "",
    "Blocs, by election (candidates):",
    ...(blocLines.length ? blocLines : ["  none"]),
  );

  const short = shortfalls(c);
  lines.push(
    "",
    short.length
      ? `Candidates' votes short of the valid votes:\n  ${short.join("\n  ")}`
      : "Candidates' votes short of the valid votes: none",
  );
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

function main(args: string[]) {
  const root = "data/atlas";
  const names = args.length ? args : listCounties(root);
  if (names.length === 0) {
    console.log("No counties under data/atlas yet.");
    return;
  }
  const wards = loadWardMaps("public/geo");
  const blocRows = loadBlocs(join(root, "blocs.csv"));
  const blocProblems = checkBlocs(blocRows);
  if (blocProblems.length) console.log(`blocs.csv: ${blocProblems.join("\n  ")}\n`);
  for (const name of names) {
    const county = loadCounty(join(root, name));
    console.log(report(county, name.charAt(0).toUpperCase() + name.slice(1)));
    const problems = checkCounty(county, wards, blocMap(blocRows));
    console.log(
      problems.length
        ? `\nChecks: ${plural(problems.length, "problem")}\n  ${problems.join("\n  ")}\n`
        : "\nChecks: all pass\n",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
