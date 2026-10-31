// The map areas whose polling centres are kept in data/stations: where each one's streams are
// on IEBC's register, its ward shapes, and the atlas file holding its wards' registered voters.
import { readFileSync } from "node:fs";

import { parseCSV } from "@/lib/csv";
import { wardShapes, type WardShape } from "@/lib/geo";

export type StationArea = {
  /** data/stations/<id>.csv, and the map area's id (src/lib/map-areas.ts). */
  id: string;
  /** The atlas key of the map area, as campaigns.map_area holds it. */
  mapArea: string;
  /** The first digits of its streams' codes: a county's 3, a constituency's 6 or a ward's 10. */
  prefix: string;
  wards: string;
  atlas: string;
  /** The migration that loads it, for an area added after schema 27's (supabase/migrations). */
  migration?: string;
};

export const STATION_AREAS: StationArea[] = [
  {
    id: "nairobi",
    mapArea: "nairobi",
    prefix: "047",
    wards: "public/geo/nairobi-wards.json",
    atlas: "data/atlas/nairobi/register.csv",
  },
  {
    id: "mathira",
    mapArea: "nyeri/mathira",
    prefix: "019096",
    wards: "public/geo/mathira-wards.json",
    atlas: "data/atlas/nyeri/register.csv",
  },
  {
    id: "githunguri",
    mapArea: "kiambu/githunguri",
    prefix: "022116",
    wards: "public/geo/githunguri-wards.json",
    atlas: "data/atlas/kiambu/register.csv",
    migration: "20261019090300_polling_centres_githunguri_athwana.sql",
  },
  {
    id: "kuria-east",
    mapArea: "migori/kuria-east",
    prefix: "044260",
    wards: "public/geo/kuria-east-wards.json",
    atlas: "data/atlas/migori/register.csv",
    migration: "20261109090300_polling_centres_kuria_east.sql",
  },
  {
    // A ward campaign: the ward's own 10 digits (county, constituency, ward).
    id: "athwana",
    mapArea: "meru/tigania-west/athwana",
    prefix: "0120540266",
    wards: "public/geo/athwana-wards.json",
    atlas: "data/atlas/meru/register.csv",
    migration: "20261019090300_polling_centres_githunguri_athwana.sql",
  },
];

/** The area's ward shapes, from its ward file. */
export const areaShapes = (a: StationArea): WardShape[] =>
  wardShapes(JSON.parse(readFileSync(a.wards, "utf8")));

/** The registered voters the atlas holds for each of the area's wards, by slug. */
export function atlasRegistered(a: StationArea): Map<string, number> {
  const [head, ...rows] = parseCSV(readFileSync(a.atlas, "utf8"));
  const area = head!.indexOf("area");
  const registered = head!.indexOf("registered");
  const year = head!.indexOf("year");
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = r[area] ?? "";
    // A ward's key is three parts under its county (nairobi/<constituency>/<ward>); a ward
    // campaign's map area is the ward itself.
    const ward =
      a.mapArea.split("/").length === 3 ? key === a.mapArea : key.startsWith(`${a.mapArea}/`);
    if (r[year] !== "2022" || !ward || key.split("/").length !== 3) continue;
    out.set(key.split("/")[2]!, Number(r[registered]));
  }
  return out;
}
