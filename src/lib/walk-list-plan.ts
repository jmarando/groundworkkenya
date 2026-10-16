// Planning a walk list on the map: the state of the planner as the person taps, and the draft it
// makes of the houses read for the area, with Walk lists' rules. Pure; the hook only holds it.

import type { Building, LngLat } from "@/lib/geo";
import {
  housesWithin,
  inWalkingOrder,
  recentKind,
  suggestPatch,
  type HouseHistory,
  type PlanHouse,
} from "@/lib/walk-lists";
import type { Door } from "@/lib/walk-lists.functions";

export type PlanMode = "patch" | "draw";

export type PlanState = {
  mode: PlanMode;
  /** Where a patch starts: the centre, or a tap on the map. */
  start: LngLat | null;
  /** The corners tapped so far while drawing. */
  drawn: LngLat[];
  /** Done was pressed: the shape takes its houses. */
  closed: boolean;
  /** Houses the person took off the draft, and houses they added to it, by plus code. */
  off: string[];
  added: string[];
};

export type PlanAction =
  | { type: "mode"; mode: PlanMode }
  | { type: "start"; at: LngLat }
  | { type: "point"; at: LngLat }
  | { type: "done" }
  | { type: "again" }
  | { type: "off"; pc: string }
  | { type: "add"; pc: string }
  | { type: "reset" };

/** A shape has this many corners at most: past it the person is scribbling. */
const MAX_POINTS = 60;

export const emptyPlan = (): PlanState => ({
  mode: "patch",
  start: null,
  drawn: [],
  closed: false,
  off: [],
  added: [],
});

const without = (list: string[], pc: string) => list.filter((x) => x !== pc);
const with1 = (list: string[], pc: string) => (list.includes(pc) ? list : [...list, pc]);

export function reducePlan(s: PlanState, a: PlanAction): PlanState {
  switch (a.type) {
    case "mode":
      return a.mode === s.mode ? s : { ...emptyPlan(), mode: a.mode, start: s.start };
    case "start":
      return { ...s, start: a.at, off: [], added: [] };
    case "point":
      return s.mode !== "draw" || s.closed || s.drawn.length >= MAX_POINTS
        ? s
        : { ...s, drawn: [...s.drawn, a.at] };
    case "done":
      return s.mode === "draw" && s.drawn.length >= 3 ? { ...s, closed: true } : s;
    case "again":
      return { ...s, drawn: [], closed: false, off: [], added: [] };
    case "off":
      return s.added.includes(a.pc)
        ? { ...s, added: without(s.added, a.pc) }
        : { ...s, off: with1(s.off, a.pc) };
    case "add":
      return s.off.includes(a.pc)
        ? { ...s, off: without(s.off, a.pc) }
        : { ...s, added: with1(s.added, a.pc) };
    case "reset":
      return emptyPlan();
  }
}

/** A house of the draft with its place in the walking order, from 1. */
export type NumberedHouse = PlanHouse & { n: number };

export type Skipped = { spoke: number; notHome: number; otherList: number };

/** The houses a patch leaves out, by why: a house on another list is only that. */
export function skipSplit(
  houses: PlanHouse[],
  history: Map<string, HouseHistory>,
  now: number,
): Skipped {
  const out: Skipped = { spoke: 0, notHome: 0, otherList: 0 };
  for (const h of houses) {
    const seen = history.get(h.pc);
    if (seen?.onList) out.otherList++;
    else {
      const kind = recentKind(seen, now);
      if (kind === "spoke") out.spoke++;
      else if (kind === "not-home") out.notHome++;
    }
  }
  return out;
}

export type Draft = {
  doors: NumberedHouse[];
  skipped: Skipped;
  /** Houses left off because another open list has them. */
  leftOff: number;
  /** A drawn shape took more houses than a list may hold. */
  tooMany: boolean;
};

/**
 * The draft list: a patch from the start point, or the houses inside the finished shape, less
 * the houses taken off and plus the houses added (never one on another list), in the order to
 * walk them, starting at the centre (the start point for a patch) or else the first door.
 */
export function draftDoors(
  s: PlanState,
  houses: PlanHouse[],
  history: Map<string, HouseHistory>,
  now: number,
  centre: LngLat | null,
): Draft {
  const nothing = (extra: Partial<Draft> = {}): Draft => ({
    doors: [],
    skipped: { spoke: 0, notHome: 0, otherList: 0 },
    leftOff: 0,
    tooMany: false,
    ...extra,
  });
  let base: PlanHouse[];
  let skipped: Skipped;
  if (s.mode === "patch") {
    if (!s.start) return nothing();
    base = suggestPatch(houses, s.start, history, now).doors;
    skipped = skipSplit(houses, history, now);
  } else {
    if (!s.closed) return nothing();
    const taken = housesWithin(houses, s.drawn, history);
    skipped = { spoke: 0, notHome: 0, otherList: taken.otherList };
    if (taken.tooMany) return nothing({ skipped, leftOff: taken.otherList, tooMany: true });
    base = taken.doors;
  }
  const off = new Set(s.off);
  const doors = base.filter((h) => !off.has(h.pc));
  const have = new Set(doors.map((h) => h.pc));
  const byPc = new Map(houses.map((h) => [h.pc, h]));
  for (const pc of s.added) {
    const h = byPc.get(pc);
    if (h && !have.has(pc) && !history.get(pc)?.onList) {
      doors.push(h);
      have.add(pc);
    }
  }
  const from = s.mode === "patch" ? s.start : centre;
  return {
    doors: inWalkingOrder(doors, from).map((h, i) => ({ ...h, n: i + 1 })),
    skipped,
    leftOff: skipped.otherList,
    tooMany: false,
  };
}

/** The houses read from the map's house file, as houses to plan. */
export function toPlanHouses(buildings: Building[]): PlanHouse[] {
  return buildings.map((b) => ({ pc: b.id, centre: b.centre, rings: b.rings, wardId: null }));
}

/** A draft's houses as the doors the database is sent. */
export function toDoors(doors: PlanHouse[]): Door[] {
  return doors.map((h) => ({
    pc: h.pc,
    lat: h.centre[1],
    lng: h.centre[0],
    outline: h.rings,
    wardId: h.wardId,
  }));
}
