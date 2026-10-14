// The rules for rivals and polls: the biggest recent poll move, ours
// included, and a rival suddenly taking more of the news. Pure.

import {
  count,
  EPS,
  finding,
  LIMITS,
  percent,
  type Figure,
  type Finding,
  type FindingsInput,
} from "@/lib/findings/core";
import { biggestPollMove, fieldworkLabel, moveTitle, withinMargin } from "@/lib/race-data";

/** 11. The biggest move between one pollster's last two polls, the newer in the last 30 days. */
export function pollMove(i: FindingsInput): Finding[] {
  const m = biggestPollMove(i.rivals, i.polls, i.today);
  if (!m) return [];
  const inside = withinMargin(m);
  const figures: Figure[] = [
    {
      label: "Points moved",
      value: m.points,
      text: m.points.toFixed(1),
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    },
    {
      label: "Share before",
      value: m.from,
      text: `${m.from}%`,
      source: m.older.pollster,
      period: fieldworkLabel(m.older),
    },
    {
      label: "Share now",
      value: m.to,
      text: `${m.to}%`,
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    },
  ];
  if (m.newer.sampleSize !== null)
    figures.push({
      label: "People asked",
      value: m.newer.sampleSize,
      text: count(m.newer.sampleSize),
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    });
  if (inside)
    figures.push({
      label: "Margin of error",
      value: m.newer.margin!,
      text: `±${m.newer.margin}`,
      source: m.newer.pollster,
      period: fieldworkLabel(m.newer),
    });
  return [
    finding(
      "poll-move",
      null,
      `${moveTitle(m)}, from ${m.from}% to ${m.to}%${inside ? `, within the poll's margin of error (±${m.newer.margin})` : ""}.`,
      figures,
      { label: "See the race", to: "/home", hash: "race" },
      m.points,
    ),
  ];
}

/** 12. A rival's share of the news this week, 10 points or more above the previous four weeks'. */
export function rivalInNews(i: FindingsInput): Finding[] {
  if (!i.rivalWeeks) return [];
  const sum = (rival: string | null, now: boolean) =>
    i
      .rivalWeeks!.filter(
        (r) => r.rivalId === rival && (now ? r.week === 0 : r.week >= 1 && r.week <= 4),
      )
      .reduce((t, r) => t + r.n, 0);
  const allNow = sum(null, true);
  const allBefore = sum(null, false);
  if (!allNow || allBefore < LIMITS.rivalMentionsMin) return [];
  return i.rivals
    .filter((r) => !r.isUs)
    .flatMap((r) => {
      const now = sum(r.id, true);
      const a = now / allNow;
      const b = sum(r.id, false) / allBefore;
      if (now < LIMITS.rivalMentionsMin || a - b < LIMITS.rivalPoints - EPS) return [];
      return [
        finding(
          "rival-in-news",
          null,
          `${r.name} was in ${percent(a)} of news and social mentions this week, up from ${percent(b)} over the previous four weeks.`,
          [
            {
              label: "Share this week",
              value: a,
              text: percent(a),
              source: "Listening",
              period: `7 days to ${i.today}`,
            },
            {
              label: "Share over the previous four weeks",
              value: b,
              text: percent(b),
              source: "Listening",
              period: "the 28 days before",
            },
            {
              label: "Mentions this week",
              value: now,
              text: count(now),
              source: "Listening",
              period: `7 days to ${i.today}`,
            },
          ],
          { label: "Open Listening", to: "/listening" },
          a - b,
          r.id,
        ),
      ];
    });
}
