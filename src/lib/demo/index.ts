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

export function getScenario(key: ScenarioKey): Scenario {
  return SCENARIOS.find((s) => s.key === key) ?? sakaja;
}

export function ours(s: Scenario): Contender {
  return s.contenders.find((c) => c.us) ?? s.contenders[0]!;
}

export function contender(s: Scenario, key: string): Contender | undefined {
  return s.contenders.find((c) => c.key === key);
}
