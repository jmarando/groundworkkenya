// The walk lists' server side, as the signed-in person: row level security decides whose lists they
// read, and the database's own functions decide who may make, give and close one. The reads fail
// soft: before schema 28 the functions aren't there, so the screens go on without lists. A failed
// read writes one line to the server log with the error's message (never the rows).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LngLat, Ring } from "@/lib/geo";
import { band, type Outcome } from "@/lib/houses";
import type { Client } from "@/lib/houses.functions";
import { pageAll } from "@/lib/page-all";
import { PLUS_CODE } from "@/lib/pluscode";
import { DRAW_CAP, type HouseHistory } from "@/lib/walk-lists";
import { refused, type Failure } from "@/lib/db-error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const NOT_A_HOUSE = "That isn't a house on the map.";
/** The most letters a list's name may have: what the database allows. */
const NAME_MAX = 80;
/** An outline has a few rings of a few dozen points; more than this is not a house. */
const MAX_RINGS = 10;
const MAX_POINTS = 300;

/** A house on a list: its plus code, its centre, its rings (about a metre) and its ward. */
export type Door = { pc: string; lat: number; lng: number; outline: Ring[]; wardId: string | null };

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** The rings of an outline, each point rounded to about a metre; throws for anything that isn't rings of points. */
function cleanRings(outline: unknown): Ring[] {
  if (outline === undefined || outline === null) return [];
  if (!Array.isArray(outline) || outline.length > MAX_RINGS) throw new Error(NOT_A_HOUSE);
  const rings: Ring[] = [];
  for (const ring of outline) {
    if (!Array.isArray(ring) || ring.length > MAX_POINTS) throw new Error(NOT_A_HOUSE);
    const points: Ring = [];
    for (const point of ring) {
      const [x, y] = Array.isArray(point) ? point : [];
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        Math.abs(x) > 180 ||
        Math.abs(y) > 90
      )
        throw new Error(NOT_A_HOUSE);
      points.push([round5(x), round5(y)]);
    }
    if (points.length) rings.push(points);
  }
  return rings;
}

/**
 * The doors of a list, in the order given and each house once: what a list must hold before it
 * goes to the database (one to 150 houses, each a plus code with a place).
 */
export function cleanDoors(input: unknown): Door[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Pick at least one house.");
  if (input.length > DRAW_CAP) throw new Error(`A list is at most ${DRAW_CAP} houses.`);
  const seen = new Set<string>();
  const doors: Door[] = [];
  for (const raw of input) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const pc = String(d["pc"] ?? "")
      .trim()
      .toUpperCase();
    const { lat, lng } = d;
    if (
      !PLUS_CODE.test(pc) ||
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      throw new Error(NOT_A_HOUSE);
    const outline = cleanRings(d["outline"]);
    if (seen.has(pc)) continue;
    seen.add(pc);
    doors.push({ pc, lat, lng, outline, wardId: isId(d["wardId"]) ? d["wardId"] : null });
  }
  return doors;
}

/** A list to make: named, in a ward, perhaps from a centre, perhaps already given to someone. */
export type NewList = {
  name: string;
  centreId: string | null;
  wardId: string;
  doors: Door[];
  giveTo: string | null;
};

/** A new list as the screen sends it; throws the sentence a person should read for what is missing. */
export function cleanNewList(input: unknown): NewList {
  const l = (input ?? {}) as Record<string, unknown>;
  const name = typeof l["name"] === "string" ? l["name"].trim() : "";
  if (!name) throw new Error("Name the list.");
  if (name.length > NAME_MAX) throw new Error(`A name is at most ${NAME_MAX} letters.`);
  if (!isId(l["wardId"])) throw new Error("Pick a ward.");
  const centre = l["centreId"] ?? null;
  if (centre !== null && !isId(centre)) throw new Error("Pick a centre.");
  const giveTo = l["giveTo"] ?? null;
  if (giveTo !== null && !isId(giveTo)) throw new Error("Pick someone on the team.");
  return { name, centreId: centre, wardId: l["wardId"], doors: cleanDoors(l["doors"]), giveTo };
}

/** Makes a list; the answer says how many houses were left off because another list has them. */
export async function createList(
  sb: Client,
  list: NewList,
): Promise<{ id: string; leftOff: number }> {
  const { data, error } = (await sb.rpc("create_walk_list", {
    _name: list.name,
    _centre_id: list.centreId,
    _ward_id: list.wardId,
    _doors: list.doors.map((d) => ({
      pc: d.pc,
      lat: d.lat,
      lng: d.lng,
      outline: d.outline,
      ward_id: d.wardId,
    })),
    _give_to: list.giveTo,
  })) as { data: unknown; error: Failure | null };
  if (error) throw refused(error, "Could not make the list.");
  const r = (data ?? {}) as Record<string, unknown>;
  if (typeof r["id"] !== "string") throw new Error("Could not make the list.");
  return { id: r["id"], leftOff: typeof r["left_off"] === "number" ? r["left_off"] : 0 };
}

/** Gives a list to someone on the team; an out list keeps its progress. */
export async function giveList(sb: Client, id: string, to: string): Promise<void> {
  const { error } = (await sb.rpc("give_walk_list", { _id: id, _to: to })) as {
    error: Failure | null;
  };
  if (error) throw refused(error, "Could not give the list.");
}

/** Closes a list by hand: its houses are free again. */
export async function closeList(sb: Client, id: string): Promise<void> {
  const { error } = (await sb.rpc("close_walk_list", { _id: id })) as { error: Failure | null };
  if (error) throw refused(error, "Could not close the list.");
}

export type ListSummary = {
  id: string;
  name: string;
  status: "draft" | "out" | "done";
  centreId: string | null;
  centreName: string | null;
  wardId: string;
  givenTo: string | null;
  givenToName: string | null;
  doors: number;
  done: number;
  notHome: number;
  firstSentAt: string | null;
  givenAt: string | null;
  /** The day it's planned for (yyyy-mm-dd) and the shift, when the field plan set them. */
  dueOn: string | null;
  shift: "morning" | "afternoon" | "day" | null;
};

export type ListDoor = {
  /** 1, 2, 3 ... in walking order. */
  n: number;
  pc: string;
  /** The house's centre, [lng, lat]. */
  at: LngLat;
  rings: Ring[];
  wardId: string | null;
  /** The latest visit at the house, whenever it was; the screen compares it with when the list went out. */
  outcome: Outcome | null;
  visitedAt: string | null;
};

/** Someone on file at a door, with the numbers the agent needs there; support is the 1 to 5 scale, 0 for none. */
export type DoorPerson = { pc: string; id: string; name: string; phone: string; support: number };

export type TeamMember = { userId: string; name: string; role: string; doorsOpen: number };

type Row = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const STATUSES = ["draft", "out", "done"] as const;
const OUTCOMES: Outcome[] = ["spoke", "not_home", "refused"];

/** The rows the database sent, as objects; anything else in the answer is dropped. */
const rowsOf = (data: unknown): Row[] =>
  (Array.isArray(data) ? data : []).filter(
    (r): r is Row => typeof r === "object" && r !== null && !Array.isArray(r),
  );

function summary(r: Row, status: ListSummary["status"] | null, wardId: string): ListSummary | null {
  const id = text(r["id"]);
  const name = text(r["name"]);
  if (!id || name === null || !status) return null;
  return {
    id,
    name,
    status,
    centreId: text(r["centre_id"]),
    centreName: text(r["centre_name"]),
    wardId: text(r["ward_id"]) ?? wardId,
    givenTo: text(r["given_to"]),
    givenToName: text(r["given_to_name"]),
    doors: count(r["doors"]),
    done: count(r["done"]),
    notHome: count(r["not_home"]),
    firstSentAt: text(r["first_sent_at"]),
    givenAt: text(r["given_at"]),
    dueOn: text(r["due_on"]),
    shift:
      r["shift"] === "morning" || r["shift"] === "afternoon" || r["shift"] === "day"
        ? r["shift"]
        : null,
  };
}

const compact = <T>(list: (T | null)[]): T[] => list.filter((x): x is T => x !== null);

/** The lists still open (a draft, or out with someone) in a ward, newest first; null when they can't be read. */
export async function readOpenLists(sb: Client, wardId: string): Promise<ListSummary[] | null> {
  const { data, error } = (await sb.rpc("open_walk_lists", { _ward_id: wardId })) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error) {
    console.error(`Could not read the walk lists: ${error.message}`);
    return null;
  }
  return compact(
    rowsOf(data).map((r) => summary(r, STATUSES.find((s) => s === r["status"]) ?? null, wardId)),
  );
}

/** The lists out with the caller, newest first; null when they can't be read. */
export async function readMyLists(sb: Client): Promise<ListSummary[] | null> {
  const { data, error } = (await sb.rpc("my_walk_lists")) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error) {
    console.error(`Could not read the walk lists: ${error.message}`);
    return null;
  }
  return compact(rowsOf(data).map((r) => summary(r, "out", "")));
}

/** What planning in a ward needs of its houses: recent visits and the open list a house is on. */
export async function readPlanning(sb: Client, wardId: string): Promise<HouseHistory[] | null> {
  let failed = false;
  const rows = await pageAll<unknown>(async (from, to) => {
    const { data, error } = (await sb
      .rpc("walk_list_planning", { _ward_id: wardId })
      .range(from, to)) as {
      data: unknown[] | null;
      error: { message: string } | null;
    };
    if (error) {
      failed = true;
      console.error(`Could not read the planning history: ${error.message}`);
    }
    return { data: error ? [] : data };
  });
  if (failed) return null;
  return compact(
    rowsOf(rows).map((r) => {
      const pc = text(r["pc"]);
      return pc
        ? {
            pc,
            spokeOrRefusedAt: text(r["spoke_or_refused_at"]),
            notHomeAt: text(r["not_home_at"]),
            onList: text(r["on_list"]),
          }
        : null;
    }),
  );
}

/** The team a list can be given to, agents first, each with the doors still open on their lists. */
export async function readTeam(sb: Client): Promise<TeamMember[] | null> {
  const { data, error } = (await sb.rpc("walk_list_team")) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error) {
    console.error(`Could not read the team: ${error.message}`);
    return null;
  }
  return compact(
    rowsOf(data).map((r) => {
      const userId = text(r["user_id"]);
      return userId
        ? {
            userId,
            name: text(r["full_name"])?.trim() || "Team member",
            role: text(r["role"]) ?? "agent",
            doorsOpen: count(r["doors_open"]),
          }
        : null;
    }),
  );
}

function toDoor(r: Row): ListDoor | null {
  const pc = text(r["pc"]);
  const lat = r["lat"];
  const lng = r["lng"];
  if (!pc || typeof lat !== "number" || typeof lng !== "number") return null;
  const rings: Ring[] = Array.isArray(r["outline"])
    ? (r["outline"] as unknown[]).flatMap((ring) => {
        const points = (Array.isArray(ring) ? ring : []).flatMap((p): LngLat[] =>
          Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number"
            ? [[p[0], p[1]]]
            : [],
        );
        return points.length ? [points] : [];
      })
    : [];
  return {
    n: count(r["position"]),
    pc,
    at: [lng, lat],
    rings,
    wardId: text(r["ward_id"]),
    outcome: OUTCOMES.find((o) => o === r["last_outcome"]) ?? null,
    visitedAt: text(r["last_at"]),
  };
}

/**
 * A list's doors in walking order with the latest visit at each, and the people on file there
 * (the agent's door sheet: names and numbers, kept on the phone for the list's sake); null when
 * the doors can't be read. A refused lookup of the people leaves the doors without them, and
 * `withPeople` false never asks for them (the outline of a list needs only its doors).
 */
export async function readListDoors(
  sb: Client,
  id: string,
  withPeople = true,
): Promise<{ doors: ListDoor[]; people: DoorPerson[] } | null> {
  const { data, error } = (await sb.rpc("walk_list_doors", { _list_id: id })) as {
    data: unknown;
    error: { message: string } | null;
  };
  if (error) {
    console.error(`Could not read a walk list's doors: ${error.message}`);
    return null;
  }
  const doors = compact(rowsOf(data).map(toDoor)).sort((a, b) => a.n - b.n);
  if (doors.length === 0 || !withPeople) return { doors, people: [] };
  const found = (await sb
    .from("people")
    .select("id, full_name, phone, support_score, building_id")
    .in(
      "building_id",
      doors.map((d) => d.pc),
    )) as { data: unknown; error: { message: string } | null };
  if (found.error) {
    console.error(`Could not read the people at a walk list's doors: ${found.error.message}`);
    return { doors, people: [] };
  }
  const place = new Map(doors.map((d) => [d.pc, d.n]));
  const people = compact(
    rowsOf(found.data).map((r): DoorPerson | null => {
      const pc = text(r["building_id"]);
      const personId = text(r["id"]);
      const phone = text(r["phone"]);
      if (!pc || !place.has(pc) || !personId || !phone) return null;
      return {
        pc,
        id: personId,
        name: text(r["full_name"])?.trim() || "No name on file",
        phone,
        support: band(count(r["support_score"])),
      };
    }),
  ).sort((a, b) => place.get(a.pc)! - place.get(b.pc)! || a.name.localeCompare(b.name));
  return { doors, people };
}

/** A list to act on; throws "Pick a list." for anything else. */
function cleanListId(input: unknown): string {
  const id = (input as { id?: unknown } | null)?.id;
  if (!isId(id)) throw new Error("Pick a list.");
  return id;
}

function cleanWardId(input: unknown): string {
  const wardId = (input as { wardId?: unknown } | null)?.wardId;
  if (!isId(wardId)) throw new Error("Pick a ward.");
  return wardId;
}

export const getOpenLists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => ({ wardId: cleanWardId(input) }))
  .handler(async ({ data, context }) => readOpenLists(context.supabase as never, data.wardId));

export const getPlanning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => ({ wardId: cleanWardId(input) }))
  .handler(async ({ data, context }) => readPlanning(context.supabase as never, data.wardId));

export const getListTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readTeam(context.supabase as never));

export const getMyWalkLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readMyLists(context.supabase as never));

export const getWalkListDoors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; people?: boolean }) => ({
    id: cleanListId(input),
    people: input?.people !== false,
  }))
  .handler(async ({ data, context }) =>
    readListDoors(context.supabase as never, data.id, data.people),
  );

export const makeWalkList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: NewList) => cleanNewList(input))
  .handler(async ({ data, context }) => createList(context.supabase as never, data));

export const giveWalkListTo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; to: string }) => {
    const to = (input as { to?: unknown } | null)?.to;
    if (!isId(to)) throw new Error("Pick someone on the team.");
    return { id: cleanListId(input), to };
  })
  .handler(async ({ data, context }) => {
    await giveList(context.supabase as never, data.id, data.to);
    return { ok: true as const };
  });

export const closeWalkListNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: cleanListId(input) }))
  .handler(async ({ data, context }) => {
    await closeList(context.supabase as never, data.id);
    return { ok: true as const };
  });
