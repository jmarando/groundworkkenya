// Reads data/stations back for the migration script and the data test.
import { existsSync, readFileSync } from "node:fs";

import { parseCSV } from "@/lib/csv";
import type { RegisterCentre } from "@/lib/stations/register";

import type { StationArea } from "./areas";

/** The area's centres from data/stations/<id>.csv. */
export function readCentres(area: StationArea): RegisterCentre[] {
  const [head, ...rows] = parseCSV(readFileSync(`data/stations/${area.id}.csv`, "utf8"));
  const at = (name: string) => head!.indexOf(name);
  return rows.map((r) => ({
    iebcCode: r[at("iebc_code")]!,
    code: r[at("code")]!,
    name: r[at("name")]!,
    ward: r[at("ward")]!,
    streams: Number(r[at("streams")]),
    registered: Number(r[at("registered")]),
  }));
}

export const hasCentres = (area: StationArea): boolean =>
  existsSync(`data/stations/${area.id}.csv`);
