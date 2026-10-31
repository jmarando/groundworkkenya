// Places the centres in data/stations from OpenStreetMap's schools, colleges and universities
// (© OpenStreetMap contributors, ODbL), writing data/stations/<area>-positions.csv: the
// centres whose position was found, and whether by an exact name or a close one. Run from the
// repository root, after scripts/stations/register.ts:
//   npx tsx --tsconfig tsconfig.json scripts/stations/positions.ts              asks Overpass
//   npx tsx --tsconfig tsconfig.json scripts/stations/positions.ts <reply.json> a saved reply
// AREAS=kuria-east,… asks about and writes only those areas and leaves the other files as they are.
import { readFileSync, writeFileSync } from "node:fs";

import { toCSV } from "@/lib/csv";
import { MAP_AREAS } from "@/lib/map-areas";
import { overpassSchools, placeCentre } from "@/lib/stations/match";

import { areaShapes, STATION_AREAS } from "./areas";
import { readCentres } from "./read";

/** About 2 km at the equator: a school that far outside a ward still counts. */
const MARGIN = 0.02;

const only = process.env["AREAS"]?.split(",");
const AREAS = STATION_AREAS.filter((a) => !only || only.includes(a.id));

function query(): string {
  const boxes = AREAS.map((a) => {
    const [w, s, e, n] = MAP_AREAS.find((m) => m.id === a.id)!.bounds;
    return `(${s - MARGIN},${w - MARGIN},${n + MARGIN},${e + MARGIN})`;
  });
  const kinds = '["amenity"~"^(school|college|university|kindergarten)$"]';
  return `[out:json][timeout:180];(${boxes.map((b) => `nwr${kinds}${b};`).join("")});out center tags;`;
}

async function reply(path: string | undefined): Promise<unknown> {
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "groundwork-stations/1.0",
    },
    body: new URLSearchParams({ data: query() }),
  });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  return res.json();
}

const schools = overpassSchools(await reply(process.argv[2]));
if (!schools.length) {
  console.error("No schools in the reply.");
  process.exit(1);
}
const round = (x: number) => Math.round(x * 1e6) / 1e6;
for (const area of AREAS) {
  const shapes = new Map(areaShapes(area).map((s) => [s.slug, s.polygons]));
  const rows: unknown[][] = [];
  for (const c of readCentres(area)) {
    const placed = placeCentre(c.name, shapes.get(c.ward)!, schools);
    if (placed)
      rows.push([
        c.iebcCode,
        round(placed.at[1]),
        round(placed.at[0]),
        placed.placedBy,
        placed.osmId,
        placed.osmName,
      ]);
  }
  const out = `data/stations/${area.id}-positions.csv`;
  writeFileSync(
    out,
    toCSV(["iebc_code", "lat", "lng", "placed_by", "osm_id", "osm_name"], rows).replace(
      /\r\n/g,
      "\n",
    ) + "\n",
  );
  const close = rows.filter((r) => r[3] === "osm-close").length;
  console.log(
    `${out}: ${rows.length - close} placed, ${close} close names, of ${readCentres(area).length} centres`,
  );
}
