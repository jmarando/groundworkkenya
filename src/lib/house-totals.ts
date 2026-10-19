// Each map area's houses per ward, from its house file's counts
// (public/tiles/houses-<id>.json, written by scripts/geo/house-tiles.ts).
// Imported, so server code reads them without a request; they are small.

import mathira from "../../public/tiles/houses-mathira.json";
import nairobi from "../../public/tiles/houses-nairobi.json";
import roysambu from "../../public/tiles/houses-roysambu.json";
import type { HouseCounts } from "@/lib/map-areas";

/** By the atlas key a campaign holds in campaigns.map_area; one per entry in MAP_AREAS. */
export const HOUSE_TOTALS: Record<string, HouseCounts> = {
  nairobi: nairobi as HouseCounts,
  "nyeri/mathira": mathira as HouseCounts,
  "nairobi/roysambu/roysambu": roysambu as HouseCounts,
};

/** Houses per ward slug in a map area; null for none, or an area with no house file. */
export const houseTotals = (mapArea: string | null | undefined): Record<string, number> | null =>
  (mapArea && HOUSE_TOTALS[mapArea]?.wards) || null;
