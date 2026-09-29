// Home's rules: which sections show real data, what goes on the Today list,
// the verdict line, and where each number leads. Pure, so they can be checked
// without a browser or a database.

import { ours } from "@/lib/demo";
import type { Action, Scenario } from "@/lib/demo/types";
import type { RacePoll, RaceRival, RivalMove } from "@/lib/race-data";

export type SectionMode = "real" | "sample";

export type HomeFacts = {
  /** People on file that are not seeded samples. */
  realPeople: number;
  /** Rivals and polls on record; race data arrives with part 2. */
  rivals: number;
  polls: number;
};

export type RealSignals = {
  /** Expenses waiting for approval; 0 for anyone who cannot approve them. */
  pendingExpenses: number;
  /** Conversations nobody has answered. */
  unread: number;
  topIssue: { label: string; count: number; angry: number } | null;
  /** The biggest recent change for a rival in one pollster's polls. */
  rivalMove?: RivalMove | null;
};

export type TodayItem = { title: string; detail: string; action: Action; sample: boolean };

/** One mention from Listening, as Home reads it. */
export type IssueRow = {
  issue: string | null;
  sentiment: string | null;
  title: string | null;
  url: string | null;
  found_at: string;
};
/** An issue people raised, with how often and its latest lines. */
export type IssueLine = {
  key: string;
  label: string;
  count: number;
  angry: number;
  examples: { text: string; url: string | null }[];
};
/** The campaign's own race; empty until someone adds it. */
export type RaceView = { rivals: RaceRival[]; polls: RacePoll[]; issues: IssueLine[] };

export function sectionModes(f: HomeFacts): { race: SectionMode; campaign: SectionMode } {
  return {
    race: f.rivals > 0 || f.polls > 0 ? "real" : "sample",
    campaign: f.realPeople > 0 ? "real" : "sample",
  };
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What is waiting on the campaign today, from its own records. */
export function realToday(sig: RealSignals): TodayItem[] {
  const items: TodayItem[] = [];
  if (sig.pendingExpenses > 0) {
    items.push({
      title: `${n(sig.pendingExpenses, "expense", "expenses")} to approve`,
      detail: "Approval needs the supporting document on file.",
      action: { kind: "go", label: "Open Finance", to: "/finance" },
      sample: false,
    });
  }
  if (sig.unread > 0) {
    items.push({
      title: `${n(sig.unread, "person", "people")} waiting for a reply`,
      detail: "Messages in the inbox nobody has answered yet.",
      action: { kind: "go", label: "Open the inbox", to: "/inbox" },
      sample: false,
    });
  }
  if (sig.topIssue) {
    const t = sig.topIssue;
    items.push({
      title: `${t.label} is the loudest issue this week`,
      detail: `${n(t.count, "mention", "mentions")} in seven days${t.angry ? `, ${t.angry} of them angry` : ""}.`,
      action: { kind: "issue", label: "See what's said", issue: t.label.toLowerCase() },
      sample: false,
    });
  }
  if (sig.rivalMove) {
    items.push({
      title: sig.rivalMove.title,
      detail: sig.rivalMove.detail,
      action: { kind: "jump", label: "See the race", to: "#race" },
      sample: false,
    });
  }
  return items;
}

/** Real items first, then the race's sample items, never more than `max`. */
export function todayItems(real: TodayItem[], sample: Scenario["today"], max = 3): TodayItem[] {
  return [...real, ...sample.map((t) => ({ ...t, sample: true }))].slice(0, max);
}

/** The listening classifier's labels for "no issue": what it cannot place, and the campaign itself. */
const NOT_ISSUES = new Set(["general", "campaign"]);

const labelOf = (issue: string) => issue.charAt(0).toUpperCase() + issue.slice(1).toLowerCase();

/** The issue mentioned most, if it was mentioned at least `min` times. */
export function topIssue(
  rows: { issue: string | null; sentiment: string | null }[],
  min = 3,
): RealSignals["topIssue"] {
  const tally = new Map<string, { label: string; count: number; angry: number }>();
  for (const r of rows) {
    const label = (r.issue ?? "").trim();
    const key = label.toLowerCase();
    if (!label || NOT_ISSUES.has(key)) continue;
    const t = tally.get(key) ?? { label: labelOf(label), count: 0, angry: 0 };
    t.count++;
    if (r.sentiment === "negative") t.angry++;
    tally.set(key, t);
  }
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= min ? best : null;
}

/** Issues by how often they came up, loudest first, each with its latest lines. */
export function issueBoard(rows: IssueRow[], max = 5, examples = 2): IssueLine[] {
  const tally = new Map<string, IssueLine & { lines: IssueRow[] }>();
  for (const r of rows) {
    const label = (r.issue ?? "").trim();
    const key = label.toLowerCase();
    if (!label || NOT_ISSUES.has(key)) continue;
    const t = tally.get(key) ?? {
      key,
      label: labelOf(label),
      count: 0,
      angry: 0,
      examples: [],
      lines: [],
    };
    t.count++;
    if (r.sentiment === "negative") t.angry++;
    if (r.title?.trim()) t.lines.push(r);
    tally.set(key, t);
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, max)
    .map(({ lines, ...t }) => ({
      ...t,
      examples: lines
        .sort((a, b) => b.found_at.localeCompare(a.found_at))
        .slice(0, examples)
        .map((r) => ({ text: r.title!.trim().slice(0, 160), url: r.url })),
    }));
}

/** "Njeri Kamau" → "Njeri"; nothing usable → the fallback. */
export function greetingName(fullName: string | null | undefined, fallback: string): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

const PLACE = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

/** Where the latest poll puts us, in one line. */
export function raceVerdict(s: Scenario): string {
  const latest = s.polls.average[s.polls.average.length - 1];
  if (!latest) return "";
  const share = (key: string) => latest.shares[key] ?? 0;
  const us = ours(s);
  const ranked = [...s.contenders].sort((a, b) => share(b.key) - share(a.key));
  const place = ranked.findIndex((c) => c.key === us.key) + 1;
  if (place === 1) {
    const next = ranked[1];
    if (!next) return "";
    return `Leading ${next.short} by ${(share(us.key) - share(next.key)).toFixed(1)} points.`;
  }
  const leader = ranked[0]!;
  return `${PLACE[place] ?? `No. ${place}`}, ${(share(leader.key) - share(us.key)).toFixed(1)} points behind ${leader.short}.`;
}

/**
 * Where each number on Home leads. Part 3 moves the people and doors links to
 * the Voters screen.
 */
export const LINKS = {
  agents: "/agents",
  money: "/finance",
  contacts: "/people",
  supporters: "/people",
  doors: "/canvassing",
  ground: "#ground",
  race: "#race",
} as const;
