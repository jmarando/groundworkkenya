// Home's rules: which sections have real data, what goes on the Today list,
// and where each number leads. Pure, so they can be checked without a browser
// or a database.

import type { Action } from "@/lib/demo/types";
import { KIND_NAMES, type DiaryEntry } from "@/lib/diary";
import type { RacePoll, RaceRival, RivalMove, RivalPost } from "@/lib/race-data";
import { pct, sourcesOf, type MindLine } from "@/lib/top-of-mind";

export type SectionMode = "real" | "empty";

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

export type TodayItem = { title: string; detail: string; action: Action };

/** The campaign's own race; empty until someone adds it. */
export type RaceView = {
  rivals: RaceRival[];
  polls: RacePoll[];
  /** Rivals' own posts from the last 30 days, newest first. */
  posts: RivalPost[];
};

export function sectionModes(f: HomeFacts): { race: SectionMode; campaign: SectionMode } {
  return {
    race: f.rivals > 0 || f.polls > 0 ? "real" : "empty",
    campaign: f.realPeople > 0 ? "real" : "empty",
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
    });
  }
  if (sig.unread > 0) {
    items.push({
      title: `${n(sig.unread, "person", "people")} waiting for a reply`,
      detail: "Messages in the inbox nobody has answered yet.",
      action: { kind: "go", label: "Open the inbox", to: "/inbox" },
    });
  }
  if (sig.mind) items.push(mindItem(sig.mind));
  if (sig.rivalMove) {
    items.push({
      title: sig.rivalMove.title,
      detail: sig.rivalMove.detail,
      action: { kind: "jump", label: "See the race", to: "#race" },
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
  };
}

/** The diary's next stop today, first on Today's list. */
export function nextStopItem(e: DiaryEntry): TodayItem {
  return {
    title: `Next: ${e.title}, ${e.startsAt}`,
    detail: e.note ?? [KIND_NAMES[e.kind], e.wardName].filter(Boolean).join(" · "),
    action: { kind: "go", label: "Open the diary", to: "/diary" },
  };
}

/** Today's list: the real items, at most three. */
export const todayItems = (real: TodayItem[], max = 3): TodayItem[] => real.slice(0, max);

/** "Njeri Kamau" → "Njeri"; nothing usable → the fallback. */
export function greetingName(fullName: string | null | undefined, fallback: string): string {
  return fullName?.trim().split(/\s+/)[0] || fallback;
}

/** Where each number on Home leads. */
export const LINKS = {
  agents: "/agents",
  money: "/finance",
  contacts: "/voters",
  supporters: "/voters",
  doors: "/voters",
  ground: "#ground",
  race: "#race",
} as const;
