// Checks for the building arithmetic: an area's size from its map, which ward
// a building's centre falls in, the building figures,
// constituencies from whole wards, and the rows for indicators.csv. Pure. Run
// from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/building-stats.test.ts

import type { Ring } from "@/lib/geo";
import {
  areaKm2,
  buildingStats,
  indicatorRows,
  makeLocator,
  withConstituencies,
} from "@/lib/building-stats";

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
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

// A: 0.01° square near Nairobi. B: 0.02° by 0.01°, with a hole 0.01° by 0.006°.
const A = [[sq(36.8, -1.3, 36.81, -1.29)]];
const B = [[sq(36.81, -1.3, 36.83, -1.29), sq(36.815, -1.298, 36.825, -1.292)]];
eq(
  "an area's size, with holes taken out",
  [round3(areaKm2(A)), round3(areaKm2(B))],
  [1.231, 1.723],
);

const locate = makeLocator([
  { key: "x/c/a", polygons: A },
  { key: "x/c/b", polygons: B },
]);
eq(
  "which ward a building's centre is in: none in a hole or outside",
  [locate(36.805, -1.295), locate(36.812, -1.295), locate(36.82, -1.295), locate(36.9, -1.295)],
  ["x/c/a", "x/c/b", null, null],
);

eq("the building figures", buildingStats([250, 10, 50, 30], 1.2306), {
  buildings: 4,
  buildings_per_km2: 3,
  median_building_m2: 40,
  small_building_share: 0.5,
  large_building_share: 0.25,
});
eq(
  "an odd count's median, and nothing to count",
  [
    buildingStats([300, 12, 100], 1)?.median_building_m2,
    buildingStats([300, 12, 100], 1)?.small_building_share,
    buildingStats([], 1),
    buildingStats([5], 0),
  ],
  [100, 0.333, null, null],
);

eq(
  "a constituency from all its wards; one only partly mapped is left out",
  withConstituencies(
    [
      { key: "x/c/a", km2: 1, sizes: [10] },
      { key: "x/c/b", km2: 2, sizes: [30, 300] },
      { key: "x/d/e", km2: 5, sizes: [20] },
    ],
    [
      { key: "x/c", wards: ["x/c/a", "x/c/b"] },
      { key: "x/d", wards: ["x/d/e", "x/d/f"] },
    ],
  ).map((a) => [a.key, a.km2, a.sizes.length]),
  [
    ["x/c/a", 1, 1],
    ["x/c/b", 2, 2],
    ["x/d/e", 5, 1],
    ["x/c", 3, 3],
  ],
);

eq(
  "the rows for indicators.csv: a place without buildings gets only its size",
  indicatorRows(
    [
      { key: "x/c/a", km2: 1.2306, sizes: [10, 30, 50, 250] },
      { key: "x/c/b", km2: 2, sizes: [] },
    ],
    { area: "geo", areaYear: 2020, buildings: "ob", buildingsYear: 2023 },
  ).map((r) => `${r.area} ${r.indicator} ${r.year} ${r.value} ${r.source}`),
  [
    "x/c/a area_km2 2020 1.231 geo",
    "x/c/a buildings 2023 4 ob",
    "x/c/a buildings_per_km2 2023 3 ob",
    "x/c/a median_building_m2 2023 40 ob",
    "x/c/a small_building_share 2023 0.5 ob",
    "x/c/a large_building_share 2023 0.25 ob",
    "x/c/b area_km2 2020 2 geo",
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
