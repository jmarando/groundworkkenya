// Home read out for the car: about three minutes, written for the ear, and
// only what Home shows. Nothing invented.

import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";
import type { StoryView } from "@/lib/morning-story";
import { pct, sourcesOf, type MindLine } from "@/lib/top-of-mind";

const COUNT = ["", "One thing", "Two things", "Three things"];

export type SpokenStrategy = {
  headline: string | null;
  next: { title: string; on: string } | null;
  wider: { title: string; stance: string; move: string | null } | null;
};

const STANCE_WORD: Record<string, string> = {
  strength: "it helps you",
  threat: "it hurts you",
  opening: "it is an opening",
  context: "it is context to keep in mind",
};
const ORDINAL = ["First", "Second", "Third"];

export function spokenTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return `${hour % 12 || 12}${minute ? ` ${minute < 10 ? "oh " : ""}${minute}` : ""} ${hour < 12 ? "a.m." : "p.m."}`;
}

const spokenDate = (iso: string): string =>
  new Date(`${iso}T09:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Nairobi",
  });

export function spokenHome(o: {
  name: string;
  today: string;
  verdict: string;
  items: TodayItem[];
  story: StoryView | null;
  plan: DiaryEntry[];
  mind: MindLine | null;
  /** Strategy at a glance, when Home has it: the fortnight's plan, the next IEBC date, wider news. */
  strategy?: SpokenStrategy | null;
}): string {
  const out = [
    `Good morning, ${o.name}. Let's get you ready for ${spokenDate(o.today)}. ${daysBetween(o.today, ELECTION_DAY)} days to the election. Here's your campaign morning.`,
  ];
  const st = o.story?.story;
  const earlier = o.story && o.story.day < o.today ? o.story.day : null;
  if (st?.kind === "written") {
    out.push(
      earlier
        ? `Today's story is not in yet, so here is ${spokenDate(earlier)}'s. ${st.headline}. ${st.summary}`
        : `First, the story making headlines. ${st.headline}. ${st.summary}`,
    );
    if (st.why) out.push(`Why it matters to your campaign: ${st.why}`);
    if (st.rivals) out.push(`What rivals are saying: ${st.rivals}`);
    if (st.line) out.push(`For your next conversation, a suggested line: ${st.line}`);
  } else if (st?.kind === "headlines" && (st.headline || st.also.length)) {
    // The lead first, then the others: the morning's headlines lead with what leads the page.
    const spoken = [st.headline, ...st.also.map((a) => a.title)].filter(Boolean).slice(0, 3);
    out.push(
      `${earlier ? `Today's headlines are not in yet. ${spokenDate(earlier)}'s` : "First, the headlines"}: ${spoken.join(". ")}.`,
    );
  }
  if (o.verdict) out.push(`Now, the race. ${o.verdict}`);
  if (o.mind) {
    out.push(
      `On people's minds this week: ${o.mind.label.toLowerCase()}. It accounts for ${pct(o.mind.score)} of what was raised across ${sourcesOf(o.mind)}.`,
    );
  }
  const sg = o.strategy;
  if (sg?.headline) out.push(`Your plan for these two weeks: ${sg.headline}.`);
  if (sg?.next) {
    const days = daysBetween(o.today, sg.next.on);
    out.push(
      `The next deadline: ${sg.next.title}, on ${spokenDate(sg.next.on)}${days > 0 ? `, ${days === 1 ? "tomorrow" : `in ${days} days`}` : ", today"}.`,
    );
  }
  if (sg?.wider)
    out.push(
      `Beyond the seat: ${sg.wider.title}. For your campaign, ${STANCE_WORD[sg.wider.stance] ?? "it is worth knowing"}.${sg.wider.move ? ` What to do: ${sg.wider.move}` : ""}`,
    );
  if (o.items.length)
    out.push(
      `Over to today's priorities. ${COUNT[o.items.length] ?? `${o.items.length} things`} to focus on.`,
    );
  o.items.forEach((t, i) => out.push(`${ORDINAL[i] ?? "Next"}: ${t.title}. ${t.detail}`));
  if (o.plan.length) {
    out.push("And now, your day on the ground.");
    for (const e of o.plan)
      out.push(
        `${e.startsAt ? `At ${spokenTime(e.startsAt)}` : "All day"}, ${e.title}.${e.note ? ` ${e.note}` : ""}`,
      );
  }
  if (o.items[0]) out.push(`Before you go, your first priority: ${o.items[0].title}.`);
  out.push("You're up to speed. Have a good day.");
  return out.join("\n\n");
}
