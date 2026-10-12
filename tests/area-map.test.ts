// Checks for drawing a county from its ward outlines: shapes from a ward map,
// and flat-projected SVG paths at the width asked for. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/area-map.test.ts

import { projectShapes, wardShapes } from "@/lib/area-map";

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

const square = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
];
const shapes = wardShapes({
  features: [
    {
      properties: { slug: "one", name: "One", constituency: "Alpha" },
      geometry: { type: "Polygon", coordinates: square },
    },
    {
      properties: { slug: "two", name: "Two" },
      geometry: { type: "MultiPolygon", coordinates: [square] },
    },
  ],
});
eq(
  "shapes from a ward map",
  shapes.map((s) => [s.slug, s.constituency, s.polygons.length]),
  [
    ["one", "Alpha", 1],
    ["two", null, 1],
  ],
);
const drawn = projectShapes([shapes[0]!], 100);
eq(
  "a square near the equator, 100 wide",
  [drawn.width, drawn.height, drawn.paths[0]?.d],
  [100, 100, "M0,100L100,100L100,0L0,0L0,100Z"],
);
eq("nothing to draw", projectShapes([], 100), { width: 100, height: 0, paths: [] });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
