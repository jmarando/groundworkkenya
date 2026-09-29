// The three demo campaigns, one per office.

import { kalonzo } from "@/lib/demo/scenarios/kalonzo";
import { mathira } from "@/lib/demo/scenarios/mathira";
import { sakaja } from "@/lib/demo/scenarios/sakaja";
import type { Contender, Scenario, ScenarioKey } from "@/lib/demo/types";

export const SCENARIOS: Scenario[] = [kalonzo, sakaja, mathira];

/** Nairobi's governor race is this workspace's own campaign, so it comes first. */
export const DEFAULT_SCENARIO: ScenarioKey = "sakaja";

/** A scenario key from the URL, or the default for anything else. */
export function scenarioKey(v: unknown): ScenarioKey {
  return v === "kalonzo" || v === "sakaja" || v === "mathira" ? v : DEFAULT_SCENARIO;
}

/** The demo scenario for a campaign's race: president, governor or MP. */
export function scenarioForLevel(level: string | null | undefined): ScenarioKey {
  if (level === "president") return "kalonzo";
  if (level === "mp") return "mathira";
  return DEFAULT_SCENARIO;
}

export function getScenario(key: ScenarioKey): Scenario {
  return SCENARIOS.find((s) => s.key === key) ?? sakaja;
}

/** Which demo is a race's own: only these three have one. */
const OWN_DEMO: Record<string, ScenarioKey> = {
  president: "kalonzo",
  governor: "sakaja",
  mp: "mathira",
};

/**
 * In a campaign's own workspace, the demo for its race carries its own
 * candidate's name. The figures stay invented and the demo badge stays on.
 */
export function forCampaign(
  s: Scenario,
  campaign: { candidate: string | null; level: string } | null | undefined,
): Scenario {
  const name = campaign?.candidate?.trim();
  if (!name || OWN_DEMO[campaign?.level ?? ""] !== s.key || name === s.candidate.name) return s;
  const words = name.split(/\s+/);
  const first = words[0]!;
  const initials = (
    first[0]! + (words.length > 1 ? words[words.length - 1]![0]! : "")
  ).toUpperCase();
  return {
    ...s,
    candidate: { ...s.candidate, name, first, initials, fictional: false },
    contenders: s.contenders.map((c) => (c.us ? { ...c, name, short: first } : c)),
  };
}

export function ours(s: Scenario): Contender {
  return s.contenders.find((c) => c.us) ?? s.contenders[0]!;
}

export function contender(s: Scenario, key: string): Contender | undefined {
  return s.contenders.find((c) => c.key === key);
}
