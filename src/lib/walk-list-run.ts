// A walk list as the agent's phone runs it: each door's state from the server's visits and the
// visits waiting on the phone, the progress, and the words on the screen. Pure.

import { ringAreaM2, type Ring } from "@/lib/geo";
import { OUTCOME_LABEL, type Outcome } from "@/lib/houses";
import type { ListDoor } from "@/lib/walk-lists.functions";

/** A visit waiting to send, as far as the list screens need it. */
export type QueuedVisit = { walkListId?: string | null; doorPc?: string | null; outcome: Outcome };

const DAY_MS = 86_400_000;

/**
 * What the phone knows of each door of a list: the server's latest visit at its house since the
 * list first went out, then the visits waiting to send (the newest last), then those saved a
 * moment ago and not yet read back. A door with none is left out.
 */
export function doorOutcomes(
  doors: ListDoor[],
  firstSentAt: string | null,
  queue: QueuedVisit[],
  listId: string,
  saved: ReadonlyMap<string, Outcome> = new Map(),
): Map<string, Outcome> {
  const out = new Map<string, Outcome>();
  const from = firstSentAt ? Date.parse(firstSentAt) : NaN;
  for (const d of doors) {
    const at = d.visitedAt ? Date.parse(d.visitedAt) : NaN;
    if (d.outcome && !Number.isNaN(from) && !Number.isNaN(at) && at >= from)
      out.set(d.pc, d.outcome);
  }
  for (const q of queue) if (q.walkListId === listId && q.doorPc) out.set(q.doorPc, q.outcome);
  for (const [pc, outcome] of saved) out.set(pc, outcome);
  return out;
}

/** The doors done, up to the doors there are. */
export function runProgress(
  outcomes: ReadonlyMap<string, Outcome>,
  total: number,
): { done: number; total: number } {
  return { done: Math.min(outcomes.size, total), total };
}

/** "Door 16 of 44". */
export const doorTitle = (n: number, total: number): string => `Door ${n} of ${total}`;

/** The save button: where it goes next, or just Save at the last door. */
export const saveLabel = (next: number | null): string =>
  next === null ? "Save" : `Save · go to door ${next}`;

/** What the phone says of the visits it holds; nothing when there is signal and none wait. */
export function queueNote(waiting: number, online: boolean): string | null {
  if (online)
    return waiting > 0 ? `${waiting} ${waiting === 1 ? "visit" : "visits"} waiting to send` : null;
  return waiting > 0
    ? `No signal · ${waiting} ${waiting === 1 ? "visit" : "visits"} saved on the phone, they send when it comes back`
    : "No signal · visits you save stay on the phone and send when it comes back";
}

/** "today", "yesterday", "12 days ago", or the date once it is a month old; nothing for no time. */
export function agoText(iso: string | null, now: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const days = Math.floor((now - t) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Nairobi",
  });
}

/** "given yesterday": when a list came to the person. */
export function givenText(iso: string | null, now: number = Date.now()): string {
  const when = agoText(iso, now);
  return when ? `given ${when}` : "";
}

/** The last visit at a door: what it was and when, or that there is none. */
export function lastVisitText(
  outcome: Outcome | null,
  at: string | null,
  now: number = Date.now(),
): string {
  if (!outcome) return "Not visited yet";
  const when = agoText(at, now);
  return when ? `${OUTCOME_LABEL[outcome]} ${when}` : OUTCOME_LABEL[outcome];
}

/** A house's footprint in whole square metres, less any courtyard; null with no outline. */
export function footprintM2(rings: Ring[]): number | null {
  const [outer, ...holes] = rings;
  if (!outer) return null;
  return Math.round(ringAreaM2(outer) - holes.reduce((sum, r) => sum + ringAreaM2(r), 0));
}
