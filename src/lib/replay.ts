// Replay: any past week or month in Nairobi days, the day-by-day bars (a paused day told from a quiet
// one), the period in five lines set against the one before, and the so-what line. Plain code, no
// AI: every number is a count of what Listening kept. Pure.

import { NO_ISSUE, type Column } from "@/lib/big-voices";
import { nf } from "@/lib/format";
import { mondayOf } from "@/lib/field-plan";
import { addDays, nairobiDay } from "@/lib/nairobi-date";

export type Period = { kind: "week" | "month" | "dates"; from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;
const days = (p: { from: string; to: string }) =>
  Math.round((Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / DAY_MS) + 1;

/** The calendar month that holds `day`, or the one `offset` months away from it. */
function monthOf(day: string, offset = 0): { from: string; to: string } {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const next = new Date(Date.UTC(y, m + offset, 1));
  const iso = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { from: iso(start), to: addDays(iso(next), -1) };
}

/** The week (Monday to Sunday) or month that holds `anchorDay`. */
export function periodFor(kind: "week" | "month", anchorDay: string): Period {
  if (kind === "week") {
    const from = mondayOf(anchorDay);
    return { kind, from, to: addDays(from, 6) };
  }
  return { kind, ...monthOf(anchorDay) };
}

/** The period a step away: a week, a month, or as many days as the chosen dates cover. */
export function stepPeriod(p: Period, dir: -1 | 1): Period {
  if (p.kind === "week")
    return { kind: "week", from: addDays(p.from, 7 * dir), to: addDays(p.to, 7 * dir) };
  if (p.kind === "month") return { kind: "month", ...monthOf(p.from, dir) };
  const n = days(p);
  return { kind: "dates", from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) };
}

/** The period to set this one against: the week or month before, or as many days ending the day before. */
export const periodBefore = (p: Period): Period => stepPeriod(p, -1);

/** The kind two days make: a Monday-to-Sunday week, a whole calendar month, or any other run of days. */
export function kindOf(from: string, to: string): Period["kind"] {
  if (from === mondayOf(from) && to === addDays(from, 6)) return "week";
  const month = monthOf(from);
  return from === month.from && to === month.to ? "month" : "dates";
}

const isDay = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  // A day that does not exist (30 February) rolls over in some engines; it must not pass.
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

/** Two Nairobi days read from a request: real, in order, and no more than `max` days (93) in all. */
export function parseSpan(
  from: unknown,
  to: unknown,
  max = 93,
): { from: string; to: string } | null {
  if (!isDay(from) || !isDay(to) || from > to) return null;
  return days({ from, to }) <= max ? { from, to } : null;
}

/**
 * The period to set `p` against: the one before it, and, while `p` is not over, only the same days
 * of it (a week that is three days old is not fairly set against a whole week).
 */
export function compareWith(p: Period, today: string): { period: Period; partial: boolean } {
  const before = periodBefore(p);
  if (today < p.from || today > p.to) return { period: before, partial: false };
  const to = addDays(before.from, days({ from: p.from, to: today }) - 1);
  return {
    period: to >= before.to ? before : { kind: "dates", from: before.from, to },
    partial: true,
  };
}

/** What a period is called, and what the one before it is called, in the lines about it. */
export const periodWord = (p: Period): { word: string; before: string } =>
  p.kind === "week"
    ? { word: "week", before: "the week before" }
    : p.kind === "month"
      ? { word: "month", before: "the month before" }
      : { word: "period", before: "the days before" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const parts = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m: m - 1, d };
};

/** "26 Oct – 1 Nov 2026", "10 – 14 Oct 2026", "29 Oct 2026", or "October 2026" for a whole month. */
export function periodLabel(p: Period): string {
  const a = parts(p.from);
  const b = parts(p.to);
  if (p.kind === "month") return `${MONTH_NAMES[a.m]} ${a.y}`;
  if (p.from === p.to) return `${a.d} ${MONTHS[a.m]} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  return `${a.d} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

/** What the daily record holds for a Nairobi day (listening_days). */
export type DayRow = {
  day: string;
  posts: number;
  warm: number;
  neutral: number;
  angry: number;
  unread: number;
  /** Null for a day counted back from the posts already kept, before sweeps recorded themselves. */
  sweeps: number | null;
  backfilled: boolean;
};

export type Bar = {
  day: string;
  /**
   * gathered: the record has the day. paused: the record had begun and nothing ran. nothing: before
   * the record began, so we cannot tell. waiting: today, before its first sweep. future: not yet.
   */
  state: "gathered" | "paused" | "nothing" | "waiting" | "future";
  posts: number;
  warm: number;
  neutral: number;
  angry: number;
  unread: number;
  /** Posts that arrived this day but were published more than a day earlier. */
  late: number;
};

export function bars(
  p: Period,
  rows: DayRow[],
  opts: {
    /** The first day a sweep recorded itself, or null when none has. */
    recordBegins: string | null;
    today: string;
    late?: Map<string, number>;
  },
): Bar[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: Bar[] = [];
  for (let day = p.from; day <= p.to; day = addDays(day, 1)) {
    const r = byDay.get(day);
    const state: Bar["state"] = r
      ? "gathered"
      : day > opts.today
        ? "future"
        : opts.recordBegins === null || day < opts.recordBegins
          ? "nothing"
          : day === opts.today
            ? "waiting"
            : "paused";
    out.push({
      day,
      state,
      posts: r?.posts ?? 0,
      warm: r?.warm ?? 0,
      neutral: r?.neutral ?? 0,
      angry: r?.angry ?? 0,
      unread: r?.unread ?? 0,
      late: opts.late?.get(day) ?? 0,
    });
  }
  return out;
}

export type PeriodStats = {
  posts: number;
  warm: number;
  neutral: number;
  angry: number;
  /** Posts under each issue, counted over the period (not "general", "campaign" or off-topic). */
  issues: { issue: string; n: number }[];
  /** The loudest voices, already limited to those big enough to name. */
  voices: string[];
  stories: { title: string; views: number; outlets: number }[];
  reactions: number;
  briefed: number;
  /** Days of the period the record had begun and nothing ran. */
  pausedDays: number;
};

/** The daily record summed over the days of a period; days outside it are left out. */
export function totalsOf(
  p: { from: string; to: string },
  rows: DayRow[],
): Pick<PeriodStats, "posts" | "warm" | "neutral" | "angry"> {
  const t = { posts: 0, warm: 0, neutral: 0, angry: 0 };
  for (const r of rows) {
    if (r.day < p.from || r.day > p.to) continue;
    t.posts += r.posts;
    t.warm += r.warm;
    t.neutral += r.neutral;
    t.angry += r.angry;
  }
  return t;
}

/** What a period's posts were about: a count per issue, without the candidates' own posts or issues that say nothing. */
export function issueCounts(
  posts: { issue: string | null; rivalId: string | null }[],
): { issue: string; n: number }[] {
  const n = new Map<string, number>();
  for (const p of posts)
    if (p.issue && !p.rivalId && !NO_ISSUE.has(p.issue)) n.set(p.issue, (n.get(p.issue) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([issue, count]) => ({ issue, n: count }));
}

/** How many of each Nairobi day's finds were published more than a day before they were found. */
export function lateByDay(
  posts: { foundAt: string; publishedAt: string | null; rivalId: string | null }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of posts) {
    if (p.rivalId || !p.publishedAt) continue;
    if (!(Date.parse(p.foundAt) - Date.parse(p.publishedAt) > DAY_MS)) continue;
    const day = nairobiDay(p.foundAt);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

/**
 * The voices to name for a period: the biggest accounts across the columns (a voice in two columns
 * has its views added), then outlets by posts to fill what is left. Only voices the columns list,
 * so none is under the size floor.
 */
export function loudestVoices(columns: Column[], n = 3): string[] {
  const accounts = new Map<
    string,
    { name: string; seen: number | null; followers: number | null }
  >();
  const outlets = new Map<string, { name: string; posts: number }>();
  for (const c of columns) {
    for (const v of c.accounts) {
      const a = accounts.get(v.key) ?? { name: v.name, seen: null, followers: null };
      if (v.seen !== null) a.seen = (a.seen ?? 0) + v.seen;
      if (v.followers !== null) a.followers = Math.max(a.followers ?? 0, v.followers);
      accounts.set(v.key, a);
    }
    for (const v of c.outlets) {
      const o = outlets.get(v.key) ?? { name: v.name, posts: 0 };
      o.posts += v.posts;
      outlets.set(v.key, o);
    }
  }
  const size = (a: { seen: number | null; followers: number | null }) => a.seen ?? a.followers ?? 0;
  return [
    ...[...accounts.values()]
      .sort((a, b) => size(b) - size(a) || a.name.localeCompare(b.name))
      .map((a) => a.name),
    ...[...outlets.values()]
      .sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name))
      .map((o) => o.name),
  ].slice(0, n);
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
const read = (s: PeriodStats) => s.warm + s.neutral + s.angry;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) =>
  `${nf.format(n)} ${n === 1 ? one : many}`;
const topIssue = (s: PeriodStats) =>
  [...s.issues].sort((a, b) => b.n - a.n || a.issue.localeCompare(b.issue))[0] ?? null;
const exactPct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

/** The period in five plain lines, each with its figures; `before` is how the other period is called. */
export function fiveLines(
  cur: PeriodStats,
  prev: PeriodStats | null,
  before = "the period before",
): string[] {
  const had = prev !== null && prev.posts > 0 ? prev : null;
  if (cur.posts === 0) {
    return [
      "No posts found.",
      "No issue stood out.",
      "No voice stood out.",
      "No story spread.",
      "Nothing drafted or briefed.",
    ];
  }

  // 1. How much, and how it felt.
  const change = had
    ? cur.posts === had.posts
      ? `, level with ${before}`
      : `, ${cur.posts > had.posts ? "up" : "down"} ${Math.round((Math.abs(cur.posts - had.posts) / had.posts) * 100)}% on ${before}`
    : "";
  const r = read(cur);
  const mood = r
    ? ` Angry ${pct(cur.angry, r)}%${had && read(had) ? ` (was ${pct(had.angry, read(had))}%)` : ""}, neutral ${pct(cur.neutral, r)}%, warm ${pct(cur.warm, r)}%.`
    : " None read for mood yet.";
  const one = `${nf.format(cur.posts)} posts${change}.${mood}`;

  // 2. What it was about.
  const top = topIssue(cur);
  const two = top
    ? `${cap(top.issue)} took ${pct(top.n, cur.posts)}% of what was said${
        had
          ? ` (${pct(had.issues.find((i) => i.issue === top.issue)?.n ?? 0, had.posts)}% ${before})`
          : ""
      }.`
    : "No issue stood out.";

  // 3. Who led it.
  const three = cur.voices.length
    ? `Loudest voices: ${cur.voices.join(", ")}.`
    : "No voice stood out.";

  // 4. What spread.
  const spread = [...cur.stories].sort((a, b) => b.views - a.views);
  const big = spread[0];
  const outlets = (n: number) => (n === 0 ? "no outlet" : plural(n, "outlet"));
  const four = big
    ? spread.length === 1
      ? `One story spread: “${big.title}”, ${plural(big.views, "view")}, picked up by ${outlets(big.outlets)}.`
      : `${spread.length} stories spread, the biggest “${big.title}”, ${plural(big.views, "view")}, picked up by ${outlets(big.outlets)}.`
    : "No story spread.";

  // 5. What the office did.
  const did = [
    cur.reactions ? `${plural(cur.reactions, "reaction")} drafted` : "",
    cur.briefed ? `${plural(cur.briefed, "voice")} briefed` : "",
  ].filter(Boolean);
  const five = did.length ? `What you did: ${did.join(", ")}.` : "Nothing drafted or briefed.";

  return [one, two, three, four, five];
}

/** The one line to take away: the biggest change on the period before, and a word if sweeping paused. */
export function replaySoWhat(cur: PeriodStats, prev: PeriodStats | null, word = "period"): string {
  const paused = cur.pausedDays + (prev?.pausedDays ?? 0);
  const note =
    paused > 0
      ? ` Sweeping was paused for ${plural(paused, "day")}, so this comparison is uneven.`
      : "";
  if (cur.posts === 0) return `Nothing was found in these days.${note}`;
  if (!prev || prev.posts === 0)
    return `This is the first period on record, so there is nothing to compare it with yet.${note}`;

  const angryNow = exactPct(cur.angry, read(cur));
  const angryThen = exactPct(prev.angry, read(prev));
  const shift = angryNow - angryThen;
  const volume = ((cur.posts - prev.posts) / prev.posts) * 100;

  let line: string;
  if (read(cur) && read(prev) && Math.abs(shift) >= 10) {
    line = `The ${word} turned ${shift > 0 ? "angrier" : "calmer"}: angry posts went from ${Math.round(angryThen)}% to ${Math.round(angryNow)}%.`;
    const top = topIssue(cur);
    if (shift > 0 && top) {
      const then = exactPct(prev.issues.find((i) => i.issue === top.issue)?.n ?? 0, prev.posts);
      const now = exactPct(top.n, cur.posts);
      if (now - then >= 15)
        line += ` ${cap(top.issue)} took ${Math.round(now)}% of what was said, up from ${Math.round(then)}%.`;
    }
  } else if (Math.abs(volume) >= 25) {
    line = `Volume was ${volume > 0 ? "up" : "down"} ${Math.round(Math.abs(volume))}% on the ${word} before; the mood held.`;
  } else {
    line = `Little changed on the ${word} before.`;
  }
  return line + note;
}
