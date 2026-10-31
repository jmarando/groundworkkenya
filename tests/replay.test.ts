// Checks for Replay: a week or a month in Nairobi days, the day-by-day bars (with a paused day told
// from a quiet one), the period in five lines set against the one before, and the so-what line.
// Plain code; no AI.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/replay.test.ts

import type { BigVoice, Column } from "@/lib/big-voices";
import {
  bars,
  compareWith,
  fiveLines,
  issueCounts,
  kindOf,
  lateByDay,
  loudestVoices,
  parseSpan,
  periodBefore,
  periodFor,
  periodLabel,
  periodWord,
  replaySoWhat,
  stepPeriod,
  totalsOf,
  type DayRow,
  type PeriodStats,
} from "@/lib/replay";

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

const span = (p: { from: string; to: string }) => [p.from, p.to];

// ---- periods
eq("a week is Monday to Sunday", span(periodFor("week", "2026-10-29")), [
  "2026-10-26",
  "2026-11-01",
]);
eq("Sunday is in the week that ends on it", span(periodFor("week", "2026-11-01")), [
  "2026-10-26",
  "2026-11-01",
]);
eq("Monday starts its own week", span(periodFor("week", "2026-10-26")), [
  "2026-10-26",
  "2026-11-01",
]);
eq("a month", span(periodFor("month", "2026-10-29")), ["2026-10-01", "2026-10-31"]);
eq("February", span(periodFor("month", "2026-02-10")), ["2026-02-01", "2026-02-28"]);
eq("a leap February", span(periodFor("month", "2028-02-10")), ["2028-02-01", "2028-02-29"]);
eq("December", span(periodFor("month", "2026-12-15")), ["2026-12-01", "2026-12-31"]);
eq("the kind is kept", periodFor("week", "2026-10-29").kind, "week");

eq("a week back", span(stepPeriod(periodFor("week", "2026-10-29"), -1)), [
  "2026-10-19",
  "2026-10-25",
]);
eq("a week on", span(stepPeriod(periodFor("week", "2026-10-29"), 1)), ["2026-11-02", "2026-11-08"]);
eq("a month back, into February", span(stepPeriod(periodFor("month", "2026-03-10"), -1)), [
  "2026-02-01",
  "2026-02-28",
]);
eq("a month on, over the year", span(stepPeriod(periodFor("month", "2026-12-10"), 1)), [
  "2027-01-01",
  "2027-01-31",
]);
eq("a month back over the year", span(stepPeriod(periodFor("month", "2027-01-10"), -1)), [
  "2026-12-01",
  "2026-12-31",
]);
eq(
  "chosen dates step by their own length",
  span(stepPeriod({ kind: "dates", from: "2026-10-10", to: "2026-10-14" }, 1)),
  ["2026-10-15", "2026-10-19"],
);

eq("the week before", span(periodBefore(periodFor("week", "2026-10-29"))), [
  "2026-10-19",
  "2026-10-25",
]);
eq("the month before is the calendar month", span(periodBefore(periodFor("month", "2026-03-10"))), [
  "2026-02-01",
  "2026-02-28",
]);
eq(
  "dates before: the same length, ending the day before",
  span(periodBefore({ kind: "dates", from: "2026-10-10", to: "2026-10-14" })),
  ["2026-10-05", "2026-10-09"],
);

// ---- bars
const row = (day: string, o: Partial<DayRow> = {}): DayRow => ({
  day,
  posts: 10,
  warm: 2,
  neutral: 3,
  angry: 4,
  unread: 1,
  sweeps: 20,
  backfilled: false,
  ...o,
});
{
  const week = periodFor("week", "2026-10-29");
  const rows = [
    row("2026-10-26", { backfilled: true, sweeps: null }),
    row("2026-10-27"),
    row("2026-10-29", { posts: 58, angry: 38 }),
  ];
  const b = bars(week, rows, {
    recordBegins: "2026-10-27",
    today: "2026-11-01",
    late: new Map([["2026-10-29", 12]]),
  });
  eq(
    "seven bars",
    b.map((x) => x.day),
    [
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ],
  );
  eq("a counted-back day is gathered", b[0]!.state, "gathered");
  eq("a day a sweep recorded is gathered", b[1]!.state, "gathered");
  eq("a missing day after the record began is paused", b[2]!.state, "paused");
  eq("and carries no counts", [b[2]!.posts, b[2]!.angry], [0, 0]);
  eq(
    "the counts of a day that has them",
    [b[3]!.posts, b[3]!.angry, b[3]!.warm, b[3]!.neutral, b[3]!.unread],
    [58, 38, 2, 3, 1],
  );
  eq("late finds pass through", [b[3]!.late, b[1]!.late], [12, 0]);
  eq("paused runs up to today", [b[4]!.state, b[5]!.state], ["paused", "paused"]);
  eq("today with no row yet is waiting, not paused", b[6]!.state, "waiting");

  const early = bars(week, [row("2026-10-29")], {
    recordBegins: "2026-10-29",
    today: "2026-11-01",
    late: new Map(),
  });
  eq(
    "a missing day before the record began is only nothing gathered",
    [early[0]!.state, early[2]!.state, early[3]!.state, early[4]!.state],
    ["nothing", "nothing", "gathered", "paused"],
  );

  const nothing = bars(week, [], { recordBegins: null, today: "2026-11-01", late: new Map() });
  eq(
    "with no record at all, every day is nothing gathered",
    new Set(nothing.map((x) => x.state)),
    new Set(["nothing"]),
  );

  const now = bars(week, [row("2026-10-26"), row("2026-10-27")], {
    recordBegins: "2026-10-26",
    today: "2026-10-28",
    late: new Map(),
  });
  eq(
    "days that have not come are not paused",
    now.map((x) => x.state),
    ["gathered", "gathered", "waiting", "future", "future", "future", "future"],
  );
}

// ---- the five lines
const stats = (o: Partial<PeriodStats> = {}): PeriodStats => ({
  posts: 200,
  warm: 38,
  neutral: 70,
  angry: 92,
  issues: [
    { issue: "water", n: 76 },
    { issue: "roads", n: 30 },
  ],
  voices: ["@mtaani_reels", "@thika_road_diaries", "Mama Njeri Talks"],
  stories: [{ title: "Taps dry for nine days", views: 61_000, outlets: 2 }],
  reactions: 1,
  briefed: 2,
  pausedDays: 0,
  ...o,
});
const before = stats({
  posts: 152,
  warm: 60,
  neutral: 65,
  angry: 27,
  issues: [
    { issue: "roads", n: 40 },
    { issue: "water", n: 14 },
  ],
  voices: [],
  stories: [],
  reactions: 0,
  briefed: 0,
});
{
  const lines = fiveLines(stats(), before, "the week before");
  eq("five lines", lines.length, 5);
  eq(
    "posts, change and mood",
    lines[0],
    "200 posts, up 32% on the week before. Angry 46% (was 18%), neutral 35%, warm 19%.",
  );
  eq(
    "the top issue and what it was",
    lines[1],
    "Water took 38% of what was said (9% the week before).",
  );
  eq(
    "the loudest voices",
    lines[2],
    "Loudest voices: @mtaani_reels, @thika_road_diaries, Mama Njeri Talks.",
  );
  eq(
    "what spread",
    lines[3],
    "One story spread: “Taps dry for nine days”, 61,000 views, picked up by 2 outlets.",
  );
  eq("what the office did", lines[4], "What you did: 1 reaction drafted, 2 voices briefed.");
}
{
  const down = fiveLines(
    stats({ posts: 100, warm: 20, neutral: 40, angry: 40 }),
    stats({ posts: 150 }),
    "the month before",
  );
  eq(
    "down on the period before",
    down[0]!.startsWith("100 posts, down 33% on the month before."),
    true,
  );
  const level = fiveLines(stats({ posts: 150 }), stats({ posts: 150 }));
  eq("level with the period before", level[0]!.includes("level with the period before"), true);
}
{
  const first = fiveLines(stats(), null);
  eq(
    "with nothing before there is nothing to compare",
    [first[0], first[1]],
    ["200 posts. Angry 46%, neutral 35%, warm 19%.", "Water took 38% of what was said."],
  );
  const emptyBefore = fiveLines(
    stats(),
    stats({ posts: 0, warm: 0, neutral: 0, angry: 0, issues: [] }),
  );
  eq(
    "an empty period before is the same",
    emptyBefore[0],
    "200 posts. Angry 46%, neutral 35%, warm 19%.",
  );
}
{
  const empty = fiveLines(
    stats({
      posts: 0,
      warm: 0,
      neutral: 0,
      angry: 0,
      issues: [],
      voices: [],
      stories: [],
      reactions: 0,
      briefed: 0,
    }),
    null,
  );
  eq("an empty period still has five lines", empty.length, 5);
  eq("and says plainly what is missing", empty, [
    "No posts found.",
    "No issue stood out.",
    "No voice stood out.",
    "No story spread.",
    "Nothing drafted or briefed.",
  ]);
  eq("nothing broken in them", /NaN|undefined|Infinity/.test(empty.join(" ")), false);
  const unread = fiveLines(stats({ posts: 10, warm: 0, neutral: 0, angry: 0 }), null);
  eq("posts none of which were read", unread[0], "10 posts. None read for mood yet.");
  const many = fiveLines(
    stats({
      stories: [
        { title: "A", views: 10, outlets: 0 },
        { title: "B", views: 5, outlets: 1 },
      ],
      voices: ["@a"],
    }),
    null,
  );
  eq(
    "several stories name the biggest",
    many[3],
    "2 stories spread, the biggest “A”, 10 views, picked up by no outlet.",
  );
  eq("one voice", many[2], "Loudest voices: @a.");
  const act = fiveLines(stats({ reactions: 2, briefed: 1 }), null);
  eq("plurals", act[4], "What you did: 2 reactions drafted, 1 voice briefed.");
}

// ---- the so-what
{
  eq(
    "an angrier period, with the issue that took it",
    replaySoWhat(stats(), before, "week"),
    "The week turned angrier: angry posts went from 18% to 46%. Water took 38% of what was said, up from 9%.",
  );
  eq(
    "a calmer period",
    replaySoWhat(
      stats({ warm: 100, neutral: 80, angry: 20, issues: [{ issue: "roads", n: 50 }] }),
      stats({ warm: 38, neutral: 70, angry: 92, issues: [{ issue: "roads", n: 50 }] }),
      "week",
    ),
    "The week turned calmer: angry posts went from 46% to 10%.",
  );
  eq(
    "a change in volume alone",
    replaySoWhat(stats({ posts: 300, warm: 57, neutral: 105, angry: 138 }), stats(), "month"),
    "Volume was up 50% on the month before; the mood held.",
  );
  eq(
    "little changed",
    replaySoWhat(stats(), stats({ posts: 190 }), "week"),
    "Little changed on the week before.",
  );
  eq(
    "nothing before",
    replaySoWhat(stats(), null, "week"),
    "This is the first period on record, so there is nothing to compare it with yet.",
  );
  eq(
    "no posts at all",
    replaySoWhat(stats({ posts: 0, warm: 0, neutral: 0, angry: 0, issues: [] }), before, "week"),
    "Nothing was found in these days.",
  );
  const paused = replaySoWhat(stats({ pausedDays: 2 }), stats({ pausedDays: 1 }), "week");
  eq(
    "a paused day is said, summed over both periods",
    paused.endsWith("Sweeping was paused for 3 days, so this comparison is uneven."),
    true,
  );
  eq(
    "one day",
    replaySoWhat(stats({ pausedDays: 1 }), null, "week").endsWith(
      "Sweeping was paused for 1 day, so this comparison is uneven.",
    ),
    true,
  );
  eq("no pause, no sentence", replaySoWhat(stats(), before, "week").includes("paused"), false);
}

// ---- what a request names: its kind, and whether it is a real span of days
eq("Monday to Sunday is a week", kindOf("2026-10-26", "2026-11-01"), "week");
eq("the 1st to the last is a month", kindOf("2026-10-01", "2026-10-31"), "month");
eq("a short February is a month", kindOf("2026-02-01", "2026-02-28"), "month");
eq(
  "a 28-day February that starts on a Monday is still a month",
  kindOf("2027-02-01", "2027-02-28"),
  "month",
);
eq("Tuesday to Monday is only dates", kindOf("2026-10-27", "2026-11-02"), "dates");
eq("five days are dates", kindOf("2026-10-10", "2026-10-14"), "dates");
eq("one day is dates", kindOf("2026-10-29", "2026-10-29"), "dates");

eq("a real span", parseSpan("2026-10-26", "2026-11-01"), { from: "2026-10-26", to: "2026-11-01" });
eq("one day is a span", parseSpan("2026-10-29", "2026-10-29"), {
  from: "2026-10-29",
  to: "2026-10-29",
});
eq("reversed", parseSpan("2026-11-01", "2026-10-26"), null);
eq("a month that does not exist", parseSpan("2026-13-01", "2026-13-02"), null);
eq("a day that does not exist", parseSpan("2026-02-30", "2026-03-01"), null);
eq("words are not days", parseSpan("26 Oct", "1 Nov"), null);
eq("a missing end", parseSpan("2026-10-01", undefined), null);
eq("93 days are allowed", parseSpan("2026-08-01", "2026-11-01")?.to, "2026-11-01");
eq("94 days are not", parseSpan("2026-07-31", "2026-11-01"), null);

// ---- the period to set a period against: fair while the period is not over
{
  const week = periodFor("week", "2026-10-29");
  eq("a finished week is set against the whole week before", compareWith(week, "2026-11-03"), {
    period: { kind: "week", from: "2026-10-19", to: "2026-10-25" },
    partial: false,
  });
  eq(
    "a week on its last day is finished at the day's end, not before",
    compareWith(week, "2026-11-01").partial,
    true,
  );
  eq(
    "a week that is not over is set against the same days before",
    compareWith(week, "2026-10-29"),
    {
      period: { kind: "dates", from: "2026-10-19", to: "2026-10-22" },
      partial: true,
    },
  );
  eq("the first day of a week is one day", compareWith(week, "2026-10-26"), {
    period: { kind: "dates", from: "2026-10-19", to: "2026-10-19" },
    partial: true,
  });
  eq("a month part way", compareWith(periodFor("month", "2026-10-10"), "2026-10-15"), {
    period: { kind: "dates", from: "2026-09-01", to: "2026-09-15" },
    partial: true,
  });
  eq(
    "a month part way is never set against more than the month before",
    compareWith(periodFor("month", "2026-03-10"), "2026-03-30").period,
    { kind: "month", from: "2026-02-01", to: "2026-02-28" },
  );
  eq("a period still to come has nothing to cut", compareWith(week, "2026-10-20"), {
    period: { kind: "week", from: "2026-10-19", to: "2026-10-25" },
    partial: false,
  });
  eq(
    "what to call the pair",
    [periodWord(week), periodWord(periodFor("month", "2026-10-10"))],
    [
      { word: "week", before: "the week before" },
      { word: "month", before: "the month before" },
    ],
  );
  eq(
    "dates are only a period",
    periodWord({ kind: "dates", from: "2026-10-10", to: "2026-10-14" }),
    { word: "period", before: "the days before" },
  );
}

// ---- how a period reads on the page
eq("a week", periodLabel(periodFor("week", "2026-10-29")), "26 Oct – 1 Nov 2026");
eq("a month", periodLabel(periodFor("month", "2026-10-29")), "October 2026");
eq(
  "dates in one month",
  periodLabel({ kind: "dates", from: "2026-10-10", to: "2026-10-14" }),
  "10 – 14 Oct 2026",
);
eq("one day", periodLabel({ kind: "dates", from: "2026-10-29", to: "2026-10-29" }), "29 Oct 2026");
eq(
  "over a new year",
  periodLabel({ kind: "dates", from: "2026-12-28", to: "2027-01-03" }),
  "28 Dec 2026 – 3 Jan 2027",
);

// ---- the daily record, summed over a period
{
  const rows = [
    row("2026-10-25", { posts: 99, warm: 9, neutral: 9, angry: 9 }),
    row("2026-10-26", { posts: 10, warm: 2, neutral: 3, angry: 4 }),
    row("2026-10-30", { posts: 20, warm: 5, neutral: 5, angry: 8 }),
    row("2026-11-02", { posts: 77, warm: 7, neutral: 7, angry: 7 }),
  ];
  eq("only the days inside count", totalsOf({ from: "2026-10-26", to: "2026-11-01" }, rows), {
    posts: 30,
    warm: 7,
    neutral: 8,
    angry: 12,
  });
  eq("no rows is zero, not NaN", totalsOf({ from: "2026-10-26", to: "2026-11-01" }, []), {
    posts: 0,
    warm: 0,
    neutral: 0,
    angry: 0,
  });
}

// ---- what the period was about
{
  const post = (issue: string | null, rivalId: string | null = null) => ({ issue, rivalId });
  eq(
    "counted by issue, most first, ties by name",
    issueCounts([
      post("water"),
      post("roads"),
      post("water"),
      post("jobs"),
      post("jobs"),
      post("water"),
    ]),
    [
      { issue: "water", n: 3 },
      { issue: "jobs", n: 2 },
      { issue: "roads", n: 1 },
    ],
  );
  eq(
    "what says nothing is left out, and so is a candidate's own post",
    issueCounts([
      post(null),
      post("general"),
      post("campaign"),
      post("off-topic"),
      post("water", "r1"),
      post("water"),
    ]),
    [{ issue: "water", n: 1 }],
  );
  eq("no posts", issueCounts([]), []);
}

// ---- older posts that arrived this day
{
  const late = lateByDay([
    { foundAt: "2026-10-29T10:00:00Z", publishedAt: "2026-10-27T10:00:00Z", rivalId: null },
    { foundAt: "2026-10-29T10:00:00Z", publishedAt: "2026-10-29T07:00:00Z", rivalId: null },
    // found 00:30 Nairobi on the 29th, published 30 hours before: late, on the Nairobi day
    { foundAt: "2026-10-28T21:30:00Z", publishedAt: "2026-10-27T15:30:00Z", rivalId: null },
    { foundAt: "2026-10-29T10:00:00Z", publishedAt: null, rivalId: null },
    { foundAt: "2026-10-29T10:00:00Z", publishedAt: "2026-10-25T10:00:00Z", rivalId: "r1" },
    // exactly a day is not more than a day
    { foundAt: "2026-10-30T10:00:00Z", publishedAt: "2026-10-29T10:00:00Z", rivalId: null },
    { foundAt: "2026-10-30T10:00:00Z", publishedAt: "2026-10-28T09:59:00Z", rivalId: null },
  ]);
  eq("counted on the day found, in Nairobi days", Object.fromEntries(late), {
    "2026-10-29": 2,
    "2026-10-30": 1,
  });
  eq("none is an empty map", lateByDay([]).size, 0);
}

// ---- the loudest voices of a period
{
  const voice = (name: string, o: Partial<BigVoice> = {}): BigVoice => ({
    key: `x:@${name.toLowerCase()}`,
    platform: "x",
    name,
    url: null,
    kind: "account",
    followers: null,
    posts: 3,
    seen: null,
    topIssues: [],
    issues: [],
    read: 0,
    warm: 0,
    angry: 0,
    towardsWarm: null,
    towardsAngry: null,
    move: "win-over",
    angryPostId: null,
    postIds: [],
    last: "2026-10-29T10:00:00.000Z",
    ...o,
  });
  const outlet = (name: string, posts: number): BigVoice =>
    voice(name, { key: `site:${name.toLowerCase()}`, platform: "news", kind: "outlet", posts });
  const column = (
    level: Column["level"],
    accounts: BigVoice[],
    outlets: BigVoice[] = [],
  ): Column => ({
    level,
    label: level,
    accounts,
    outlets,
    smaller: 0,
  });

  eq(
    "the biggest accounts across the columns, by views seen or followers",
    loudestVoices([
      column(
        "seat",
        [voice("A", { seen: 50_000 }), voice("B", { seen: 20_000 })],
        [outlet("Nation", 9)],
      ),
      column("county", [
        voice("B", { seen: 8_000 }),
        voice("C", { seen: null, followers: 30_000 }),
      ]),
      column("country", [voice("D", { seen: 90_000 })]),
    ]),
    ["D", "A", "C"],
  );
  eq(
    "a voice in two columns has its views added",
    loudestVoices(
      [
        column("seat", [voice("A", { seen: 50_000 }), voice("B", { seen: 30_000 })]),
        column("county", [voice("B", { seen: 30_000 })]),
      ],
      2,
    ),
    ["B", "A"],
  );
  eq(
    "outlets fill what the accounts leave, by posts",
    loudestVoices([
      column("seat", [voice("A", { seen: 6_000 })], [outlet("Nation", 9), outlet("Star", 12)]),
    ]),
    ["A", "Star", "Nation"],
  );
  eq("only outlets", loudestVoices([column("seat", [], [outlet("Nation", 9)])]), ["Nation"]);
  eq("no columns", loudestVoices([]), []);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
