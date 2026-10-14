// Checks for the area nearest each polling centre (src/lib/stations/areas.ts): the cells cover
// the ward once over, stay inside it, and give a point to its nearest centre. Pure. Run from
// the repository root:
//   npx tsx --tsconfig tsconfig.json tests/centre-areas.test.ts

import { readFileSync } from "node:fs";

import {
  boundsOf,
  distanceM,
  toLocalM,
  wardShapes,
  type LngLat,
  type Ring,
  type WardShape,
} from "@/lib/geo";
import { centreAreas, centreAt } from "@/lib/stations/areas";

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

const square: Ring = [
  [36.79, -1.29],
  [36.81, -1.29],
  [36.81, -1.27],
  [36.79, -1.27],
  [36.79, -1.29],
];
const ward: WardShape = {
  slug: "test",
  polygons: [[square]],
  box: boundsOf({ type: "Polygon", coordinates: [square] }),
};
const centres: { id: string; at: LngLat }[] = [
  { id: "a", at: [36.795, -1.285] },
  { id: "b", at: [36.805, -1.285] },
  { id: "c", at: [36.8, -1.274] },
];
const areas = centreAreas(centres, ward);

// Square metres of a ward's pieces, every ring on one flat plane around the ward's middle.
// `ringAreaM2` scales each ring by the latitude of its own first vertex, so a ward and its cells
// would differ by parts per million even when the cells tile it exactly.
function areaIn(w: WardShape) {
  const origin: LngLat = [(w.box.west + w.box.east) / 2, (w.box.south + w.box.north) / 2];
  const ringM2 = (ring: Ring) => {
    let twice = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = toLocalM(ring[i]!, origin);
      const [x2, y2] = toLocalM(ring[i + 1]!, origin);
      twice += x1 * y2 - x2 * y1;
    }
    return Math.abs(twice) / 2;
  };
  return (polygons: Ring[][]) =>
    polygons.reduce(
      (t, rings) => t + ringM2(rings[0]!) - rings.slice(1).reduce((h, r) => h + ringM2(r), 0),
      0,
    );
}
const areaOf = areaIn(ward);

eq(
  "an area for each centre",
  areas.map((a) => a.id),
  ["a", "b", "c"],
);
eq(
  "together they are the ward",
  Math.abs(areas.reduce((t, a) => t + areaOf(a.polygons), 0) - areaOf(ward.polygons)) < 1,
  true,
);

// Points on a grid across the ward, off the cells' edges.
let once = 0;
let nearest = 0;
let total = 0;
for (let i = 0; i < 20; i++)
  for (let j = 0; j < 20; j++) {
    const p: LngLat = [36.79 + (i + 0.37) * 0.001, -1.29 + (j + 0.41) * 0.001];
    total++;
    const holders = areas.filter((a) => centreAt(p, [a]) !== null);
    if (holders.length === 1) once++;
    const near = [...centres].sort((x, y) => distanceM(p, x.at) - distanceM(p, y.at))[0]!;
    if (centreAt(p, areas) === near.id) nearest++;
  }
eq("every point of the ward in exactly one area", once, total);
eq("every point in its nearest centre's area", nearest, total);
eq("outside the ward, no area", centreAt([36.82, -1.28], areas), null);
eq("one centre has the whole ward", centreAreas([centres[0]!], ward), [
  { id: "a", polygons: ward.polygons },
]);
eq("no centres, no areas", centreAreas([], ward), []);
eq(
  "a centre at another's very place gets no area of its own",
  centreAreas([...centres, { id: "d", at: [36.795, -1.285] }], ward).find((a) => a.id === "d")
    ?.polygons,
  [],
);
eq(
  "a centre outside the ward still splits it",
  centreAreas([centres[0]!, { id: "e", at: [36.82, -1.28] }], ward).map(
    (a) => a.polygons.length > 0,
  ),
  [true, true],
);

// Kileleshwa, on Nairobi's real ward map, with three of its centres.
const kile = wardShapes(JSON.parse(readFileSync("public/geo/nairobi-wards.json", "utf8"))).find(
  (s) => s.slug === "kileleshwa",
)!;
const real = centreAreas(
  [
    { id: "1", at: [36.7836, -1.2841] },
    { id: "2", at: [36.7705, -1.2766] },
    { id: "3", at: [36.7951, -1.2896] },
  ],
  kile,
);
const kileArea = areaIn(kile);
eq(
  "a real ward: its areas add up to it",
  Math.abs(real.reduce((t, a) => t + kileArea(a.polygons), 0) / kileArea(kile.polygons) - 1) < 1e-6,
  true,
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
