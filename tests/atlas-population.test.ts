// Checks for turning WorldPop's age-and-sex pyramid into the atlas's numbers,
// and for shrinking a ward's outline to send to WorldPop. Pure. Run from the
// repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-population.test.ts

import { bandStart, compactGeometry, fromPyramid, simplifyRing } from "@/lib/atlas-population";

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

eq("a band's first age", ["15 to 19", "15-19", "80+", "0", "x"].map(bandStart), [
  15,
  15,
  80,
  0,
  null,
]);
eq(
  "total, adults and 18–34, a band shared evenly across its ages",
  fromPyramid([
    { age: "35 to 39", male: 50, female: 50 },
    { age: "10 to 14", male: 50, female: 50 },
    { age: "15 to 19", male: 50, female: 50 },
    { age: "20 to 24", male: 50, female: 50 },
    { age: "25 to 29", male: 50, female: 50 },
    { age: "30 to 34", male: 50, female: 50 },
    { age: "80+", male: 5, female: 5 },
  ]),
  { total: 610, adults: 450, young_adults: 340 },
);
const square: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
];
eq("a square loses its points along straight edges", simplifyRing(square, 0.01), [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
]);
const spike: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 0.5],
  [1.2, 0.55],
  [1, 0.6],
  [1, 1],
  [0, 1],
  [0, 0],
];
eq(
  "but keeps a spike bigger than the tolerance",
  simplifyRing(spike, 0.05).some(([x]) => x === 1.2),
  true,
);
eq(
  "compacting rounds to five places",
  compactGeometry(
    {
      type: "Polygon",
      coordinates: [
        [
          [36.123456789, -1.2],
          [36.2, -1.2],
          [36.2, -1.3],
          [36.123456789, -1.2],
        ],
      ],
    },
    0.0001,
  ),
  {
    type: "Polygon",
    coordinates: [
      [
        [36.12346, -1.2],
        [36.2, -1.2],
        [36.2, -1.3],
        [36.12346, -1.2],
      ],
    ],
  },
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
