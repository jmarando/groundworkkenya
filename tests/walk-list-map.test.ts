// Checks for what the Voters map draws for walk lists (src/lib/walk-list-map.ts): the draft's
// numbered houses, the shape being drawn, a list's doors coloured by their latest visit, and the
// outlines of the open lists. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/walk-list-map.test.ts

import { inPolygon, type LngLat, type Ring } from "@/lib/geo";
import { OUTCOME_COLOUR, PLAIN } from "@/lib/houses";
import {
  boxOfDoors,
  draftShapes,
  drawnShape,
  listDoorShapes,
  listHull,
  openListOutlines,
} from "@/lib/walk-list-map";
import type { ListDoor } from "@/lib/walk-lists.functions";

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

const ring: Ring = [
  [36.78, -1.28],
  [36.7801, -1.28],
  [36.7801, -1.2801],
  [36.78, -1.2801],
  [36.78, -1.28],
];

// The draft: each house a polygon carrying its number in the walking order.
eq(
  "draft shapes carry the door number",
  draftShapes([{ pc: "A", rings: [ring], n: 3 }]).features[0]!.properties,
  { pc: "A", n: 3 },
);
eq(
  "and are polygons of the house's rings",
  draftShapes([{ pc: "A", rings: [ring], n: 3 }]).features[0]!.geometry,
  { type: "Polygon", coordinates: [ring] },
);
eq(
  "a house with no outline has nothing to draw",
  draftShapes([{ pc: "A", rings: [], n: 1 }]).features,
  [],
);

// The shape being drawn: its points, the line between two, and the closed shape from three.
const two: LngLat[] = [
  [36.78, -1.28],
  [36.7801, -1.28],
];
const three: LngLat[] = [...two, [36.7801, -1.2801]];
eq(
  "a drawn line closes at three points, not before",
  [
    drawnShape(two).features.some((f) => f.geometry.type === "Polygon"),
    drawnShape(three).features.some((f) => f.geometry.type === "Polygon"),
  ],
  [false, true],
);
eq(
  "every point is drawn, and two have the line between them",
  [
    drawnShape(two).features.filter((f) => f.geometry.type === "Point").length,
    drawnShape(two).features.filter((f) => f.geometry.type === "LineString").length,
    drawnShape(three).features.filter((f) => f.geometry.type === "Point").length,
  ],
  [2, 1, 3],
);
eq(
  "the closed shape ends where it began",
  (() => {
    const poly = drawnShape(three).features.find((f) => f.geometry.type === "Polygon")!
      .geometry as {
      coordinates: Ring[];
    };
    const r = poly.coordinates[0]!;
    return [r.length, r[0], r[r.length - 1]];
  })(),
  [4, three[0], three[0]],
);
eq("nothing drawn yet", drawnShape([]).features, []);

// A list's doors, coloured by the latest visit at each.
const door = (n: number, extra: Partial<ListDoor> = {}): ListDoor => ({
  n,
  pc: `D${n}`,
  at: [36.78, -1.28],
  rings: [ring],
  wardId: null,
  outcome: null,
  visitedAt: null,
  ...extra,
});
const doors: ListDoor[] = [
  door(1, { outcome: "spoke", visitedAt: "2026-10-20T09:00:00Z" }),
  door(2, { outcome: "not_home", visitedAt: "2026-10-20T09:05:00Z" }),
  door(3),
];
eq(
  "a list's doors are coloured by their latest visit",
  listDoorShapes(doors).features.map((f) => f.properties!["colour"]),
  [OUTCOME_COLOUR.spoke, OUTCOME_COLOUR.not_home, PLAIN],
);
eq(
  "each carries its plus code and number",
  listDoorShapes(doors).features.map((f) => [f.properties!["pc"], f.properties!["n"]]),
  [
    ["D1", 1],
    ["D2", 2],
    ["D3", 3],
  ],
);
eq(
  "a visit from before the list went out is not this list's",
  listDoorShapes(doors, "2026-10-20T09:02:00Z").features.map((f) => f.properties!["colour"]),
  [PLAIN, OUTCOME_COLOUR.not_home, PLAIN],
);
eq(
  "a visit at the very moment the list went out is this list's",
  listDoorShapes(doors, "2026-10-20T09:00:00Z").features[0]!.properties!["colour"],
  OUTCOME_COLOUR.spoke,
);
eq(
  "a door with no outline is a small square round its place",
  (() => {
    const f = listDoorShapes([door(1, { rings: [], at: [36.78, -1.28] })]).features[0]!;
    const r = (f.geometry as { coordinates: Ring[] }).coordinates[0]!;
    return [f.geometry.type, inPolygon([36.78, -1.28], [r])];
  })(),
  ["Polygon", true],
);

// The outline of an open list: the hull of its houses, a little wider.
const street: LngLat[] = [
  [36.78, -1.28],
  [36.7802, -1.28],
  [36.7802, -1.2802],
  [36.78, -1.2802],
  [36.7801, -1.2801],
];
eq(
  "a list's outline holds every one of its houses",
  street.every((p) => inPolygon(p, [listHull(street)])),
  true,
);
eq(
  "and is closed",
  (() => {
    const h = listHull(street);
    return [h[0], h[h.length - 1]];
  })(),
  (() => {
    const h = listHull(street);
    return [h[0], h[0]];
  })(),
);
eq(
  "one house has an outline round it too",
  inPolygon([36.78, -1.28], [listHull([[36.78, -1.28]])]),
  true,
);
eq(
  "so do two",
  [
    [36.78, -1.28],
    [36.7801, -1.28],
  ].every((p) => inPolygon(p as LngLat, [listHull(two)])),
  true,
);
eq("no houses, no outline", listHull([]), []);
eq(
  "open list outlines carry the list's id",
  openListOutlines([
    { id: "L1", rings: [listHull(street)] },
    { id: "L2", rings: [] },
  ]).features.map((f) => [f.geometry.type, f.properties]),
  [["Polygon", { id: "L1" }]],
);

// Where to fly to see a list.
eq(
  "the box round a list's doors",
  boxOfDoors([{ at: [36.78, -1.28] }, { at: [36.79, -1.3] }, { at: [36.775, -1.285] }]),
  { west: 36.775, south: -1.3, east: 36.79, north: -1.28 },
);
eq("no doors, no box", boxOfDoors([]), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
