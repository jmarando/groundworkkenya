// Every finding rule, run over one input in the order the screens show them.
// A rule that throws is left out and logged; the others still run. Pure.

import {
  orderFindings,
  RULES,
  type Finding,
  type FindingsInput,
  type RuleId,
} from "@/lib/findings/core";
import { issueRising, oneSeatDifferentPlaces, wardTopIssue } from "@/lib/findings/message";
import { notVisited, timeInSafeSeats } from "@/lib/findings/time";

export type Rule = (i: FindingsInput) => Finding[];

/** Each rule's function; a rule without one is skipped. */
export const RULE_FNS: Partial<Record<RuleId, Rule>> = {
  "not-visited": notVisited,
  "time-in-safe-seats": timeInSafeSeats,
  "ward-top-issue": wardTopIssue,
  "issue-rising": issueRising,
  "one-seat-different-places": oneSeatDifferentPlaces,
};

export function findings(
  i: FindingsInput,
  rules: Partial<Record<RuleId, Rule>> = RULE_FNS,
  log: (message: string, error: unknown) => void = console.error,
): Finding[] {
  const out: Finding[] = [];
  for (const r of RULES) {
    const rule = rules[r.id];
    if (!rule) continue;
    try {
      out.push(...rule(i));
    } catch (e) {
      log(`The ${r.id} rule failed`, e);
    }
  }
  return orderFindings(out);
}
