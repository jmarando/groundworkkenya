// Home's rules: which sections show real data, what goes on the Today list,
// the verdict line, and where each number leads. Pure, so they can be checked
// without a browser or a database.

import { ours } from "@/lib/demo";
import type { Action, Scenario } from "@/lib/demo/types";

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
};

export type TodayItem = { title: string; detail: string; action: Action; sample: boolean };

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
      action: { kind: "go", label: "See what's said", to: "/listening" },
      sample: false,
    });
  }
  return items;
}

/** Real items first, then the race's sample items, never more than `max`. */
export function todayItems(real: TodayItem[], sample: Scenario["today"], max = 3): TodayItem[] {
  return [...real, ...sample.map((t) => ({ ...t, sample: true }))].slice(0, max);
}

/** The issue mentioned most, if it was mentioned at least `min` times. */
export function topIssue(
  rows: { issue: string | null; sentiment: string | null }[],
  min = 3,
): RealSignals["topIssue"] {
  const tally = new Map<string, { label: string; count: number; angry: number }>();
  for (const r of rows) {
    const label = (r.issue ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const t = tally.get(key) ?? {
      label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
      count: 0,
      angry: 0,
    };
    t.count++;
    if (r.sentiment === "negative") t.angry++;
    tally.set(key, t);
  }
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  return best && best.count >= min ? best : null;
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
