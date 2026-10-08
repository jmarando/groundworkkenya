// Checks for what the Elections section shows: an area's count, its figures in
// a race and year, the ranking of its parts, its results tables and the map's
// colours. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-view.test.ts

import {
  TODO_COLOURS,
  blocsIn,
  countAt,
  figuresFor,
  raceInText,
  rankChildren,
  resultBlocks,
  shadeOf,
  signedPoints,
  type AtlasData,
} from "@/lib/atlas-view";

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
const r4 = (x: number | null | undefined) =>
  x === null || x === undefined ? x : Math.round(x * 1e4) / 1e4;

const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/a", level: "constituency", name: "Alpha", parent: "nairobi" },
    { key: "nairobi/b", level: "constituency", name: "Beta", parent: "nairobi" },
    { key: "nairobi/c", level: "constituency", name: "Gamma", parent: "nairobi" },
    { key: "nairobi/a/w1", level: "ward", name: "Ward One", parent: "nairobi/a" },
  ],
  candidates: [
    {
      id: "g22-s",
      election: "2022-governor",
      seat: "nairobi",
      name: "Sakaja",
      party: "UDA",
      bloc: "Kenya Kwanza",
    },
    {
      id: "g22-i",
      election: "2022-governor",
      seat: "nairobi",
      name: "Igathe",
      party: "Jubilee",
      bloc: "Azimio",
    },
    {
      id: "g17-s",
      election: "2017-governor",
      seat: "nairobi",
      name: "Sonko",
      party: "Jubilee",
      bloc: "Jubilee",
    },
    {
      id: "g17-k",
      election: "2017-governor",
      seat: "nairobi",
      name: "Kidero",
      party: "ODM",
      bloc: "NASA",
    },
  ],
  results: [
    { candidate: "g22-s", area: "nairobi", votes: 600, source: "iebc" },
    { candidate: "g22-i", area: "nairobi", votes: 400, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/a", votes: 240, source: "iebc" },
    { candidate: "g22-i", area: "nairobi/a", votes: 225, source: "iebc" },
    { candidate: "g17-s", area: "nairobi/a", votes: 300, source: "iebc" },
    { candidate: "g17-k", area: "nairobi/a", votes: 200, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/b", votes: 280, source: "iebc" },
    { candidate: "g22-i", area: "nairobi/b", votes: 120, source: "iebc" },
    { candidate: "g22-s", area: "nairobi/c", votes: 60, source: "star" },
    { candidate: "g22-i", area: "nairobi/c", votes: 140, source: "star" },
  ],
  turnout: [
    {
      election: "2022-governor",
      area: "nairobi",
      registered: 3000,
      cast: 1500,
      rejected: null,
      valid: null,
      source: "iebc",
    },
    {
      election: "2022-governor",
      area: "nairobi/a",
      registered: 1000,
      cast: 505,
      rejected: 5,
      valid: 500,
      source: "iebc",
    },
    {
      election: "2017-governor",
      area: "nairobi/a",
      registered: 900,
      cast: 510,
      rejected: 10,
      valid: 500,
      source: "iebc",
    },
    {
      election: "2022-governor",
      area: "nairobi/b",
      registered: 800,
      cast: 410,
      rejected: 10,
      valid: 400,
      source: "iebc",
    },
  ],
  register: [
    { year: 2022, area: "nairobi/a", registered: 1000, source: "iebc" },
    { year: 2017, area: "nairobi/a", registered: 900, source: "iebc" },
    { year: 2022, area: "nairobi/b", registered: 800, source: "iebc" },
  ],
  population: [
    {
      area: "nairobi/a",
      year: 2020,
      total: 2000,
      adults: 1500,
      youngAdults: 600,
      source: "worldpop",
    },
    {
      area: "nairobi/b",
      year: 2020,
      total: 900,
      adults: 600,
      youngAdults: 300,
      source: "worldpop",
    },
  ],
  sources: [
    { id: "iebc", title: "Form 37C (test)", publisher: "IEBC", url: null, note: null },
    { id: "star", title: "A newspaper tally", publisher: "The Star", url: null, note: null },
    { id: "worldpop", title: "WorldPop", publisher: "WorldPop", url: null, note: null },
  ],
  homeArea: null,
  sides: { "2022-governor": "Kenya Kwanza", "2017-governor": "Jubilee" },
  notes: {},
};

eq("an area's count", countAt(D, "2022-governor", "nairobi/a"), {
  year: 2022,
  candidates: [
    { name: "Sakaja", party: "UDA", bloc: "Kenya Kwanza", votes: 240 },
    { name: "Igathe", party: "Jubilee", bloc: "Azimio", votes: 225 },
  ],
  registered: 1000,
  cast: 505,
  rejected: 5,
  valid: 500,
});
eq("no count where nothing was found", countAt(D, "2013-governor", "nairobi/a"), null);

const A = figuresFor(D, "nairobi/a", "governor", 2022);
eq(
  "Alpha's figures",
  [
    r4(A.ourShare),
    r4(A.margin),
    r4(A.turnout),
    r4(A.swing),
    A.yearBefore,
    A.todo?.todo,
    A.reach,
    A.tag,
  ],
  [
    0.48,
    0.03,
    0.505,
    -0.12,
    2017,
    "persuade",
    { turnout: null, persuasion: 25, total: 25, partial: true },
    "IEBC · constituency total · 2022",
  ],
);
eq(
  "its register and people",
  [
    A.registered,
    A.growth?.change,
    r4(A.growth?.rate ?? null),
    A.notRegistered,
    A.estimateBelowRegister,
  ],
  [1000, 100, 0.1111, { adults: 500, youngShare: 0.4 }, false],
);
const B = figuresFor(D, "nairobi/b", "governor", 2022);
eq(
  "the estimate below the register",
  [B.todo?.todo, B.notRegistered, B.estimateBelowRegister],
  ["hold", null, true],
);
const C = figuresFor(D, "nairobi/c", "governor", 2022);
eq(
  "a listed-only count",
  [C.listedOnly, r4(C.ourShare), C.todo?.todo, C.turnout, C.tag],
  [true, 0.3, "cut", null, "The Star · constituency total · 2022"],
);
const W = figuresFor(D, "nairobi/a/w1", "governor", 2022);
eq("a ward with no count of its own", [W.count, W.todo, W.reach, W.tag], [null, null, null, null]);
eq(
  "the county's parts, most votes within reach first",
  rankChildren(D, "nairobi", "governor", 2022).map((f) => f.key),
  ["nairobi/a", "nairobi/b", "nairobi/c"],
);
eq(
  "results tables, newest first",
  resultBlocks(D, "nairobi/a").map((b) => [
    b.race,
    b.year,
    b.rows.map((r) => [r.name, r4(r.share)]),
  ]),
  [
    [
      "governor",
      2022,
      [
        ["Sakaja", 0.48],
        ["Igathe", 0.45],
      ],
    ],
    [
      "governor",
      2017,
      [
        ["Sonko", 0.6],
        ["Kidero", 0.4],
      ],
    ],
  ],
);
eq("the blocs to pick a side from, most votes first", blocsIn(D, "2022-governor"), [
  "Kenya Kwanza",
  "Azimio",
]);
eq(
  "the map's colours",
  [shadeOf(A, "todo"), shadeOf(W, "lean"), shadeOf(B, "lean")?.label],
  [{ colour: TODO_COLOURS.persuade, label: "Persuade" }, null, "ahead by 40 points"],
);
const D2: AtlasData = {
  ...D,
  candidates: [
    ...D.candidates,
    {
      id: "g13-k",
      election: "2013-governor",
      seat: "nairobi",
      name: "Kidero",
      party: "ODM",
      bloc: "CORD",
    },
  ],
  results: [...D.results, { candidate: "g13-k", area: "nairobi/b", votes: 300, source: "iebc" }],
};
eq(
  "swing is against the previous general election only, so 2013 doesn't stand in for a missing 2017",
  [
    figuresFor(D2, "nairobi/b", "governor", 2022).swing,
    figuresFor(D2, "nairobi/b", "governor", 2022).yearBefore,
  ],
  [null, null],
);
const D3: AtlasData = {
  ...D,
  turnout: [
    ...D.turnout,
    {
      election: "2017-governor",
      area: "nairobi/c",
      registered: 700,
      cast: 400,
      rejected: null,
      valid: null,
      source: "iebc",
    },
  ],
};
eq(
  "which year's register: 2022's, else the election's own",
  [
    A.registeredYear,
    figuresFor(D3, "nairobi/c", "governor", 2017).registeredYear,
    W.registeredYear,
  ],
  [2022, 2017, null],
);
eq(
  "signed points",
  [signedPoints(0.052), signedPoints(-0.12), signedPoints(0)],
  ["+5.2 points", "−12 points", "0 points"],
);

const P: AtlasData = {
  ...D,
  areas: [
    ...D.areas,
    { key: "nyeri", level: "county", name: "Nyeri", parent: "kenya" },
    { key: "nyeri/m", level: "constituency", name: "Mathira", parent: "nyeri" },
    { key: "nyeri/x", level: "constituency", name: "Kieni", parent: "nyeri" },
    { key: "nyeri/m/w1", level: "ward", name: "One", parent: "nyeri/m" },
    { key: "nyeri/m/w2", level: "ward", name: "Two", parent: "nyeri/m" },
  ],
  population: [
    ...D.population,
    { area: "nyeri/m/w1", year: 2020, total: 100, adults: 60, youngAdults: 30, source: "worldpop" },
    { area: "nyeri/m/w2", year: 2020, total: 50, adults: 40, youngAdults: 10, source: "worldpop" },
  ],
};
const M = figuresFor(P, "nyeri/m", "mp", 2022);
eq(
  "a constituency's people: the sum of its wards' estimates",
  [M.population, M.populationParts],
  [
    { area: "nyeri/m", year: 2020, total: 150, adults: 100, youngAdults: 40, source: "worldpop" },
    2,
  ],
);
eq(
  "a sum with a part missing stays missing",
  [
    figuresFor(P, "nyeri", "mp", 2022).population,
    figuresFor(D, "nairobi", "governor", 2022).population,
  ],
  [null, null],
);
eq("an area's own estimate comes first", [A.population?.total, A.populationParts], [2000, null]);
eq(
  "the register from the same day's other race",
  figuresFor(D, "nairobi", "president", 2022).registered,
  3000,
);
eq(
  "races in a sentence",
  [raceInText("mp"), raceInText("governor"), raceInText("president")],
  ["MP", "governor", "president"],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
