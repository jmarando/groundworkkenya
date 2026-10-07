// Checks for the atlas across the app: where a campaign's ward or a Voters
// area sits in the atlas, the last count there, a diary stop's brief, Home's
// places where votes can move, 2022 turnout, today's turnout so far, and the
// map key. Pure. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/atlas-app.test.ts

import {
  briefLine,
  lastHere,
  reportedTurnout,
  topMoves,
  turnout2022,
  votersKey,
  wardKey,
} from "@/lib/atlas-app";
import { shadeLegend, type AtlasData } from "@/lib/atlas-view";

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

const D: AtlasData = {
  areas: [
    { key: "kenya", level: "country", name: "Kenya", parent: null },
    { key: "nairobi", level: "county", name: "Nairobi", parent: "kenya" },
    { key: "nairobi/westlands", level: "constituency", name: "Westlands", parent: "nairobi" },
    { key: "nairobi/kibra", level: "constituency", name: "Kibra", parent: "nairobi" },
    {
      key: "nairobi/westlands/kangemi",
      level: "ward",
      name: "Kangemi",
      parent: "nairobi/westlands",
    },
    { key: "nyeri", level: "county", name: "Nyeri", parent: "kenya" },
    { key: "nyeri/mathira", level: "constituency", name: "Mathira", parent: "nyeri" },
    { key: "nyeri/mathira/iriaini", level: "ward", name: "Iriaini", parent: "nyeri/mathira" },
  ],
  candidates: [
    {
      id: "g-s",
      election: "2022-governor",
      seat: "nairobi",
      name: "Sakaja",
      party: "UDA",
      bloc: "Kenya Kwanza",
    },
    {
      id: "g-i",
      election: "2022-governor",
      seat: "nairobi",
      name: "Igathe",
      party: "Jubilee",
      bloc: "Azimio",
    },
  ],
  results: [
    { candidate: "g-s", area: "nairobi/westlands", votes: 240, source: "iebc" },
    { candidate: "g-i", area: "nairobi/westlands", votes: 225, source: "iebc" },
    { candidate: "g-s", area: "nairobi/kibra", votes: 280, source: "star" },
    { candidate: "g-i", area: "nairobi/kibra", votes: 120, source: "star" },
  ],
  turnout: [
    {
      election: "2022-governor",
      area: "nairobi/westlands",
      registered: 1000,
      cast: 505,
      rejected: 5,
      valid: 500,
      source: "iebc",
    },
    {
      election: "2022-president",
      area: "nairobi/kibra",
      registered: 800,
      cast: 410,
      rejected: 10,
      valid: 400,
      source: "iebc",
    },
  ],
  register: [],
  population: [],
  sources: [
    { id: "iebc", title: "Form 37B (test)", publisher: "IEBC", url: null, note: null },
    { id: "star", title: "A tally", publisher: "The Star", url: null, note: null },
  ],
  homeArea: null,
  sides: { "2022-governor": "Kenya Kwanza" },
  notes: {},
};
const NO_SIDE: AtlasData = { ...D, sides: {} };

eq(
  "a campaign ward's place: the ward, else its constituency, else nothing",
  [
    wardKey(D, "Westlands", "kangemi"),
    wardKey(D, "Westlands", "parklands"),
    wardKey(D, "Nowhere", "kangemi"),
    wardKey(D, null, "kangemi"),
  ],
  ["nairobi/westlands/kangemi", "nairobi/westlands", null, null],
);
const wards = [{ slug: "kangemi", constituency: "Westlands" }];
eq(
  "a Voters area's place: the top is the home area",
  [
    votersKey(D, { level: "county" }, wards, "nairobi"),
    votersKey(D, { level: "constituency", name: "Westlands" }, wards, "nairobi"),
    votersKey(D, { level: "ward", slug: "kangemi" }, wards, "nairobi"),
    votersKey(D, { level: "ward", slug: "unknown" }, wards, "nairobi"),
  ],
  ["nairobi", "nairobi/westlands", "nairobi/westlands/kangemi", null],
);
const k = lastHere(D, "nairobi/westlands/kangemi", "governor");
eq(
  "a ward's last count is its constituency's",
  [k?.at, k?.year, k?.share, k?.todo, k?.constituencyFigure],
  ["nairobi/westlands", 2022, "48.0% to us", "persuade", true],
);
eq(
  "without a side, the leading bloc",
  lastHere(NO_SIDE, "nairobi/westlands", "governor")?.share,
  "Kenya Kwanza 48.0%",
);
eq(
  "no count here",
  [lastHere(D, "nyeri/mathira", "mp"), lastHere(D, "nyeri/mathira/iriaini", "governor")],
  [null, null],
);
eq(
  "a diary stop's brief",
  [
    briefLine(D, "nairobi/westlands/kangemi", "governor"),
    briefLine(NO_SIDE, "nairobi/westlands", "governor"),
    briefLine(D, "nairobi/kibra", "governor"),
  ],
  [
    "Persuade: 48.0% to us in 2022, turnout 51% (Westlands)",
    "Kenya Kwanza 48.0% in 2022, turnout 51%",
    "Hold: 70.0% to us in 2022",
  ],
);
eq(
  "a place the atlas doesn't hold",
  [briefLine(D, null, "governor"), briefLine(D, "mombasa/x", "governor")],
  [null, null],
);
eq(
  "where votes can move: most within reach first, a side set",
  [
    topMoves(D, "nairobi", "governor").map((f) => f.key),
    topMoves(D, "nairobi", "governor", 1).map((f) => f.key),
    topMoves(NO_SIDE, "nairobi", "governor"),
  ],
  [["nairobi/westlands", "nairobi/kibra"], ["nairobi/westlands"], []],
);
eq(
  "2022 turnout: the campaign's race, else the same day's other race",
  [
    turnout2022(D, "nairobi/westlands", "governor"),
    turnout2022(D, "nairobi/kibra", "governor"),
    turnout2022(D, "nairobi", "governor"),
    turnout2022(D, null, "governor"),
  ],
  [{ turnout: 0.505, race: "governor" }, { turnout: 0.5125, race: "president" }, null, null],
);
eq(
  "turnout at the stations reported so far",
  [
    reportedTurnout([
      { registered: 500, cast: 300, reported: true },
      { registered: 400, cast: 0, reported: false },
      { registered: 0, cast: 5, reported: true },
    ]),
    reportedTurnout([{ registered: 500, cast: 0, reported: false }]),
  ],
  [0.6, null],
);
eq("before any station reports", reportedTurnout([]), null);
eq(
  "the map key",
  [
    shadeLegend("todo").map((l) => l.label),
    shadeLegend("lean").map((l) => l.colour),
    shadeLegend("swing").map((l) => l.label),
  ],
  [
    ["Mobilise", "Hold", "Persuade", "Cut the gap", "Lean ours", "Lean theirs"],
    ["hsl(0 70% 52%)", "hsl(40 90% 52%)", "hsl(142 60% 38%)"],
    ["15 points or more away", "No change", "15 points or more our way"],
  ],
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
