// The houses within reach of the phone: the zoom-16 tiles of the area's house
// file around the GPS fix. Each tile is read while there is signal and kept
// for the session, so a street walked into a dead zone still finds its houses.

import { useQueries, type UseQueryResult } from "@tanstack/react-query";

import { inBox, type Building, type LngLat } from "@/lib/geo";
import { housesInTile } from "@/lib/house-source";
import { mergeHouses, tilesAround } from "@/lib/house-tiles";
import type { MapArea } from "@/lib/map-areas";

/** The 80 m picker, plus room for a vague fix. */
const AROUND_M = 120;

export type HouseStatus = "none" | "loading" | "ready";

/**
 * Whether the houses around the phone are known: none without a map area or
 * outside it, loading until there is a fix and a first tile, else ready.
 */
export function houseStatus(
  area: MapArea | null,
  fix: LngLat | null,
  pending: boolean,
  count: number,
): HouseStatus {
  if (!area) return "none";
  if (!fix) return "loading";
  const [west, south, east, north] = area.bounds;
  if (!inBox(fix, { west, south, east, north })) return "none";
  if (pending && count === 0) return "loading";
  return "ready";
}

// Outside the hook, so React Query keeps the merged list while no tile changes.
const combine = (results: UseQueryResult<Building[]>[]) => ({
  buildings: mergeHouses(results.map((r) => r.data ?? [])),
  pending: results.some((r) => r.isPending),
});

export function useHousesAround(
  area: MapArea | null,
  fix: LngLat | null,
): { buildings: Building[]; status: HouseStatus } {
  const inside = houseStatus(area, fix, false, 0) === "ready";
  const tiles = inside && fix ? tilesAround(fix, AROUND_M) : [];
  const { buildings, pending } = useQueries({
    queries: tiles.map((t) => ({
      queryKey: ["house-tile", area?.id, t.x, t.y],
      queryFn: () => housesInTile(area!, t.x, t.y),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
    })),
    combine,
  });
  return { buildings, status: houseStatus(area, fix, pending, buildings.length) };
}
