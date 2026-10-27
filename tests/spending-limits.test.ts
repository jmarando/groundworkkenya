// Checks for the 2027 spending limits behind /guides/2027-campaign-spending-limits: the files hold
// every county, constituency and ward of Kenya Gazette Notice 12251 once, each constituency sits in
// the county its population adds up to, the figures the guide quotes are the files' own, and a bad
// file is refused with every problem named. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/spending-limits.test.ts

import { readFileSync } from "node:fs";

import { parseCSV } from "@/lib/csv";
import {
  PARTY_ITEMS,
  PARTY_TOTAL_KES,
  WARD_RANGE,
  parseLimits,
  parseWards,
  rangeOf,
} from "@/lib/spending-limits";

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

const countiesCsv = readFileSync("data/kenya/limits-2027-counties.csv", "utf8");
const constituenciesCsv = readFileSync("data/kenya/limits-2027-constituencies.csv", "utf8");
const wardsCsv = readFileSync("data/kenya/limits-2027-wards.csv", "utf8");
const limits = parseLimits(countiesCsv, constituenciesCsv);
const wards = parseWards(wardsCsv, limits.counties);

eq("every county", limits.counties.length, 47);
eq("every constituency", limits.constituencies.length, 290);
eq("every ward", wards.length, 1450);

// The counties are IEBC's 47, in IEBC's order, named as data/kenya/counties.csv names them.
const [head = [], ...rows] = parseCSV(readFileSync("data/kenya/counties.csv", "utf8"));
const named = rows
  .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])))
  .filter((r) => r["code"] !== "DIA")
  .map((r) => `${r["code"]} ${r["county"]}`);
eq(
  "counties as counties.csv has them",
  limits.counties.map((c) => `${c.code} ${c.name}`),
  named,
);

// The notice lists constituencies without their counties. Each county's constituencies add up to
// its population, give or take the notice's own rounding, which is what places each one.
for (const c of limits.counties) {
  const own = limits.constituencies.filter((x) => x.county === c.code);
  const sum = own.reduce((t, x) => t + x.population, 0);
  if (own.length === 0 || Math.abs(sum - c.population) > 10) {
    eq(`${c.name}: its constituencies add up to its population`, sum, c.population);
  } else pass++;
}
eq(
  "every ward is in a county",
  wards.every((w) => limits.counties.some((c) => c.code === w.county)),
  true,
);

// The same holds for wards. The notice prints a county's name beside its wards, but at a page break
// the name can sit a few rows below the block's first row, which put eight wards in the wrong county
// until each county's wards were added up: so the sums, not the printed names, place a ward.
for (const c of limits.counties) {
  const own = wards.filter((w) => w.county === c.code);
  const sum = own.reduce((t, w) => t + w.population, 0);
  if (own.length === 0 || Math.abs(sum - c.population) > 10) {
    eq(`${c.name}: its wards add up to its population`, sum, c.population);
  } else pass++;
}

// Figures quoted elsewhere: the demo campaigns' limits, and the ranges the guide states.
const named1 = (rows: { name: string; kes: number }[], name: string) =>
  rows.find((r) => r.name === name)?.kes;
eq("Githunguri, MP", named1(limits.constituencies, "Githunguri"), 20_560_428);
eq("Athwana, MCA", named1(wards, "Athwana"), 4_224_052);
eq("Roysambu, MCA", named1(wards, "Roysambu"), 6_699_179);
eq("Nairobi, county seats", named1(limits.counties, "Nairobi"), 181_312_885);
const wardRange = rangeOf(wards);
const countyOf = (code: string) => limits.counties.find((c) => c.code === code)?.name;
eq("the ward range the guide states", WARD_RANGE, {
  low: { ward: wardRange.low.name, county: countyOf(wardRange.low.county), kes: wardRange.low.kes },
  high: {
    ward: wardRange.high.name,
    county: countyOf(wardRange.high.county),
    kes: wardRange.high.kes,
  },
});
eq(
  "the parties' items add up to their total",
  PARTY_ITEMS.reduce((t, p) => t + p.kes, 0),
  PARTY_TOTAL_KES,
);

// A bad file is refused, every problem named.
const refused = (run: () => unknown) => {
  try {
    run();
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};
eq(
  "a missing column",
  refused(() => parseLimits(countiesCsv.replace("limit_kes", "limit"), constituenciesCsv)),
  'limits-2027-counties.csv has no column "limit_kes"',
);
eq(
  "a constituency in no county",
  refused(() =>
    parseLimits(countiesCsv, constituenciesCsv.replace("116,Githunguri,022", "116,Githunguri,099")),
  ),
  "limits-2027-constituencies.csv: Githunguri is in county 099, which is not in the county file",
);
eq(
  "a limit that is not a whole number",
  refused(() => parseLimits(countiesCsv.replace("60967580", "60967580.5"), constituenciesCsv)),
  'limits-2027-counties.csv: Mombasa has a limit_kes that is not a whole number ("60967580.5")',
);
eq(
  "a row missing, and every problem named",
  refused(() =>
    parseLimits(
      countiesCsv.replace(/\n047,Nairobi,[^\n]*/, ""),
      constituenciesCsv.replace("116,Githunguri", "117,Githunguri"),
    ),
  ).split("\n").length >= 2,
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
