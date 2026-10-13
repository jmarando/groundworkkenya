// The houses within reach of the phone: the zoom-16 tiles of the area's house
// file around the GPS fix. Each tile is read while there is signal and kept
// for the session, so a street walked into a dead zone still finds its houses.
// A tile that couldn't be read counts as not read yet, never as a tile with no
// houses, and is tried again while the door form is open.

import { useQueries, type QueryStatus, type UseQueryResult } from "@tanstack/react-query";

import { inBox, type Building, type LngLat } from "@/lib/geo";
import { housesInTile } from "@/lib/house-source";
import { mergeHouses, tilesAround } from "@/lib/house-tiles";
import type { MapArea } from "@/lib/map-areas";

/** The 80 m picker, plus room for a vague fix. */
const AROUND_M = 120;

/** How long a tile that couldn't be read waits before it is read again. */
const RETRY_FAILED_TILE_MS = 15_000;

export type HouseStatus = "none" | "loading" | "ready";

/**
 * Whether the houses around the phone are known. `area` is the campaign's map
 * area: null when it has none (so none), undefined while its map config hasn't
 * arrived (not known yet, so loading, never none). With an area: none outside
 * it; loading until there is a fix, and while no house has been read and some
 * tile is unread (loading, paused offline or failed); else ready.
 */
export function houseStatus(
  area: MapArea | null | undefined,
  fix: LngLat | null,
  unread: boolean,
  count: number,
): HouseStatus {
  if (area === undefined) return "loading";
  if (!area) return "none";
  if (!fix) return "loading";
  const [west, south, east, north] = area.bounds;
  if (!inBox(fix, { west, south, east, north })) return "none";
  if (unread && count === 0) return "loading";
  return "ready";
}

/**
 * The houses read so far, merged, and whether any tile is unread: it has no
 * houses yet because it is loading, paused offline or failed. A tile that
 * failed is not an empty one. Outside the hook, so React Query keeps the
 * merged list while no tile changes.
 */
export const combineTiles = (results: UseQueryResult<Building[]>[]) => ({
  buildings: mergeHouses(results.map((r) => r.data ?? [])),
  unread: results.some((r) => r.data === undefined),
});

/**
 * React Query's refetchInterval for a tile: one that failed is read again every
 * 15 seconds until it is read; one being read, or already read, is left alone.
 */
export function retryFailedTile(query: { state: { status: QueryStatus } }): number | false {
  return query.state.status === "error" ? RETRY_FAILED_TILE_MS : false;
}

export type HousesAround = {
  /** The houses read so far, from every tile that could be read. */
  buildings: Building[];
  status: HouseStatus;
  /** Every tile around the phone is read; false while any is loading or has failed. */
  complete: boolean;
};

/**
 * The houses around the phone's fix. `area` is the campaign's map area: null
 * when it has none, undefined while its map config hasn't arrived (see
 * houseStatus); in neither case is any tile read.
 */
export function useHousesAround(
  area: MapArea | null | undefined,
  fix: LngLat | null,
): HousesAround {
  const inside = houseStatus(area, fix, false, 0) === "ready";
  const tiles = inside && fix ? tilesAround(fix, AROUND_M) : [];
  const { buildings, unread } = useQueries({
    queries: tiles.map((t) => ({
      queryKey: ["house-tile", area?.id, t.x, t.y],
      queryFn: () => housesInTile(area!, t.x, t.y),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
      refetchInterval: retryFailedTile,
    })),
    combine: combineTiles,
  });
  return {
    buildings,
    status: houseStatus(area, fix, unread, buildings.length),
    complete: !unread,
  };
}
