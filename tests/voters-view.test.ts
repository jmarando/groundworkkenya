// Checks for the Voters screen's rules: the address's area, tab, house and
// filters, an area's numbers, who matches, and the links in and out. Pure;
// nothing leaves this process. Run from the repository root:
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
  share,
  stepFor,
  pageWithin,
  validateVotersSearch,
  wardsIn,
  type VotersSearch,
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
    tab: "people",
    house: " 6gcrpqm6+v9f4 ",
    colour: "support",
    base: "streets",
    support: "strong",
    consent: "sms",
    contact: "week",
    person: "p-1",
    manage: true,
    other: "x",
  }),
  {
    area: "w:kileleshwa",
    tab: "people",
    house: "6GCRPQM6+V9F4",
    colour: "support",
    base: "streets",
    support: "strong",
    consent: "sms",
    contact: "week",
    person: "p-1",
    manage: true,
  },
);
eq(
  "unknown values are dropped",
  validateVotersSearch({ tab: "doors", colour: "red", base: "moon", support: "max" }),
  {},
);
eq(
  "a bad house is dropped, so the map opens the area instead",
  [
    validateVotersSearch({ house: "hello" }),
    validateVotersSearch({ house: "6GCRPQM6+V9F4;x" }),
    validateVotersSearch({ house: 42 }),
  ],
  [{}, {}, {}],
);
eq("manage from a link", validateVotersSearch({ manage: 1 }).manage, true);
eq(
  "old links: view=people is the People tab; view=doors and view=wards open the map",
  [
    validateVotersSearch({ view: "people", person: "p-9" }),
    validateVotersSearch({ view: "doors" }),
    validateVotersSearch({ view: "wards", area: "c:Westlands" }),
  ],
  [{ tab: "people", person: "p-9" }, {}, { area: "c:Westlands" }],
);

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
{
  const MATHIRA = { name: "Mathira", top: "constituency" } as const;
  const wards = [ward("m1", "konyu", "Konyu", "Mathira", 2)];
  eq(
    "a constituency's map: its name on top, and no crumb for itself",
    [
      areaTitle({ level: "county" }, wards, MATHIRA),
      crumbsOf({ level: "ward", slug: "konyu" }, wards, MATHIRA).map((c) => [
        c.label,
        areaParam(c.area) ?? null,
      ]),
    ],
    [
      "Mathira",
      [
        ["Mathira", null],
        ["Konyu ward", "w:konyu"],
      ],
    ],
  );
}

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
  tab: "people",
  person: "p-9",
});
eq("an old People link without one", peopleForward({}), { tab: "people" });

eq(
  "a change to the address; undefined removes",
  nextSearch(
    { area: "w:kileleshwa", tab: "people", person: "p-1" },
    { area: "c:Mathare", person: undefined },
  ),
  { area: "c:Mathare", tab: "people" },
);
eq(
  "an old view=people still in the address doesn't hold the People tab open",
  nextSearch({ view: "people", area: "c:Mathare" } as VotersSearch, { tab: undefined }),
  { area: "c:Mathare" },
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

eq(
  "a share too small to round is not 0%",
  [share(0.0002), share(0), share(0.336), share(1)],
  ["under 1%", "0%", "34%", "100%"],
);

eq(
  "a new area, tab or house is a step Back undoes; only a new area or tab goes back to the top",
  [
    stepFor({ area: "c:Mathare", house: undefined }),
    stepFor({ tab: undefined }),
    stepFor({ house: "6GCRPQM6+V9F4" }),
    stepFor({ colour: "support" }),
    stepFor({ support: "strong" }),
  ],
  [
    { replace: false, resetScroll: true },
    { replace: false, resetScroll: true },
    { replace: false, resetScroll: false },
    { replace: true, resetScroll: false },
    { replace: true, resetScroll: false },
  ],
);

eq(
  "a page past the end of a shorter list comes back to the last page",
  [pageWithin(3, 5, 12), pageWithin(1, 30, 12), pageWithin(4, 30, 12), pageWithin(2, 0, 12)],
  [0, 1, 2, 0],
);
eq(
  "the county counts people not yet placed in a ward",
  areaNumbers({ level: "county" }, WARDS, DOORS, { people: 50, knocked: 10, doors30: 7 }),
  { registered: 6000, target: 600, onFile: 350, supporters: 240, doors: 132, coverage: 110 / 300 },
);
eq(
  "a constituency doesn't",
  areaNumbers(DN, WARDS, DOORS, { people: 50, knocked: 10, doors30: 7 }).onFile,
  250,
);
eq("a group in the address", validateVotersSearch({ segment: "boda" }).segment, "boda");
eq("a group that isn't a slug is dropped", validateVotersSearch({ segment: "Boda Riders!" }), {});
eq(
  "the group filter",
  [
    matchPerson(person({ segment: "boda" }), DN, WARDS, { segment: "boda" }, NOW),
    matchPerson(person({ segment: "youth" }), DN, WARDS, { segment: "boda" }, NOW),
    matchPerson(person({ segment: null }), DN, WARDS, { segment: "boda" }, NOW),
  ],
  [true, false, false],
);

// The polling centre open on the map: by its short code, so a link or a reload opens it.
eq(
  "a centre in the address, by its code in capitals",
  validateVotersSearch({ centre: "ps-0042" }).centre,
  "PS-0042",
);
eq(
  "a centre that isn't a code is dropped, so the map opens the area instead",
  [
    validateVotersSearch({ centre: "PS 0042" }),
    validateVotersSearch({ centre: "x" }),
    validateVotersSearch({ centre: "PS-0042;drop" }),
    validateVotersSearch({ centre: 42 }),
  ],
  [{}, {}, {}, {}],
);
eq(
  "a link opens a centre in the area it names",
  nextSearch({ area: "w:kileleshwa" }, { centre: "PS-0042" }),
  { area: "w:kileleshwa", centre: "PS-0042" },
);
eq(
  "closing it takes it out of the address",
  nextSearch({ area: "w:kileleshwa", centre: "PS-0042" }, { centre: undefined }),
  { area: "w:kileleshwa" },
);
eq(
  "opening a centre is a step Back undoes, and doesn't go back to the top",
  stepFor({ centre: "PS-0042" }),
  { replace: false, resetScroll: false },
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
