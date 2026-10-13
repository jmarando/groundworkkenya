// Checks for the findings engine's shared parts: ordering, places, the first
// of each decision, the address's place, the figures check, number words,
// "top quarter", the seats weighed, the empty lines and the runner. Pure.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/findings-core.test.ts

import { findings } from "@/lib/findings";
import {
  count,
  emptyLine,
  finding,
  firstOfEach,
  forPlace,
  orderFindings,
  percent,
  placeParam,
  seatsOf,
  topPart,
  unaccounted,
  votersPlace,
  within,
  type Finding,
} from "@/lib/findings/core";

import { ATLAS, FULL, input, KEYS } from "./findings-fixture";

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

const go = { label: "Go", to: "/home" };
const WARD_RULES: string[] = [
  "ward-top-issue",
  "doors-behind",
  "short-of-target",
  "spend-out-of-line",
];
const f = (rule: Finding["rule"], place: string | null, weight: number, about?: string) =>
  finding(rule, place, `${rule} ${place}`, [], go, weight, about ?? place);

// ---------------------------------------------------------------- ordering

eq(
  "by decision, then the rules' order, then weight",
  orderFindings([
    f("poll-move", null, 1),
    f("votes-within-reach", KEYS.mwiki, 5),
    f("doors-behind", KEYS.kawangware, 9),
    f("votes-within-reach", KEYS.kangemi, 7),
    f("ward-top-issue", KEYS.kawangware, 1),
    f("not-visited", KEYS.mwiki, 1),
  ]).map((x) => x.id),
  [
    `not-visited:${KEYS.mwiki}`,
    `ward-top-issue:${KEYS.kawangware}`,
    `votes-within-reach:${KEYS.kangemi}`,
    `votes-within-reach:${KEYS.mwiki}`,
    `doors-behind:${KEYS.kawangware}`,
    "poll-move:campaign",
  ],
);
eq(
  "a finding's decision comes from its rule",
  f("issue-rising", null, 1, "floods").decision,
  "message",
);
eq("a campaign-wide finding's id", f("issue-rising", null, 1, "floods").id, "issue-rising:floods");

// ---------------------------------------------------------------- places

eq(
  "inside a place, itself included; Kenya holds everything",
  [
    within("nairobi/dagoretti-north", KEYS.kawangware),
    within("nairobi/dagoretti-north", "nairobi/dagoretti-north"),
    within("nairobi/dagoretti-north", "nairobi/dagoretti-northx"),
    within("kenya", "nyeri"),
  ],
  [true, true, false, true],
);
{
  const all = [
    f("poll-move", null, 1),
    f("doors-behind", KEYS.kawangware, 1),
    f("doors-behind", KEYS.mwiki, 1),
    f("votes-within-reach", "nairobi/dagoretti-north", 1),
  ];
  eq(
    "a place's findings and the campaign's",
    forPlace(all, "nairobi/dagoretti-north").map((x) => x.id),
    [
      "poll-move:campaign",
      `doors-behind:${KEYS.kawangware}`,
      "votes-within-reach:nairobi/dagoretti-north",
    ],
  );
  eq(
    "a place's findings alone",
    forPlace(all, "nairobi/dagoretti-north", false).map((x) => x.id),
    [`doors-behind:${KEYS.kawangware}`, "votes-within-reach:nairobi/dagoretti-north"],
  );
  eq("no place: everything", forPlace(all, null).length, 4);
  eq(
    "the first of each decision",
    firstOfEach(orderFindings(all)).map((x) => x.id),
    ["votes-within-reach:nairobi/dagoretti-north", "poll-move:campaign"],
  );
}
eq(
  "the address's place: a well-formed key, or none",
  [
    placeParam("nairobi/westlands"),
    placeParam("Nairobi/../x"),
    placeParam(42),
    placeParam(undefined),
  ],
  ["nairobi/westlands", null, null, null],
);

{
  const wards = [
    { id: "w-kawangware", slug: "kawangware", constituency: "Dagoretti North" },
    { id: "w-new", slug: "new-ward", constituency: "Dagoretti North" },
    { id: "w-x", slug: "x", constituency: "Nowhere" },
  ];
  const keys = { "w-kawangware": KEYS.kawangware };
  eq(
    "a Voters area in the atlas: the whole map, a ward, its constituency, or nothing known",
    [
      votersPlace({ level: "county" }, wards, keys),
      votersPlace({ level: "ward", slug: "kawangware" }, wards, keys),
      votersPlace({ level: "constituency", name: "Dagoretti North" }, wards, keys),
      votersPlace({ level: "ward", slug: "new-ward" }, wards, keys),
      votersPlace({ level: "constituency", name: "Nowhere" }, wards, keys),
    ].map((x) => (x === undefined ? "not in the atlas" : x)),
    [null, KEYS.kawangware, "nairobi/dagoretti-north", "not in the atlas", "not in the atlas"],
  );
}

// ---------------------------------------------------------------- the figures check

eq(
  "every number accounted for",
  unaccounted({
    line: "Kawangware: under 1% of its 8,830 houses knocked in 30 days.",
    figures: [
      { label: "a", value: 0.001, text: "under 1%", source: "s", period: "p" },
      { label: "b", value: 8830, text: "8,830", source: "s", period: "p" },
      { label: "c", value: 30, text: "30", source: "s", period: "p" },
    ],
  }),
  [],
);
eq(
  "a number no figure prints",
  unaccounted({
    line: "Kawangware: 2% of its 8,830 houses.",
    figures: [{ label: "b", value: 8830, text: "8,830", source: "s", period: "p" }],
  }),
  ["2"],
);

// ---------------------------------------------------------------- words and parts

eq("counts", [count(8830), count(0), count(1_204)], ["8,830", "0", "1,204"]);
eq(
  "percents",
  [percent(0.3846), percent(0.001), percent(0), percent(1)],
  ["38%", "under 1%", "0%", "100%"],
);
eq(
  "a quarter of six rounds up to two; ties by id",
  topPart([3, 1, 2, 2, 5, 4], (x) => x, 0.25, String),
  [5, 4],
);
eq(
  "a quarter of one is one",
  topPart([7], (x) => x, 0.25, String),
  [7],
);
eq(
  "a quarter of none is none",
  topPart([], (x: number) => x, 0.25, String),
  [],
);

eq("the seats weighed: a county's constituencies", seatsOf({ atlas: ATLAS, home: "nairobi" }), [
  "nairobi/dagoretti-north",
  "nairobi/westlands",
  "nairobi/kasarani",
  "nairobi/embakasi-east",
]);
eq("an MP's seat is itself", seatsOf({ atlas: ATLAS, home: "nairobi/kasarani" }), [
  "nairobi/kasarani",
]);
eq("Kenya's seats are its counties", seatsOf({ atlas: ATLAS, home: "kenya" }), ["nairobi"]);

eq(
  "what an empty group says",
  [
    emptyLine("time", { waiting: [], sideSet: false }),
    emptyLine("message", { waiting: ["ward_issues"], sideSet: true }),
    emptyLine("field", { waiting: [], sideSet: true }),
    emptyLine("rivals", { waiting: [], sideSet: true }),
  ],
  [
    "Set your side in Elections first: the diary is weighed against where the votes are.",
    "Waiting for the database update: the issues raised by ward come with it.",
    "Nothing stands out in the field figures right now.",
    "No poll moves or rivals rising in the news in the last 30 days.",
  ],
);

// ---------------------------------------------------------------- the runner

{
  const logged: string[] = [];
  const out = findings(
    FULL,
    {
      "poll-move": () => {
        throw new Error("bad poll");
      },
      "doors-behind": () => [f("doors-behind", KEYS.kawangware, 1)],
    },
    (message) => logged.push(message),
  );
  eq(
    "a rule that throws is left out and logged",
    [out.map((x) => x.id), logged],
    [[`doors-behind:${KEYS.kawangware}`], ["The poll-move rule failed"]],
  );
}
{
  const logged: string[] = [];
  const out = findings(input({ wards: [] }), undefined, (message) => logged.push(message));
  eq(
    "no campaign wards: the ward rules are quiet and nothing throws",
    [logged, out.filter((x) => WARD_RULES.includes(x.rule)).length],
    [[], 0],
  );
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
