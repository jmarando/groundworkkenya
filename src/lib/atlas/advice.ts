// What to do in an area and why, and the votes within reach there. Pure. The rules follow who is
// ahead, not the share alone, so a crowded race (45% to 30%) reads "Lean ours" and a narrow lead
// on a small share (38% to 30%) reads "Persuade". Each answer carries a one-line reason built from
// the numbers. Shares, margins and swings are percentages and points, as `measures.ts` gives them.

import { fmtPoints, fmtShare, fmtTurnout, MISSING } from "./format";
import { settle } from "./measures";

export type Action = "mobilise" | "hold" | "cut-the-gap" | "persuade" | "lean-ours";

export type Advice = {
  action: Action | "set-side" | "no-result";
  label: string;
  reason: string;
};

export type AdviceInput = {
  /** The bloc the campaign counts as ours in this election; null until it is set. */
  side: string | null;
  ourShare: number | null;
  margin: number | null;
  /** Our share now minus our share at the election before, in points. */
  swing: number | null;
  turnout: number | null;
  /** Turnout in the area above (the county for a constituency), and what to call that area. */
  parentTurnout: number | null;
  parentName: string;
};

const LABELS: Record<Action, string> = {
  mobilise: "Mobilise",
  hold: "Hold",
  "cut-the-gap": "Cut the gap",
  persuade: "Persuade",
  "lean-ours": "Lean ours",
};

const answer = (action: Action, reason: string): Advice => ({
  action,
  label: LABELS[action],
  reason,
});

/**
 * First match wins:
 * 1. Mobilise: our share is 50% or more and turnout is more than 3 points below the area above.
 * 2. Hold: our share is 60% or more.
 * 3. Cut the gap: we trail the strongest other bloc by more than 10 points.
 * 4. Persuade: the margin is within 10 points either way, or the last swing was 10 or more.
 * 5. Lean ours: anything else, which is ahead by more than 10 points.
 */
export function whatToDo(i: AdviceInput): Advice {
  if (i.side === null) return { action: "set-side", label: "Set your side first", reason: "" };
  if (i.ourShare === null || i.margin === null) {
    return { action: "no-result", label: "No result", reason: MISSING };
  }
  const share = settle(i.ourShare);
  const m = settle(i.margin);
  const swing = i.swing === null ? null : settle(i.swing);
  const gap =
    i.turnout !== null && i.parentTurnout !== null ? settle(i.parentTurnout - i.turnout) : null;
  const to = `${fmtShare(share)} to us`;

  if (share >= 50 && gap !== null && gap > 3) {
    return answer(
      "mobilise",
      `${to}, but turnout was ${fmtTurnout(i.turnout)}, ${fmtPoints(gap)} below ` +
        `${i.parentName}'s ${fmtTurnout(i.parentTurnout)}`,
    );
  }
  if (share >= 60) return answer("hold", to);
  if (m < -10) return answer("cut-the-gap", `${to}, ${fmtPoints(m)} behind`);

  const contest = Math.abs(m) <= 10;
  const swung = swing !== null && Math.abs(swing) >= 10;
  if (contest || swung) {
    const parts = [to];
    if (contest) parts.push(m === 0 ? "level" : `${fmtPoints(m)} ${m > 0 ? "ahead" : "behind"}`);
    if (swung) {
      parts.push(`swung ${fmtPoints(swing)} ${swing > 0 ? "to" : "away from"} us since last time`);
    }
    return answer("persuade", parts.join(", "));
  }
  return answer("lean-ours", `${to}, ${fmtPoints(m)} ahead`);
}

/** The value at a percentile by the nearest-rank method; null for an empty list. */
export function nearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Multiply first: (7 / 100) * 100 is 7.000000000000001, and ceil would answer 8.
  const rank = Math.max(1, Math.ceil((percentile * sorted.length) / 100));
  return sorted[rank - 1] ?? null;
}

export type ReachInput = {
  /** This area's turnout, in percent. */
  turnout: number | null;
  /** The turnouts of all the areas with the same parent, this one included, that have one. */
  siblingTurnouts: number[];
  registered: number | null;
  /** Our share, in percent. */
  ourShare: number | null;
  valid: number | null;
};

export type Reach = { turnout: number | null; persuasion: number | null; total: number | null };

/**
 * The votes within reach, as two parts and their sum:
 * - turnout: if this area's turnout rose to the 75th percentile of its siblings' (nearest rank),
 *   the extra voters, at our share. Zero when it is already there; missing with fewer than four
 *   siblings that have a turnout, or when a figure it needs is missing.
 * - persuasion: 5% of the valid votes, a 5-point swing to us.
 */
export function votesWithinReach(i: ReachInput): Reach {
  let turnoutVotes: number | null = null;
  if (
    i.turnout !== null &&
    i.registered !== null &&
    i.ourShare !== null &&
    i.siblingTurnouts.length >= 4
  ) {
    const top = nearestRank(i.siblingTurnouts, 75);
    if (top !== null) {
      turnoutVotes = settle(
        Math.max(0, ((top - i.turnout) / 100) * i.registered * (i.ourShare / 100)),
      );
    }
  }
  const persuasion = i.valid === null ? null : settle(i.valid * 0.05);
  const parts = [turnoutVotes, persuasion].filter((x): x is number => x !== null);
  const total = parts.length === 0 ? null : settle(parts.reduce((a, b) => a + b, 0));
  return { turnout: turnoutVotes, persuasion, total };
}
