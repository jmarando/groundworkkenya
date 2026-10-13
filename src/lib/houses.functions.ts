// The Voters map's doors, read as the signed-in person: row level security
// decides whose doors they count (the office every door in the campaign, an
// agent the doors they knocked). Every read fails soft: before the voters-map
// migration is applied there is no house_visits table, and the screen says the
// door counts aren't in yet instead of breaking.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isOutcome,
  toHouseStates,
  toWardDoors,
  type HouseState,
  type HouseVisit,
  type WardDoors,
} from "@/lib/houses";
import { pageAll } from "@/lib/page-all";
import { PLUS_CODE } from "@/lib/pluscode";

export type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Supabase builder, loosely: house_visits is newer than the generated types
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Doors per ward in the campaign; null when they can't be read (the migration isn't in yet). */
export async function readAreaDoors(sb: Client): Promise<WardDoors[] | null> {
  const { data, error } = (await sb.rpc("house_doors")) as { data: unknown; error: unknown };
  if (error) return null;
  return toWardDoors(data);
}

/** Each house in a ward with a visit in 30 days, its latest; nothing when they can't be read. */
export async function readWardHouses(sb: Client, wardId: string): Promise<HouseState[]> {
  let failed = false;
  const rows = await pageAll<unknown>(async (from, to) => {
    const { data, error } = (await sb.rpc("ward_houses", { _ward_id: wardId }).range(from, to)) as {
      data: unknown[] | null;
      error: unknown;
    };
    if (error) failed = true;
    return { data: error ? [] : data };
  });
  return failed ? [] : toHouseStates(rows);
}

type VisitRow = {
  visited_at: string;
  actor: string | null;
  outcome: unknown;
  support: number | null;
  issue: string | null;
  person_id: string | null;
};

/** A house's visits, newest first (up to 50), with who knocked and who answered; null on a failed read. */
export async function readHouse(sb: Client, pc: string): Promise<HouseVisit[] | null> {
  const { data, error } = (await sb
    .from("house_visits")
    .select("visited_at, actor, outcome, support, issue, person_id")
    .eq("pc", pc)
    .order("visited_at", { ascending: false })
    .limit(50)) as { data: VisitRow[] | null; error: unknown };
  if (error) return null;
  const rows = (data ?? []).filter((r) => isOutcome(r.outcome));
  const actors = [...new Set(rows.map((r) => r.actor).filter((a): a is string => Boolean(a)))];
  const people = [...new Set(rows.map((r) => r.person_id).filter((p): p is string => Boolean(p)))];
  const [profiles, persons] = (await Promise.all([
    actors.length
      ? sb.from("profiles").select("user_id, full_name").in("user_id", actors)
      : { data: [] },
    people.length ? sb.from("people").select("id, full_name").in("id", people) : { data: [] },
  ])) as [
    { data: { user_id: string; full_name: string | null }[] | null },
    { data: { id: string; full_name: string | null }[] | null },
  ];
  const agentName = new Map(
    (profiles.data ?? []).map((p) => [p.user_id, p.full_name?.trim() || null]),
  );
  const personName = new Map((persons.data ?? []).map((p) => [p.id, p.full_name?.trim() || null]));
  return rows.map((r) => ({
    at: r.visited_at,
    agent: (r.actor && agentName.get(r.actor)) || null,
    outcome: r.outcome as HouseVisit["outcome"],
    support: typeof r.support === "number" ? r.support : null,
    issue: r.issue ?? null,
    person: r.person_id
      ? { id: r.person_id, name: personName.get(r.person_id) ?? "No name on file" }
      : null,
  }));
}

export const getAreaDoors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readAreaDoors(context.supabase as never));

export const getWardHouses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => {
    if (!input?.wardId || !UUID.test(input.wardId)) throw new Error("Pick a ward.");
    return { wardId: input.wardId };
  })
  .handler(async ({ data, context }) => readWardHouses(context.supabase as never, data.wardId));

export const getHouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pc: string }) => {
    const pc = String(input?.pc ?? "")
      .trim()
      .toUpperCase();
    if (!PLUS_CODE.test(pc)) throw new Error("That isn't a house on the map.");
    return { pc };
  })
  .handler(async ({ data, context }) => readHouse(context.supabase as never, data.pc));
