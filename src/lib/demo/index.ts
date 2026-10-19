// The demo campaigns: one per office, and a campaign's own where it has one.

import { githunguri } from "@/lib/demo/scenarios/githunguri";
import { kalonzo } from "@/lib/demo/scenarios/kalonzo";
import { mathira } from "@/lib/demo/scenarios/mathira";
import { roysambu } from "@/lib/demo/scenarios/roysambu";
import { sakaja } from "@/lib/demo/scenarios/sakaja";
import type { Contender, Scenario, ScenarioKey } from "@/lib/demo/types";

export const SCENARIOS: Scenario[] = [kalonzo, sakaja, mathira, roysambu, githunguri];

/** Nairobi's governor race is this workspace's own campaign, so it comes first. */
export const DEFAULT_SCENARIO: ScenarioKey = "sakaja";

/** A scenario key from the URL, or the default for anything else. */
export function scenarioKey(v: unknown): ScenarioKey {
  return SCENARIOS.some((s) => s.key === v) ? (v as ScenarioKey) : DEFAULT_SCENARIO;
}

/** The demo scenario for a campaign's race: president, governor, MP or MCA. */
export function scenarioForLevel(level: string | null | undefined): ScenarioKey {
  return OWN_DEMO[level ?? ""] ?? DEFAULT_SCENARIO;
}

/** A campaign's demo: its own place's, where there is one, else its race's. */
export function scenarioFor(
  campaign: { slug: string; level: string } | null | undefined,
): ScenarioKey {
  const own = SCENARIOS.find((s) => s.key === campaign?.slug && s.office === campaign?.level);
  return own ? own.key : scenarioForLevel(campaign?.level);
}

export function getScenario(key: ScenarioKey): Scenario {
  return SCENARIOS.find((s) => s.key === key) ?? sakaja;
}

/** Which demo is a race's own: only these four have one. */
const OWN_DEMO: Record<string, ScenarioKey> = {
  president: "kalonzo",
  governor: "sakaja",
  mp: "mathira",
  mca: "roysambu",
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
  if (!name || s.office !== campaign?.level || name === s.candidate.name) return s;
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
