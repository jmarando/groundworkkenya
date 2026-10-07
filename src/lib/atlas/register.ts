// What the register and the population estimates say about an area: how the register grew, how
// many adults are not yet registered, how young the adults are, and whether the gap is wide
// enough to flag. Pure. Population figures are estimates; a figure that is missing is null.

import { settle } from "./measures";

/** Registered voters now minus at the last election, and that as a share of the last. */
export function registerGrowth(
  now: number | null,
  before: number | null,
): { change: number; pct: number | null } | null {
  if (now === null || before === null) return null;
  return {
    change: now - before,
    pct: before > 0 ? settle(((now - before) / before) * 100) : null,
  };
}

/** Adults minus registered voters, never below zero. An estimate: the adults are. */
export function notYetRegistered(adults: number | null, registered: number | null): number | null {
  if (adults === null || registered === null) return null;
  return Math.max(0, adults - registered);
}

/**
 * 18 to 34 as a share of the area's adults, in percent. It says who lives there,
 * not who is unregistered.
 */
export function youngShare(young: number | null, adults: number | null): number | null {
  if (young === null || adults === null || adults <= 0) return null;
  return settle((young / adults) * 100);
}

/** An estimated quarter or more of the area's adults are not registered. */
export function registerFlag(adults: number | null, registered: number | null): boolean {
  const missing = notYetRegistered(adults, registered);
  if (missing === null || adults === null || adults <= 0) return false;
  return settle(missing / adults) >= 0.25;
}
