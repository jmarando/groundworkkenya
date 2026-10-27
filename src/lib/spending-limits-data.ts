// The 2027 spending limits as the guide reads them: the three files in data/kenya, parsed once.
// (tests/spending-limits.test.ts reads the same files with readFileSync, since the test runner does
// not understand ?raw imports.)

import constituenciesCsv from "../../data/kenya/limits-2027-constituencies.csv?raw";
import countiesCsv from "../../data/kenya/limits-2027-counties.csv?raw";
import wardsCsv from "../../data/kenya/limits-2027-wards.csv?raw";
import { parseLimits, parseWards } from "@/lib/spending-limits";

const limits = parseLimits(countiesCsv, constituenciesCsv);

export const COUNTIES = limits.counties;
export const CONSTITUENCIES = limits.constituencies;
export const WARDS = parseWards(wardsCsv, limits.counties);
