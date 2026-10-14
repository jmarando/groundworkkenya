// Checks for writing data/stations as SQL (src/lib/stations/sql.ts): names quoted, positions
// where OpenStreetMap gave one, each ward's voters its centres', and the count the migration
// checks. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/stations-sql.test.ts

import { stationsMigration, stationsSql } from "@/lib/stations/sql";

let pass = 0;
let fail = 0;

function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

const sql = stationsSql([
  {
    mapArea: "nairobi",
    centres: [
      {
        iebcCode: "0472751371002",
        code: "PS-0001",
        name: "ST GEORGE'S PRIMARY SCHOOL",
        ward: "kilimani",
        streams: 8,
        registered: 5595,
      },
      {
        iebcCode: "0472751371003",
        code: "PS-0002",
        name: "KILIMANI PRIMARY SCHOOL",
        ward: "kilimani",
        streams: 2,
        registered: 1000,
      },
    ],
    positions: [
      {
        iebcCode: "0472751371002",
        lat: -1.2833761,
        lng: 36.7957484,
        placedBy: "osm",
        osmId: "node/1",
        osmName: "St. George's",
      },
    ],
    boxes: [{ slug: "kilimani", box: { west: 36.77, south: -1.31, east: 36.8, north: -1.28 } }],
  },
]);

eq("an apostrophe doubled", sql.includes("'ST GEORGE''S PRIMARY SCHOOL'"), true);
eq(
  "a centre with a position, rounded to a millionth of a degree",
  sql.includes(
    "('0472751371002', 'PS-0001', 'ST GEORGE''S PRIMARY SCHOOL', 'kilimani', 8, 5595, -1.283376, 36.795748, 'osm')",
  ),
  true,
);
eq(
  "a centre without one",
  sql.includes(
    "('0472751371003', 'PS-0002', 'KILIMANI PRIMARY SCHOOL', 'kilimani', 2, 1000, null, null, null)",
  ),
  true,
);
eq(
  "the ward's box, and its voters its centres'",
  sql.includes("('kilimani', 36.77, -1.31, 36.8, -1.28, 6595)"),
  true,
);
eq("for every campaign with the map area", sql.match(/c\.map_area = 'nairobi'/g)?.length, 2);
eq("a count of what loaded", sql.includes("(values ('nairobi', 2)) as e(map_area, want)"), true);
eq("schema 27", sql.includes("as $$ select 27 $$;"), true);
eq(
  "the migration file starts with what wrote it",
  stationsMigration([]).split("\n")[3],
  "-- Written by scripts/stations/build-sql.ts: change the CSV files and run it again, not this file.",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
