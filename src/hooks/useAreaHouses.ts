// The houses in one polling centre's area, counted from the zoom-16 tiles of the house file that
// the area covers. Each tile is read once and kept for the session, as the field app keeps the
// tiles around a phone; a tile that couldn't be read is tried again every 15 seconds.

import { useQueries } from "@tanstack/react-query";

import { combineTiles, retryFailedTile } from "@/hooks/useHousesAround";
import { housesIn, tilesToCount } from "@/lib/centres";
import { housesInTile } from "@/lib/house-source";
import type { MapArea } from "@/lib/map-areas";
import type { CentreArea } from "@/lib/stations/areas";

/**
 * The houses whose centres are in the area: undefined while its tiles are being read, null when
 * it isn't counted (no outline, or too many tiles), else the count.
 */
export function useAreaHouses(
  mapArea: MapArea | null,
  area: CentreArea | null | undefined,
): number | null | undefined {
  const tiles = area && mapArea ? tilesToCount(area) : null;
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
  if (!area || !tiles) return null;
  return unread ? undefined : housesIn(buildings, area);
}
