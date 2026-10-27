// The campaign spending limits IEBC set for the general election of 10 August 2027, in Kenya Gazette
// Notice No. 12251 (a special issue of 7 August 2026), read from data/kenya, whose README says how
// the schedules were copied and checked. Pure.

import type { Source } from "@/lib/brief";
import { PRESS_RELEASE } from "@/lib/election-dates";
import type { Statement } from "@/lib/guides";
import { rowsOf } from "@/lib/kenya";

export const NOTICE: Source = {
  label: "Kenya Gazette Notice No. 12251, special issue of 7 August 2026 (IEBC)",
  url: "https://www.iebc.or.ke/uploads/resources/QUTuQXad27.pdf",
  date: "2026-08-07",
};

/** First Schedule: a presidential candidate, across the country. */
export const PRESIDENT_KES = 6_112_543_133;

/** Fifth Schedule: what political parties may spend, item by item. */
export const PARTY_ITEMS: { item: string; kes: number }[] = [
  { item: "Venues", kes: 375_052_688 },
  { item: "Publicity materials", kes: 1_066_714_464 },
  { item: "Advertising and media", kes: 2_517_509_489 },
  { item: "Campaign personnel", kes: 332_922_614 },
  { item: "Election agents", kes: 2_081_162_296 },
  { item: "Transportation", kes: 16_126_632_035 },
  { item: "Communication", kes: 134_230_217 },
  { item: "Nomination fees and charges", kes: 213_818_044 },
  { item: "Security", kes: 285_090_725 },
  { item: "Accommodation", kes: 24_945_438 },
  { item: "Administrative cost", kes: 1_292_094_521 },
];
export const PARTY_TOTAL_KES = 24_450_172_531;

/** Sixth Schedule: the fixed cost each limit starts from, before population and land area. */
export const FIXED_KES = { ward: 3_225_105, constituency: 10_795_432, county: 14_406_545 };

/**
 * The lowest and highest of the Fourth Schedule's 1,450 ward limits. The site doesn't load the
 * ward file for two numbers; npm test checks these against it.
 */
export const WARD_RANGE = {
  low: { ward: "Shella", county: "Lamu", kes: 3_486_686 },
  high: { ward: "Turbi", county: "Marsabit", kes: 22_095_682 },
};

/** A whole number of shillings with its thousands separators: 6112543133 is "6,112,543,133". */
export const kes = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** What the notice says campaign spending is: the items its limits apply to. */
export const AUTHORIZED_ITEMS = [
  "Venues where campaigns may be undertaken",
  "Publicity material for campaigns",
  "Advertising for the campaigns",
  "Campaign personnel",
  "Transportation in respect of campaign activities",
  "Any other justifiable expenses, including communication, nomination fees, security, accommodation and administrative costs",
];

export const STAR_ORDER: Source = {
  label: "The Star: MPs accuse IEBC of sidelining them on campaign financing",
  url: "https://www.the-star.co.ke/news/2026-10-22-mps-accuse-iebc-of-sidelining-them-on-campaign-financing",
  date: "2026-10-22",
};
export const NATION_PARTIES: Source = {
  label: "Daily Nation: Why parties are opposed to IEBC rules on campaign billions",
  url: "https://nation.africa/kenya/news/politics/why-parties-are-opposed-to-iebc-rules-on-campaign-billions-5642192",
  date: "2026-10-23",
};
export const STANDARD_SUED: Source = {
  label: "The Standard: IEBC sued over 2027 campaign finance regulations",
  url: "https://thestandard.ke/business/national/article/2001556248/iebc-sued-over-2027-campaign-finance-regulations",
  date: "2026-08-26",
};

/** What is on record about the court challenge to the rules and the limits. */
export const CHALLENGE: Statement[] = [
  {
    says: "IEBC says that on 7 August 2026 it gazetted the Election Campaign Financing Regulations, 2026 and the contribution and spending limits for the 2027 general election.",
    ref: "Paragraph 40",
    from: PRESS_RELEASE,
  },
  {
    says: "The Standard reported on 26 August 2026 that IEBC had been sued over the 2027 campaign finance regulations. We could not read the body of that article.",
    ref: "Article of 26 August 2026",
    from: STANDARD_SUED,
  },
  {
    says: "The Star reported on 22 October 2026 that the High Court issued a stay order on 18 September 2026, pending an inter-partes hearing, and that MPs were told of a court order stopping Parliament from considering the regulations.",
    ref: "Article of 22 October 2026",
    from: STAR_ORDER,
  },
  {
    says: "The Nation reported on 23 October 2026 that two parties, the Republican Liberty Party and the Grassroots Development Party, are challenging the rules in court, and that the court has temporarily stopped implementation of the new expenditure limits pending the petition. The article is behind a paywall and we could not confirm this wording.",
    ref: "Article of 23 October 2026",
    from: NATION_PARTIES,
  },
];

export type Limit = {
  /** IEBC's code: "001" to "047" for a county, "001" to "290" for a constituency, "0001" to "1450" for a ward. */
  code: string;
  name: string;
  /** The code of the county it is in (a county's own code). */
  county: string;
  population: number;
  areaKm2: number;
  kes: number;
};
export type Limits = { counties: Limit[]; constituencies: Limit[] };

/** One schedule's rows, every code from 1 to `size` once; `counties` checks where each row is. */
function readSchedule(
  file: string,
  csv: string,
  nameColumn: string,
  size: number,
  digits: number,
  counties: Set<string> | null,
  problems: string[],
): Limit[] {
  const before = problems.length;
  const columns = ["code", nameColumn, "population", "area_km2", "limit_kes"];
  const rows = rowsOf(file, csv, counties ? [...columns, "county"] : columns, problems);
  if (problems.length > before) return [];

  const out: Limit[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = r[nameColumn] ?? "";
    const code = r["code"] ?? "";
    let ok = true;
    const whole = (column: string): number => {
      const v = r[column] ?? "";
      if (/^\d+$/.test(v)) return Number(v);
      problems.push(`${file}: ${name} has a ${column} that is not a whole number ("${v}")`);
      ok = false;
      return 0;
    };
    const population = whole("population");
    const kes = whole("limit_kes");
    const area = r["area_km2"] ?? "";
    if (!/^\d+(\.\d+)?$/.test(area)) {
      problems.push(`${file}: ${name} has an area_km2 that is not a number ("${area}")`);
      ok = false;
    }
    if (!name) {
      problems.push(`${file}: code ${code} has no name`);
      ok = false;
    }
    if (seen.has(code)) problems.push(`${file}: code ${code} is listed twice`);
    seen.add(code);
    const county = counties ? (r["county"] ?? "") : code;
    if (counties && !counties.has(county)) {
      problems.push(`${file}: ${name} is in county ${county}, which is not in the county file`);
      ok = false;
    }
    if (ok) out.push({ code, name, county, population, areaKm2: Number(area), kes });
  }
  for (let i = 1; i <= size; i++) {
    const code = String(i).padStart(digits, "0");
    if (!seen.has(code)) problems.push(`${file}: code ${code} is missing`);
  }
  if (rows.length !== size) problems.push(`${file}: ${rows.length} rows, not ${size}`);
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Reads the county and constituency limits. A bad file is refused with one Error that names every
 * problem, one to a line.
 */
export function parseLimits(countiesCsv: string, constituenciesCsv: string): Limits {
  const problems: string[] = [];
  const counties = readSchedule(
    "limits-2027-counties.csv",
    countiesCsv,
    "county",
    47,
    3,
    null,
    problems,
  );
  const known = problems.length ? null : new Set(counties.map((c) => c.code));
  const constituencies = readSchedule(
    "limits-2027-constituencies.csv",
    constituenciesCsv,
    "constituency",
    290,
    3,
    known ?? new Set(["*"]),
    known ? problems : [],
  );
  if (problems.length) throw new Error(problems.join("\n"));
  return { counties, constituencies };
}

/** Reads the ward limits, refusing a bad file the same way. */
export function parseWards(wardsCsv: string, counties: Limit[]): Limit[] {
  const problems: string[] = [];
  const known = new Set(counties.map((c) => c.code));
  const wards = readSchedule("limits-2027-wards.csv", wardsCsv, "ward", 1450, 4, known, problems);
  if (problems.length) throw new Error(problems.join("\n"));
  return wards;
}

/** The rows with the lowest and highest limits (the first, where two are equal). */
export function rangeOf(rows: Limit[]): { low: Limit; high: Limit } {
  let low = rows[0]!;
  let high = rows[0]!;
  for (const r of rows) {
    if (r.kes < low.kes) low = r;
    if (r.kes > high.kes) high = r;
  }
  return { low, high };
}
