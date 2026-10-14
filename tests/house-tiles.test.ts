// Checks for the house layer: plus codes, the zoom-16 tile grid, and houses
// written into a vector tile and read back, by our reader and by the one
// MapLibre draws with. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/house-tiles.test.ts

// MapLibre's own tile reader and its protobuf library, from MapLibre's dependencies.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

import {
  distanceM,
  ringAreaM2,
  ringCentre,
  wardAt,
  wardShapes,
  type LngLat,
  type Ring,
} from "@/lib/geo";
import {
  decodeTile,
  encodeTile,
  EXTENT,
  fromTileSpace,
  HOUSE_ZOOM,
  mergeHouses,
  tilesAround,
  tilesCovering,
  tilesOf,
  toTileHouse,
  toTileSpace,
} from "@/lib/house-tiles";
import { plusCodeCentre } from "@/lib/pluscode";

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

const near = (a: LngLat, b: LngLat, m: number) => distanceM(a, b) <= m;

// A house in Kileleshwa, from Google Open Buildings v3 (CC BY 4.0).
const PC = "6GCRPQM6+V9F4";
const RING: Ring = [
  [36.760986, -1.265294],
  [36.760894, -1.265264],
  [36.760866, -1.265352],
  [36.760958, -1.265382],
  [36.760986, -1.265294],
];

eq("the house's footprint", Math.round(ringAreaM2(RING)), 110);
{
  const c = plusCodeCentre(PC);
  eq("a plus code's centre", c !== null && near(c, [36.76092578125, -1.2653225], 0.01), true);
  eq(
    "names the house's centre, to within a metre",
    c !== null && near(c, ringCentre(RING), 1),
    true,
  );
  eq("lower case is the same code", plusCodeCentre(PC.toLowerCase()), c);
}
{
  // A 1.5 m square at real Nairobi coordinates. Worked out from whole degrees (about 36.9 by
  // -1.3) the cross products cancel badly, and an outline this small has its centre metres off.
  const MIDDLE: LngLat = [36.87716, -1.28963];
  const [mx, my] = MIDDLE;
  const d = 0.0000068;
  const SMALL: Ring = [
    [mx - d, my - d],
    [mx + d, my - d],
    [mx + d, my + d],
    [mx - d, my + d],
    [mx - d, my - d],
  ];
  eq("a small house's centre, to within 10 cm", near(ringCentre(SMALL), MIDDLE, 0.1), true);
}
eq(
  "not plus codes",
  [
    plusCodeCentre("6GCRPQ00+"),
    plusCodeCentre("6GCRPQM6V9F4"),
    plusCodeCentre("hello"),
    plusCodeCentre(""),
    // Made of code digits, but no place on Earth: the latitude digit goes only as far as C,
    // the longitude digit as far as V.
    plusCodeCentre("XXXXXXXX+XX"),
    plusCodeCentre("FFFFFFFF+FF"),
    plusCodeCentre("6WWWWWWW+WW"),
  ],
  [null, null, null, null, null, null, null],
);

{
  const p: LngLat = [36.8172, -1.2864];
  eq("tile space and back", near(fromTileSpace(toTileSpace(p)), p, 0.001), true);
}

const house = toTileHouse(PC, [RING])!;
const [tx, ty] = toTileSpace(RING[0]!);
const x = Math.floor(tx);
const y = Math.floor(ty);
eq("where the house is on the grid", [x, y], [39460, 32998]);
eq("a small house is in one tile", tilesOf(house), [{ x, y }]);

const bytes = encodeTile(x, y, [house]);
const back = decodeTile(x, y, bytes);
eq(
  "one house comes back, by its plus code",
  back.map((b) => b.id),
  [PC],
);
eq(
  "its outline, to within a metre, closed",
  [back[0]!.rings[0]!.length, back[0]!.rings[0]!.every((p) => RING.some((q) => near(p, q, 1)))],
  [5, true],
);
eq("its footprint, to within 10%", Math.abs(back[0]!.area - 110) <= 11, true);
eq("its centre, to within a metre", near(back[0]!.centre, ringCentre(RING), 1), true);

{
  // A tile from another tool can carry a field we don't read: field 9, 3 bytes, before the layer.
  const withExtra = new Uint8Array([0x4a, 3, 1, 2, 3, ...bytes]);
  eq(
    "an unknown field in a tile is skipped",
    decodeTile(x, y, withExtra).map((b) => b.id),
    back.map((b) => b.id),
  );
}

{
  const tile = new VectorTile(new PbfReader(bytes));
  const layer = tile.layers["buildings"]!;
  const f = layer.feature(0);
  const gj = f.toGeoJSON(x, y, HOUSE_ZOOM);
  eq(
    "MapLibre's reader sees one polygon with its plus code",
    [layer.extent, layer.length, f.type, f.properties["pc"]],
    [EXTENT, 1, 3, PC],
  );
  const outline = (gj.geometry as { coordinates: number[][][] }).coordinates[0]!;
  eq(
    "and the same outline",
    outline.every((p) => RING.some((q) => near([p[0]!, p[1]!], q, 1))),
    true,
  );
}

{
  // A 22 m square across the tile's eastern edge, in the middle of the tile north to south.
  const [edgeLng, midLat] = fromTileSpace([x + 1, y + 0.5]);
  const d = 0.0001;
  const EDGE: Ring = [
    [edgeLng - d, midLat - d],
    [edgeLng + d, midLat - d],
    [edgeLng + d, midLat + d],
    [edgeLng - d, midLat + d],
    [edgeLng - d, midLat - d],
  ];
  const wide = toTileHouse("6GCRPQM7+2222", [EDGE])!;
  eq("a house on a tile edge is in both tiles", tilesOf(wide), [
    { x, y },
    { x: x + 1, y },
  ]);
  const left = decodeTile(x, y, encodeTile(x, y, [wide]));
  const right = decodeTile(x + 1, y, encodeTile(x + 1, y, [wide]));
  eq(
    "each tile has all of it",
    [left.length, right.length, near(left[0]!.centre, right[0]!.centre, 0.01)],
    [1, 1, true],
  );
  eq(
    "found once across the edge",
    mergeHouses([left, right]).map((b) => b.id),
    ["6GCRPQM7+2222"],
  );
}

{
  // A block with a courtyard; the courtyard's ring is given turning the same way, as files sometimes do.
  const [cx, cy] = fromTileSpace([x + 0.5, y + 0.5]);
  const sq = (d: number): Ring => [
    [cx - d, cy - d],
    [cx + d, cy - d],
    [cx + d, cy + d],
    [cx - d, cy + d],
    [cx - d, cy - d],
  ];
  const OUTER = sq(0.00018);
  const INNER = sq(0.00009);
  const holed = decodeTile(x, y, encodeTile(x, y, [toTileHouse("6GCRPQM8+3333", [OUTER, INNER])!]));
  eq(
    "a courtyard stays a hole",
    [
      holed[0]!.rings.length,
      // The 0.6 m grid moves each corner by up to 0.3 m: a few percent on a 40 m block.
      Math.abs(holed[0]!.area / (ringAreaM2(OUTER) - ringAreaM2(INNER)) - 1) < 0.05,
    ],
    [2, true],
  );
}

eq(
  "an outline that is a single point is dropped",
  toTileHouse("6GCRPQM9+4444", [
    [
      [36.8, -1.3],
      [36.8, -1.3],
      [36.8, -1.3],
      [36.8, -1.3],
    ],
  ]),
  null,
);
eq("an empty tile has no houses", decodeTile(x, y, new Uint8Array(0)), []);

eq("around the middle of a tile, that tile", tilesAround(fromTileSpace([x + 0.5, y + 0.5]), 120), [
  { x, y },
]);
eq(
  "around a corner, the four tiles there",
  tilesAround(fromTileSpace([x + 1, y + 1]), 120).length,
  4,
);

// The tiles that cover a box, with numbers worked out by hand: a tile is 360/65,536 degrees of
// longitude wide at zoom 16, and x counts east from the date line, y south from the top.
eq(
  "a small box inside one tile is that tile",
  tilesCovering({ west: 36.7999, south: -1.2801, east: 36.8001, north: -1.2799 }),
  [{ x: 39467, y: 33001 }],
);
eq(
  "a box across a tile corner is the four tiles there",
  tilesCovering({ west: 36.752, south: -1.266, east: 36.756, north: -1.263 }),
  [
    { x: 39458, y: 32997 },
    { x: 39458, y: 32998 },
    { x: 39459, y: 32997 },
    { x: 39459, y: 32998 },
  ],
);
eq(
  "a box across one tile's edge is two",
  tilesCovering({ west: 36.808, south: -1.277, east: 36.812, north: -1.275 }),
  [
    { x: 39468, y: 33000 },
    { x: 39469, y: 33000 },
  ],
);

{
  const shapes = wardShapes({
    features: [
      {
        properties: { slug: "west" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
      {
        properties: { slug: "east" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [1, 0],
                [2, 0],
                [2, 1],
                [1, 1],
                [1, 0],
              ],
            ],
          ],
        },
      },
    ],
  });
  eq(
    "the ward a point is in",
    [wardAt([0.5, 0.5], shapes)?.slug, wardAt([1.5, 0.5], shapes)?.slug, wardAt([3, 3], shapes)],
    ["west", "east", null],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
