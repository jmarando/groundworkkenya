// Checks for the Voters screen's rules: the address's area, view and filters,
// an area's numbers, who matches, what an agent sees, and the links in and
// out. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/voters-view.test.ts

import {
  areaNumbers,
  areaParam,
  areaTitle,
  broadcastSearch,
  crumbsOf,
  doorIssues,
  inArea,
  matchPerson,
  nextSearch,
  parseArea,
  parseBroadcastSearch,
  peopleForward,
  validateVotersSearch,
  viewOf,
  viewsFor,
  wardsIn,
  type WardInfo,
} from "@/lib/voters-view";

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

const ward = (
  id: string,
  slug: string,
  name: string,
  constituency: string,
  n: number,
): WardInfo => ({
  id,
  slug,
  name,
  constituency,
  registered: n * 1000,
  target: n * 100,
  supporters: n * 40,
  people: n * 50,
  contacted: n * 5,
});
const WARDS = [
  ward("w1", "kileleshwa", "Kileleshwa", "Dagoretti North", 2),
  ward("w2", "kawangware", "Kawangware", "Dagoretti North", 3),
  ward("w3", "mabatini", "Mabatini", "Mathare", 1),
];

eq(
  "an address, cleaned",
  validateVotersSearch({
    area: "w:kileleshwa",
    view: "doors",
    support: "strong",
    consent: "sms",
    contact: "week",
    person: "p-1",
    manage: true,
    other: "x",
  }),
  {
    area: "w:kileleshwa",
    view: "doors",
    support: "strong",
    consent: "sms",
    contact: "week",
    person: "p-1",
    manage: true,
  },
);
eq("an unknown view is dropped", validateVotersSearch({ view: "nonsense", support: "max" }), {});
eq("manage from a link", validateVotersSearch({ manage: 1 }).manage, true);

eq("the county", parseArea(undefined, WARDS), { level: "county" });
eq("a constituency", parseArea("c:Dagoretti North", WARDS), {
  level: "constituency",
  name: "Dagoretti North",
});
eq("a ward", parseArea("w:mabatini", WARDS), { level: "ward", slug: "mabatini" });
eq("an unknown ward is the county", parseArea("w:nowhere", WARDS), { level: "county" });
eq("an unknown constituency too", parseArea("c:Atlantis", WARDS), { level: "county" });
eq(
  "back to the address",
  [
    areaParam({ level: "county" }),
    areaParam({ level: "constituency", name: "Mathare" }),
    areaParam({ level: "ward", slug: "mabatini" }),
  ],
  [undefined, "c:Mathare", "w:mabatini"],
);

const DN = { level: "constituency", name: "Dagoretti North" } as const;
const KILE = { level: "ward", slug: "kileleshwa" } as const;
eq(
  "the wards in a constituency",
  wardsIn(DN, WARDS).map((w) => w.id),
  ["w1", "w2"],
);
eq(
  "titles",
  [areaTitle({ level: "county" }, WARDS), areaTitle(DN, WARDS), areaTitle(KILE, WARDS)],
  ["Nairobi County", "Dagoretti North", "Kileleshwa ward"],
);
eq(
  "the breadcrumb to a ward",
  crumbsOf(KILE, WARDS).map((c) => [c.label, areaParam(c.area) ?? null]),
  [
    ["Nairobi County", null],
    ["Dagoretti North", "c:Dagoretti North"],
    ["Kileleshwa ward", "w:kileleshwa"],
  ],
);

const DOORS = [
  { id: "w1", people: 100, knocked: 40, doors30: 55 },
  { id: "w2", people: 150, knocked: 60, doors30: 70 },
];
eq("a constituency's numbers", areaNumbers(DN, WARDS, DOORS), {
  registered: 5000,
  target: 500,
  onFile: 250,
  supporters: 200,
  doors: 125,
  coverage: 0.4,
});
eq("a ward nobody has knocked", areaNumbers({ level: "ward", slug: "mabatini" }, WARDS, DOORS), {
  registered: 1000,
  target: 100,
  onFile: 50,
  supporters: 40,
  doors: 0,
  coverage: 0,
});

eq("the views above a ward", viewsFor(false, DN), ["people", "doors", "wards"]);
eq("in a ward, no wards view", viewsFor(false, KILE), ["people", "doors"]);
eq("an agent sees doors only", viewsFor(true, DN), ["doors"]);
eq("an agent asks for People and gets Doors", viewOf({ view: "people" }, true, DN), "doors");
eq("the default above a ward", viewOf({}, false, DN), "wards");
eq("the default in a ward", viewOf({}, false, KILE), "people");
eq("a wards view asked for inside a ward", viewOf({ view: "wards" }, false, KILE), "people");

const NOW = Date.UTC(2026, 9, 4, 9);
const daysAgo = (d: number) => new Date(NOW - d * 864e5).toISOString();
const person = (over: Record<string, unknown> = {}) => ({
  ward: "Kileleshwa",
  constituency: "Dagoretti North",
  support: 75,
  channels: ["SMS"],
  optedOut: false,
  lastTouch: daysAgo(3),
  ...over,
});
eq(
  "in the area",
  [
    inArea("Kileleshwa", DN, WARDS),
    inArea("Mabatini", DN, WARDS),
    inArea(null, { level: "county" }, WARDS),
  ],
  [true, false, true],
);
eq(
  "a strong supporter, by SMS, seen this week",
  matchPerson(person(), DN, WARDS, { support: "strong", consent: "sms", contact: "week" }, NOW),
  true,
);
eq(
  "filters that don't match",
  [
    matchPerson(person({ support: 50 }), DN, WARDS, { support: "strong" }, NOW),
    matchPerson(person({ support: 50 }), DN, WARDS, { support: "persuadable" }, NOW),
    matchPerson(person({ support: 0 }), DN, WARDS, { support: "unscored" }, NOW),
    matchPerson(person({ support: 20 }), DN, WARDS, { support: "against" }, NOW),
    matchPerson(person({ optedOut: true }), DN, WARDS, { consent: "sms" }, NOW),
    matchPerson(person({ channels: [] }), DN, WARDS, { consent: "none" }, NOW),
    matchPerson(person({ lastTouch: daysAgo(20) }), DN, WARDS, { contact: "week" }, NOW),
    matchPerson(person({ lastTouch: daysAgo(20) }), DN, WARDS, { contact: "month" }, NOW),
    matchPerson(person({ lastTouch: null }), DN, WARDS, { contact: "never" }, NOW),
    matchPerson(person({ ward: "Mabatini", constituency: "Mathare" }), DN, WARDS, {}, NOW),
  ],
  [false, true, true, true, false, true, false, true, true, false],
);

eq("a constituency carries all its wards", broadcastSearch(DN, WARDS, "strong"), {
  wards: "w1,w2",
  support: "strong",
});
eq("the county, everyone", broadcastSearch({ level: "county" }, WARDS), {});
eq("Broadcast reads it back", parseBroadcastSearch({ wards: "w1,w2", support: "persuadable" }), {
  wardIds: ["w1", "w2"],
  strong: false,
  persuadable: true,
});
eq("Broadcast with nothing chosen keeps its defaults", parseBroadcastSearch({}), {
  wardIds: [],
  strong: true,
  persuadable: true,
});
eq("an old People link keeps its person", peopleForward({ person: "p-9" }), {
  view: "people",
  person: "p-9",
});
eq("an old People link without one", peopleForward({}), { view: "people" });

eq(
  "a change to the address; undefined removes",
  nextSearch(
    { area: "w:kileleshwa", view: "people", person: "p-1" },
    { area: "c:Mathare", person: undefined },
  ),
  { area: "c:Mathare", view: "people" },
);
eq(
  "what came up at the door across an area",
  doorIssues(
    [
      {
        name: "Kileleshwa",
        issues: [
          { name: "Water", count: 3 },
          { name: "Roads", count: 1 },
        ],
      },
      {
        name: "Kawangware",
        issues: [
          { name: "Water", count: 2 },
          { name: "Jobs", count: 2 },
        ],
      },
      { name: "Mabatini", issues: [{ name: "Roads", count: 9 }] },
    ],
    DN,
    WARDS,
  ),
  [
    { name: "Water", count: 5 },
    { name: "Jobs", count: 2 },
    { name: "Roads", count: 1 },
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
