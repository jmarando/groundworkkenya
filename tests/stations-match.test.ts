// Checks for placing polling centres from OpenStreetMap's schools (src/lib/stations/match.ts)
// and the distance to a ward's edge it uses (src/lib/geo.ts). Pure. Run from the repository
// root:
//   npx tsx --tsconfig tsconfig.json tests/stations-match.test.ts

import { distanceOutsideM, type LngLat, type Ring } from "@/lib/geo";
import {
  coreWords,
  nameMatch,
  nameWords,
  overpassSchools,
  placeCentre,
  schoolKind,
  type School,
} from "@/lib/stations/match";

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

eq("words, lower case, no punctuation", nameWords("St. Mary's Primary School, Riruta"), [
  "st",
  "marys",
  "primary",
  "school",
  "riruta",
]);
eq("the register's lost apostrophe", nameWords("ST MARY S PRIMARY SCHOOL"), [
  "st",
  "marys",
  "primary",
  "school",
]);
eq("the kind of school isn't part of which", coreWords("KILIMANI PRIMARY SCHOOL"), ["kilimani"]);
eq("primary", schoolKind("Kilimani Pri. Sch"), "primary");
eq("secondary, high school", schoolKind("Pangani Girls High School"), "secondary");
eq("no kind", schoolKind("City Prime Centre"), null);

eq(
  "the same name, in another order",
  nameMatch("HGM PRIMARY SCHOOL,RIRUTA", "Riruta HGM Primary School"),
  "exact",
);
eq(
  "one word more",
  nameMatch("NEW KIHUMBUINI PRIMARY SCHOOLL", "New Kihumbuini Primary School"),
  "close",
);
eq("one word different", nameMatch("ST JOSEPH KANGEMI", "St Joseph Kawangware"), "close");
eq("only one word the same", nameMatch("ST JOSEPH", "St Mary"), null);
eq("two words off", nameMatch("OUR LADY OF MERCY", "Our Lady of Fatima Girls"), null);

// A ward about 2.2 km across, around (36.80, -1.28).
const ward: Ring[][] = [
  [
    [
      [36.79, -1.29],
      [36.81, -1.29],
      [36.81, -1.27],
      [36.79, -1.27],
      [36.79, -1.29],
    ],
  ],
];
const east = (m: number): LngLat => [
  36.81 + m / (111_195 * Math.cos((1.28 * Math.PI) / 180)),
  -1.28,
];
eq("inside the ward", distanceOutsideM([36.8, -1.28], ward), 0);
eq("a kilometre past its edge", Math.round(distanceOutsideM(east(1000), ward)), 1000);

const school = (id: string, name: string, at: LngLat, area = false): School => ({
  id,
  name,
  at,
  area,
});
eq(
  "a school of that name in the ward",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [
    school("node/1", "Kilimani Primary School", [36.8, -1.28]),
  ]),
  { at: [36.8, -1.28], placedBy: "osm", osmId: "node/1", osmName: "Kilimani Primary School" },
);
eq(
  "near the ward",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [school("node/1", "Kilimani Primary", east(1500))])
    ?.placedBy,
  "osm",
);
eq(
  "too far from the ward",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [school("node/1", "Kilimani Primary", east(2500))]),
  null,
);
eq(
  "never a secondary for a primary",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [
    school("node/1", "Kilimani Secondary School", [36.8, -1.28]),
  ]),
  null,
);
eq(
  "inside the ward before outside it",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [
    school("node/1", "Kilimani Primary", east(300)),
    school("node/2", "Kilimani Primary", [36.795, -1.285]),
  ])?.osmId,
  "node/2",
);
eq(
  "one school drawn twice: its campus over its point",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [
    school("node/1", "Kilimani Primary School", [36.8, -1.28]),
    school("way/2", "Kilimani Primary School", [36.8005, -1.2805], true),
  ]),
  { at: [36.8005, -1.2805], placedBy: "osm", osmId: "way/2", osmName: "Kilimani Primary School" },
);
eq(
  "the same name 900 m apart: only close",
  placeCentre("KILIMANI PRIMARY SCHOOL", ward, [
    school("node/1", "Kilimani Primary School", [36.795, -1.28]),
    school("node/2", "Kilimani Primary School", [36.8031, -1.28]),
  ])?.placedBy,
  "osm-close",
);
eq(
  "a close name is a hollow pin",
  placeCentre("NEW KIHUMBUINI PRIMARY SCHOOLL", ward, [
    school("node/1", "New Kihumbuini Primary School", [36.8, -1.28]),
  ])?.placedBy,
  "osm-close",
);
eq(
  "an exact name before a close one",
  placeCentre("ST JOSEPH KANGEMI", ward, [
    school("node/1", "St Joseph Kawangware", [36.8, -1.28]),
    school("node/2", "St Joseph Kangemi", [36.795, -1.275]),
  ])?.osmId,
  "node/2",
);

eq(
  "schools from an Overpass reply",
  overpassSchools({
    elements: [
      { type: "node", id: 1, lat: -1.28, lon: 36.8, tags: { name: "Kilimani Primary" } },
      { type: "way", id: 2, center: { lat: -1.27, lon: 36.79 }, tags: { name: " Moi Girls " } },
      { type: "node", id: 3, lat: -1.2, lon: 36.7, tags: { amenity: "school" } },
      { type: "relation", id: 4, tags: { name: "No centre" } },
    ],
  }),
  [
    { id: "node/1", name: "Kilimani Primary", at: [36.8, -1.28], area: false },
    { id: "way/2", name: "Moi Girls", at: [36.79, -1.27], area: true },
  ],
);
eq("not an Overpass reply", overpassSchools({ remark: "timeout" }), []);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
