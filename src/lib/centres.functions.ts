// The Voters map's polling centres, read and placed as the signed-in person: row level security
// decides whose campaign's centres they see, and the database's own functions decide who may
// place one. The read fails soft: before schema 27 the position columns aren't there, so the
// screen goes on without centres. A failed read writes one line to the server log with the
// error's message (never the rows).

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toCentres, type Centre, type HereResult } from "@/lib/centres";
import type { Client } from "@/lib/houses.functions";
import { pageAll } from "@/lib/page-all";
import { refused, type Failure } from "@/lib/db-error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS =
  "id, code, iebc_code, name, ward_id, registered_voters, streams, lat, lng, placed_by, " +
  "placed_accuracy_m, placed_at, placed_actor, suggested_lat, suggested_lng, " +
  "suggested_accuracy_m, suggested_at, suggested_by";

/**
 * The campaign's polling centres in code order, with the name of whoever placed each or
 * suggested a position when it can be read; null when they can't be read at all.
 */
export async function readCentres(sb: Client): Promise<Centre[] | null> {
  let failed = false;
  const rows = await pageAll<Record<string, unknown>>(async (from, to) => {
    const { data, error } = (await sb
      .from("polling_stations")
      .select(COLUMNS)
      .order("code")
      .range(from, to)) as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    };
    if (error) {
      failed = true;
      console.error(`Could not read the polling centres: ${error.message}`);
    }
    return { data: error ? [] : data };
  });
  if (failed) return null;
  const people = [
    ...new Set(
      rows
        .flatMap((r) => [r["placed_actor"], r["suggested_by"]])
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const names = new Map<string, string>();
  if (people.length) {
    // The names are a nicety: a refused lookup leaves the centres without them.
    const { data } = (await sb
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", people)) as {
      data: { user_id: string; full_name: string | null }[] | null;
    };
    for (const p of data ?? []) if (p.full_name?.trim()) names.set(p.user_id, p.full_name.trim());
  }
  return toCentres(rows, names);
}

const PICK = "Pick a centre.";
const NOT_A_PLACE = "That isn't a place on the map.";

/** A polling centre's id; throws "Pick a centre." for anything else. */
export function cleanId(input: unknown): string {
  const id = (input as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !UUID.test(id)) throw new Error(PICK);
  return id;
}

export type Pin = { id: string; lat: number; lng: number };

/** A centre and a place on Earth to put it. */
export function cleanPin(input: unknown): Pin {
  const id = cleanId(input);
  const { lat, lng } = input as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error(NOT_A_PLACE);
  return { id, lat, lng };
}

export type Here = Pin & { accuracyM: number | null };

/** A phone's position at a centre; an accuracy it didn't give is none, and the database decides. */
export function cleanHere(input: unknown): Here {
  const pin = cleanPin(input);
  const a = (input as { accuracyM?: unknown }).accuracyM;
  return { ...pin, accuracyM: typeof a === "number" && Number.isFinite(a) && a >= 0 ? a : null };
}

/** An organiser's pin; the database says who may. */
export async function placeStation(sb: Client, pin: Pin): Promise<void> {
  const { error } = (await sb.rpc("place_station", {
    _station_id: pin.id,
    _lat: pin.lat,
    _lng: pin.lng,
  })) as { error: Failure | null };
  if (error) throw refused(error, "Could not place the centre.");
}

/** An agent's suggested position, taken as the centre's. */
export async function adoptSuggestion(sb: Client, id: string): Promise<void> {
  const { error } = (await sb.rpc("use_station_suggestion", { _station_id: id })) as {
    error: Failure | null;
  };
  if (error) throw refused(error, "Could not use that position.");
}

export type { HereResult };

const WHY: NonNullable<HereResult["why"]>[] = ["accuracy", "distance", "no-ward"];

/** An agent at a centre: the position becomes the centre's, or waits as a suggestion, and why. */
export async function stationHere(sb: Client, here: Here): Promise<HereResult> {
  const { data, error } = (await sb.rpc("station_here", {
    _station_id: here.id,
    _lat: here.lat,
    _lng: here.lng,
    _accuracy: here.accuracyM,
  })) as { data: unknown; error: Failure | null };
  if (error) throw refused(error, "Could not confirm the centre.");
  const r = (data ?? {}) as Record<string, unknown>;
  if (r["moved"] === true) return { moved: true, why: null };
  return { moved: false, why: WHY.find((w) => w === r["why"]) ?? null };
}

export const getCentres = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => readCentres(context.supabase as never));

export const placeCentre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Pin) => cleanPin(input))
  .handler(async ({ data, context }) => {
    await placeStation(context.supabase as never, data);
    return { ok: true as const };
  });

export const takeCentreSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: cleanId(input) }))
  .handler(async ({ data, context }) => {
    await adoptSuggestion(context.supabase as never, data.id);
    return { ok: true as const };
  });

export const confirmCentreHere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Here) => cleanHere(input))
  .handler(async ({ data, context }) => stationHere(context.supabase as never, data));
