// The areas the Voters map covers, by the atlas key a campaign holds in
// campaigns.map_area: the ward shapes, the house file and the count of houses
// in each ward that go with each. A new area needs its ward shapes in
// public/geo, a line here, and a run of scripts/geo/house-tiles.ts.

export type Top = "county" | "constituency";

export type MapArea = {
  /** The atlas key, as campaigns.map_area holds it. */
  key: string;
  /** In file names: public/tiles/houses-<id>.pmtiles. */
  id: string;
  name: string;
  /** A county opens on its wards by constituency; a constituency on its wards. */
  top: Top;
  wards: string;
  houses: string;
  counts: string;
  /** West, south, east, north: the wards' extent, rounded out. */
  bounds: [number, number, number, number];
};

export const MAP_AREAS: MapArea[] = [
  {
    key: "nairobi",
    id: "nairobi",
    name: "Nairobi County",
    top: "county",
    wards: "/geo/nairobi-wards.json",
    houses: "/tiles/houses-nairobi.pmtiles",
    counts: "/tiles/houses-nairobi.json",
    bounds: [36.66, -1.45, 37.11, -1.16],
  },
  {
    key: "nyeri/mathira",
    id: "mathira",
    name: "Mathira",
    top: "constituency",
    wards: "/geo/mathira-wards.json",
    houses: "/tiles/houses-mathira.pmtiles",
    counts: "/tiles/houses-mathira.json",
    bounds: [37.03, -0.57, 37.31, -0.1],
  },
];

export function mapAreaFor(key: string | null | undefined): MapArea | null {
  return MAP_AREAS.find((a) => a.key === key) ?? null;
}

/** public/tiles/houses-<id>.json: the houses in each ward, which door coverage divides by. */
export type HouseCounts = {
  area: string;
  source: string;
  minConfidence: number;
  built: string;
  total: number;
  wards: Record<string, number>;
};
