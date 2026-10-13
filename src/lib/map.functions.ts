// The ward map's two server calls: which basemap to draw with, and who is
// pinned where in a ward. Both need a signed-in team member.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Client } from "@/lib/houses.functions";
import type { Outcome, WardMapRow } from "@/lib/wardmap";

export type MapConfig = {
  /**
   * MapTiler key for satellite and street tiles, set as MAPTILER_KEY in the
   * project's secrets (never in the repository). It is used by the browser
   * to fetch tiles, so restrict it to the site's domain in MapTiler. Without
   * it the map falls back to OpenFreeMap streets, with no satellite.
   */
  maptilerKey: string | null;
  /**
   * The atlas key of the area the campaign's Voters map covers
   * (campaigns.map_area; src/lib/map-areas.ts); null when it has none, or
   * before the voters-map migration is applied.
   */
  mapArea: string | null;
};

/** The campaign's map area; null on any failure, so the screen says there's no map yet. */
export async function readMapArea(sb: Client): Promise<string | null> {
  try {
    const { data: id, error } = (await sb.rpc("my_campaign")) as { data: unknown; error: unknown };
    if (error || typeof id !== "string") return null;
    const { data, error: failed } = (await sb
      .from("campaigns")
      .select("map_area")
      .eq("id", id)
      .maybeSingle()) as { data: { map_area?: unknown } | null; error: unknown };
    if (failed) return null;
    const area = data?.map_area;
    return typeof area === "string" && area ? area : null;
  } catch {
    return null;
  }
}

export const getMapConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MapConfig> => {
    const key = process.env["MAPTILER_KEY"]?.trim();
    return {
      maptilerKey: key ? key : null,
      mapArea: await readMapArea(context.supabase as never),
    };
  });

const OUTCOMES = new Set<Outcome>(["spoke", "not_home", "refused"]);

export const getWardMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { wardId: string }) => {
    if (!input?.wardId) throw new Error("Pick a ward.");
    return input;
  })
  .handler(async ({ data, context }): Promise<WardMapRow[]> => {
    const { data: rows, error } = await context.supabase.rpc("ward_map", { _ward_id: data.wardId });
    if (error) throw new Error("Could not load the ward map.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.full_name ?? "No name on file",
      phoneMasked: r.phone_masked,
      buildingId: r.building_id,
      lat: r.lat,
      lng: r.lng,
      support: r.support_score ?? 0,
      segment: r.segment,
      smsOk: Boolean(r.consent_sms) && !r.opted_out,
      optedOut: Boolean(r.opted_out),
      lastContactedAt: r.last_contacted_at,
      lastOutcome: OUTCOMES.has(r.last_outcome as Outcome) ? (r.last_outcome as Outcome) : null,
      lastVisitAt: r.last_visit_at,
      lastIssue: r.last_issue,
    }));
  });
