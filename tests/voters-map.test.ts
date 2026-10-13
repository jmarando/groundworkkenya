// Checks for the Voters map's rules: levels by zoom, the area under a point
// (on Nairobi's real ward map), camera targets, hints, constituency labels and
// search. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/voters-map.test.ts

import { readFileSync } from "node:fs";

import { inBox, ringCentre, wardShapes } from "@/lib/geo";
import { mapAreaFor } from "@/lib/map-areas";
import {
  areaAt,
  cameraFor,
  constituencyLabels,
  geocodeUrl,
  hintFor,
  levelFor,
  placeHits,
  searchHits,
} from "@/lib/voters-map";

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

type WardFile = {
  features: {
    properties: { slug: string; name: string; constituency?: string };
    geometry: { type: string; coordinates: unknown };
  }[];
};
const NAIROBI = JSON.parse(readFileSync("public/geo/nairobi-wards.json", "utf8")) as WardFile;
const SHAPES = wardShapes(NAIROBI);
const WARDS = NAIROBI.features.map((f) => ({
  slug: f.properties.slug,
  name: f.properties.name,
  constituency: f.properties.constituency ?? "",
}));
const AREA = mapAreaFor("nairobi")!;
const MATHIRA = mapAreaFor("nyeri/mathira")!;
// The Kileleshwa house the other tests use: its plus code and its centre.
const HOUSE = "6GCRPQM6+V9F4";
const AT_HOUSE: [number, number] = [36.760926, -1.265323];

eq(
  "levels by zoom, for a county",
  [8, 10.9, 11, 12.9, 13, 15.9, 16, 20].map((z) => levelFor(z, "county")),
  ["area", "area", "constituency", "constituency", "ward", "ward", "street", "street"],
);
eq("a constituency's map starts at the constituency", levelFor(9, "constituency"), "constituency");

eq(
  "the top level is the whole map, wherever you are",
  areaAt("area", AT_HOUSE, SHAPES, WARDS, "county"),
  {
    level: "county",
  },
);
eq(
  "one down, the constituency under the point",
  areaAt("constituency", AT_HOUSE, SHAPES, WARDS, "county"),
  { level: "constituency", name: "Dagoretti North" },
);
eq(
  "at ward and street level, the ward",
  [
    areaAt("ward", AT_HOUSE, SHAPES, WARDS, "county"),
    areaAt("street", AT_HOUSE, SHAPES, WARDS, "county"),
  ],
  [
    { level: "ward", slug: "kileleshwa" },
    { level: "ward", slug: "kileleshwa" },
  ],
);
eq(
  "outside every ward, keep the area on show",
  areaAt("ward", [37.5, -1.0], SHAPES, WARDS, "county"),
  null,
);
eq(
  "a constituency's map has no constituency below the top",
  areaAt("constituency", AT_HOUSE, SHAPES, WARDS, "constituency"),
  { level: "county" },
);

{
  const t = cameraFor({ area: { level: "county" }, house: HOUSE }, WARDS, SHAPES, AREA);
  eq(
    "a house: its centre, close in",
    t.kind === "point"
      ? [
          Math.abs(t.center[0] - AT_HOUSE[0]) < 1e-4,
          Math.abs(t.center[1] - AT_HOUSE[1]) < 1e-4,
          t.zoom,
        ]
      : t,
    [true, true, 18],
  );
}
{
  const t = cameraFor({ area: { level: "ward", slug: "kileleshwa" } }, WARDS, SHAPES, AREA);
  eq(
    "a ward: its box, between ward and street zoom",
    t.kind === "box" ? [inBox(AT_HOUSE, t.box), t.minZoom, t.maxZoom] : t,
    [true, 13, 15.9],
  );
}
{
  const t = cameraFor(
    { area: { level: "constituency", name: "Dagoretti North" } },
    WARDS,
    SHAPES,
    AREA,
  );
  const kile = SHAPES.find((s) => s.slug === "kileleshwa")!.box;
  eq(
    "a constituency: around all its wards",
    t.kind === "box"
      ? [t.box.west <= kile.west && t.box.east >= kile.east, t.minZoom, t.maxZoom]
      : t,
    [true, 11, 12.9],
  );
}
eq(
  "an unknown ward, a bad house or the county: the whole map area",
  [
    cameraFor({ area: { level: "ward", slug: "nowhere" } }, WARDS, SHAPES, AREA),
    cameraFor({ area: { level: "county" }, house: "hello" }, WARDS, SHAPES, AREA),
  ],
  [
    {
      kind: "box",
      box: { west: 36.66, south: -1.45, east: 37.11, north: -1.16 },
      minZoom: 8,
      maxZoom: 10.9,
    },
    {
      kind: "box",
      box: { west: 36.66, south: -1.45, east: 37.11, north: -1.16 },
      minZoom: 8,
      maxZoom: 10.9,
    },
  ],
);
{
  // A hand-edited address can name any plus code on Earth; this one is in London.
  const LONDON = "9C3XGV4V+XX";
  const kileleshwa = { level: "ward" as const, slug: "kileleshwa" };
  eq(
    "a house outside the map area is no house: the same target as without one",
    [
      cameraFor({ area: { level: "county" }, house: LONDON }, WARDS, SHAPES, AREA),
      cameraFor({ area: kileleshwa, house: LONDON }, WARDS, SHAPES, AREA),
    ],
    [
      cameraFor({ area: { level: "county" } }, WARDS, SHAPES, AREA),
      cameraFor({ area: kileleshwa }, WARDS, SHAPES, AREA),
    ],
  );
}
eq(
  "a constituency's map opens to ward zoom",
  (cameraFor({ area: { level: "county" } }, [], [], MATHIRA) as { maxZoom: number }).maxZoom,
  12.9,
);

eq(
  "what a click does, said on the map",
  [
    hintFor("street", "county"),
    hintFor("ward", "county"),
    hintFor("constituency", "county"),
    hintFor("area", "county"),
  ],
  [
    "Click a house to open it",
    "Zoom in, or click, to see the houses",
    "Click a ward to drop in",
    "Click a ward to drop in, or a constituency's name",
  ],
);

{
  const labels = constituencyLabels(SHAPES, WARDS);
  const dn = labels.features.find((f) => f.properties.name === "Dagoretti North");
  eq("a name for each of Nairobi's 17 constituencies", labels.features.length, 17);
  eq(
    "in the middle of its wards",
    dn ? [dn.geometry.coordinates[0] > 36.7 && dn.geometry.coordinates[0] < 36.8] : null,
    [true],
  );
  // Clicked, a name must open its own constituency: list the ones that don't.
  eq(
    "every name sits inside its own constituency",
    labels.features
      .filter((f) => {
        const area = areaAt("constituency", f.geometry.coordinates, SHAPES, WARDS, "county");
        const own = { level: "constituency", name: f.properties.name };
        return JSON.stringify(area) !== JSON.stringify(own);
      })
      .map((f) => f.properties.name),
    [],
  );
  // The middle of the box around a constituency's wards, where a name goes if it can.
  const middleOf = (name: string): [number, number] => {
    const boxes = SHAPES.filter(
      (s) => WARDS.find((w) => w.slug === s.slug)?.constituency === name,
    ).map((s) => s.box);
    return [
      (Math.min(...boxes.map((b) => b.west)) + Math.max(...boxes.map((b) => b.east))) / 2,
      (Math.min(...boxes.map((b) => b.south)) + Math.max(...boxes.map((b) => b.north))) / 2,
    ];
  };
  // The middle of Mathare's wards is in Ruaraka's Utalii, so its name goes to the centre of
  // Mabatini, the ward whose own box is centred nearest that middle.
  const mabatini = ringCentre(SHAPES.find((s) => s.slug === "mabatini")!.polygons[0]![0]!);
  eq(
    "only Mathare's name leaves the middle, for the centre of Mabatini, the ward nearest it",
    labels.features
      .filter((f) => {
        const [x, y] = middleOf(f.properties.name);
        return (
          Math.abs(f.geometry.coordinates[0] - x) > 1e-9 ||
          Math.abs(f.geometry.coordinates[1] - y) > 1e-9
        );
      })
      .map((f) => [f.properties.name, f.geometry.coordinates]),
    [["Mathare", mabatini]],
  );
}

const PEOPLE = [
  { id: "p1", name: "Faith Chebet", phone: "+254722111222", ward: "Kileleshwa", house: HOUSE },
  { id: "p2", name: "Kamau Njoroge", phone: "+254733444555", ward: null, house: null },
];
eq(
  "search: wards, constituencies, people",
  searchHits("kile", WARDS, PEOPLE, "county").map((h) => [h.kind, h.label]),
  [["ward", "Kileleshwa ward"]],
);
eq(
  "a constituency by name",
  searchHits("dagoretti", WARDS, PEOPLE, "county")
    .filter((h) => h.kind === "constituency")
    .map((h) => h.label),
  ["Dagoretti North", "Dagoretti South"],
);
eq(
  "a constituency's map offers no constituencies",
  searchHits(
    "mathira",
    [{ slug: "konyu", name: "Konyu", constituency: "Mathira" }],
    [],
    "constituency",
  ),
  [],
);
eq("a person by name carries their house and ward", searchHits("faith", WARDS, PEOPLE, "county"), [
  {
    kind: "person",
    id: "p1",
    label: "Faith Chebet",
    sub: "Kileleshwa ward",
    house: HOUSE,
    wardSlug: "kileleshwa",
  },
]);
eq(
  "or by four digits of their number",
  searchHits("0733 44", WARDS, PEOPLE, "county").map((h) => [h.kind, h.label]),
  [["person", "Kamau Njoroge"]],
);
eq(
  "the 0 or 254 typed first is not one of the four digits",
  ["0733", "2547"].map((q) => searchHits(q, WARDS, PEOPLE, "county")),
  [[], []],
);
eq(
  "but four digits after it find the number",
  ["07334", "2547334", "7334"].map((q) =>
    searchHits(q, WARDS, PEOPLE, "county").map((h) => [h.kind, h.label]),
  ),
  [[["person", "Kamau Njoroge"]], [["person", "Kamau Njoroge"]], [["person", "Kamau Njoroge"]]],
);
{
  // An accent at the end of a part of a name, and one inside a word.
  const jose = { id: "p3", name: "José Ochieng", phone: "+254711000111", ward: null, house: null };
  const renee = { id: "p4", name: "Renée Akinyi", phone: "+254722000222", ward: null, house: null };
  const found = (q: string) =>
    searchHits(q, WARDS, [...PEOPLE, jose, renee], "county").map((h) => [h.kind, h.label]);
  eq(
    "a name typed without accents finds one written with them, and the reverse",
    ["jose", "José", "renee", "RENÉE"].map(found),
    [
      [["person", "José Ochieng"]],
      [["person", "José Ochieng"]],
      [["person", "Renée Akinyi"]],
      [["person", "Renée Akinyi"]],
    ],
  );
}
eq("nothing typed, nothing found", searchHits("  ", WARDS, PEOPLE, "county"), []);

eq(
  "MapTiler's search inside the area, only with a key and three letters",
  [
    geocodeUrl("Ngong Road", "k", AREA.bounds),
    geocodeUrl("ng", "k", AREA.bounds),
    geocodeUrl("Ngong Road", null, AREA.bounds),
  ],
  [
    "https://api.maptiler.com/geocoding/Ngong%20Road.json?key=k&bbox=36.66%2C-1.45%2C37.11%2C-1.16&country=ke&limit=5",
    null,
    null,
  ],
);
eq(
  "places from its reply",
  placeHits({
    features: [
      { text: "Ngong Road", place_name: "Ngong Road, Kilimani, Nairobi", center: [36.78, -1.3] },
      { text: "No centre", place_name: "Somewhere" },
    ],
  }),
  [{ kind: "place", label: "Ngong Road", sub: "Kilimani, Nairobi", center: [36.78, -1.3] }],
);
eq("a reply that isn't one", placeHits({ error: "bad key" }), []);
eq(
  "a bad entry in the reply is skipped, like one without a name or centre",
  placeHits({
    features: [
      null,
      "Ngong Road",
      7,
      { text: "Ngong Road", place_name: "Ngong Road, Kilimani, Nairobi", center: [36.78, -1.3] },
    ],
  }),
  [{ kind: "place", label: "Ngong Road", sub: "Kilimani, Nairobi", center: [36.78, -1.3] }],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
