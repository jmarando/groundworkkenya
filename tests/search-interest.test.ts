// Checks for search interest: reading SerpApi's Google Trends answer, when an
// answer is too thin to show, a rival searched far more this week, and the
// chart's lines. Pure; nothing leaves this process. Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/search-interest.test.ts

import type { RaceRival } from "@/lib/race-data";
import {
  ISSUE_SEARCH,
  isThin,
  issueAverages,
  monthAverages,
  parseTrends,
  searchChart,
  searchFromRow,
  searchName,
  searchSpike,
  searchSummary,
  type SearchRead,
} from "@/lib/search-interest";

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

// SerpApi's documented answer: a timeline of days, each with a value per term.
const ts = (day: string) => String(Date.parse(`${day}T00:00:00Z`) / 1000);
const ANSWER = {
  interest_over_time: {
    timeline_data: [
      {
        date: "Sep 29, 2026",
        timestamp: ts("2026-09-29"),
        values: [
          { query: "Sakaja", value: "40", extracted_value: 40 },
          { query: "Babu Owino", value: "100", extracted_value: 100 },
        ],
      },
      {
        date: "Sep 30, 2026",
        timestamp: ts("2026-09-30"),
        values: [
          { query: "Sakaja", value: "35", extracted_value: 35 },
          { query: "Babu Owino", value: "<1", extracted_value: 0 },
        ],
      },
      {
        date: "Oct 1, 2026",
        timestamp: ts("2026-10-01"),
        partial_data: true,
        values: [
          { query: "Sakaja", value: "9", extracted_value: 9 },
          { query: "Babu Owino", value: "9", extracted_value: 9 },
        ],
      },
    ],
  },
};
eq("each term's days, the partial day left out", parseTrends(ANSWER, ["Sakaja", "Babu Owino"]), [
  {
    term: "Sakaja",
    points: [
      { day: "2026-09-29", value: 40 },
      { day: "2026-09-30", value: 35 },
    ],
  },
  {
    term: "Babu Owino",
    points: [
      { day: "2026-09-29", value: 100 },
      { day: "2026-09-30", value: 0 },
    ],
  },
]);
eq("an answer with no timeline", parseTrends({ error: "Unsupported geo" }, ["Sakaja"]), null);

const run = (n: number, value: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    value: value(i),
  }));
eq("a few days is thin", isThin([{ points: run(3, () => 50) }]), true);
eq(
  "mostly zeros is thin",
  isThin([
    { points: run(10, (i) => (i < 6 ? 0 : 40)) },
    { points: run(10, (i) => (i < 7 ? 0 : 10)) },
  ]),
  true,
);
eq("a month of interest is not", isThin([{ points: run(30, () => 20) }]), false);

eq(
  "searched as",
  [
    searchName({ name: "Johnson Sakaja", searchAs: "Sakaja" }),
    searchName({ name: "Babu Owino", searchAs: null }),
  ],
  ["Sakaja", "Babu Owino"],
);
eq("water is searched as the shortage", ISSUE_SEARCH["water"], "water shortage");

// Four weeks to 30 September: the last seven days at `week`, the three before at `before`.
const TODAY = "2026-09-30";
const month = (before: number, week: number) =>
  Array.from({ length: 28 }, (_, i) => ({
    day: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (27 - i) * 864e5).toISOString().slice(0, 10),
    value: i >= 21 ? week : before,
  }));
const rival = (id: string, name: string, tone: RaceRival["tone"], isUs = false): RaceRival => ({
  id,
  name,
  party: null,
  office: null,
  isUs,
  tone,
  sort: 0,
  facebook: null,
  x: null,
  tiktok: null,
  searchAs: null,
});
const R = [
  rival("s", "Johnson Sakaja", "us", true),
  rival("b", "Babu Owino", "a"),
  rival("k", "Agnes Kagure", "b"),
];
const READ: SearchRead = {
  day: TODAY,
  kind: "candidates",
  geo: "KE-110",
  at: "2026-09-30T03:05:00Z",
  series: [
    { term: "Sakaja", ref: "s", points: month(10, 40) },
    { term: "Babu Owino", ref: "b", points: month(12, 30) },
    { term: "Kagure", ref: "k", points: month(8, 8) },
  ],
};
eq(
  "a rival searched twice as much this week; ours is no rival's move",
  searchSpike(READ, R, TODAY),
  {
    title: "Searches for Babu Owino doubled this week",
    detail:
      "Google search interest in Nairobi averaged 30 this week, against 12 over the three weeks before.",
  },
);
eq(
  "three times as much",
  searchSpike(
    { ...READ, series: [{ term: "Babu Owino", ref: "b", points: month(10, 35) }] },
    R,
    TODAY,
  )?.title,
  "Searches for Babu Owino tripled this week",
);
eq(
  "a steady week is no move",
  searchSpike({ ...READ, series: [{ term: "Kagure", ref: "k", points: month(8, 8) }] }, R, TODAY),
  null,
);
eq(
  "no history, no move",
  searchSpike(
    { ...READ, series: [{ term: "Babu Owino", ref: "b", points: month(0, 30) }] },
    R,
    TODAY,
  ),
  null,
);
eq("a read of issues is no rival's move", searchSpike({ ...READ, kind: "issues" }, R, TODAY), null);
eq(
  "who drew the most searches",
  searchSummary(READ, R),
  "Johnson Sakaja drew the most searches in Nairobi this month, then Babu Owino.",
);
const chart = searchChart(READ, R);
eq(
  "the chart: a line per candidate, a point per day",
  [chart?.days.length, chart?.series.map((s) => [s.key, s.tone, s.values[0], s.values[27]])],
  [
    28,
    [
      ["s", "us", 10, 40],
      ["b", "a", 12, 30],
      ["k", "b", 8, 8],
    ],
  ],
);
eq(
  "issues' interest this week",
  issueAverages(
    {
      ...READ,
      kind: "issues",
      series: [{ term: "water shortage", ref: "water", points: month(10, 40) }],
    },
    TODAY,
  ),
  [{ issue: "water", average: 40 }],
);
eq(
  "a stored read",
  searchFromRow({
    day: TODAY,
    kind: "candidates",
    geo: "KE",
    created_at: "2026-09-30T03:05:00Z",
    series: [
      {
        term: "Sakaja",
        ref: "s",
        points: [
          { day: "2026-09-30", value: 140 },
          { day: "soon", value: 3 },
        ],
      },
    ],
  }),
  {
    day: TODAY,
    kind: "candidates",
    geo: "KE",
    series: [{ term: "Sakaja", ref: "s", points: [{ day: "2026-09-30", value: 100 }] }],
    at: "2026-09-30T03:05:00Z",
  },
);
eq(
  "a read from nowhere we know",
  searchFromRow({ day: TODAY, kind: "candidates", geo: "US", created_at: "x", series: [] }),
  null,
);

eq("each candidate's month, for the table under the chart", monthAverages(READ, R), [
  { name: "Johnson Sakaja", average: 18 },
  { name: "Babu Owino", average: 17 },
  { name: "Agnes Kagure", average: 8 },
]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
