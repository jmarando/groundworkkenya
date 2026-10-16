// The base map's style: MapTiler's satellite or streets when the campaign has a key, else
// OpenFreeMap's streets, which need none. Shared by the Voters map and the field app's list map.

import type { Basemap } from "@/lib/voters-map";

export const OPENFREEMAP = "https://tiles.openfreemap.org/styles/liberty";

export function styleUrl(basemap: Basemap, key: string | null): string {
  if (!key) return OPENFREEMAP;
  const k = encodeURIComponent(key);
  return basemap === "satellite"
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${k}`
    : `https://api.maptiler.com/maps/streets-v2/style.json?key=${k}`;
}

/**
 * A plain background with nothing to fetch, for a phone with no signal: the field app's list map
 * draws its doors on it from the list's own saved outlines.
 */
export const PLAIN_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "plain",
      type: "background" as const,
      paint: { "background-color": "hsl(45, 22%, 93%)" },
    },
  ],
};
