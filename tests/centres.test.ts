// Checks for the polling centres the Voters map draws (src/lib/centres.ts): the database's
// rows read into centres, which have a position, and the dots and areas handed to the map.
// Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/centres.test.ts

import {
  canPlaceCentres,
  centreAreaShapes,
  centreDoors,
  centreDots,
  dotSize,
  housesIn,
  placementNote,
  suggestionNote,
  tilesToCount,
  toCentres,
  wardCentres,
} from "@/lib/centres";
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

// Doors by area. Real Kileleshwa houses (their plus codes say where they are): three near
// 36.754, -1.2644; three near 36.8097, -1.2761; and one between, at 36.7813, -1.2836.
const rect = (west: number, south: number, east: number, north: number): Ring => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];
const areas = [
  { id: "w", polygons: [[rect(36.752, -1.266, 36.756, -1.263)]] },
  { id: "e", polygons: [[rect(36.808, -1.277, 36.812, -1.275)]] },
  { id: "z", polygons: [[rect(36.9, -1.4, 36.91, -1.39)]] },
];
const visit = (pc: string, outcome: "spoke" | "not_home" | "refused", support: number | null) => ({
  pc,
  at: "2026-10-10T08:00:00Z",
  outcome,
  support,
});
const doors = centreDoors(
  [
    visit("6GCRPQP3+5JC5", "spoke", 5),
    visit("6GCRPQP3+7H3V", "spoke", 2),
    visit("6GCRPQP3+6JH2", "not_home", null),
    visit("6GCRPRF5+HVCP", "spoke", 4),
    visit("6GCRPQ8J+HG7M", "spoke", 5),
    visit("hello", "spoke", 5),
  ],
  areas,
);
eq(
  "each house knocked counts in the area it stands in: knocked, scored, and supporters (4 or 5)",
  [...doors.entries()],
  [
    ["w", { knocked: 3, rated: 2, supporters: 1 }],
    ["e", { knocked: 1, rated: 1, supporters: 1 }],
    ["z", { knocked: 0, rated: 0, supporters: 0 }],
  ],
);

const building = (id: string, centre: [number, number]) => ({ id, area: 60, centre, rings: [] });
eq(
  "houses in an area, by where each house's centre is",
  housesIn(
    [
      building("a", [36.754027, -1.264572]),
      building("b", [36.753918, -1.264353]),
      building("c", [36.809645, -1.276057]),
      building("d", [36.781293, -1.283583]),
    ],
    areas[0]!,
  ),
  2,
);

// Counting an area's houses means reading the house tiles it covers: cheap for a city block of
// cells, not for a rural ward in one piece.
eq("the tiles to read for an area are those its outline covers", tilesToCount(areas[1]!), [
  { x: 39468, y: 33000 },
  { x: 39469, y: 33000 },
]);
eq(
  "an area too big to read is not counted",
  tilesToCount({ id: "big", polygons: [[rect(36.0, -1.5, 37.0, -1.0)]] }),
  null,
);
eq(
  "an area with no outline has nothing to count",
  tilesToCount({ id: "none", polygons: [] }),
  null,
);

// A ward's centres, in the two lists the panel shows.
{
  const at = { lat: -1.28, lng: 36.8, placed_by: "osm" };
  const ward = toCentres(
    [
      row({ id: "c-1", code: "PS-0001", name: "BETA SCHOOL", registered_voters: 9000, ...at }),
      row({ id: "c-2", code: "PS-0002", name: "SMALL SCHOOL", registered_voters: 5000, ...at }),
      row({ id: "c-3", code: "PS-0003", name: "ALPHA SCHOOL", registered_voters: 9000, ...at }),
      row({ id: "c-4", code: "PS-0004", name: "MID UNPLACED", registered_voters: 3000 }),
      row({ id: "c-5", code: "PS-0005", name: "TINY UNPLACED", registered_voters: 100 }),
      row({ id: "c-6", code: "PS-0006", name: "ELSEWHERE", ward_id: "w-other", ...at }),
    ],
    new Map(),
  );
  const lists = wardCentres(ward, "w-kitisuru");
  eq(
    "a ward's centres on the map: the biggest register first, ties by name",
    lists.placed.map((c) => c.code),
    ["PS-0003", "PS-0001", "PS-0002"],
  );
  eq(
    "and those not on the map yet, the same way, with no other ward's",
    lists.waiting.map((c) => c.code),
    ["PS-0004", "PS-0005"],
  );
}

// Where a centre's position came from, in words.
const placement = (extra: Record<string, unknown>) => ({
  at: [36.8, -1.28] as [number, number],
  by: "osm" as const,
  accuracyM: null,
  when: null,
  who: null,
  ...extra,
});
eq(
  "each source says what it is",
  [
    placementNote(placement({ by: "osm" })),
    placementNote(placement({ by: "osm-close" })),
    placementNote(
      placement({ by: "organiser", who: "Njoki Mwangi", when: "2026-10-12T09:00:00Z" }),
    ),
    placementNote(placement({ by: "organiser" })),
    placementNote(
      placement({
        by: "agent",
        who: "Peter Otieno",
        when: "2026-10-12T09:00:00Z",
        accuracyM: 12.5,
      }),
    ),
    placementNote(placement({ by: "agent" })),
  ],
  [
    "From OpenStreetMap, where a school has this name.",
    "From OpenStreetMap, but a school with a close name rather than this one's: not confirmed yet.",
    "Placed by Njoki Mwangi on 12 Oct.",
    "Placed by an organiser.",
    "Confirmed at the centre by Peter Otieno on 12 Oct (the phone said it was good to 13 m).",
    "Confirmed at the centre by an agent.",
  ],
);

// An agent's suggestion waiting for an organiser.
{
  const suggestion = (lat: number) => ({
    at: [36.8, lat] as [number, number],
    accuracyM: 31,
    when: "2026-10-13T09:00:00Z",
    who: "Brian Otieno",
  });
  eq(
    "a suggestion says who, when, how sure the phone was, and how far it is from the pin",
    [
      suggestionNote(suggestion(-1.277844), [36.8, -1.28]),
      suggestionNote(suggestion(-1.2665), [36.8, -1.28]),
      suggestionNote(suggestion(-1.277844), null),
    ],
    [
      "Brian Otieno suggested this position on 13 Oct (the phone said it was good to 31 m), about 240 m from the pin.",
      "Brian Otieno suggested this position on 13 Oct (the phone said it was good to 31 m), about 1.5 km from the pin.",
      "Brian Otieno suggested this position on 13 Oct (the phone said it was good to 31 m).",
    ],
  );
}

// Who may put a centre on the map: what the database's functions allow.
eq(
  "the candidate, managers and organisers place centres; agents and people not yet admitted don't",
  (["super", "candidate", "manager", "organiser", "agent", "pending", null] as const).map(
    canPlaceCentres,
  ),
  [true, true, true, true, false, false, false],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
