// Checks for what the Replay screen says: the period and its arrows, a bar for every day with a
// paused day told from one nothing was gathered on, the five lines, the so-what line, and a note
// when the period is not over. Invented posts and accounts only.
// Run from the repository root:
//   npx tsx --tsconfig tsconfig.json tests/replay-render.test.ts

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplayView } from "@/components/gw/listening/Replay";
import { periodBefore, periodFor, type DayRow, type PeriodStats } from "@/lib/replay";
import type { ReplayData } from "@/lib/replay.functions";

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, markup = "") {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${markup ? `\n  in ${markup.slice(0, 1200)}` : ""}`);
  }
}

const week = periodFor("week", "2026-10-29"); // 26 Oct to 1 Nov
const row = (day: string, o: Partial<DayRow> = {}): DayRow => ({
  day,
  posts: 40,
  warm: 6,
  neutral: 14,
  angry: 18,
  unread: 2,
  sweeps: 20,
  backfilled: false,
  ...o,
});
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
  briefed: 0,
  pausedDays: 1,
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
  pausedDays: 0,
});
// The record began on the 27th; the 26th was counted back; the 28th has no row (paused).
const data = (o: Partial<ReplayData> = {}): ReplayData => ({
  period: week,
  previous: periodBefore(week),
  partial: false,
  today: "2026-11-03",
  recordBegins: "2026-10-27",
  days: [
    row("2026-10-26", { backfilled: true, sweeps: null }),
    row("2026-10-27"),
    row("2026-10-29", { posts: 58, angry: 38 }),
    row("2026-10-30"),
    row("2026-10-31"),
    row("2026-11-01", { posts: 0, warm: 0, neutral: 0, angry: 0, unread: 0 }),
  ],
  late: { "2026-10-29": 12 },
  stats: stats(),
  prevStats: before,
  truncated: false,
  ...o,
});
const render = (d: ReplayData, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ReplayView, {
      data: d,
      setPeriod: () => undefined,
      openDay: () => undefined,
      ...props,
    }),
  );
const count = (m: string, re: RegExp) => (m.match(re) ?? []).length;
const clean = (m: string) => !/NaN|undefined|Infinity|\[object/.test(m);

// ---- the whole week
{
  const m = render(data());
  ok("the period is named", m.includes("26 Oct – 1 Nov 2026"), m);
  ok("a bar for every day", count(m, /class="rp-day /g) === 7, m);
  ok("five lines", count(m, /class="rp-line"/g) === 5, m);
  ok(
    "the first line has the figures and the week before",
    /200 posts, up 32% on the week before/.test(m),
    m,
  );
  ok(
    "the loudest voices are named",
    m.includes("@mtaani_reels, @thika_road_diaries, Mama Njeri Talks"),
    m,
  );
  ok(
    "the story that spread",
    m.includes("Taps dry for nine days") && m.includes("61,000 views"),
    m,
  );
  ok("the so-what line", m.includes("So what") && m.includes("The week turned angrier"), m);
  ok("a paused day is said, in the bar and under it", count(m, /Sweeping paused/g) >= 2, m);
  ok(
    "the paused day cannot be opened",
    /aria-label="Wed 28 Oct: Sweeping paused · nothing gathered"[^>]*disabled/.test(m),
    m,
  );
  ok(
    "a day with posts can be opened and says its counts",
    /aria-label="Thu 29 Oct: 58 posts found, 38 angry, 14 neutral, 6 warm, 2 not read yet"(?![^>]*disabled)/.test(
      m,
    ),
    m,
  );
  ok("a day that found nothing says so", /Sun 1 Nov: nothing found/.test(m), m);
  ok("late finds are said on their day", m.includes("12 were older posts found late"), m);
  ok(
    "nothing was gathered before the record: not claimed here",
    !m.includes("Nothing gathered"),
    m,
  );
  ok(
    "no note about a period not over",
    !m.includes("isn&#x27;t over") && !m.includes("isn't over"),
    m,
  );
  ok("nothing broken", clean(m), m);
}

// ---- days before the record began are not called paused
{
  const m = render(
    data({ days: [row("2026-10-29"), row("2026-10-30")], recordBegins: "2026-10-29" }),
  );
  ok("a day before the record began reads Nothing gathered", m.includes("Nothing gathered"), m);
  ok(
    "and is told apart from a paused one",
    /aria-label="Mon 26 Oct: Nothing gathered"/.test(m) &&
      /aria-label="Sat 31 Oct: Sweeping paused · nothing gathered"/.test(m),
    m,
  );
}

// ---- no data at all
{
  const m = render(
    data({
      days: [],
      recordBegins: null,
      late: {},
      stats: stats({
        posts: 0,
        warm: 0,
        neutral: 0,
        angry: 0,
        issues: [],
        voices: [],
        stories: [],
        reactions: 0,
        pausedDays: 0,
      }),
      prevStats: stats({ posts: 0, warm: 0, neutral: 0, angry: 0, issues: [], pausedDays: 0 }),
    }),
  );
  ok(
    "still five lines and seven bars",
    count(m, /class="rp-line"/g) === 5 && count(m, /class="rp-day /g) === 7,
    m,
  );
  ok("every day says nothing gathered", count(m, /Nothing gathered/g) >= 7, m);
  ok("nothing broken", clean(m), m);
  ok("no chart frame with nothing in it", !m.includes('rp-col"'), m);
  ok("the days shrink to a thin row", m.includes("rp-bars rp-bars--flat"), m);
  ok("while a week with bars keeps its chart", !render(data()).includes("rp-bars--flat"), m);
}

// ---- set against the period before, or not
{
  const off = render(data(), { compare: false });
  ok(
    "no figures for the week before when comparing is off",
    !/week before|was \d+%/.test(off.replace("Compare with the week before", "")),
    off,
  );
  ok(
    "no so-what claim when comparing is off",
    !off.includes("So what") && !off.includes("first period on record"),
    off,
  );
  ok("the box is unticked", /<input[^>]*type="checkbox"(?![^>]*checked)/.test(off), off);
  const on = render(data());
  ok(
    "the box is ticked by default and says what it compares with",
    /type="checkbox"[^>]*checked/.test(on) && on.includes("Compare with the week before"),
    on,
  );
}

// ---- a period that is not over
{
  const m = render(data({ partial: true, today: "2026-10-29" }));
  ok(
    "the week so far is set against the same days before",
    m.includes("isn&#x27;t over") || m.includes("isn't over"),
    m,
  );
  ok("and says how", m.includes("same days"), m);
  ok("the days to come have bars but no figures", count(m, /class="rp-day /g) === 7 && clean(m), m);
  ok(
    "the later arrow is off while the period holds today",
    /aria-label="Later period"[^>]*disabled/.test(m),
    m,
  );
  const done = render(data());
  ok(
    "the later arrow works once the period is over",
    !/aria-label="Later period"[^>]*disabled/.test(done),
    done,
  );
}

// ---- choosing the days
{
  const weekly = render(data());
  ok(
    "week and month are chips, the week pressed",
    /aria-pressed="true"[^>]*>Week</.test(weekly) &&
      /aria-pressed="false"[^>]*>Month</.test(weekly),
    weekly,
  );
  ok("no date boxes for a week", !weekly.includes('type="date"'), weekly);
  const picked = render(
    data({
      period: { kind: "dates", from: "2026-10-10", to: "2026-10-14" },
      previous: { kind: "dates", from: "2026-10-05", to: "2026-10-09" },
    }),
  );
  ok(
    "dates show two date boxes with the days",
    count(picked, /type="date"/g) === 2 &&
      picked.includes('value="2026-10-10"') &&
      picked.includes('value="2026-10-14"'),
    picked,
  );
  ok("and the label", picked.includes("10 – 14 Oct 2026") && clean(picked), picked);
  const month = render(
    data({ period: periodFor("month", "2026-10-10"), previous: periodFor("month", "2026-09-10") }),
  );
  ok(
    "a month has its days",
    count(month, /class="rp-day /g) === 31 && month.includes("October 2026"),
    month,
  );
}

// ---- more posts than were read
{
  const m = render(data({ truncated: true }));
  ok("the newest are counted, and it says so", m.includes("more posts than could be read"), m);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
