// Checks for the polling centres the Voters map draws (src/lib/centres.ts): the database's
// rows read into centres, which have a position, and the dots and areas handed to the map.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/centres.test.ts

import { centreAreaShapes, centreDots, dotSize, toCentres } from "@/lib/centres";
import type { Ring } from "@/lib/geo";

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

// A row as the database sends it: a centre from the register, with no position yet.
const row = (extra: Record<string, unknown> = {}) => ({
  id: "c-1",
  code: "PS-0001",
  iebc_code: "0472741366001",
  name: "KABETE VETLAB PRIMARY SCHOOL",
  ward_id: "w-kitisuru",
  registered_voters: 7889,
  streams: 12,
  lat: null,
  lng: null,
  placed_by: null,
  placed_accuracy_m: null,
  placed_at: null,
  placed_actor: null,
  suggested_lat: null,
  suggested_lng: null,
  suggested_accuracy_m: null,
  suggested_at: null,
  suggested_by: null,
  ...extra,
});

// A centre with no position is still a centre: it is listed, and has no pin.
eq("a row with no position becomes a centre with none", toCentres([row()], new Map())[0], {
  id: "c-1",
  code: "PS-0001",
  iebc: "0472741366001",
  name: "KABETE VETLAB PRIMARY SCHOOL",
  wardId: "w-kitisuru",
  streams: 12,
  voters: 7889,
  placed: null,
  suggestion: null,
});

// The database keeps lat then lng; the map wants [lng, lat].
eq(
  "a position is [longitude, latitude]",
  toCentres([row({ lat: -1.257842, lng: 36.758761, placed_by: "osm" })], new Map())[0]?.placed?.at,
  [36.758761, -1.257842],
);

const byOrganiser = row({
  lat: -1.26,
  lng: 36.76,
  placed_by: "organiser",
  placed_at: "2026-10-12T08:30:00Z",
  placed_actor: "u-1",
});
eq(
  "who placed it, and when, by name",
  toCentres([byOrganiser], new Map([["u-1", "Njoki Mwangi"]]))[0]?.placed,
  {
    at: [36.76, -1.26],
    by: "organiser",
    accuracyM: null,
    when: "2026-10-12T08:30:00Z",
    who: "Njoki Mwangi",
  },
);
eq(
  "someone with no name on file is no name",
  toCentres([byOrganiser], new Map())[0]?.placed?.who,
  null,
);
eq(
  "an agent's position keeps how accurate the phone said it was",
  toCentres(
    [row({ lat: -1.26, lng: 36.76, placed_by: "agent", placed_accuracy_m: 12.5 })],
    new Map(),
  )[0]?.placed?.accuracyM,
  12.5,
);

// A pin needs a source it can name and a place on Earth.
for (const [why, extra] of [
  ["an unknown source", { lat: -1.26, lng: 36.76, placed_by: "somebody" }],
  ["no source", { lat: -1.26, lng: 36.76 }],
  ["a latitude past the pole", { lat: 95, lng: 36.76, placed_by: "osm" }],
  ["a longitude past the date line", { lat: -1.26, lng: 181, placed_by: "osm" }],
  ["a latitude with no longitude", { lat: -1.26, lng: null, placed_by: "osm" }],
  ["text for a latitude", { lat: "-1.26", lng: 36.76, placed_by: "osm" }],
] as [string, Record<string, unknown>][])
  eq(`${why} is no pin`, toCentres([row(extra)], new Map())[0]?.placed, null);

// An agent's position the phone couldn't confirm waits for an organiser.
const waiting = row({
  suggested_lat: -1.3,
  suggested_lng: 36.8,
  suggested_accuracy_m: 31.5,
  suggested_at: "2026-10-13T10:00:00Z",
  suggested_by: "u-2",
});
eq(
  "a suggestion waiting",
  toCentres([waiting], new Map([["u-2", "Peter Otieno"]]))[0]?.suggestion,
  {
    at: [36.8, -1.3],
    accuracyM: 31.5,
    when: "2026-10-13T10:00:00Z",
    who: "Peter Otieno",
  },
);
eq(
  "half a suggestion is none",
  toCentres([row({ suggested_lat: -1.3 })], new Map())[0]?.suggestion,
  null,
);

// A bad row can't take the list down.
eq(
  "rows with no id, code or name are left out",
  toCentres(
    [row({ id: null }), row({ code: "" }), row({ name: undefined }), row(), null, 7],
    new Map(),
  ).map((c) => c.code),
  ["PS-0001"],
);
eq("not a list, no centres", toCentres(null, new Map()), []);
eq(
  "a count that isn't a whole number is none, not NaN",
  toCentres([row({ registered_voters: "7889", streams: -2 })], new Map()).map((c) => [
    c.voters,
    c.streams,
  ]),
  [[0, 0]],
);

// What the map draws.
const centres = toCentres(
  [
    row({ lat: -1.257842, lng: 36.758761, placed_by: "osm" }),
    row({
      id: "c-2",
      code: "PS-0002",
      name: "LORESHO PRIMARY SCHOOL",
      lat: -1.25,
      lng: 36.75,
      placed_by: "osm-close",
      registered_voters: 100,
    }),
    row({ id: "c-3", code: "PS-0003", name: "NOT PLACED SCHOOL" }),
  ],
  new Map(),
);
const dots = centreDots(centres);
eq(
  "only a centre with a position is drawn",
  dots.features.map((f) => f.properties.code),
  ["PS-0001", "PS-0002"],
);
eq("a dot sits at [longitude, latitude]", dots.features[0]?.geometry, {
  type: "Point",
  coordinates: [36.758761, -1.257842],
});
eq(
  "a close name is drawn hollow, a sure one filled",
  dots.features.map((f) => f.properties.close),
  [false, true],
);
eq(
  "a dot carries the name and the voters it is labelled and sized by",
  [dots.features[0]?.properties.name, dots.features[0]?.properties.voters],
  ["KABETE VETLAB PRIMARY SCHOOL", 7889],
);
eq(
  "a centre with more voters is a bigger dot",
  (dots.features[0]?.properties.size ?? 0) > (dots.features[1]?.properties.size ?? 0),
  true,
);

// Sizes: Nairobi's centres run from 1 registered voter to 40,554, with a median near 5,600.
const sizes = [0, 1, 100, 5594, 12117, 40554, 1e7].map(dotSize);
eq(
  "a bigger centre is never a smaller dot",
  sizes.every((s, i) => i === 0 || s >= sizes[i - 1]!),
  true,
);
eq(
  "dots stay between 4 and 24 px",
  sizes.every((s) => s >= 4 && s <= 24),
  true,
);
eq(
  "the largest real centre is still told apart from a median one",
  dotSize(40554) > dotSize(5594) && dotSize(5594) > dotSize(100),
  true,
);

// The shaded areas.
const square: Ring = [
  [36.75, -1.26],
  [36.76, -1.26],
  [36.76, -1.25],
  [36.75, -1.25],
  [36.75, -1.26],
];
const shapes = centreAreaShapes(
  [
    { id: "c-1", polygons: [[square]] },
    // A centre at another's very place has no area of its own.
    { id: "c-2", polygons: [] },
  ],
  centres,
);
eq(
  "an area with nothing in it isn't drawn",
  shapes.features.map((f) => f.properties.code),
  ["PS-0001"],
);
eq("an area is drawn as the polygons it is", shapes.features[0]?.geometry, {
  type: "MultiPolygon",
  coordinates: [[square]],
});
eq(
  "an area for a centre we don't know is left out",
  centreAreaShapes([{ id: "ghost", polygons: [[square]] }], centres).features,
  [],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
