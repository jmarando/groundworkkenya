// The 2022 presidential result by county, and the regions the counties are
// grouped into, read from data/kenya (see its README for where each number
// comes from). Pure. The Path to State House engine starts from it:
// docs/superpowers/plans/2026-10-17-path-to-state-house.md.

import { parseCSV } from "@/lib/csv";

/** A set of counties, as analysts group them. A region describes places, never people. */
export type Region = { id: string; name: string; note: string };

export type County = {
  /** IEBC's: "001" to "047". */
  code: string;
  name: string;
  /** A region's id. */
  region: string;
  /** 2022, as IEBC declared it. */
  registered: number;
  valid: number;
  rejected: number;
  raila: number;
  ruto: number;
  /** August 2017, for context only. */
  uhuru2017: number;
  raila2017: number;
  valid2017: number;
};
/** The votes outside every county: the diaspora's. */
export type Outside = Pick<County, "registered" | "valid" | "rejected" | "raila" | "ruto">;
export type Kenya = { regions: Region[]; counties: County[]; outside: Outside };

const COUNTIES = 47;
const REGION_COLUMNS = ["id", "name", "note"];
const NUMBERS = ["registered", "valid", "rejected", "raila", "ruto"] as const;
const NUMBERS_2017 = ["uhuru_2017", "raila_2017", "valid_2017"] as const;
const COUNTY_COLUMNS = ["code", "county", "region", ...NUMBERS, ...NUMBERS_2017];

type Row = Record<string, string>;

/** The rows of a CSV file by column name; a missing column is a problem and no rows. */
function rowsOf(file: string, text: string, columns: string[], problems: string[]): Row[] {
  const [head = [], ...body] = parseCSV(text).map((r) => r.map((c) => c.trim()));
  const missing = columns.filter((c) => !head.includes(c));
  for (const c of missing) problems.push(`${file} has no column "${c}"`);
  if (missing.length) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * Reads the region table and the county table. A bad file is refused with one
 * Error that names every problem, one to a line.
 */
export function parseKenya(regionsCsv: string, countiesCsv: string): Kenya {
  const problems: string[] = [];
  const regions: Region[] = [];
  for (const r of rowsOf("regions.csv", regionsCsv, REGION_COLUMNS, problems)) {
    if (regions.some((x) => x.id === r["id"]))
      problems.push(`regions.csv: "${r["id"]}" is listed twice`);
    else regions.push({ id: r["id"] ?? "", name: r["name"] ?? "", note: r["note"] ?? "" });
  }

  const counties: County[] = [];
  const outside: Outside[] = [];
  const names = new Set<string>();
  const codes = new Set<string>();
  for (const r of rowsOf("counties.csv", countiesCsv, COUNTY_COLUMNS, problems)) {
    const who = r["county"] ?? "";
    let ok = true;
    const whole = (column: string): number => {
      const v = r[column] ?? "";
      if (/^\d+$/.test(v)) return Number(v);
      problems.push(`${who}: ${column} is not a whole number (${v})`);
      ok = false;
      return 0;
    };
    const n = Object.fromEntries(NUMBERS.map((c) => [c, whole(c)])) as Record<
      (typeof NUMBERS)[number],
      number
    >;
    if (!r["region"]) {
      outside.push(n);
      continue;
    }
    const m = Object.fromEntries(NUMBERS_2017.map((c) => [c, whole(c)])) as Record<
      (typeof NUMBERS_2017)[number],
      number
    >;
    if (!regions.some((x) => x.id === r["region"]))
      problems.push(`${who}: region "${r["region"]}" is not in regions.csv`);
    if (names.has(who)) problems.push(`${who} is listed twice`);
    if (codes.has(r["code"] ?? "")) problems.push(`code ${r["code"]} is used twice`);
    names.add(who);
    codes.add(r["code"] ?? "");
    if (ok) {
      // Turnout is worked out as cast over registered: neither may be nothing.
      if (n.registered === 0) problems.push(`${who}: nobody is registered`);
      if (n.valid + n.rejected === 0) problems.push(`${who}: no votes were cast`);
      if (n.raila + n.ruto > n.valid)
        problems.push(`${who}: Raila and Ruto have more votes than were valid`);
      if (n.valid + n.rejected > n.registered)
        problems.push(`${who}: more votes were cast than people registered`);
      if (m.uhuru_2017 + m.raila_2017 > m.valid_2017)
        problems.push(`${who}: Uhuru and Raila have more votes than were valid in 2017`);
    }
    counties.push({
      code: r["code"] ?? "",
      name: who,
      region: r["region"],
      ...n,
      uhuru2017: m.uhuru_2017,
      raila2017: m.raila_2017,
      valid2017: m.valid_2017,
    });
  }

  if (counties.length !== COUNTIES)
    problems.push(`counties.csv: expected ${COUNTIES} counties, found ${counties.length}`);
  if (outside.length !== 1)
    problems.push(
      `counties.csv: expected one diaspora row (a blank region), found ${outside.length}`,
    );
  for (const g of regions)
    if (!counties.some((c) => c.region === g.id))
      problems.push(`region "${g.name}" has no counties`);

  if (problems.length) throw new Error(problems.join("\n"));
  return { regions, counties, outside: outside[0]! };
}
