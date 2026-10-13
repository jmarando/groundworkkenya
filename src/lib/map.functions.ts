// The Voters map's settings: the key to draw the basemap with, and the
// campaign's map area. Needs a signed-in team member.

import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Client } from "@/lib/houses.functions";

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
