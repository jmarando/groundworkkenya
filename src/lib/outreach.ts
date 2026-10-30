// Briefing a voice: the lines Daraja Pulse's creators always work under, why a voice is worth a brief
// (only facts from its own public posts), and a plain invitation to edit. Plain code, no AI, and
// nothing that names or guesses anyone's community: a voice is only what it published. Pure.

import type { BigVoice, Level } from "@/lib/big-voices";
import { nf, short } from "@/lib/format";
import { RAPID_RULES } from "@/lib/pulse";

/** Every brief carries these, and the office cannot remove them. */
export const STANDING_LINES: readonly string[] = [
  RAPID_RULES.dos[0]!,
  RAPID_RULES.donts[0]!,
  "The creator approves a draft before anything posts.",
];

const FOUND_BY: Record<Level, string> = {
  seat: "found by keywords about your race",
  county: "found by your county news keywords",
  country: "found by your national keywords",
};

const plural = (n: number, one: string) => `${nf.format(n)} ${n === 1 ? one : `${one}s`}`;

/**
 * Why this voice: what it posted in the window and where we found it, how far it reached, how its
 * posts feel towards you, and what it talks about. Every line is a count of its own public posts.
 */
export function whyThem(v: BigVoice, level: Level, days: number): string[] {
  const out = [`${plural(v.posts, "post")} in the last ${days} days, ${FOUND_BY[level]}.`];

  const size = [
    v.seen !== null ? `seen ${nf.format(v.seen)} times` : "",
    v.followers !== null ? `${short(v.followers)} followers` : "",
  ].filter(Boolean);
  if (size.length) out.push(`${size.join(", ").replace(/^./, (c) => c.toUpperCase())}.`);

  out.push(
    v.read > 0 && v.towardsWarm !== null && v.towardsAngry !== null
      ? `Of ${plural(v.read, "post")} read for mood, ${Math.round(v.towardsWarm * 100)}% warm and ${Math.round(v.towardsAngry * 100)}% angry towards you.`
      : "Mood not read yet.",
  );

  if (v.topIssues.length) out.push(`Mostly about ${v.topIssues.join(" and ")}.`);
  return out;
}

const NOUN: Record<string, string> = { facebook: "page", youtube: "channel" };

/**
 * The invitation, from a plain template: who we are, that we have seen their posts (and the issue
 * they talk about most, when there is one), that the posts are paid and clearly labelled, and that
 * the brief and rate come through Daraja Pulse. The office edits it before it goes.
 */
export function invitation(
  campaign: { candidate: string | null; seat: string },
  voice: Pick<BigVoice, "name" | "platform" | "topIssues">,
): string {
  const team = campaign.candidate
    ? `the campaign team for ${campaign.candidate} in ${campaign.seat}`
    : `the campaign team in ${campaign.seat}`;
  const noun = NOUN[voice.platform] ?? "account";
  const issue = voice.topIssues[0];
  return [
    `Hello ${voice.name.slice(0, 80)}, we are ${team}.`,
    `We have seen your ${noun}${issue ? ` and what you say about ${issue}` : ""}.`,
    "We would like to brief you on paid, clearly labelled posts for the campaign.",
    "If you are open to it, reply here and we will send the brief and the rate through Daraja Pulse.",
  ].join(" ");
}
