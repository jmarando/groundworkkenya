// Home read out for the car: about three minutes, written for the ear, and
// only what Home shows. Nothing invented.

import { daysBetween, ELECTION_DAY } from "@/lib/demo/insights";
import type { DiaryEntry } from "@/lib/diary";
import type { TodayItem } from "@/lib/home";
import type { StoryView } from "@/lib/morning-story";
import { pct, sourcesOf, type MindLine } from "@/lib/top-of-mind";

const COUNT = ["", "One thing", "Two things", "Three things"];
const ORDINAL = ["First", "Second", "Third"];

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
}): string {
  const out = [
    `Good morning, ${o.name}. It's ${spokenDate(o.today)}, and ${daysBetween(o.today, ELECTION_DAY)} days to the election.`,
  ];
  if (o.verdict) out.push(`Where you stand: ${o.verdict}`);
  if (o.items.length) out.push(`${COUNT[o.items.length] ?? `${o.items.length} things`} today.`);
  o.items.forEach((t, i) => out.push(`${ORDINAL[i] ?? "Next"}: ${t.title}. ${t.detail}`));
  const st = o.story?.story;
  if (st?.kind === "written") {
    out.push(`The story this morning: ${st.headline}. ${st.summary}`);
    if (st.line) out.push(`A line you could use: ${st.line}`);
  } else if (st?.kind === "headlines" && st.also.length) {
    out.push(
      `This morning's top stories: ${st.also
        .slice(0, 3)
        .map((a) => a.title)
        .join(". ")}.`,
    );
  }
  if (o.mind) {
    out.push(
      `Top of mind this week: ${o.mind.label.toLowerCase()}, ${pct(o.mind.score)} of what was raised across ${sourcesOf(o.mind)}.`,
    );
  }
  if (o.plan.length) {
    out.push("Where to be today.");
    for (const e of o.plan)
      out.push(
        `${e.startsAt ? `At ${e.startsAt}` : "All day"}, ${e.title}.${e.note ? ` ${e.note}` : ""}`,
      );
  }
  out.push("That's your briefing. Have a good day.");
  return out.join(" ");
}
