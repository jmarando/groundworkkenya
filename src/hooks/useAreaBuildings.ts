// The houses inside an area, read from the zoom-16 tiles of the house file that the area covers:
// the planner's houses. Each tile is read once and kept for the session (the same tiles the
// centres' counts and the phone's houses use); a tile that couldn't be read is tried again every
// 15 seconds.

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { combineTiles, retryFailedTile } from "@/hooks/useHousesAround";
import { tilesToCount } from "@/lib/centres";
import { inPolygon, type Building, type Ring } from "@/lib/geo";
import { housesInTile } from "@/lib/house-source";
import type { MapArea } from "@/lib/map-areas";

/**
 * The houses whose centres are in the area's polygons: undefined while its tiles are being read,
 * null when they aren't read (no outline, no map, or too many tiles), else the houses.
 */
export function useAreaBuildings(
  mapArea: MapArea | null,
  polygons: Ring[][] | null,
): Building[] | null | undefined {
  const area = useMemo(
    () => (polygons && polygons.length ? { id: "plan", polygons } : null),
    [polygons],
  );
  const tiles = useMemo(() => (area && mapArea ? tilesToCount(area) : null), [area, mapArea]);
  const { buildings, unread } = useQueries({
    queries: (tiles ?? []).map((t) => ({
      queryKey: ["house-tile", mapArea?.id, t.x, t.y],
      queryFn: () => housesInTile(mapArea!, t.x, t.y),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
      refetchInterval: retryFailedTile,
    })),
    combine: combineTiles,
  });
  return useMemo(() => {
    if (!area || !tiles) return null;
    if (unread) return undefined;
    return buildings.filter((b) => area.polygons.some((rings) => inPolygon(b.centre, rings)));
  }, [area, tiles, unread, buildings]);
}
