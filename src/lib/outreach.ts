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

/** Where an approach stands, in the order it usually travels. The office sets it by hand until Pulse reports it. */
export const APPROACH_STATUSES = ["approached", "invited", "on_roster", "declined"] as const;
export type ApproachStatus = (typeof APPROACH_STATUSES)[number];

/** What each status is called on screen. */
export const APPROACH_LABEL: Record<ApproachStatus, string> = {
  approached: "Approached",
  invited: "Invited",
  on_roster: "On roster",
  declined: "Declined",
};

/** An approach as the office records it when it copies or sends an invitation. */
export type ApproachInput = {
  voice: { key: string; platform: string; name: string; url: string | null };
  invitation: string;
  channel: "copied" | "pulse";
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** The approach as it will be saved, or the sentence saying what is wrong with it. */
export function checkApproach(
  raw: unknown,
): { ok: true; approach: ApproachInput } | { ok: false; why: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const v = (r["voice"] ?? {}) as Record<string, unknown>;
  const key = str(v["key"], 300);
  const platform = str(v["platform"], 40);
  const name = str(v["name"], 200);
  if (key.length < 3 || !platform || !name) return { ok: false, why: "Say which voice this is." };
  if (key.startsWith("site:"))
    return { ok: false, why: "An outlet gets a note to its newsroom, not a creator brief." };
  const url = typeof v["url"] === "string" && v["url"] ? v["url"].trim() : null;
  if (url !== null && !/^https:\/\/\S{1,480}$/.test(url))
    return { ok: false, why: "The voice's address must be a secure link." };
  const text = typeof r["invitation"] === "string" ? r["invitation"].trim() : "";
  if (!text) return { ok: false, why: "Write the invitation first." };
  if (text.length > 2000)
    return { ok: false, why: "The invitation is limited to 2,000 characters." };
  const channel = r["channel"];
  if (channel !== "copied" && channel !== "pulse")
    return { ok: false, why: "Say how the invitation went out: copied, or sent through Pulse." };
  return { ok: true, approach: { voice: { key, platform, name, url }, invitation: text, channel } };
}

/** A voice and one of the four statuses, or what is missing. */
export function checkStatus(
  raw: unknown,
): { ok: true; key: string; status: ApproachStatus } | { ok: false; why: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = str(r["key"], 300);
  const status = APPROACH_STATUSES.find((s) => s === r["status"]);
  if (key.length < 3) return { ok: false, why: "Say which voice this is." };
  if (!status) return { ok: false, why: "That is not a status." };
  return { ok: true, key, status };
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
