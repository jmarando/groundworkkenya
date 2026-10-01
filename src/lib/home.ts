// Home's rules: which sections show real data, what goes on the Today list,
// the verdict line, and where each number leads. Pure, so they can be checked
// without a browser or a database.

import { ours } from "@/lib/demo";
import type { Action, Scenario } from "@/lib/demo/types";
import { KIND_NAMES, type DiaryEntry } from "@/lib/diary";
import type { RacePoll, RaceRival, RivalMove, RivalPost } from "@/lib/race-data";
import { pct, sourcesOf, type MindLine } from "@/lib/top-of-mind";

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
  /** The week's top issue across news and social, messages, the door and searches. */
  mind: MindLine | null;
  /** The biggest recent change for a rival in one pollster's polls. */
  rivalMove?: RivalMove | null;
};

export type TodayItem = { title: string; detail: string; action: Action; sample: boolean };

/** The campaign's own race; empty until someone adds it. */
export type RaceView = {
  rivals: RaceRival[];
  polls: RacePoll[];
  /** Rivals' own posts from the last 30 days, newest first. */
  posts: RivalPost[];
};

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
  if (sig.mind) items.push(mindItem(sig.mind));
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

/** The week's top issue as a Today item. */
export function mindItem(l: MindLine): TodayItem {
  return {
    title: `${l.label} is top of mind this week`,
    detail: `${pct(l.score)} of what was raised across ${sourcesOf(l)}.`,
    action: { kind: "issue", label: "See what's said", issue: l.key },
    sample: false,
  };
}

/** The diary's next stop today, first on Today's list. */
export function nextStopItem(e: DiaryEntry): TodayItem {
  return {
    title: `Next: ${e.title}, ${e.startsAt}`,
    detail: e.note ?? [KIND_NAMES[e.kind], e.wardName].filter(Boolean).join(" · "),
    action: { kind: "go", label: "Open the diary", to: "/diary" },
    sample: false,
  };
}

/** Real items first, then the race's sample items, never more than `max`. */
export function todayItems(real: TodayItem[], sample: Scenario["today"], max = 3): TodayItem[] {
  return [...real, ...sample.map((t) => ({ ...t, sample: true }))].slice(0, max);
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
