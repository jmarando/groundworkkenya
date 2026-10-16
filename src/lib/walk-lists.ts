// The rules of a walk list: which houses a suggested patch takes, which a drawn shape takes, the
// order to walk them in, who may plan one, and the words the screens show. Pure, so the planning
// screen and the agent's phone share one set of rules.

import type { MyRole } from "@/lib/access";
import { distanceM, inPolygon, toLocalM, type LngLat, type Ring } from "@/lib/geo";

/** A suggested patch is the nearest 50 free houses. */
export const PATCH_SIZE = 50;
/** A drawn shape takes at most this many houses; more and it asks for a smaller area. */
export const DRAW_CAP = 150;
/** A house spoken to or refused waits this long before it is suggested again. */
export const SPOKE_REFUSED_DAYS = 30;
/** A house where no one was home waits this long. */
export const NOT_HOME_DAYS = 3;

const DAY_MS = 86_400_000;
/** The database allows a list's name this many letters. */
const NAME_MAX = 80;

/** A house on the map: its plus code, its centre and outline, and the ward it is in. */
export type PlanHouse = { pc: string; centre: LngLat; rings: Ring[]; wardId: string | null };

/** What the database knows of a house for planning: its latest visits and the open list it is on. */
export type HouseHistory = {
  pc: string;
  spokeOrRefusedAt: string | null;
  notHomeAt: string | null;
  onList: string | null;
};

/** Which kind of visit keeps a house waiting: a conversation or a refusal, or nobody home. */
export function recentKind(h: HouseHistory | undefined, now: number): "spoke" | "not-home" | null {
  if (!h) return null;
  if (within(h.spokeOrRefusedAt, SPOKE_REFUSED_DAYS, now)) return "spoke";
  if (within(h.notHomeAt, NOT_HOME_DAYS, now)) return "not-home";
  return null;
}

/** Why a house is not suggested: it is on another open list, or was visited lately. */
export function skipReason(
  h: HouseHistory | undefined,
  now: number,
): "other-list" | "recent" | null {
  if (!h) return null;
  if (h.onList) return "other-list";
  return recentKind(h, now) ? "recent" : null;
}

/** True when the time is less than this many days before now. */
function within(iso: string | null, days: number, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t < days * DAY_MS;
}

/**
 * The patch to suggest: the nearest `limit` houses to a point that are free (not on another
 * open list, not visited lately). The skips are counted across every house given.
 */
export function suggestPatch(
  houses: PlanHouse[],
  from: LngLat,
  history: Map<string, HouseHistory>,
  now: number,
  limit: number = PATCH_SIZE,
): { doors: PlanHouse[]; skipped: { recent: number; otherList: number } } {
  const skipped = { recent: 0, otherList: 0 };
  const free: { house: PlanHouse; m: number }[] = [];
  for (const house of houses) {
    const why = skipReason(history.get(house.pc), now);
    if (why === "other-list") skipped.otherList++;
    else if (why === "recent") skipped.recent++;
    else free.push({ house, m: distanceM(from, house.centre) });
  }
  free.sort(
    (a, b) => a.m - b.m || (a.house.pc < b.house.pc ? -1 : a.house.pc > b.house.pc ? 1 : 0),
  );
  return { doors: free.slice(0, limit).map((f) => f.house), skipped };
}

/**
 * The houses inside a drawn shape: every house whose centre is inside, except the ones on another
 * open list, which are counted. A shape of fewer than three points takes nothing. Over the cap it
 * takes nothing and says so, so the screen can ask for a smaller area.
 */
export function housesWithin(
  houses: PlanHouse[],
  shape: LngLat[],
  history: Map<string, HouseHistory>,
): { doors: PlanHouse[]; otherList: number; tooMany: boolean } {
  if (shape.length < 3) return { doors: [], otherList: 0, tooMany: false };
  const doors: PlanHouse[] = [];
  let otherList = 0;
  for (const house of houses) {
    if (!inPolygon(house.centre, [shape])) continue;
    if (history.get(house.pc)?.onList) otherList++;
    else doors.push(house);
  }
  const tooMany = doors.length > DRAW_CAP;
  return { doors: tooMany ? [] : doors, otherList, tooMany };
}

/**
 * The order to walk points in, as indices; the first point is where the walk starts. Nearest
 * next, then shortened by reversing stretches while that helps (2-opt), on straight-line
 * distances in metres.
 */
export function walkingOrder(points: LngLat[]): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  const flat = points.map((q) => toLocalM(q, points[0]!));
  const gap = (a: number, b: number) =>
    Math.hypot(flat[a]![0] - flat[b]![0], flat[a]![1] - flat[b]![1]);

  const path = [0];
  const left = new Set<number>();
  for (let i = 1; i < n; i++) left.add(i);
  while (left.size) {
    const last = path[path.length - 1]!;
    let best = -1;
    let bestGap = Infinity;
    for (const i of left) {
      const g = gap(last, i);
      if (g < bestGap) {
        bestGap = g;
        best = i;
      }
    }
    path.push(best);
    left.delete(best);
  }

  // The path is open and its first point fixed: reversing path[i+1..j] swaps the edges at both
  // ends of the stretch, and at the end of the path there is only the one.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 2; j < n; j++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        const c = path[j]!;
        const d = j + 1 < n ? path[j + 1]! : null;
        const before = gap(a, b) + (d === null ? 0 : gap(c, d));
        const after = gap(a, c) + (d === null ? 0 : gap(b, d));
        if (after < before - 1e-9) {
          path.splice(i + 1, j - i, ...path.slice(i + 1, j + 1).reverse());
          changed = true;
        }
      }
    }
  }
  return path;
}

/**
 * Doors in the order to walk them: starting at the door nearest the start (the first door when
 * there is no start), then the rest by walkingOrder.
 */
export function inWalkingOrder<T extends { centre: LngLat }>(
  doors: T[],
  start: LngLat | null,
): T[] {
  if (doors.length === 0) return [];
  let first = 0;
  if (start) {
    let bestGap = Infinity;
    doors.forEach((d, i) => {
      const g = distanceM(start, d.centre);
      if (g < bestGap) {
        bestGap = g;
        first = i;
      }
    });
  }
  const rest = doors.filter((_, i) => i !== first);
  const ordered = [doors[first]!, ...rest];
  return walkingOrder(ordered.map((d) => d.centre)).map((i) => ordered[i]!);
}

/** "Kileleshwa Primary 3": the centre's name tidied, then the number of the list made from it. */
export function defaultName(
  centreName: string | null,
  wardName: string,
  madeFromCentre: number,
): string {
  const words = (centreName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (words.length > 1 && words[words.length - 1] === "School") words.pop();
  const base =
    words.length === 0 || (words.length === 1 && words[0] === "School")
      ? wardName
      : words.join(" ");
  const number = ` ${madeFromCentre + 1}`;
  return `${base.slice(0, NAME_MAX - number.length).trimEnd()}${number}`;
}

/** Who has a list, and since when ("With Njoki Mwangi since 20 Oct"). */
export function holderText(name: string | null, since: string | null): string {
  if (!name) return "Not given to anyone yet";
  const t = since ? Date.parse(since) : NaN;
  if (Number.isNaN(t)) return `With ${name}`;
  const day = new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Nairobi",
  });
  return `With ${name} since ${day}`;
}

/** A team member in the picker: who, as what, and the doors still open on their lists. */
export function teamOptionText(m: { name: string; role: string; doorsOpen: number }): string {
  const open =
    m.doorsOpen === 0
      ? "no doors open"
      : m.doorsOpen === 1
        ? "1 door open"
        : `${m.doorsOpen} doors open`;
  return `${m.name} · ${m.role} · ${open}`;
}

/** What a suggested patch left out, and why; nothing when it left nothing out. */
export function skipText(s: { spoke: number; notHome: number; otherList: number }): string {
  const parts: string[] = [];
  if (s.spoke > 0) parts.push(`${s.spoke} spoken to or refused in ${SPOKE_REFUSED_DAYS} days`);
  if (s.notHome > 0) parts.push(`${s.notHome} not home in the last ${NOT_HOME_DAYS} days`);
  if (s.otherList > 0)
    parts.push(`${s.otherList} on ${s.otherList === 1 ? "another list" : "other lists"}`);
  const last = parts.pop();
  if (last === undefined) return "";
  return `Left out: ${parts.length ? `${parts.join(", ")} and ` : ""}${last}`;
}

/** "15 of 44 done". */
export function progressText(done: number, total: number): string {
  return `${done} of ${total} done`;
}

/** What the screen says about houses a list didn't take because another list has them. */
export function leftOffText(n: number): string {
  if (n <= 0) return "";
  return n === 1
    ? "1 house is on another list and was left out"
    : `${n} houses are on other lists and were left out`;
}

/**
 * The door to go to after this one: the next unvisited, unskipped door in walking order, else the
 * first of those before it, else a door skipped earlier (never the one just skipped), else none.
 */
export function nextDoor(
  order: string[],
  visited: Set<string>,
  skipped: string[],
  current: string | null,
): string | null {
  const passed = new Set(skipped);
  const open = (pc: string) => !visited.has(pc) && !passed.has(pc);
  const at = current === null ? -1 : order.indexOf(current);
  const after = order.slice(at + 1).find(open);
  if (after !== undefined) return after;
  const before = order.slice(0, Math.max(at, 0)).find(open);
  if (before !== undefined) return before;
  return order.find((pc) => passed.has(pc) && !visited.has(pc) && pc !== current) ?? null;
}

/** The doors of one list that have a visit waiting on the phone to be sent. */
export function queuedDoors(
  queue: { walkListId?: string | null; doorPc?: string | null }[],
  listId: string,
): Set<string> {
  const doors = new Set<string>();
  for (const q of queue) if (q.walkListId === listId && q.doorPc) doors.add(q.doorPc);
  return doors;
}

/** The candidate, managers and organisers plan, give and close lists: what the database allows. */
export function canPlanWalkLists(role: MyRole): boolean {
  return role === "super" || role === "candidate" || role === "manager" || role === "organiser";
}
