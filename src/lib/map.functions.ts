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

/**
 * The campaign's map area; null on any failure, which is logged, so the screen says there's no
 * map yet. A campaign with no map area, or a person with no campaign, is not a failure.
 */
export async function readMapArea(sb: Client): Promise<string | null> {
  try {
    const { data: id, error } = (await sb.rpc("my_campaign")) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (error) {
      console.error(`Could not read the campaign's map area: ${error.message}`);
      return null;
    }
    if (typeof id !== "string") return null;
    const { data, error: failed } = (await sb
      .from("campaigns")
      .select("map_area")
      .eq("id", id)
      .maybeSingle()) as {
      data: { map_area?: unknown } | null;
      error: { message: string } | null;
    };
    if (failed) {
      console.error(`Could not read the campaign's map area: ${failed.message}`);
      return null;
    }
    const area = data?.map_area;
    return typeof area === "string" && area ? area : null;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error(`Could not read the campaign's map area: ${why}`);
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
