// Checks data/stations, the polling centres read from IEBC's 2022 register, before they become
// a migration: every ward's centres add up to the voters the atlas holds for it, codes run
// PS-0001 upwards in IEBC's order, and every centre is in one of the area's wards. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/stations-data.test.ts

import { checkRegistered } from "@/lib/stations/register";

import { areaShapes, atlasRegistered, STATION_AREAS } from "../scripts/stations/areas";
import { readCentres } from "../scripts/stations/read";

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

const WANT: Record<string, { centres: number; streams: number; voters: number }> = {
  nairobi: { centres: 378, streams: 3643, voters: 2415310 },
  mathira: { centres: 109, streams: 201, voters: 104492 },
};

for (const area of STATION_AREAS) {
  const centres = readCentres(area);
  const want = WANT[area.id]!;
  eq(
    `${area.id}: centres, streams and voters`,
    {
      centres: centres.length,
      streams: centres.reduce((t, c) => t + c.streams, 0),
      voters: centres.reduce((t, c) => t + c.registered, 0),
    },
    want,
  );
  eq(
    `${area.id}: every ward adds up to the atlas`,
    checkRegistered(centres, atlasRegistered(area)),
    [],
  );
  eq(
    `${area.id}: codes PS-0001 upwards in IEBC's order`,
    centres.every(
      (c, i) =>
        c.code === `PS-${String(i + 1).padStart(4, "0")}` &&
        (i === 0 || centres[i - 1]!.iebcCode < c.iebcCode),
    ),
    true,
  );
  const wards = new Set(areaShapes(area).map((s) => s.slug));
  eq(
    `${area.id}: every centre is in one of the area's wards`,
    centres.filter((c) => !wards.has(c.ward)).map((c) => c.code),
    [],
  );
  eq(
    `${area.id}: IEBC codes are 13 digits under the area's prefix`,
    centres.filter((c) => !/^\d{13}$/.test(c.iebcCode) || !c.iebcCode.startsWith(area.prefix))
      .length,
    0,
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
